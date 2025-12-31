# TelebotHost Commands & Webhooks (Copy/Paste)

This file contains **all TelebotHost scripts** needed to run the game + global leaderboard.

## Naming rules
- Chat commands (typed by users) start with `/` (e.g. `/start`)
- Webhook commands (called by the HTML) have **no slash** (e.g. `score_submit`)
- Telegram handlers: `handle_callback_query`, `handle_inline_query`

> Do **NOT** paste any `-END-` separators into TelebotHost — those are just document separators.

---

## 1) `/start` (chat command)

```js
// /start
if (!chat || !chat.id) return;

Api.sendMessage({
  chat_id: chat.id,
  text:
    "🎯 *Guess the Number!*\n\n" +
    "• Casual: 3 digits (max 30 guesses)\n" +
    "• Hard: 4 digits (max 20 guesses)\n\n" +
    "Tap *Play* to start.",
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "🎮 Play", callback_data: "UI:PLAY" }],
      [{ text: "ℹ️ Help", callback_data: "UI:HELP" }]
    ]
  }
});
```

---

## 2) `/help` (chat command)

```js
// /help
if (!chat || !chat.id) return;

Api.sendMessage({
  chat_id: chat.id,
  text:
    "🧩 *How to play*\n\n" +
    "1) Type /play\n" +
    "2) Tap *Play*\n" +
    "3) Guess the number (no repeated digits)\n\n" +
    "Inline: type @<YOUR_BOT_USERNAME> in any chat.",
  parse_mode: "Markdown"
});
```

---

## 3) `/globaltop` (chat command)

Shows the **Top 10 runs** (duplicates allowed).

```js
// /globaltop [hard|casual]

function normMode(m) {
  m = String(m || "").toLowerCase().trim();
  return (m === "hard") ? "hard" : "casual";
}
function lbKeyForMode(mode) {
  return mode === "hard" ? "global_lb_hard_v1" : "global_lb_casual_v1";
}

const mode = normMode(params);
const key = lbKeyForMode(mode);

let list = Bot.getProperty(key);
if (typeof list === "string") {
  try { list = JSON.parse(list); } catch (e) { list = []; }
}
if (!Array.isArray(list)) list = [];

// Ensure sorted best-first
list.sort((a, b) => {
  const ds = Number(b.score || 0) - Number(a.score || 0);
  if (ds !== 0) return ds;
  return Number(b.at || 0) - Number(a.at || 0);
});

if (!list.length) {
  Bot.sendMessage(
    mode === "hard"
      ? "🔥 Global Top 10 — Hard\n\nNo scores yet."
      : "🙂 Global Top 10 — Casual\n\nNo scores yet."
  );
  return;
}

const title = mode === "hard" ? "🔥 Global Top 10 — Hard" : "🙂 Global Top 10 — Casual";
let text = title + "\n\n";

list.slice(0, 10).forEach((e, i) => {
  text += `${i + 1}. ${e.name} — ${e.score}\n`;
});

Bot.sendMessage(text);
```

---

## 4) `/myrank` (chat command)

Returns your **best rank currently in Top N** for the mode.

```js
// /myrank [hard|casual]

function normMode(m) {
  m = String(m || "").toLowerCase().trim();
  return (m === "hard") ? "hard" : "casual";
}
function lbKeyForMode(mode) {
  return mode === "hard" ? "global_lb_hard_v1" : "global_lb_casual_v1";
}

const mode = normMode(params);
const key = lbKeyForMode(mode);

let list = Bot.getProperty(key);
if (typeof list === "string") {
  try { list = JSON.parse(list); } catch (e) { list = []; }
}
if (!Array.isArray(list)) list = [];

// Ensure sorted best-first
list.sort((a, b) => {
  const ds = Number(b.score || 0) - Number(a.score || 0);
  if (ds !== 0) return ds;
  return Number(b.at || 0) - Number(a.at || 0);
});

const uid = String(user.id);
const bestIdx = list.findIndex(e => String(e.user_id) === uid);

if (bestIdx < 0) {
  Bot.sendMessage("No global score yet for " + (mode === "hard" ? "Hard" : "Casual") + ". Play a round first 🎯");
  return;
}

const e = list[bestIdx];

Bot.sendMessage(
  (mode === "hard" ? "🔥 *Hard* Global Rank\n\n" : "🙂 *Casual* Global Rank\n\n") +
    "Rank: *#" + (bestIdx + 1) + "*\n" +
    "Score: *" + e.score + "*\n" +
    "Name: " + e.name,
  { parse_mode: "Markdown" }
);
```

---

## 5) `handle_callback_query` (Telegram handler)

**Update these constants:**
- `GAME_SHORT_NAME`
- `GAME_URL`

```js
// handle_callback_query

const GAME_SHORT_NAME = "guessdanumber_bot";      // CHANGE THIS
const GAME_URL = "https://keemsome.github.io/guess_the_number/"; // CHANGE THIS
const SESSION_TTL_MS = 15 * 60 * 1000;

function makeId(len) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

if (!request) return;

// UI buttons from /start
if (request.data === "UI:PLAY") {
  Api.sendGame({
    chat_id: request.message.chat.id,
    game_short_name: GAME_SHORT_NAME
  });
  Api.answerCallbackQuery({ callback_query_id: request.id });
  return;
}

if (request.data === "UI:HELP") {
  Api.sendMessage({
    chat_id: request.message.chat.id,
    text:
      "🎯 *Guess The Number*\n\n" +
      "• No repeated digits\n" +
      "• Casual (3 digits) / Hard (4 digits)\n\n" +
      "Type /play to start — works in groups too!",
    parse_mode: "Markdown"
  });
  Api.answerCallbackQuery({ callback_query_id: request.id });
  return;
}

// Telegram Game Play callback
if (request.game_short_name === GAME_SHORT_NAME) {
  const sessionId = Date.now().toString(36) + makeId(10);
  const token = makeId(20);

  const from = request.from || {};

  const ctx = {
    token: token,
    created_at: Date.now(),
    expires_at: Date.now() + SESSION_TTL_MS,

    // Telegram identity for global LB
    user_id: from.id,
    first_name: from.first_name || "",
    last_name: from.last_name || "",
    username: from.username || "",

    // Launch context (group/private/inline)
    chat_id: request.message ? request.message.chat.id : null,
    message_id: request.message ? request.message.message_id : null,
    inline_message_id: request.inline_message_id || null
  };

  Bot.setProperty("sess:" + sessionId, ctx, "json");

  Api.answerCallbackQuery({
    callback_query_id: request.id,
    url: GAME_URL + "?s=" + encodeURIComponent(sessionId) + "&t=" + encodeURIComponent(token)
  });
  return;
}

// fallback
Api.answerCallbackQuery({ callback_query_id: request.id });
```

---

## 6) `handle_inline_query` (Telegram handler)

```js
// handle_inline_query
const GAME_SHORT_NAME = "guessdanumber_bot"; // must match your Telegram Game short name

Api.answerInlineQuery({
  inline_query_id: request.id,
  cache_time: 1,
  is_personal: true,
  results: [
    {
      type: "game",
      id: "guess_game_1",
      game_short_name: GAME_SHORT_NAME
    }
  ]
});
```

---

## 7) `score_submit` (webhook command — NO slash)

Stores **Top N runs** (duplicates allowed) and DM’s Top 10 + rank.

```js
// score_submit (webhook)

const KEEP_TOP_N = 100;   // keep only top N runs per mode
const MAX_SCORE = 50000;  // sanity cap

function getParam(name) {
  try {
    if (request?.params?.[name] !== undefined) return request.params[name];
    if (request?.query?.[name] !== undefined) return request.query[name];
  } catch (e) {}
  return null;
}

function normMode(m) {
  m = String(m || "").toLowerCase().trim();
  return (m === "hard") ? "hard" : "casual";
}

function lbKeyForMode(mode) {
  return mode === "hard" ? "global_lb_hard_v1" : "global_lb_casual_v1";
}

function displayNameFromCtx(ctx) {
  if (ctx.username) return "@" + ctx.username;
  const n = (String(ctx.first_name || "") + " " + String(ctx.last_name || "")).trim();
  return n || "Player";
}

function buildTopText(mode, list, highlightSubmitId) {
  const title = mode === "hard" ? "🔥 Global Top 10 — Hard" : "🙂 Global Top 10 — Casual";
  let text = title + "\n\n";
  const top = list.slice(0, 10);
  for (let i = 0; i < top.length; i++) {
    const e = top[i];
    const mark = (String(e.submit_id) === String(highlightSubmitId)) ? " ← you" : "";
    text += `${i + 1}. ${e.name} — ${e.score}${mark}\n`;
  }
  return text;
}

function sendJSON(obj) {
  try {
    if (typeof res !== "undefined" && typeof res.json === "function") {
      res.json(obj);
      return;
    }
  } catch (e) {}
  if (typeof res !== "undefined" && typeof res.text === "function") {
    res.text(JSON.stringify(obj));
  }
}

// Inputs
const sessionId = String(getParam("s") || "");
const token = String(getParam("t") || "");
const score = parseInt(getParam("score"), 10);
const mode = normMode(getParam("mode"));

if (!sessionId || !token || !Number.isFinite(score)) {
  sendJSON({ ok: false, error: "bad request" });
  return;
}

// Load session
let ctx = Bot.getProperty("sess:" + sessionId);
if (!ctx || String(ctx.token) !== token) {
  sendJSON({ ok: false, error: "forbidden" });
  return;
}

// Expiry
if (ctx.expires_at && Date.now() > ctx.expires_at) {
  Bot.setProperty("sess:" + sessionId, null, "json");
  sendJSON({ ok: false, error: "expired" });
  return;
}

// Sanity
if (score < 0 || score > MAX_SCORE) {
  sendJSON({ ok: false, error: "invalid score" });
  return;
}

// 1) Telegram in-chat leaderboard (optional)
try {
  if (ctx.inline_message_id) {
    Api.setGameScore({
      user_id: ctx.user_id,
      score: score,
      inline_message_id: ctx.inline_message_id
    });
  } else {
    Api.setGameScore({
      user_id: ctx.user_id,
      score: score,
      chat_id: ctx.chat_id,
      message_id: ctx.message_id
    });
  }
} catch (e) {}

// 2) Update GLOBAL leaderboard (Top N runs, duplicates allowed)
const key = lbKeyForMode(mode);

let list = Bot.getProperty(key);
if (typeof list === "string") {
  try { list = JSON.parse(list); } catch (e) { list = []; }
}
if (!Array.isArray(list)) list = [];

const now = Date.now();
const name = displayNameFromCtx(ctx);

// Unique id for this submission
const submit_id =
  String(ctx.user_id) + ":" + String(now) + ":" + String(Math.floor(Math.random() * 1e9));

list.push({
  submit_id: submit_id,
  user_id: ctx.user_id,
  name: name,
  score: score,
  at: now
});

// Sort best-first, tie-breaker: latest first
list.sort((a, b) => {
  const ds = Number(b.score || 0) - Number(a.score || 0);
  if (ds !== 0) return ds;
  return Number(b.at || 0) - Number(a.at || 0);
});

// Trim to top N
if (list.length > KEEP_TOP_N) list = list.slice(0, KEEP_TOP_N);

Bot.setProperty(key, list, "json");

// Rank for THIS submission
const rankIndex = list.findIndex(e => String(e.submit_id) === String(submit_id));
const rank = (rankIndex >= 0) ? (rankIndex + 1) : null;

// Store last submission in session (for rank_get)
ctx.last_submit = { mode: mode, submit_id: submit_id, score: score, at: now };
Bot.setProperty("sess:" + sessionId, ctx, "json");

// 3) Private DM Top10 + rank
try {
  const topText = buildTopText(mode, list, submit_id);
  let dmText = topText;
  if (rank) dmText += `\n\nYour rank: #${rank}`;
  else dmText += `\n\nYour rank: (not in Top ${KEEP_TOP_N})`;

  Api.sendMessage({ chat_id: ctx.user_id, text: dmText });
} catch (e) {}

// JSON response (optional)
sendJSON({ ok: true, mode: mode, score: score, rank: rank, total: list.length });
```

---

## 8) `rank_get` (webhook command — NO slash)

Used by the HTML to show **Global Rank** in the win modal.

```js
// rank_get (webhook)

function getParam(name) {
  try {
    if (request?.params?.[name] !== undefined) return request.params[name];
    if (request?.query?.[name] !== undefined) return request.query[name];
  } catch (e) {}
  return null;
}

function normMode(m) {
  m = String(m || "").toLowerCase().trim();
  return (m === "hard") ? "hard" : "casual";
}

function lbKeyForMode(mode) {
  return mode === "hard" ? "global_lb_hard_v1" : "global_lb_casual_v1";
}

function sendJSON(obj) {
  try {
    if (typeof res !== "undefined" && typeof res.json === "function") {
      res.json(obj);
      return;
    }
  } catch (e) {}
  if (typeof res !== "undefined" && typeof res.text === "function") {
    res.text(JSON.stringify(obj));
  }
}

const sessionId = String(getParam("s") || "");
const token = String(getParam("t") || "");
const mode = normMode(getParam("mode"));

if (!sessionId || !token) {
  sendJSON({ ok: false, error: "bad request" });
  return;
}

const ctx = Bot.getProperty("sess:" + sessionId);
if (!ctx || String(ctx.token) !== token) {
  sendJSON({ ok: false, error: "forbidden" });
  return;
}

if (ctx.expires_at && Date.now() > ctx.expires_at) {
  Bot.setProperty("sess:" + sessionId, null, "json");
  sendJSON({ ok: false, error: "expired" });
  return;
}

const key = lbKeyForMode(mode);

let list = Bot.getProperty(key);
if (typeof list === "string") {
  try { list = JSON.parse(list); } catch (e) { list = []; }
}
if (!Array.isArray(list)) list = [];

// Ensure sorted best-first
list.sort((a, b) => {
  const ds = Number(b.score || 0) - Number(a.score || 0);
  if (ds !== 0) return ds;
  return Number(b.at || 0) - Number(a.at || 0);
});

const uid = String(ctx.user_id);
const last = ctx.last_submit;

// 1) Try rank by the latest run (submit_id)
if (last && last.mode === mode && last.submit_id) {
  const idx = list.findIndex(e => String(e.submit_id) === String(last.submit_id));
  if (idx >= 0) {
    sendJSON({ ok: true, mode: mode, rank: idx + 1, score: Number(list[idx].score || 0), total: list.length });
    return;
  }
}

// 2) Fallback: best rank currently in Top N
const bestIdx = list.findIndex(e => String(e.user_id) === uid);
if (bestIdx >= 0) {
  sendJSON({ ok: true, mode: mode, rank: bestIdx + 1, score: Number(list[bestIdx].score || 0), total: list.length });
  return;
}

sendJSON({ ok: true, mode: mode, rank: null, score: null, total: list.length });
```

---

## Optional: URL helper commands

### `/show_submit_url`

```js
// /show_submit_url
if (!chat || !chat.id) return;

if (chat.type !== "private") {
  Bot.sendMessage("⚠️ Run this in private chat.");
  return;
}

let url = Webhook.getGlobalUrl("score_submit", { params: {} });
url = url.replace(/&/g, "&amp;");

Api.sendMessage({
  chat_id: chat.id,
  parse_mode: "HTML",
  disable_web_page_preview: true,
  text:
    "🔗 <b>Score submit endpoint</b>\n\n<code>" + url + "</code>\n\n" +
    "Your game should call this URL with:\n" +
    "<code>&amp;s=SESSION&amp;t=TOKEN&amp;score=SCORE&amp;mode=casual|hard</code>"
});
```

### `/show_rank_url`

```js
// /show_rank_url
if (!chat || !chat.id) return;

if (chat.type !== "private") {
  Bot.sendMessage("⚠️ Run this in private chat.");
  return;
}

let url = Webhook.getGlobalUrl("rank_get", { params: {} });
url = url.replace(/&/g, "&amp;");

Api.sendMessage({
  chat_id: chat.id,
  parse_mode: "HTML",
  disable_web_page_preview: true,
  text:
    "🔗 <b>Rank endpoint</b>\n\n<code>" + url + "</code>\n\n" +
    "Your game should call this URL with:\n" +
    "<code>&amp;s=SESSION&amp;t=TOKEN&amp;mode=casual|hard</code>"
});
```
