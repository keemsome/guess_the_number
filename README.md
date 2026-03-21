# Guess The Number — Telegram Game on Cloudflare Workers

A Telegram Game with:
- Casual and Hard modes
- global leaderboard
- rank shown in the win modal
- direct-message leaderboard summary after each accepted score

The project now runs as a single Cloudflare Workers app:
- static UI from [`public/index.html`](./public/index.html)
- Telegram webhook and game APIs from [`src/index.js`](./src/index.js)
- leaderboard/session storage in D1 via [`schema.sql`](./schema.sql)

## Files

- [`public/index.html`](./public/index.html): game UI
- [`src/index.js`](./src/index.js): Worker routes, Telegram webhook, score/rank API
- [`schema.sql`](./schema.sql): D1 schema
- [`wrangler.jsonc`](./wrangler.jsonc): Cloudflare config

## Deploy

1. Install dependencies:
   `npm install`
2. Create local env file:
   `cp .dev.vars.example .dev.vars`
3. Put your Telegram bot token in `.dev.vars`.
4. Update `GAME_SHORT_NAME` and `PUBLIC_BASE_URL` in [`wrangler.jsonc`](./wrangler.jsonc).
5. Create a D1 database:
   `npx wrangler d1 create guess-the-number-db`
6. Put the returned `database_id` into [`wrangler.jsonc`](./wrangler.jsonc).
7. Apply the schema:
   `npm run db:apply:local`
8. Start local dev:
   `npm run dev`
9. Deploy:
   `npm run deploy`

After deploy:
- set the Telegram webhook to `https://<your-worker>/telegram/webhook`
- set the BotFather game URL to `https://<your-worker>/`

Example webhook command:
`curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-worker>/telegram/webhook"`

## Behavior

- `/start`, `/help`, `/play`, `/globaltop`, and `/myrank` are handled directly by the Worker
- score submissions go to `POST /api/score_submit`
- rank lookups go to `GET /api/rank_get`
- each launched session can submit only one accepted score
- session tokens are hashed before storage

## Notes

- The frontend is public; do not expose Telegram bot tokens there.
- The Worker uses same-origin API routes, so no extra public webhook endpoints are required.
- This repo no longer depends on TeleBotHost.
