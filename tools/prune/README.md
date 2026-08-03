# Leaderboard moderation (`prune`)

Removes bad/injected rows from the shared Firestore leaderboard. It uses
Application Default Credentials (no HTTP secret), so run it from **Cloud Shell**
or any machine authenticated to the `loxleyorbit-dev-jozilla` project.

```bash
cd tools/prune
go mod tidy            # first time only, downloads deps

# Preview (dry run — writes nothing):
go run . -score 8888

# Actually remove the 8888 rows:
go run . -score 8888 -apply
```

Flags: `-score N` (exact), `-min N` (>= N), `-name "X"` (exact name),
`-game orbit_jump`, `-db orbitjump`, `-project <id>`, `-apply` (commit).
Dry run by default.
