# Deploying to a Raspberry Pi

The whole backend runs in Docker — nothing is installed bare on the Pi. Two
containers: **pocketbase** (serves the API *and* the built PWA from `pb_public`)
and **caddy** (automatic HTTPS via Let's Encrypt, reverse-proxies to PocketBase).
Your data lives in one Docker volume (`pb_data`) — that's the only thing to back
up.

## Prerequisites

- Raspberry Pi running a 64-bit OS (Pi 4/5 recommended).
- Docker + Docker Compose plugin: `curl -fsSL https://get.docker.com | sh`
- A free domain via **DuckDNS** (https://www.duckdns.org) → e.g.
  `yourname.duckdns.org`. Note your token.
- Your home router forwarding **ports 80 and 443** to the Pi (Let's Encrypt and
  the app need these reachable from the internet).

## 1. Get the code on the Pi

```sh
git clone <your-repo-url> meal-planner && cd meal-planner
```

## 2. Configure

Create a `.env` next to `docker-compose.yml`:

```sh
DOMAIN=yourname.duckdns.org
# Only if you want the container to update DuckDNS for you (skip if your
# router already does dynamic DNS):
DUCKDNS_SUBDOMAIN=yourname
DUCKDNS_TOKEN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## 3. Start it

```sh
docker compose up -d --build          # add: --profile ddns  (to run the DuckDNS updater)
```

The first build compiles the PWA and downloads PocketBase for the Pi's arch — it
takes a few minutes. Caddy fetches a TLS certificate automatically once your
domain resolves to the Pi and 80/443 are reachable.

## 4. Create the PocketBase superuser (server operator)

This is the server-level admin (separate from app users):

```sh
docker compose exec pocketbase ./pocketbase superuser upsert you@example.com 'a-strong-password'
docker compose restart pocketbase
```

## 5. Bootstrap the first family admin

Run the seed via Compose, on the Pi. It reaches PocketBase over the internal
Docker network (don't point it at your public URL from inside your home — most
routers block that NAT loopback):

```sh
PB_SUPERUSER_EMAIL=you@example.com \
PB_SUPERUSER_PASSWORD='a-strong-password' \
ADMIN_NAME="Adam" \
docker compose --profile seed run --rm seed-admin
```

It prints a one-time invite link (using your public `APP_URL`). Open it once on your phone → you're signed in
as the first admin (and the starter recipes/plan are seeded). From **Account →
Manage family**, add your wife (set her role to Admin) and the kids (members
with the capabilities you choose); share each person their invite link.

## Backups

Everything is in the `pb_data` volume. Snapshot it any time:

```sh
docker run --rm -v meal-planner_pb_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/pb_data_$(date +%F).tgz -C /data .
```

Restore by extracting back into the volume while the stack is stopped.

## Updating

```sh
git pull && docker compose up -d --build
```

Schema changes ship as PocketBase migrations in the image and apply on startup.

## Notes / troubleshooting

- **HTTPS not issuing:** confirm `DOMAIN` resolves to your home IP and ports
  80/443 are forwarded to the Pi; check `docker compose logs caddy`.
- **superuser auth fails right after `upsert`:** restart the pocketbase
  container so the running server picks up the new account (step 4 does this).
- **Members never need passwords** — they sign in via invite links and stay
  signed in on their device. Re-invite from Manage family if someone gets a new
  device or their link expires (links last 7 days).
- The PocketBase admin dashboard is at `https://yourname.duckdns.org/_/` (for
  you, the operator).
