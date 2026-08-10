# Chrome Web Store — publish checklist

## Before you upload

- [x] Extension icons (`icons/icon16.png` … `icon128.png`) in `manifest.json`
- [x] Privacy policy page: `privacy.html` (publish with the site)
- [x] Narrower permissions: inject on toolbar click only (`activeTab` + `scripting`), Supabase host only
- [x] Package script includes icons

## Developer Console steps

1. Register at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time).
2. Run packaging:
   ```bash
   bash scripts/package-extension.sh
   ```
   Upload **`mondrian-browsing-store.zip`** to the Developer Dashboard  
   (manifest must be at the zip root). Keep `mondrian-browsing.zip` for the landing-page sideload download.
3. Create a new item and fill the listing (draft text below).
4. Set **Privacy policy** URL to your live page, e.g.  
   `https://jyol.github.io/mondrian-browsing/privacy.html`
5. Under **Single purpose**, say it is a short webpage painting / leaderboard game.
6. Under **Host permission justification** (if asked):  
   Supabase is used only for the public leaderboard API. Page access is temporary via `activeTab` when the user clicks the icon.
7. Submit for review.

## Listing draft

**Name:** Mondrian Browsing

**Summary (short):**  
Paint any webpage in Mondrian colors in 60 seconds and climb the global leaderboard.

**Description:**
```
Mondrian Browsing turns the page you’re on into a playable painting.

How to play
1. Open a normal webpage (Wikipedia, news, blogs work great).
2. Click the Mondrian Browsing icon in the toolbar.
3. Paint as many blocks as you can in 60 seconds.
4. Enter a nickname to join the global leaderboard.
5. Download your finished composition as a PNG.

Tips
• Busier pages (cards, lists, nav) make nicer paintings.
• Drag the red bar on the score panel to move it.
• Click the icon again to quit.

Note: The game cannot run on chrome:// pages or the Chrome Web Store.
```

**Category:** Fun / Games (or “Entertainment”)

**Language:** English (add Chinese in the listing if you want)

## Screenshots to capture

Chrome asks for at least one 1280×800 or 640×400 image. Suggested shots:

1. Mid-game: painted Mondrian blocks + HUD with Global leaderboard  
2. Result card after a run (“download PNG”)  
3. Optional: your landing page / install instructions

## After approval

- Share the Web Store URL on the landing page instead of (or next to) the sideload zip.
- Each update: bump `manifest.json` → `version`, re-run the package script, upload a new package.
