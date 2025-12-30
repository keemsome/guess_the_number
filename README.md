# 🎯 Guess The Number (Telegram HTML5 Game)

A fast, mobile-friendly number guessing game (no repeated digits) designed to run as a **Telegram Game** and hosted for free on **GitHub Pages**.

## Game Modes
- **Casual:** 3 digits, max **30** guesses  
- **Hard:** 4 digits, max **20** guesses

## Features
- Responsive UI for desktop + mobile (numeric keypad friendly)
- Instant clue feedback after each guess
- Guess history
- Local leaderboard (per device/browser) using `localStorage`
- Win / Game Over modals
- Simple animations (shake / flash)
- Optional Telegram **Share Score** button via `telegram.org/js/games.js`
- No external libraries required

---

## Live Demo (GitHub Pages)
Once you enable GitHub Pages, your game will be available at:

`https://<github-username>.github.io/<repo-name>/`

Example:
`https://keemyap.github.io/guess-the-number/`

---

## Telegram Game Setup (BotFather)
1. Create your bot with **@BotFather**: `/newbot`
2. Create a game with **@BotFather**: `/newgame`
3. Set a `game_short_name` (example: `guessdanumber_bot`)
4. You’ll get a share URL like:
   `https://t.me/<your_bot>?game=<game_short_name>`

✅ Important: Telegram will show a **Play** button, but your bot must be running to open the web game.

---

## Hosting (GitHub Pages)
1. Push `index.html` to your repo (root folder is recommended).
2. Go to **Repo → Settings → Pages**
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/(root)**
4. Save and wait for GitHub to publish.

---

## How Telegram “Play” Works (High Level)
When a user taps **Play**:
- Telegram sends your bot a `callback_query` containing the `game_short_name`.
- Your bot must answer that callback with a `url` pointing to your GitHub Pages game.

➡️ This repo contains only the **front-end game**.  
➡️ Bot logic (TeleBotHost / server) is configured separately.

---

## Local Leaderboard
This version stores scores locally in the browser:
- Casual leaderboard key: `number_guess_lb_casual_v1`
- Hard leaderboard key: `number_guess_lb_hard_v1`

Note: Local leaderboard is **per device/browser**.  
For a global Telegram leaderboard, you’ll later add bot-side `setGameScore/getGameHighScores`.

---

## Project Files
- `index.html` — Single-file game (HTML + CSS + JS)

---

## Roadmap (Optional)
- Bot-side score submission endpoint (webhook)
- Telegram `setGameScore` integration for in-chat high scores
- `getGameHighScores` to display Telegram leaderboard inside the game

---

## License
MIT (or replace with your preferred license)
