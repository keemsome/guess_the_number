const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_SCORE = 50_000;
const TOP_LIMIT = 10;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    if (url.pathname === "/api/score_submit" && request.method === "POST") {
      return handleScoreSubmit(request, env);
    }

    if (url.pathname === "/api/rank_get" && request.method === "GET") {
      return handleRankGet(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
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
    const lines = await getTopLines(env.DB, mode, TOP_LIMIT);
    const title = mode === "hard" ? "🔥 Global Top 10 — Hard" : "🙂 Global Top 10 — Casual";
    const textBody = lines.length
      ? lines.map((entry, index) => `${index + 1}. ${entry.name} — ${entry.score}`).join("\n")
      : "No scores yet.";

    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text: `${title}\n\n${textBody}`
    });
  }

  if (normalized === "/myrank") {
    const mode = normMode(arg);
    const userId = String(message.from.id);
    const best = await getBestEntryForUser(env.DB, userId, mode);

    if (!best) {
      return telegramApi(env, "sendMessage", {
        chat_id: chatId,
        text: `No global score yet for ${mode === "hard" ? "Hard" : "Casual"}. Play a round first 🎯`
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

  if (!sessionId || !token || !Number.isFinite(score)) {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  if (score < 0 || score > MAX_SCORE) {
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

  const submitId = `${session.user_id}:${now}:${crypto.randomUUID()}`;
  const displayName = displayNameFromSession(session);

  await env.DB.prepare(
    "INSERT INTO leaderboard_entries (submit_id, mode, user_id, name, score, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(submitId, mode, String(session.user_id), displayName, score, now).run();

  await env.DB.prepare(
    "UPDATE sessions SET last_mode = ?, last_submit_id = ?, last_score = ? WHERE session_id = ?"
  ).bind(mode, submitId, score, sessionId).run();

  const entry = {
    submit_id: submitId,
    mode,
    user_id: String(session.user_id),
    name: displayName,
    score,
    created_at: now
  };

  const rank = await getRankForEntry(env.DB, entry);
  const totalRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM leaderboard_entries WHERE mode = ?"
  ).bind(mode).first();

  await setTelegramGameScore(env, session, score);
  await sendRankDirectMessage(env, session.user_id, mode, submitId, rank, score, env.DB);

  return json({
    ok: true,
    mode,
    score,
    rank,
    total: Number(totalRow?.count || 0)
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

  if (session.last_submit_id && session.last_mode === mode) {
    const lastEntry = await env.DB.prepare(
      "SELECT submit_id, mode, user_id, name, score, created_at FROM leaderboard_entries WHERE submit_id = ?"
    ).bind(session.last_submit_id).first();

    if (lastEntry) {
      const rank = await getRankForEntry(env.DB, lastEntry);
      const totalRow = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM leaderboard_entries WHERE mode = ?"
      ).bind(mode).first();

      return json({
        ok: true,
        mode,
        rank,
        score: Number(lastEntry.score || 0),
        total: Number(totalRow?.count || 0)
      });
    }
  }

  const best = await getBestEntryForUser(env.DB, String(session.user_id), mode);
  const totalRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM leaderboard_entries WHERE mode = ?"
  ).bind(mode).first();

  if (!best) {
    return json({
      ok: true,
      mode,
      rank: null,
      score: null,
      total: Number(totalRow?.count || 0)
    });
  }

  return json({
    ok: true,
    mode,
    rank: await getRankForEntry(env.DB, best),
    score: Number(best.score || 0),
    total: Number(totalRow?.count || 0)
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

function displayNameFromSession(session) {
  if (session.username) return `@${session.username}`;
  const name = `${session.first_name || ""} ${session.last_name || ""}`.trim();
  return name || "Player";
}

function randomId(length) {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length).toUpperCase();
}

async function loadSession(db, sessionId) {
  return db.prepare("SELECT * FROM sessions WHERE session_id = ?").bind(sessionId).first();
}

async function getTopLines(db, mode, limit) {
  const result = await db.prepare(
    "SELECT name, score FROM leaderboard_entries WHERE mode = ? ORDER BY score DESC, created_at DESC LIMIT ?"
  ).bind(mode, limit).all();

  return result.results || [];
}

async function getBestEntryForUser(db, userId, mode) {
  return db.prepare(
    `SELECT submit_id, mode, user_id, name, score, created_at
     FROM leaderboard_entries
     WHERE mode = ? AND user_id = ?
     ORDER BY score DESC, created_at DESC
     LIMIT 1`
  ).bind(mode, userId).first();
}

async function getRankForEntry(db, entry) {
  const row = await db.prepare(
    `SELECT COUNT(*) + 1 AS rank
     FROM leaderboard_entries
     WHERE mode = ?
       AND (
         score > ?
         OR (score = ? AND created_at > ?)
         OR (score = ? AND created_at = ? AND submit_id > ?)
       )`
  ).bind(
    entry.mode,
    entry.score,
    entry.score,
    entry.created_at,
    entry.score,
    entry.created_at,
    entry.submit_id
  ).first();

  return Number(row?.rank || 1);
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

async function sendRankDirectMessage(env, userId, mode, submitId, rank, score, db) {
  const top = await db.prepare(
    "SELECT submit_id, name, score FROM leaderboard_entries WHERE mode = ? ORDER BY score DESC, created_at DESC LIMIT ?"
  ).bind(mode, TOP_LIMIT).all();

  const title = mode === "hard" ? "🔥 Global Top 10 — Hard" : "🙂 Global Top 10 — Casual";
  const body = (top.results || []).map((entry, index) => {
    const suffix = entry.submit_id === submitId ? " ← you" : "";
    return `${index + 1}. ${entry.name} — ${entry.score}${suffix}`;
  }).join("\n");

  const text = `${title}\n\n${body || "No scores yet."}\n\nYour rank: ${rank ? `#${rank}` : "not ranked"}\nScore: ${score}`;
  return telegramApi(env, "sendMessage", { chat_id: userId, text }).catch(() => null);
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
