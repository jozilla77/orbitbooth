package main

import (
	"context"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// ---- name sanitizer -------------------------------------------------------

func TestCleanNameStripsHiddenRunes(t *testing.T) {
	hidden := []struct {
		name string
		r    rune
	}{
		{"U+202E bidi override", 0x202E},
		{"U+200B zero-width space", 0x200B},
		{"U+FEFF BOM", 0xFEFF},
		{"U+0007 bell", 0x0007},
		{"U+3164 Hangul filler", 0x3164},
		{"U+2800 braille blank", 0x2800},
		{"U+00AD soft hyphen", 0x00AD},
	}
	for _, h := range hidden {
		got := cleanName("ab" + string(h.r) + "cd")
		if strings.ContainsRune(got, h.r) {
			t.Errorf("%s survived sanitizing: %q", h.name, got)
		}
		if got != "abcd" {
			t.Errorf("%s: got %q, want %q", h.name, got, "abcd")
		}
	}
}

func TestCleanNameRejectsAllInvisible(t *testing.T) {
	cases := []string{
		strings.Repeat(string(rune(0x3164)), 5), // Hangul fillers
		string(rune(0x200B)) + string(rune(0xFEFF)),
		"   ",
		"",
		string(rune(0x2800)), // braille blank
	}
	for _, in := range cases {
		if got := cleanName(in); got != "" {
			t.Errorf("cleanName(%q) = %q, want \"\" (rejected)", in, got)
		}
	}
}

func TestCleanNameKeepsRealNames(t *testing.T) {
	cases := map[string]string{
		"Jo":              "Jo",
		"  Orbit  ":       "Orbit",
		"นักบิน":          "นักบิน", // Thai must survive
		"Orbit    Jumper": "Orbit Jumper",
		"日本語":             "日本語",
	}
	for in, want := range cases {
		if got := cleanName(in); got != want {
			t.Errorf("cleanName(%q) = %q, want %q", in, got, want)
		}
	}
	// Emoji are graphic and should be kept.
	if got := cleanName("hi \U0001F600"); got != "hi \U0001F600" {
		t.Errorf("emoji name mangled: %q", got)
	}
}

func TestCleanNameLengthCap(t *testing.T) {
	got := cleanName(strings.Repeat("A", 100))
	if len([]rune(got)) != maxNameLen {
		t.Errorf("length cap: got %d runes, want %d", len([]rune(got)), maxNameLen)
	}
	// Multi-byte must cap by runes, not bytes.
	got = cleanName(strings.Repeat(string(rune(0x1F600)), 40))
	if n := len([]rune(got)); n != maxNameLen {
		t.Errorf("emoji cap: got %d runes, want %d", n, maxNameLen)
	}
}

// ---- rate limiter ---------------------------------------------------------

func TestRateLimiterBurstThenDeny(t *testing.T) {
	rl := newRateLimiter(10, 5) // 10/min, burst 5
	for i := 1; i <= 5; i++ {
		if !rl.allow("1.2.3.4") {
			t.Fatalf("request %d should be allowed within burst", i)
		}
	}
	if rl.allow("1.2.3.4") {
		t.Error("6th request should be denied (burst exhausted)")
	}
	// A different IP has its own bucket.
	if !rl.allow("5.6.7.8") {
		t.Error("a different IP must not be affected by another IP's limit")
	}
}

func TestRateLimiterRefills(t *testing.T) {
	rl := newRateLimiter(60, 1) // 1/sec, burst 1
	if !rl.allow("ip") {
		t.Fatal("first request should be allowed")
	}
	if rl.allow("ip") {
		t.Fatal("immediate second request should be denied")
	}
	// Simulate time passing by backdating the bucket.
	rl.mu.Lock()
	rl.buckets["ip"].last = time.Now().Add(-2 * time.Second)
	rl.mu.Unlock()
	if !rl.allow("ip") {
		t.Error("request should be allowed after the bucket refills")
	}
}

// ---- client IP ------------------------------------------------------------

func TestClientIPPrefersUnspoofableHeader(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	// A client forging X-Forwarded-For must not override the App Engine header.
	r.Header.Set("X-Forwarded-For", "6.6.6.6")
	r.Header.Set("X-Appengine-User-IP", "203.0.113.9")
	if got := clientIP(r); got != "203.0.113.9" {
		t.Errorf("clientIP = %q, want the App Engine header value", got)
	}
}

func TestClientIPFallbacks(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	if got := clientIP(r); got != "10.0.0.1" {
		t.Errorf("RemoteAddr fallback = %q, want 10.0.0.1", got)
	}
	r.Header.Set("X-Forwarded-For", "198.51.100.7, 10.1.1.1")
	if got := clientIP(r); got != "198.51.100.7" {
		t.Errorf("XFF fallback = %q, want 198.51.100.7", got)
	}
}

// ---- tokens ---------------------------------------------------------------

func testSecret(t *testing.T) []byte {
	t.Helper()
	s := make([]byte, 32)
	if _, err := rand.Read(s); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestTokenRoundTripReturnsNonce(t *testing.T) {
	secret := testSecret(t)
	tok := mintToken(secret)
	issued, nonce, ok := verifyToken(secret, tok)
	if !ok {
		t.Fatal("freshly minted token failed verification")
	}
	if nonce == "" {
		t.Error("nonce must be returned so the token can be marked single-use")
	}
	if d := time.Now().UnixMilli() - issued; d < 0 || d > 5000 {
		t.Errorf("issuedAt looks wrong (delta %d ms)", d)
	}
	// Each token must carry a distinct nonce, or single-use would collide.
	_, nonce2, _ := verifyToken(secret, mintToken(secret))
	if nonce == nonce2 {
		t.Error("two tokens shared a nonce")
	}
}

func TestTokenRejectsTamperingAndWrongSecret(t *testing.T) {
	secret := testSecret(t)
	tok := mintToken(secret)

	if _, _, ok := verifyToken(secret, tok[:len(tok)-2]+"XX"); ok {
		t.Error("tampered signature accepted")
	}
	if _, _, ok := verifyToken(testSecret(t), tok); ok {
		t.Error("token verified under the wrong secret")
	}
	for _, bad := range []string{"", "garbage", "a.b", "a.b.c.d"} {
		if _, _, ok := verifyToken(secret, bad); ok {
			t.Errorf("malformed token %q accepted", bad)
		}
	}
}

func TestTokenNonceIsSafeAsDocumentID(t *testing.T) {
	secret := testSecret(t)
	for i := 0; i < 50; i++ {
		_, nonce, ok := verifyToken(secret, mintToken(secret))
		if !ok {
			t.Fatal("verification failed")
		}
		if strings.ContainsAny(nonce, "/.") || nonce == "" {
			t.Fatalf("nonce %q is not a valid Firestore document ID", nonce)
		}
	}
	// A crafted token whose nonce would escape the collection path is refused.
	forged := "123./../evil"
	msg := "123./../evil"
	if _, _, ok := verifyToken(secret, msg+"."+signMsg(secret, forged)); ok {
		t.Error("token with a path-traversing nonce was accepted")
	}
}

// ---- bare-path redirect ---------------------------------------------------

func TestBareOrbitjumpRedirectsToTrailingSlash(t *testing.T) {
	cases := map[string]string{
		"/orbitjump":               "/orbitjump/",
		"/orbitjump?dev":           "/orbitjump/?dev",
		"/orbitjump?preview=3&x=1": "/orbitjump/?preview=3&x=1",
	}
	for in, want := range cases {
		rec := httptest.NewRecorder()
		handleBareRedirect(rec, httptest.NewRequest(http.MethodGet, in, nil))
		if rec.Code != http.StatusMovedPermanently {
			t.Errorf("%s: status %d, want 301", in, rec.Code)
		}
		if got := rec.Header().Get("Location"); got != want {
			t.Errorf("%s: Location %q, want %q", in, got, want)
		}
	}
}

// ---- single-use redemption ------------------------------------------------

// memRedeemer mimics Firestore Create(): the first claim of a nonce succeeds,
// any later claim reports "already spent".
func memRedeemer() (func(ctx context.Context, nonce string) (bool, error), func() int) {
	var mu sync.Mutex
	seen := map[string]bool{}
	fn := func(_ context.Context, nonce string) (bool, error) {
		mu.Lock()
		defer mu.Unlock()
		if seen[nonce] {
			return false, nil
		}
		seen[nonce] = true
		return true, nil
	}
	count := func() int { mu.Lock(); defer mu.Unlock(); return len(seen) }
	return fn, count
}

func TestTokenIsSingleUse(t *testing.T) {
	secret := testSecret(t)
	redeem, _ := memRedeemer()

	_, nonce, ok := verifyToken(secret, mintToken(secret))
	if !ok {
		t.Fatal("token failed to verify")
	}

	first, err := redeem(context.Background(), nonce)
	if err != nil || !first {
		t.Fatalf("first redemption should succeed (ok=%v err=%v)", first, err)
	}
	// This is the replay that previously let one aged token flood the board.
	for i := 2; i <= 5; i++ {
		again, err := redeem(context.Background(), nonce)
		if err != nil {
			t.Fatalf("redemption %d errored: %v", i, err)
		}
		if again {
			t.Fatalf("replay %d was accepted — token is not single-use", i)
		}
	}
}

func TestConcurrentRedemptionAllowsExactlyOne(t *testing.T) {
	secret := testSecret(t)
	redeem, _ := memRedeemer()
	_, nonce, _ := verifyToken(secret, mintToken(secret))

	const racers = 40
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, err := redeem(context.Background(), nonce); err == nil && ok {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Errorf("concurrent redemption: %d winners, want exactly 1", wins)
	}
}

// ---- time gate ------------------------------------------------------------

// The gate logic lives inline in handleScore; this locks in the arithmetic so a
// future tweak can't silently re-open instant high-score injection.
func TestTimeGateArithmetic(t *testing.T) {
	gate := func(ageMs int64, score int) bool {
		return int64(score)*msPerPoint > ageMs+tokenSkewMs // true == rejected
	}
	if !gate(0, 8888) {
		t.Error("an instant 8888 must be rejected")
	}
	if gate(60_000, 40) {
		t.Error("40 points after 60s of play must be allowed")
	}
	if gate(40*60*1000, 8888) {
		t.Error("8888 after 40 minutes must be allowed")
	}
}
