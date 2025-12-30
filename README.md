# 🎯 Guess The Number (Telegram HTML5 Game)

A fast, mobile-first number guessing game designed as a **Telegram Game** (HTML5) and hosted for free on **GitHub Pages**.

This repo contains the **front-end game** only. The **Telegram bot + score handling** runs on **TeleBotHost**.

---

## Game Modes

- 🙂 **Casual**: 3 digits, max **30** guesses  
- 🔥 **Hard**: 4 digits, max **20** guesses  
- Digits are **0–9** with **no repeats**

Clues are generated after each guess based on:
- correct digits + correct positions

---

## Features

- ✅ Responsive UI (Telegram mobile friendly)
- ✅ Numeric keypad friendly input
- ✅ Instant clue feedback + guess history
- ✅ Win / Game Over modals
- ✅ Telegram **Share Score** support (`telegram.org/js/games.js`)
- ✅ **Global leaderboard (server-side)** using Telegram identity (no manual name input)

> Local (device-only) leaderboard has been removed in favour of server-side global leaderboard.

---

## Live Game URL (GitHub Pages)

After enabling GitHub Pages, your game will be available at:

`https://<github-username>.github.io/<repo-name>/`

Example:
`https://keemsome.github.io/guess_the_number/`

---

## How Telegram Games Work (High Level)

When a user taps **Play**:
1. Telegram sends your bot a `callback_query` containing `game_short_name`
2. Your bot replies with a **URL** to your hosted HTML game
3. Telegram opens the game inside Telegram

---

## Bot Setup (BotFather)

1. Create bot: `/newbot`
2. Create game: `/newgame`
3. Set `game_short_name` (example: `guessdanumber_bot`)
4. You’ll get a share link like:
   `https://t.me/<your_bot>?game=<game_short_name>`

### Important for group play
- Disable privacy mode so `/play` works reliably in groups:  
  `@BotFather → /setprivacy → <your bot> → Disable`

---

## TeleBotHost Setup (Required)

You need these commands on TeleBotHost:

### 1) `/handle_callback_query`
- Handles the Telegram game “Play” callback
- Generates a **session** + **one-time token**
- Stores launch context (private/group/inline) + Telegram identity
- Opens:
  `GAME_URL?s=SESSION_ID&t=TOKEN`

### 2) `score_submit` (webhook)
Called by the game on win:
- Updates Telegram in-chat leaderboard via `setGameScore`
- Updates your **global leaderboard** (Casual / Hard separated)
- Optionally DMs player with `/globaltop` results (depends on your implementation)

Game calls:
`...score_submit...&s=SESSION&t=TOKEN&score=SCORE&mode=casual|hard`

### 3) `/globaltop`
Shows global top scores:
- `/globaltop` → Casual
- `/globaltop hard` → Hard

### 4) `/myrank` (optional)
Shows player rank:
- `/myrank` → Casual
- `/myrank hard` → Hard

### 5) `rank_get` (optional, for showing rank inside game UI)
If you want “Global Rank: #X” to appear inside the game’s win screen:
- expose a `rank_get` webhook returning `{ ok, rank, bestScore }`
- set `TELEGRAM_RANK_ENDPOINT` in `index.html`

---

## Score Model

Current score is computed in the game as a combined measure of:
- **Guess efficiency** (fewer guesses → higher score)
- **Time bonus** (faster completion → higher score)

Server treats the submitted score as a number and stores best score per user.

---

## Security Notes

- ✅ The game does **NOT** store any permanent secret in GitHub
- ✅ Score submission uses a **one-time token** (`s` + `t`)
- ✅ Sessions should expire (recommended: 15 minutes)
- ✅ Each score submit should invalidate the session after use

---

## Repo Files

- `index.html` — Main game (HTML + CSS + JS)

---

## Deploy Checklist

1. Replace repo `index.html` with your latest working build
2. Enable GitHub Pages:
   - Repo → Settings → Pages
   - Deploy from branch → `main` → `/ (root)`
3. Confirm the URL loads on mobile
4. Confirm Telegram bot can open the game
5. Win a game and verify:
   - Telegram in-chat leaderboard updates
   - `/globaltop` shows the player globally

---

## License

MIT (or replace with your preferred license)
