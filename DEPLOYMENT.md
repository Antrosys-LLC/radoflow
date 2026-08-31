# Deploying RadoFlow

## Why a clean build can still return "Internal Server Error"

Nothing in this app needs Supabase to _build_ — pages are compiled without ever
connecting. But the middleware runs on **every** request and constructs a
Supabase client from environment variables. If those are not set on the host,
that constructor throws before any page renders, so every route (including the
login page) returns a bare `Internal Server Error` while the build log stays
completely green.

The app now detects this and returns a readable 503 naming the missing
variables instead. `/api/health` reports the same thing as JSON and is always
reachable, even when the rest of the app is refusing to serve.

```bash
curl https://your-app.up.railway.app/api/health
```

## Required variables

Set these in Railway → your service → **Variables**.

| Variable                        | Needed at             | Where to find it                  |
| ------------------------------- | --------------------- | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | **build and runtime** | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **build and runtime** | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY`     | runtime               | Supabase → Project Settings → API |
| `DEVICE_INGEST_SECRET`          | runtime               | `openssl rand -hex 32`            |

The two `NEXT_PUBLIC_` values matter at **build** time as well. Next inlines
them into the browser bundle when it compiles, so a build that ran without them
ships a bundle with `undefined` baked in — and adding them afterwards will not
fix it without a rebuild. Set the variables first, then redeploy.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security. It is only read on the
server; never prefix it with `NEXT_PUBLIC_`.

## Pointing at a cloud database

The local stack is for development. For a deployed app, create a Supabase
project and push the schema to it:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

That applies every migration in `supabase/migrations`. Do **not** run
`supabase/seed.sql` against production — it creates demo accounts with a
published password.

## The biometric terminals will not work from the cloud

This is a network fact, not a configuration problem. The ZKTeco K50 sits on the
factory LAN at `192.168.1.201`. A Railway container cannot route to a private
address, so:

- **Polling from Railway will always fail.** The background poller is therefore
  off unless `DEVICE_SYNC_ENABLED=true`, so a cloud deploy does not retry an
  unreachable device every minute and bury real errors.
- **Push mode needs a path inward.** The terminal uploads to
  `/iclock/cdata`, so it must be able to reach the deployed URL. That means
  outbound internet access from the factory network, with the public URL and
  port set in the terminal's _Menu → Comm → Cloud Server_.

Two workable arrangements:

1. **Push to the cloud** — terminal uploads directly to the Railway URL.
   Simplest, and needs no inbound firewall rule at the factory. Keep
   `DEVICE_SYNC_ENABLED` unset.
2. **A small on-site machine** — run RadoFlow (or just a sync worker) on a PC
   inside the factory with `DEVICE_SYNC_ENABLED=true`, pointed at the same
   Supabase project. It polls the terminal over the LAN and writes to the
   shared database; the cloud app reads the same data.

Do not set `DEVICE_SYNC_ENABLED=true` on more than one instance, or on a
Railway service scaled past one replica — several pollers would hit the same
terminal at once.

## Health check

`railway.json` points Railway's healthcheck at `/api/health`. It returns:

- `200 ok` — configured and the database answers
- `503 misconfigured` — variables missing, with their names
- `503 degraded` — configured but Supabase is unreachable (wrong URL, or a
  paused project)
