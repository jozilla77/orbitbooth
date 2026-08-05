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
//
// Tokens are SINGLE-USE: redeeming one records its nonce in Firestore, so a
// captured token cannot be replayed to flood the board with one aged token.
// Both endpoints are also rate limited per client IP.
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
	"net"
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
	maxRows      = 100     // rows kept per game
	topRows      = 10      // rows returned to clients
	maxScore     = 1000000 // sanity cap to blunt obviously bogus scores
	maxNameLen   = 20
	collection   = "boards"
	defaultGame  = "orbit_jump"
	usedTokenCol = "used_tokens" // redeemed token nonces (single-use enforcement)

	// Play-token defaults (overridable via env). The game scores at most ~1
	// point/second, so gating at 250 ms/point leaves a ~4x safety margin for
	// legit players while making a faked 8888 require ~37 min of waiting.
	defTokenMaxAgeMs = 6 * 60 * 60 * 1000 // token older than this is stale
	tokenSkewMs      = 30 * 1000          // tolerated clock skew
	defMinMsPerPoint = 250                // required elapsed play per point of score

	// Rate limits (per client IP, per instance — see rateLimiter).
	scoreRatePerMin   = 10 // score submissions
	scoreBurst        = 5
	sessionRatePerMin = 30 // token issuance
	sessionBurst      = 10
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

	// Per-IP rate limiters. In-memory, so the effective ceiling is
	// (limit x running instances) — still enough to stop scripted flooding,
	// and it costs nothing per request. Tighten max_instances in app.yaml if
	// you want a harder global cap.
	scoreLimiter   = newRateLimiter(scoreRatePerMin, scoreBurst)
	sessionLimiter = newRateLimiter(sessionRatePerMin, sessionBurst)
)

// ---- rate limiting --------------------------------------------------------

type bucket struct {
	tokens float64
	last   time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*bucket
	perSec  float64
	burst   float64
	lastGC  time.Time
}

func newRateLimiter(perMin int, burst int) *rateLimiter {
	return &rateLimiter{
		buckets: make(map[string]*bucket),
		perSec:  float64(perMin) / 60.0,
		burst:   float64(burst),
		lastGC:  time.Now(),
	}
}

// allow reports whether this key may proceed, consuming one token if so.
func (rl *rateLimiter) allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Opportunistic GC so idle IPs don't accumulate forever.
	if now.Sub(rl.lastGC) > 10*time.Minute {
		for k, b := range rl.buckets {
			if now.Sub(b.last) > 10*time.Minute {
				delete(rl.buckets, k)
			}
		}
		rl.lastGC = now
	}

	b, ok := rl.buckets[key]
	if !ok {
		rl.buckets[key] = &bucket{tokens: rl.burst - 1, last: now}
		return true
	}
	// Refill according to elapsed time, capped at burst.
	b.tokens += now.Sub(b.last).Seconds() * rl.perSec
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// clientIP resolves the caller's address. On App Engine the infrastructure sets
// X-Appengine-User-IP, which (unlike X-Forwarded-For) a client cannot spoof —
// prefer it so the rate limit can't be bypassed with a forged header.
func clientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Appengine-User-IP")); ip != "" {
		return ip
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if first := strings.TrimSpace(strings.Split(xff, ",")[0]); first != "" {
			return first
		}
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

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
	mux.HandleFunc("/orbitjump", handleBareRedirect)

	port := envOr("PORT", "8080")
	log.Printf("orbitjump listening on :%s (project=%s db=%s requireToken=%v)", port, projectID, dbID, requireToken)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

// handleBareRedirect sends /orbitjump -> /orbitjump/ (301), preserving any query
// string. Without the trailing slash the browser resolves the page's relative
// asset paths (css/style.css) against the site root, so the game renders with no
// CSS, images or script at all.
func handleBareRedirect(w http.ResponseWriter, r *http.Request) {
	target := "/orbitjump/"
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	http.Redirect(w, r, target, http.StatusMovedPermanently)
}

// GET /orbitjump/api/session -> {"token": "..."} issued for a new play session.
func handleSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !sessionLimiter.allow(clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, "too many requests — slow down")
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
	if !scoreLimiter.allow(clientIP(r)) {
		writeErr(w, http.StatusTooManyRequests, "too many submissions — slow down")
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
		issued, nonce, ok := verifyToken(secret, in.Token)
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
		// Spend the token. Done last (so a rejected score doesn't burn it) but
		// before the board write, so a replay can never reach the leaderboard.
		fresh, rerr := redeemToken(r.Context(), nonce)
		if rerr != nil {
			log.Printf("redeem token: %v", rerr)
			writeErr(w, http.StatusInternalServerError, "could not verify submission")
			return
		}
		if !fresh {
			writeErr(w, http.StatusForbidden, "play token already used — start a new game")
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
// "<issuedAtMs>.<nonce>")). The signature is verified statelessly; the nonce is
// then claimed once in Firestore so the same token cannot be submitted twice.

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

// verifyToken returns the issuedAt (ms) and the nonce if the signature is valid.
func verifyToken(secret []byte, token string) (int64, string, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0, "", false
	}
	msg := parts[0] + "." + parts[1]
	want := signMsg(secret, msg)
	if subtle.ConstantTimeCompare([]byte(want), []byte(parts[2])) != 1 {
		return 0, "", false
	}
	issued, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, "", false
	}
	if parts[1] == "" || strings.ContainsAny(parts[1], "/.") {
		return 0, "", false // must be usable as a Firestore document ID
	}
	return issued, parts[1], true
}

// redeemToken claims a token's nonce exactly once. Indirected through a var so
// tests can substitute an in-memory store (the real one needs Firestore).
var redeemToken = redeemTokenFirestore

// redeemTokenFirestore claims a nonce using Create(), which fails with
// AlreadyExists if the document is already there — atomic without a
// transaction. Returns false if the token has already been spent.
//
// The stored doc carries expiresAt so a Firestore TTL policy on the
// "used_tokens" collection can garbage-collect spent nonces automatically
// (see deploy/README.md — the policy is a one-time console/gcloud setup).
func redeemTokenFirestore(ctx context.Context, nonce string) (bool, error) {
	ref := fsClient.Collection(usedTokenCol).Doc(nonce)
	_, err := ref.Create(ctx, map[string]any{
		"usedAt":    time.Now(),
		"expiresAt": time.Now().Add(time.Duration(maxTokenAge)*time.Millisecond + time.Hour),
	})
	if err != nil {
		if status.Code(err) == codes.AlreadyExists {
			return false, nil
		}
		return false, err
	}
	return true, nil
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

// invisibleRunes are characters that render as nothing (or reorder surrounding
// text) but are NOT caught by unicode.IsControl, which only covers category Cc.
// Without this, a player could submit a blank-looking name, pad a name with
// zero-width filler, or use a bidi override to scramble the public board.
var invisibleRunes = map[rune]bool{
	0x00AD: true, // soft hyphen
	0x115F: true, // Hangul choseong filler
	0x1160: true, // Hangul jungseong filler
	0x180E: true, // Mongolian vowel separator
	0x2800: true, // braille pattern blank
	0x3164: true, // Hangul filler
	0xFFA0: true, // halfwidth Hangul filler
}

// isHidden reports whether a rune is invisible or a formatting/bidi control.
func isHidden(r rune) bool {
	return unicode.IsControl(r) || // Cc
		unicode.Is(unicode.Cf, r) || // Cf: bidi overrides, ZWSP-likes, BOM
		unicode.Is(unicode.Co, r) || // private use
		unicode.Is(unicode.Cs, r) || // surrogates
		!unicode.IsGraphic(r) ||
		invisibleRunes[r]
}

// cleanName normalizes a submitted display name: strips hidden characters,
// collapses whitespace, caps length, and requires at least one visible glyph
// (returning "" so the caller rejects the submission).
func cleanName(s string) string {
	var b strings.Builder
	for _, r := range s {
		if isHidden(r) {
			continue
		}
		if unicode.IsSpace(r) {
			r = ' ' // normalize exotic spaces to a plain one
		}
		b.WriteRune(r)
		if b.Len() >= maxNameLen*4 { // rune-safe upper bound
			break
		}
	}
	out := []rune(strings.Join(strings.Fields(b.String()), " ")) // collapse runs of spaces
	if len(out) > maxNameLen {
		out = out[:maxNameLen]
	}
	name := strings.TrimSpace(string(out))

	// Require a visible, non-space character so all-blank names are rejected.
	for _, r := range name {
		if !unicode.IsSpace(r) && !isHidden(r) {
			return name
		}
	}
	return ""
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
		// API responses are JSON only: forbid MIME sniffing, framing, and
		// referrer leakage. (Static assets get their headers from app.yaml.)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
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
