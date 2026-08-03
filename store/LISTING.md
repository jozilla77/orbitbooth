# Orbit Jump — Chrome Web Store submission kit

Everything you need to publish Orbit Jump as a Chrome extension. Copy/paste the
fields below into the Chrome Web Store developer dashboard.

---

## 0. Before you start (2 quick TODOs)

1. **Set your contact email.** In `game/privacy.html` (and `store/privacy-policy.md`),
   replace `REPLACE_WITH_YOUR_CONTACT_EMAIL` with a real address, then **redeploy
   the game** so the hosted policy shows it.
2. **Developer account.** You need a Chrome Web Store developer account — a
   **one-time US $5 fee** at
   <https://chrome.google.com/webstore/devconsole>. (Review typically takes a few
   business days.)

---

## 1. The package to upload

**File:** `store/orbit-jump-chrome-extension.zip`

Rebuild it any time the game changes:

```bash
bash store/build.sh
```

It bundles the whole game (offline-playable). The leaderboard still syncs online
when the player is connected. The extension requests **no permissions** — clicking
the toolbar icon simply opens the game in a new tab.

---

## 2. Store listing fields

**Product name**
```
Orbit Jump
```

**Summary** (≤ 132 characters)
```
A cute one-tap flying game — guide Orbit across 18 kawaii Thai provinces, grab sparkles for slow-mo, top the leaderboard.
```

**Category:** `Games`
**Language:** `English`

**Description**
```
Orbit Jump is a cute, one-tap arcade flyer. Tap, click, or press Space to keep
Orbit — a little space bunny — soaring through the gaps. Simple to learn, tricky
to master!

🇹🇭 18 STAGES ACROSS THAILAND
Journey through 17 beautifully themed provinces — from Bangkok, Phuket and
Chiang Mai to Ayutthaya, Trang and Rayong — each with its own scenery, temples,
wildlife and music, before reaching the neon 2× SPEED finale of Neo Bangkok.

✨ SLOW-MO SPARKLES
Grab the rainbow sparkle to slow time for a few seconds and glide through the
tightest gaps.

🏆 GLOBAL LEADERBOARD
Beat your best and put your name on the online leaderboard.

🎵 KAWAII, POLISHED, OFFLINE
Hand-crafted pastel art, cheerful music and sound (both toggleable), and smooth
play on desktop and touch. Plays offline; the leaderboard syncs when you're online.

No ads. No accounts. No tracking. Just a wholesome pick-up-and-play game.
```

---

## 3. Graphics assets (all included in `store/`)

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `store/promo/store-icon-128.png` |
| Screenshot 1 | 1280×800 | `store/screenshots/01-start.png` |
| Screenshot 2 | 1280×800 | `store/screenshots/02-bangkok.png` |
| Screenshot 3 | 1280×800 | `store/screenshots/03-slowmo.png` |
| Screenshot 4 | 1280×800 | `store/screenshots/04-neo-bangkok.png` |
| Screenshot 5 | 1280×800 | `store/screenshots/05-krabi.png` |
| Small promo tile | 440×280 | `store/promo/small-tile-440x280.png` |
| Marquee promo tile | 1400×560 | `store/promo/marquee-1400x560.png` |

(At least one 1280×800 screenshot is required; the promo tiles are optional but
recommended, especially the small tile.)

---

## 4. Privacy tab (in the dashboard)

**Single purpose** (paste)
```
Orbit Jump is a self-contained arcade game. Its single purpose is to let the user
play the game in the browser. Clicking the toolbar icon opens the bundled game in
a new tab.
```

**Permissions:** none requested — so there are no permission justifications to
fill in. (If asked to justify the absence, note that the extension only opens its
own bundled page and requests no host or API permissions.)

**Data usage — declare the following:**
- The extension **collects** a user-provided **display name (nickname)** and a
  **game score**, and only when the user chooses to submit to the leaderboard.
- Check the required certifications (all true for Orbit Jump):
  - ☑ I do **not** sell or transfer user data to third parties (outside approved use cases).
  - ☑ I do **not** use or transfer user data for purposes unrelated to the item's single purpose.
  - ☑ I do **not** use or transfer user data to determine creditworthiness or for lending.

**Privacy policy URL**
```
https://jozilla.loxleyorbit.com/orbitjump/privacy.html
```
(Make sure you've deployed the game after setting your contact email — see §0.)

---

## 5. Step-by-step upload

1. Go to <https://chrome.google.com/webstore/devconsole> and sign in.
2. Pay the one-time $5 registration fee if you haven't (first item only).
3. **New Item → Upload** `store/orbit-jump-chrome-extension.zip`.
4. **Store listing:** paste the name, summary, description, pick category
   `Games` and language `English`. Upload the 5 screenshots, the small tile, and
   the marquee tile. The store icon is read from the package but you can also set
   it here.
5. **Privacy practices:** paste the single-purpose text, complete the data-usage
   declaration and certifications above, and paste the privacy policy URL.
6. **Distribution:** choose `Public` (or `Unlisted` if you want a link-only
   release first), and the regions.
7. **Save draft → Submit for review.**

That's it. You'll get an email when it's approved (or if the reviewer needs a
change).

---

## Notes / good to know
- The bundled game is identical to the web version, so future updates are: change
  the game → `bash store/build.sh` → bump `"version"` in
  `store/extension/manifest.json` → upload the new zip.
- The extension deliberately asks for **zero permissions**, which means no scary
  install warning and a smoother review.
- The leaderboard works from the extension via the server's open CORS policy — no
  host permission needed.
