# Big Sky API

Cloudflare Worker behind the redesign's sticky notes and live cursors.

| Route | Does |
| --- | --- |
| `GET /notes?before=<id>&limit=24` | Visible notes, newest first |
| `POST /notes` | Pin a note. One a minute per visitor |
| `POST /notes/:id/hide` | Hide a note. `Authorization: Bearer $ADMIN_TOKEN` |
| `DELETE /notes/:id` | Delete a note. Same token |
| `GET /cursors` | WebSocket into the `CursorRoom` Durable Object. 50 people, 4 tabs each |

Privacy: no raw IPs are stored. The rate limit keys on SHA-256(`IP_SALT` + IP) in KV for 60 s. Cursor ids are random per connection, and nothing about cursors touches storage.

## Setup, once

```sh
cd worker
npm install
npx wrangler login
npx wrangler d1 create bigsky            # paste database_id into wrangler.toml
npx wrangler kv namespace create RATE    # paste id into wrangler.toml
npx wrangler d1 execute bigsky --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN      # long random string
npx wrangler secret put IP_SALT          # another one
npx wrangler secret put BLOCKLIST        # optional: extra words, comma separated; word* matches word starts
npx wrangler deploy                      # serves https://api.tannersteorts.com
```

Random strings: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

The worker runs on the `api.tannersteorts.com` custom domain, so the zone has to be on Cloudflare. Wrangler creates the DNS record and certificate.

Everything here fits the free plan. New Durable Objects must be SQLite-backed, which the `v1` migration is.

## Point the site at it

Astro reads `PUBLIC_BIGSKY_API` at build time. Unset, the guestbook keeps notes in the visitor's browser and cursors stay off.

It's set in the committed `.env` at the repo root. The URL is public; no secrets go in it.

```sh
PUBLIC_BIGSKY_API=https://api.tannersteorts.com
```

The GitHub Pages build reads it from the checkout. `localhost:4321` and `127.0.0.1:4321` are in `ALLOWED_ORIGINS`, so `npm run dev` works against the deployed worker. If the site moves, update `ALLOWED_ORIGINS` in `wrangler.toml`.

## Run it locally

```sh
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev                              # http://127.0.0.1:8787
```

Then start the site with `PUBLIC_BIGSKY_API=http://127.0.0.1:8787 npm run dev` from the repo root.

## Moderate

Open https://tannersteorts.com/moderate/ (or `/moderate/` on `npm run dev`), paste `ADMIN_TOKEN`, then hide or delete notes. Hidden notes drop off that list; delete them with curl.

```sh
API=https://api.tannersteorts.com
curl -X POST   -H "Authorization: Bearer $ADMIN_TOKEN" $API/notes/42/hide
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" $API/notes/42
npx wrangler d1 execute bigsky --remote --command "SELECT id, created_at, name, place, message, hidden FROM notes ORDER BY id DESC LIMIT 20"
```

## Rules for a note

- Name and place: 40 characters. Message: 140.
- Drawing: PNG data URL, 60 KB at most, 600 px a side at most. Optional if there's a message.
- Paper: `butter`, `mint`, `sky` or `blush`.
- No links. Control characters, zero-width marks and bidi overrides are stripped.
- Blocklist: a short default in `src/text.ts`, plus the `BLOCKLIST` secret.
