// Orbit Jump leaderboard service (App Engine Standard, Go).
//
// Serves the shared, persistent high-score leaderboard for the game from a
// Firestore "boards/{gameName}" document. Every deployment of the game
// (App Engine at /orbitjump plus any other platform) calls this one service,
// so scores stay in sync everywhere. CORS is open so other origins can call it.
//
// Anti-injection: a score submission must carry a valid play token that the
// server issued (GET /api/session) when the round started. The token is HMAC
// signed and timestamped, and the server rejects a score that arrives faster
// than it could physically be earned. This stops the trivial attack of POSTing
// a made-up number straight to /api/score. The signing secret is generated once
// and stored in Firestore (collection "config"), never in the repo.
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Entry is one leaderboard row. JSON tags keep the client contract
// (playerName/score) identical to the original API.
type Entry struct {
	Name  string `firestore:"name" json:"playerName"`
	Score int    `firestore:"score" json:"score"`
	Ts    int64  `firestore:"ts" json:"ts"`
}

type board struct {
	Entries []Entry `firestore:"entries"`
}

const (
	maxRows     = 100     // rows kept per game
	topRows     = 10      // rows returned to clients
	maxScore    = 1000000 // sanity cap to blunt obviously bogus scores
	maxNameLen  = 20
	collection  = "boards"
	defaultGame = "orbit_jump"

	// Play-token defaults (overridable via env). The game scores at most ~1
	// point/second, so gating at 250 ms/point leaves a ~4x safety margin for
	// legit players while making a faked 8888 require ~37 min of waiting.
	defTokenMaxAgeMs = 6 * 60 * 60 * 1000 // token older than this is stale
	tokenSkewMs      = 30 * 1000          // tolerated clock skew
	defMinMsPerPoint = 250                // required elapsed play per point of score
)

var (
	fsClient *firestore.Client
	gameIDre = regexp.MustCompile(`[^a-z0-9_-]`)

	// Config (env-overridable). requireToken can be set to "false" only for an
	// emergency rollback — leaving injection open again.
	requireToken = os.Getenv("REQUIRE_PLAY_TOKEN") != "false"
	msPerPoint   = int64(envInt("MIN_MS_PER_POINT", defMinMsPerPoint))
	maxTokenAge  = int64(envInt("TOKEN_MAX_AGE_MS", defTokenMaxAgeMs))

	secretMu     sync.Mutex
	cachedSecret []byte
)

func main() {
	ctx := context.Background()
	projectID := envOr("GOOGLE_CLOUD_PROJECT", "loxleyorbit-dev-jozilla")
	dbID := envOr("FIRESTORE_DB", "orbitjump")

	c, err := firestore.NewClientWithDatabase(ctx, projectID, dbID)
	if err != nil {
		log.Fatalf("firestore init failed: %v", err)
	}
	fsClient = c
	defer c.Close()

	mux := http.NewServeMux()
	mux.HandleFunc("/orbitjump/api/leaderboard", withCORS(handleLeaderboard))
	mux.HandleFunc("/orbitjump/api/session", withCORS(handleSession))
	mux.HandleFunc("/orbitjump/api/score", withCORS(handleScore))
	mux.HandleFunc("/orbitjump/api/health", withCORS(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))

	port := envOr("PORT", "8080")
	log.Printf("orbitjump listening on :%s (project=%s db=%s requireToken=%v)", port, projectID, dbID, requireToken)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

// GET /orbitjump/api/session -> {"token": "..."} issued for a new play session.
func handleSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	secret, err := getSecret(r.Context())
	if err != nil {
		log.Printf("session secret: %v", err)
		writeErr(w, http.StatusInternalServerError, "could not start session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": mintToken(secret)})
}

// GET /orbitjump/api/leaderboard?gameName=orbit_jump
func handleLeaderboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	game := cleanGame(r.URL.Query().Get("gameName"))
	b, err := readBoard(r.Context(), game)
	if err != nil {
		log.Printf("read board %q: %v", game, err)
		writeErr(w, http.StatusInternalServerError, "could not load leaderboard")
		return
	}
	rows := b.Entries
	if len(rows) > topRows {
		rows = rows[:topRows]
	}
	writeJSON(w, http.StatusOK, map[string]any{"leaderboard": rows})
}

// POST /orbitjump/api/score  {playerName, score, gameName, token}
func handleScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var in struct {
		PlayerName string `json:"playerName"`
		Score      int    `json:"score"`
		GameName   string `json:"gameName"`
		Token      string `json:"token"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	name := cleanName(in.PlayerName)
	if name == "" {
		writeErr(w, http.StatusBadRequest, "playerName is required")
		return
	}
	if in.Score < 0 || in.Score > maxScore {
		writeErr(w, http.StatusBadRequest, "invalid score")
		return
	}

	// Anti-injection: verify the play token unless explicitly disabled.
	if requireToken {
		secret, serr := getSecret(r.Context())
		if serr != nil {
			log.Printf("score secret: %v", serr)
			writeErr(w, http.StatusInternalServerError, "could not verify submission")
			return
		}
		issued, ok := verifyToken(secret, in.Token)
		if !ok {
			writeErr(w, http.StatusForbidden, "missing or invalid play token")
			return
		}
		age := time.Now().UnixMilli() - issued
		if age < -tokenSkewMs || age > maxTokenAge {
			writeErr(w, http.StatusForbidden, "play token expired — start a new game")
			return
		}
		// You cannot earn `score` points in less than score*msPerPoint of play.
		if int64(in.Score)*msPerPoint > age+tokenSkewMs {
			writeErr(w, http.StatusForbidden, "score rejected: submitted too fast to be real")
			return
		}
	}

	game := cleanGame(in.GameName)
	entry := Entry{Name: name, Score: in.Score, Ts: time.Now().UnixMilli()}

	ref := fsClient.Collection(collection).Doc(game)
	rank := 0
	err := fsClient.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		var b board
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if snap != nil && snap.Exists() {
			if derr := snap.DataTo(&b); derr != nil {
				return derr
			}
		}
		b.Entries = append(b.Entries, entry)
		sortEntries(b.Entries)
		if len(b.Entries) > maxRows {
			b.Entries = b.Entries[:maxRows]
		}
		for i := range b.Entries {
			if b.Entries[i].Ts == entry.Ts && b.Entries[i].Name == entry.Name && b.Entries[i].Score == entry.Score {
				rank = i + 1
				break
			}
		}
		return tx.Set(ref, b)
	})
	if err != nil {
		log.Printf("submit score %q: %v", game, err)
		writeErr(w, http.StatusInternalServerError, "could not save score")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true, "rank": rank})
}

func readBoard(ctx context.Context, game string) (board, error) {
	var b board
	snap, err := fsClient.Collection(collection).Doc(game).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return b, nil // empty board is fine
		}
		return b, err
	}
	if err := snap.DataTo(&b); err != nil {
		return b, err
	}
	return b, nil
}

// sortEntries orders by score desc, then earliest timestamp first for ties.
func sortEntries(e []Entry) {
	sort.SliceStable(e, func(i, j int) bool {
		if e[i].Score != e[j].Score {
			return e[i].Score > e[j].Score
		}
		return e[i].Ts < e[j].Ts
	})
}

// ---- Play tokens ----------------------------------------------------------
//
// token = "<issuedAtMs>.<nonce>.<sig>" where sig = base64url(HMAC-SHA256(secret,
// "<issuedAtMs>.<nonce>")). Stateless: the server re-derives and compares the
// signature, so no per-session storage is needed.

func mintToken(secret []byte) string {
	issued := time.Now().UnixMilli()
	nonce := make([]byte, 12)
	_, _ = rand.Read(nonce)
	msg := strconv.FormatInt(issued, 10) + "." + base64.RawURLEncoding.EncodeToString(nonce)
	return msg + "." + signMsg(secret, msg)
}

func signMsg(secret []byte, msg string) string {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// verifyToken returns the issuedAt (ms) if the signature is valid.
func verifyToken(secret []byte, token string) (int64, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, false
	}
	msg := parts[0] + "." + parts[1]
	want := signMsg(secret, msg)
	if subtle.ConstantTimeCompare([]byte(want), []byte(parts[2])) != 1 {
		return 0, false
	}
	issued, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, false
	}
	return issued, true
}

// getSecret returns the HMAC signing secret, generating and persisting one in
// Firestore (config/signing) on first use. Cached in memory per instance.
func getSecret(ctx context.Context) ([]byte, error) {
	secretMu.Lock()
	defer secretMu.Unlock()
	if cachedSecret != nil {
		return cachedSecret, nil
	}
	ref := fsClient.Collection("config").Doc("signing")

	if snap, err := ref.Get(ctx); err == nil && snap.Exists() {
		if b := decodeSecret(snap.Data()); b != nil {
			cachedSecret = b
			return b, nil
		}
	} else if err != nil && status.Code(err) != codes.NotFound {
		return nil, err
	}

	// Create it (transaction guards against two instances racing).
	fresh := make([]byte, 32)
	if _, err := rand.Read(fresh); err != nil {
		return nil, err
	}
	err := fsClient.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, gerr := tx.Get(ref)
		if gerr != nil && status.Code(gerr) != codes.NotFound {
			return gerr
		}
		if snap != nil && snap.Exists() {
			if b := decodeSecret(snap.Data()); b != nil {
				fresh = b // adopt the secret another instance already wrote
				return nil
			}
		}
		return tx.Set(ref, map[string]any{
			"secret":    base64.StdEncoding.EncodeToString(fresh),
			"createdAt": time.Now().UnixMilli(),
		})
	})
	if err != nil {
		return nil, err
	}
	cachedSecret = fresh
	return fresh, nil
}

func decodeSecret(data map[string]any) []byte {
	v, ok := data["secret"].(string)
	if !ok || v == "" {
		return nil
	}
	b, err := base64.StdEncoding.DecodeString(v)
	if err != nil || len(b) < 32 {
		return nil
	}
	return b
}

// ---- helpers --------------------------------------------------------------

func cleanName(s string) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsControl(r) {
			continue
		}
		b.WriteRune(r)
		if b.Len() >= maxNameLen*4 { // rune-safe upper bound
			break
		}
	}
	out := []rune(b.String())
	if len(out) > maxNameLen {
		out = out[:maxNameLen]
	}
	return strings.TrimSpace(string(out))
}

func cleanGame(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = gameIDre.ReplaceAllString(s, "")
	if s == "" {
		return defaultGame
	}
	if len(s) > 40 {
		s = s[:40]
	}
	return s
}

func withCORS(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "3600")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h(w, r)
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
