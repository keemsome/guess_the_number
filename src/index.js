const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SCORE = 50_000;
const TOP_LIMIT = 10;
const SEASON_MS = 14 * 24 * 60 * 60 * 1000;
const LEADERBOARD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const GUEST_NAME_MAX_LENGTH = 20;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    if (url.pathname === "/api/score_submit" && request.method === "POST") {
      return handleScoreSubmit(request, env);
    }

    if (url.pathname === "/api/guest_score_submit" && request.method === "POST") {
      return handleGuestScoreSubmit(request, env);
    }

    if (url.pathname === "/api/rank_get" && request.method === "GET") {
      return handleRankGet(request, env);
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      return handleLeaderboardGet(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runMaintenance(env.DB));
  }
};

async function handleTelegramWebhook(request, env) {
  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: false, error: "bad_request" }, 400);

  if (update.message) {
    await handleMessage(update.message, env);
  } else if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, env);
  } else if (update.inline_query) {
    await handleInlineQuery(update.inline_query, env);
  }

  return json({ ok: true });
}

async function handleMessage(message, env) {
  const text = (message.text || "").trim();
  if (!text.startsWith("/")) return;

  const [command, arg] = text.split(/\s+/, 2);
  const normalized = command.split("@")[0].toLowerCase();
  const chatId = message.chat.id;
  const season = getSeasonInfo();

  if (normalized === "/start") {
    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text:
        "🎯 *Guess the Number!*\n\n" +
        "• Casual: 3 digits (max 30 guesses)\n" +
        "• Hard: 4 digits (max 20 guesses)\n\n" +
        "Tap *Play* or type /play to start.",
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎮 Play", callback_data: "UI:PLAY" }],
          [{ text: "ℹ️ Help", callback_data: "UI:HELP" }]
        ]
      }
    });
  }

  if (normalized === "/help") {
    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text:
        "🧩 *How to play*\n\n" +
        "1) Type /play or tap *Play*\n" +
        "2) Guess the number\n" +
        "3) Digits cannot repeat\n\n" +
        "Inline: type @<YOUR_BOT_USERNAME> in any chat.",
      parse_mode: "Markdown"
    });
  }

  if (normalized === "/play") {
    return telegramApi(env, "sendGame", {
      chat_id: chatId,
      game_short_name: env.GAME_SHORT_NAME
    });
  }

  if (normalized === "/globaltop") {
    const mode = normMode(arg);
    const entries = await getTopEntries(env.DB, mode, season.key, TOP_LIMIT);
    const title = mode === "hard" ? "🔥 Global Top 10 — Hard" : "🙂 Global Top 10 — Casual";
    const textBody = entries.length
      ? entries.map((entry, index) => `${index + 1}. ${formatLeaderboardTextEntry(entry)}`).join("\n")
      : "No scores yet this season.";

    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text: `${title}\n\n${textBody}`
    });
  }

  if (normalized === "/myrank") {
    const mode = normMode(arg);
    const userId = String(message.from.id);
    const best = await getBestEntryForUser(env.DB, userId, mode, season.key);

    if (!best) {
      return telegramApi(env, "sendMessage", {
        chat_id: chatId,
        text: `No global score yet this season for ${mode === "hard" ? "Hard" : "Casual"}. Play a round first 🎯`
      });
    }

    const rank = await getRankForEntry(env.DB, best);
    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text:
        `${mode === "hard" ? "🔥 *Hard*" : "🙂 *Casual*"} Global Rank\n\n` +
        `Rank: *#${rank}*\n` +
        `Score: *${best.score}*\n` +
        `Name: ${best.name}`,
      parse_mode: "Markdown"
    });
  }
}

async function handleCallbackQuery(callbackQuery, env) {
  if (callbackQuery.data === "UI:PLAY") {
    await telegramApi(env, "sendGame", {
      chat_id: callbackQuery.message.chat.id,
      game_short_name: env.GAME_SHORT_NAME
    });
    return telegramApi(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id
    });
  }

  if (callbackQuery.data === "UI:HELP") {
    await telegramApi(env, "sendMessage", {
      chat_id: callbackQuery.message.chat.id,
      text:
        "🎯 *Guess The Number*\n\n" +
        "• No repeated digits\n" +
        "• Casual (3 digits) / Hard (4 digits)\n\n" +
        "Type /play to start.",
      parse_mode: "Markdown"
    });
    return telegramApi(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id
    });
  }

  if (callbackQuery.game_short_name === env.GAME_SHORT_NAME) {
    const session = createSessionPayload(callbackQuery, env.PUBLIC_BASE_URL);
    await saveSession(env.DB, session);

    return telegramApi(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      url: session.gameUrl
    });
  }

  return telegramApi(env, "answerCallbackQuery", {
    callback_query_id: callbackQuery.id
  });
}

async function handleInlineQuery(inlineQuery, env) {
  return telegramApi(env, "answerInlineQuery", {
    inline_query_id: inlineQuery.id,
    cache_time: 1,
    is_personal: true,
    results: [
      {
        type: "game",
        id: "guess_game_1",
        game_short_name: env.GAME_SHORT_NAME
      }
    ]
  });
}

async function handleScoreSubmit(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "bad_request" }, 400);

  const sessionId = String(body.s || "");
  const token = String(body.t || "");
  const mode = normMode(body.mode);
  const score = Number.parseInt(body.score, 10);
  const roundsUsed = Number.parseInt(body.rounds_used, 10);
  const timeUsedMs = Number.parseInt(body.time_used_ms, 10);

  if (!sessionId || !token || !Number.isFinite(score) || !Number.isFinite(roundsUsed) || !Number.isFinite(timeUsedMs)) {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  if (score < 0 || score > MAX_SCORE || roundsUsed < 1 || timeUsedMs < 0) {
    return json({ ok: false, error: "invalid_score" }, 400);
  }

  const session = await loadSession(env.DB, sessionId);
  if (!session || session.token_hash !== await sha256(token)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const now = Date.now();
  if (Number(session.expires_at) < now) {
    return json({ ok: false, error: "expired" }, 403);
  }

  const claimed = await env.DB.prepare(
    "UPDATE sessions SET submitted_at = ? WHERE session_id = ? AND submitted_at IS NULL"
  ).bind(now, sessionId).run();

  if ((claimed.meta?.changes || 0) === 0) {
    return json({ ok: false, error: "already_submitted" }, 409);
  }

  const season = getSeasonInfo(now);
  const submitId = `${session.user_id}:${now}:${crypto.randomUUID()}`;
  const displayName = displayNameFromSession(session);
  const entry = makeLeaderboardEntry({
    submitId,
    mode,
    seasonKey: season.key,
    playerSource: "telegram",
    userId: String(session.user_id),
    name: displayName,
    score,
    roundsUsed,
    timeUsedMs,
    createdAt: now
  });

  await insertLeaderboardEntry(env.DB, entry);
  await env.DB.prepare(
    "UPDATE sessions SET last_mode = ?, last_submit_id = ?, last_score = ? WHERE session_id = ?"
  ).bind(mode, submitId, score, sessionId).run();

  const rank = await getRankForEntry(env.DB, entry);
  const total = await countSeasonEntries(env.DB, mode, season.key);

  await setTelegramGameScore(env, session, score);
  await sendRankDirectMessage(env, session.user_id, mode, season.key, submitId, rank, score, env.DB);

  return json({
    ok: true,
    mode,
    season_key: season.key,
    score,
    rounds_used: roundsUsed,
    time_used_ms: timeUsedMs,
    rank,
    total
  });
}

async function handleGuestScoreSubmit(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "bad_request" }, 400);

  const mode = normMode(body.mode);
  const score = Number.parseInt(body.score, 10);
  const roundsUsed = Number.parseInt(body.rounds_used, 10);
  const timeUsedMs = Number.parseInt(body.time_used_ms, 10);
  const normalizedName = normalizeGuestName(body.name);

  if (!Number.isFinite(score) || !Number.isFinite(roundsUsed) || !Number.isFinite(timeUsedMs) ||
      score < 0 || score > MAX_SCORE || roundsUsed < 1 || timeUsedMs < 0) {
    return json({ ok: false, error: "invalid_score" }, 400);
  }

  if (!normalizedName.ok) {
    return json({ ok: false, error: "invalid_name", message: normalizedName.message }, 400);
  }

  const season = getSeasonInfo();
  const topEntries = await getTopEntries(env.DB, mode, season.key, TOP_LIMIT);
  if (!scoreQualifiesForTop(topEntries, score)) {
    return json({
      ok: false,
      error: "not_qualified",
      minimum_score_to_qualify: getMinimumScoreToQualify(topEntries)
    }, 409);
  }

  const now = Date.now();
  const submitId = `guest:${now}:${crypto.randomUUID()}`;
  const entry = makeLeaderboardEntry({
    submitId,
    mode,
    seasonKey: season.key,
    playerSource: "guest",
    userId: `guest:${submitId}`,
    name: normalizedName.value,
    score,
    roundsUsed,
    timeUsedMs,
    createdAt: now
  });

  await insertLeaderboardEntry(env.DB, entry);

  const rank = await getRankForEntry(env.DB, entry);
  if (rank > TOP_LIMIT) {
    await deleteLeaderboardEntry(env.DB, submitId);
    return json({
      ok: false,
      error: "not_qualified",
      minimum_score_to_qualify: getMinimumScoreToQualify(await getTopEntries(env.DB, mode, season.key, TOP_LIMIT))
    }, 409);
  }

  const entries = await getTopEntries(env.DB, mode, season.key, TOP_LIMIT);
  return json({
    ok: true,
    mode,
    season_key: season.key,
    rank,
    score,
    total: await countSeasonEntries(env.DB, mode, season.key),
    entries: serializeLeaderboard(entries)
  });
}

async function handleRankGet(request, env) {
  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get("s") || "");
  const token = String(url.searchParams.get("t") || "");
  const mode = normMode(url.searchParams.get("mode"));

  if (!sessionId || !token) return json({ ok: false, error: "bad_request" }, 400);

  const session = await loadSession(env.DB, sessionId);
  if (!session || session.token_hash !== await sha256(token)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  if (Number(session.expires_at) < Date.now()) {
    return json({ ok: false, error: "expired" }, 403);
  }

  const season = getSeasonInfo();
  const total = await countSeasonEntries(env.DB, mode, season.key);

  if (session.last_submit_id && session.last_mode === mode) {
    const lastEntry = await getEntryBySubmitId(env.DB, session.last_submit_id);

    if (lastEntry && lastEntry.season_key === season.key) {
      return json({
        ok: true,
        mode,
        season_key: season.key,
        rank: await getRankForEntry(env.DB, lastEntry),
        score: Number(lastEntry.score || 0),
        rounds_used: Number(lastEntry.rounds_used || 0),
        time_used_ms: Number(lastEntry.time_used_ms || 0),
        total
      });
    }
  }

  const best = await getBestEntryForUser(env.DB, String(session.user_id), mode, season.key);
  if (!best) {
    return json({
      ok: true,
      mode,
      season_key: season.key,
      rank: null,
      score: null,
      total
    });
  }

  return json({
    ok: true,
    mode,
    season_key: season.key,
    rank: await getRankForEntry(env.DB, best),
    score: Number(best.score || 0),
    rounds_used: Number(best.rounds_used || 0),
    time_used_ms: Number(best.time_used_ms || 0),
    total
  });
}

async function handleLeaderboardGet(request, env) {
  const url = new URL(request.url);
  const mode = normMode(url.searchParams.get("mode"));
  const season = getSeasonInfo();
  const entries = await getTopEntries(env.DB, mode, season.key, TOP_LIMIT);

  return json({
    ok: true,
    mode,
    season_key: season.key,
    season_started_at: season.startMs,
    season_ends_at: season.endMs,
    total: await countSeasonEntries(env.DB, mode, season.key),
    minimum_score_to_qualify: getMinimumScoreToQualify(entries),
    entries: serializeLeaderboard(entries)
  });
}

function createSessionPayload(callbackQuery, baseUrl) {
  const sessionId = `${Date.now().toString(36)}${randomId(10)}`;
  const token = randomId(20);
  const now = Date.now();
  const from = callbackQuery.from || {};
  const message = callbackQuery.message || null;
  const gameUrl = `${baseUrl.replace(/\/$/, "")}/?s=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}`;

  return {
    sessionId,
    token,
    tokenHashPromise: sha256(token),
    user_id: String(from.id || ""),
    first_name: from.first_name || "",
    last_name: from.last_name || "",
    username: from.username || "",
    chat_id: message?.chat?.id ?? null,
    message_id: message?.message_id ?? null,
    inline_message_id: callbackQuery.inline_message_id || null,
    created_at: now,
    expires_at: now + SESSION_TTL_MS,
    gameUrl
  };
}

async function saveSession(db, session) {
  await db.prepare(
    `INSERT INTO sessions (
      session_id, token_hash, user_id, first_name, last_name, username,
      chat_id, message_id, inline_message_id, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    session.sessionId,
    await session.tokenHashPromise,
    session.user_id,
    session.first_name,
    session.last_name,
    session.username,
    session.chat_id,
    session.message_id,
    session.inline_message_id,
    session.created_at,
    session.expires_at
  ).run();
}

function normMode(value) {
  return String(value || "").trim().toLowerCase() === "hard" ? "hard" : "casual";
}

function getSeasonInfo(now = Date.now()) {
  const seasonIndex = Math.floor(now / SEASON_MS);
  const startMs = seasonIndex * SEASON_MS;
  return {
    key: `s${seasonIndex}`,
    startMs,
    endMs: startMs + SEASON_MS
  };
}

function displayNameFromSession(session) {
  if (session.username) return `@${session.username}`;
  const name = `${session.first_name || ""} ${session.last_name || ""}`.trim();
  return name || "Player";
}

function normalizeGuestName(name) {
  const value = String(name || "").replace(/\s+/g, " ").trim();
  if (value.length < 2) {
    return { ok: false, message: "Name must be at least 2 characters." };
  }
  if (value.length > GUEST_NAME_MAX_LENGTH) {
    return { ok: false, message: `Name must be ${GUEST_NAME_MAX_LENGTH} characters or less.` };
  }
  if (/[\u0000-\u001f\u007f<>]/.test(value)) {
    return { ok: false, message: "Name contains invalid characters." };
  }
  return { ok: true, value };
}

function scoreQualifiesForTop(entries, score) {
  if (entries.length < TOP_LIMIT) return true;
  const lastEntry = entries[entries.length - 1];
  return score >= Number(lastEntry.score || 0);
}

function getMinimumScoreToQualify(entries) {
  if (entries.length < TOP_LIMIT) return null;
  return Number(entries[entries.length - 1].score || 0);
}

function makeLeaderboardEntry({ submitId, mode, seasonKey, playerSource, userId, name, score, roundsUsed, timeUsedMs, createdAt }) {
  return {
    submit_id: submitId,
    mode,
    season_key: seasonKey,
    player_source: playerSource,
    user_id: userId,
    name,
    score,
    rounds_used: roundsUsed,
    time_used_ms: timeUsedMs,
    created_at: createdAt
  };
}

function randomId(length) {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length).toUpperCase();
}

async function loadSession(db, sessionId) {
  return db.prepare("SELECT * FROM sessions WHERE session_id = ?").bind(sessionId).first();
}

async function getEntryBySubmitId(db, submitId) {
  return db.prepare(
    "SELECT submit_id, mode, season_key, player_source, user_id, name, score, rounds_used, time_used_ms, created_at FROM leaderboard_entries WHERE submit_id = ?"
  ).bind(submitId).first();
}

async function insertLeaderboardEntry(db, entry) {
  return db.prepare(
    `INSERT INTO leaderboard_entries (
      submit_id, mode, season_key, player_source, user_id, name, score, rounds_used, time_used_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    entry.submit_id,
    entry.mode,
    entry.season_key,
    entry.player_source,
    entry.user_id,
    entry.name,
    entry.score,
    entry.rounds_used,
    entry.time_used_ms,
    entry.created_at
  ).run();
}

async function deleteLeaderboardEntry(db, submitId) {
  return db.prepare("DELETE FROM leaderboard_entries WHERE submit_id = ?").bind(submitId).run();
}

async function getTopEntries(db, mode, seasonKey, limit) {
  const result = await db.prepare(
    `SELECT submit_id, mode, season_key, player_source, user_id, name, score, rounds_used, time_used_ms, created_at
     FROM leaderboard_entries
     WHERE mode = ? AND season_key = ?
     ORDER BY score DESC, created_at DESC, submit_id DESC
     LIMIT ?`
  ).bind(mode, seasonKey, limit).all();

  return result.results || [];
}

async function countSeasonEntries(db, mode, seasonKey) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM leaderboard_entries WHERE mode = ? AND season_key = ?"
  ).bind(mode, seasonKey).first();

  return Number(row?.count || 0);
}

async function getBestEntryForUser(db, userId, mode, seasonKey) {
  return db.prepare(
    `SELECT submit_id, mode, season_key, player_source, user_id, name, score, rounds_used, time_used_ms, created_at
     FROM leaderboard_entries
     WHERE mode = ? AND season_key = ? AND user_id = ?
     ORDER BY score DESC, created_at DESC, submit_id DESC
     LIMIT 1`
  ).bind(mode, seasonKey, userId).first();
}

async function getRankForEntry(db, entry) {
  const row = await db.prepare(
    `SELECT COUNT(*) + 1 AS rank
     FROM leaderboard_entries
     WHERE mode = ?
       AND season_key = ?
       AND (
         score > ?
         OR (score = ? AND created_at > ?)
         OR (score = ? AND created_at = ? AND submit_id > ?)
       )`
  ).bind(
    entry.mode,
    entry.season_key,
    entry.score,
    entry.score,
    entry.created_at,
    entry.score,
    entry.created_at,
    entry.submit_id
  ).first();

  return Number(row?.rank || 1);
}

function serializeLeaderboard(entries) {
  return entries.map((entry, index) => ({
    rank: index + 1,
    name: entry.name,
    score: Number(entry.score || 0),
    rounds_used: Number(entry.rounds_used || 0),
    time_used_ms: Number(entry.time_used_ms || 0),
    player_source: entry.player_source,
    created_at: Number(entry.created_at || 0)
  }));
}

function formatTimeUsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatLeaderboardTextEntry(entry) {
  return `${entry.name} — ${entry.score} pts · ${Number(entry.rounds_used || 0)} rounds · ${formatTimeUsed(entry.time_used_ms)}`;
}

async function setTelegramGameScore(env, session, score) {
  const payload = session.inline_message_id
    ? {
        user_id: Number(session.user_id),
        score,
        inline_message_id: session.inline_message_id
      }
    : {
        user_id: Number(session.user_id),
        score,
        chat_id: session.chat_id,
        message_id: session.message_id
      };

  return telegramApi(env, "setGameScore", payload).catch(() => null);
}

async function sendRankDirectMessage(env, userId, mode, seasonKey, submitId, rank, score, db) {
  const top = await getTopEntries(db, mode, seasonKey, TOP_LIMIT);
  const title = mode === "hard" ? "🔥 Global Top 10 — Hard" : "🙂 Global Top 10 — Casual";
  const body = top.map((entry, index) => {
    const suffix = entry.submit_id === submitId ? " ← you" : "";
    return `${index + 1}. ${formatLeaderboardTextEntry(entry)}${suffix}`;
  }).join("\n");

  const text =
    `${title}\n\n${body || "No scores yet this season."}\n\n` +
    `Your rank: ${rank ? `#${rank}` : "not ranked"}\n` +
    `Score: ${score}`;

  return telegramApi(env, "sendMessage", { chat_id: userId, text }).catch(() => null);
}

async function runMaintenance(db) {
  const cutoff = Date.now() - LEADERBOARD_RETENTION_MS;
  await db.prepare("DELETE FROM leaderboard_entries WHERE created_at < ?").bind(cutoff).run();
  await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
}

async function telegramApi(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed with ${response.status}`);
  }

  return response.json();
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
