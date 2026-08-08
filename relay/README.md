# pzmap Live relay

Cloudflare Worker + Durable Object that lets browser tabs (and the server bridge) share live
positions inside a "room" — see `docs/plans/2026-08-08-pzmap-live-2-relay.md` for the design.

## Local development

    npm install
    npm run dev          # wrangler dev, listens on the default port wrangler picks
    npm test              # vitest, pure room logic only

## Deploying

    npm run deploy

Requires a Cloudflare account logged in via `wrangler login` — this repo doesn't do that for
you. After deploying, set `VITE_RELAY_URL=wss://<your-worker>.<your-subdomain>.workers.dev` in
the web app's environment (Vercel project settings, or a local `.env.local`).
