// Orbit Jump leaderboard service (App Engine Standard, Go).
//
// Serves the shared, persistent high-score leaderboard for the game from a
// Firestore "boards/{gameName}" document. Every deployment of the game
// (App Engine at /orbitjump plus any other platform) calls this one service,
// so scores stay in sync everywhere. CORS is open so other origins can call it.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
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
)

var (
	fsClient  *firestore.Client
	gameIDre  = regexp.MustCompile(`[^a-z0-9_-]`)
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
	mux.HandleFunc("/orbitjump/api/score", withCORS(handleScore))
	mux.HandleFunc("/orbitjump/api/health", withCORS(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}))

	port := envOr("PORT", "8080")
	log.Printf("orbitjump listening on :%s (project=%s db=%s)", port, projectID, dbID)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
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

// POST /orbitjump/api/score  {playerName, score, gameName}
func handleScore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var in struct {
		PlayerName string `json:"playerName"`
		Score      int    `json:"score"`
		GameName   string `json:"gameName"`
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
