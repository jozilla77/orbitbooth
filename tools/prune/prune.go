// Orbit Jump leaderboard moderation tool.
//
// Removes bad/injected entries from the shared Firestore leaderboard.
// Run it from Cloud Shell (or anywhere with GCP credentials for the project) —
// it authenticates with Application Default Credentials, so there is no HTTP
// secret to leak. It is a dry run by default; add -apply to actually write.
//
//   go run . -score 8888           # preview removing every entry scoring 8888
//   go run . -score 8888 -apply    # do it
//   go run . -min 2000 -apply      # nuke everything scoring 2000 or more
//   go run . -name "cheater" -apply
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"sort"

	"cloud.google.com/go/firestore"
)

// Entry mirrors the leaderboard row shape written by the service (main.go).
type Entry struct {
	Name  string `firestore:"name"`
	Score int    `firestore:"score"`
	Ts    int64  `firestore:"ts"`
}

type board struct {
	Entries []Entry `firestore:"entries"`
}

func main() {
	project := flag.String("project", envOr("GOOGLE_CLOUD_PROJECT", "loxleyorbit-dev-jozilla"), "GCP project id")
	dbID := flag.String("db", "orbitjump", "Firestore database id")
	game := flag.String("game", "orbit_jump", "board (game) id")
	score := flag.Int("score", -1, "remove entries with this EXACT score (-1 = ignore)")
	min := flag.Int("min", -1, "remove entries scoring >= this value (-1 = ignore)")
	name := flag.String("name", "", "remove entries with this exact name (empty = ignore)")
	apply := flag.Bool("apply", false, "actually write changes (omit for a dry run)")
	flag.Parse()

	if *score < 0 && *min < 0 && *name == "" {
		log.Fatal("nothing to remove: pass at least one of -score, -min, or -name")
	}

	ctx := context.Background()
	cli, err := firestore.NewClientWithDatabase(ctx, *project, *dbID)
	if err != nil {
		log.Fatalf("connect to Firestore %q/%q: %v", *project, *dbID, err)
	}
	defer cli.Close()

	ref := cli.Collection("boards").Doc(*game)
	snap, err := ref.Get(ctx)
	if err != nil {
		log.Fatalf("read board %q: %v", *game, err)
	}
	var b board
	if err := snap.DataTo(&b); err != nil {
		log.Fatalf("decode board: %v", err)
	}

	var kept, removed []Entry
	for _, e := range b.Entries {
		bad := (*score >= 0 && e.Score == *score) ||
			(*min >= 0 && e.Score >= *min) ||
			(*name != "" && e.Name == *name)
		if bad {
			removed = append(removed, e)
		} else {
			kept = append(kept, e)
		}
	}

	fmt.Printf("Board %q on %s/%s: %d entries, %d match removal.\n",
		*game, *project, *dbID, len(b.Entries), len(removed))
	for _, e := range removed {
		fmt.Printf("  - REMOVE  %-20q %d\n", e.Name, e.Score)
	}

	if !*apply {
		fmt.Println("\nDry run — nothing written. Re-run with -apply to commit these removals.")
		return
	}
	sort.SliceStable(kept, func(i, j int) bool {
		if kept[i].Score != kept[j].Score {
			return kept[i].Score > kept[j].Score
		}
		return kept[i].Ts < kept[j].Ts
	})
	if _, err := ref.Set(ctx, board{Entries: kept}); err != nil {
		log.Fatalf("write board: %v", err)
	}
	fmt.Printf("\nDone: removed %d, kept %d.\n", len(removed), len(kept))
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
