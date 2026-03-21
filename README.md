# Guess The Number — Telegram Game on Cloudflare Workers

A Telegram Game with:
- Casual and Hard modes
- global leaderboard
- web Top 10 leaderboard for both modes
- guest name submission for non-Telegram winners
- rank shown in the win modal
- direct-message leaderboard summary after each accepted Telegram score
- automatic 2-week seasonal reset with 30-day leaderboard retention

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
8. If you are upgrading an existing live database, run:
   `npm run db:migrate:seasonal:remote`
9. Start local dev:
   `npm run dev`
10. Deploy:
   `npm run deploy`

After deploy:
- set the Telegram webhook to `https://<your-worker>/telegram/webhook`
- set the BotFather game URL to `https://<your-worker>/`

Example webhook command:
`curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-worker>/telegram/webhook"`

## Behavior

- `/start`, `/help`, `/play`, `/globaltop`, and `/myrank` are handled directly by the Worker
- score submissions go to `POST /api/score_submit`
- guest score submissions go to `POST /api/guest_score_submit`
- rank lookups go to `GET /api/rank_get`
- page Top 10 data loads from `GET /api/leaderboard`
- each launched session can submit only one accepted score
- session tokens are hashed before storage
- leaderboard resets every 2 weeks by season and old entries are pruned after 30 days

## Notes

- The frontend is public; do not expose Telegram bot tokens there.
- The Worker uses same-origin API routes, so no extra public webhook endpoints are required.
- This repo no longer depends on TeleBotHost.
