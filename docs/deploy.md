# Deploying to the Raspberry Pi

A complete, from-scratch runbook for **this** setup. No secrets are stored here —
fill in the placeholders (`<...>`) from your own records.

## What runs

- **pocketbase** (Docker) — serves the API *and* the built PWA from `pb_public`.
- **caddy** (Docker) — public HTTPS for `silermeals.duckdns.org`, reverse-proxies
  to PocketBase. Gets its cert via the ACME **DNS-01** challenge (DuckDNS), so it
  needs **no port 80** — only 443.
- All data is in one Docker volume, `pb_data` (the only thing to back up).

## This environment's specifics (important)

- **Raspberry Pi, 64-bit (aarch64).**
- **Docker runs rootless** (as user `adam`, socket `/run/user/1000/docker.sock`).
  Two consequences handled below: rootless can't bind ports < 1024 by default,
  and you must **not** override Docker's DNS (the embedded resolver works; a
  manual `dns:` override breaks it because rootless networking can't route raw
  UDP to external resolvers).
- **Pi-hole v6 is on the same Pi.** Its embedded webserver grabs **80 and 443**
  by default — 443 collides with Caddy, so we move Pi-hole to HTTP-only.
- **Domain:** `silermeals.duckdns.org` via DuckDNS.
- Repo lives at `~/projects/meal-planner`.

## Prerequisites

- Docker + Compose (rootless). Verify: `docker info | grep -i rootless` shows
  `rootless`.
- A DuckDNS subdomain + token (https://www.duckdns.org).
- Router forwarding **only port 443** to the Pi. (DNS-01 means no port 80 is
  needed; this is also what lets Pi-hole keep 80.)

## 1. Free port 443 from Pi-hole

Pi-hole v6 listens on 80 and 443; Caddy needs 443. Move Pi-hole to HTTP-only
(its DNS on port 53 is unaffected):

```sh
sudo pihole-FTL --config webserver.port '80o,[::]:80o'
sudo systemctl restart pihole-FTL
ss -tln | grep ':443 ' || echo "443 is free"   # should print "443 is free"
```

Pi-hole's admin is now at **http://raspberrypi.local/admin** (HTTP). Its HTTPS
admin is gone — that's expected and fine.

## 2. Host prep for rootless Docker

**Allow rootless to bind 443** (otherwise Caddy fails with "permission denied"):

```sh
echo 'net.ipv4.ip_unprivileged_port_start=443' | sudo tee /etc/sysctl.d/99-unprivileged-ports.conf
sudo sysctl -p /etc/sysctl.d/99-unprivileged-ports.conf
```

**Let the stack survive reboots** (rootless services only start on boot with
lingering enabled):

```sh
sudo loginctl enable-linger adam
```

**Do NOT** create `/etc/docker/daemon.json` or `~/.config/docker/daemon.json`
with a `dns` setting. Rootless uses the embedded resolver (`127.0.0.11` →
slirp), which works. A manual external resolver (e.g. `1.1.1.1`) causes
`dial udp …:53: connect: network is unreachable`.

## 3. Get the code + configure

```sh
git clone https://github.com/Metaphile/meal-planner.git ~/projects/meal-planner
cd ~/projects/meal-planner
```

Create `.env` (no real secrets in this doc — use your own):

```sh
DOMAIN=silermeals.duckdns.org
DUCKDNS_TOKEN=<your-duckdns-token>     # required: Caddy uses it for the DNS-01 cert
DUCKDNS_SUBDOMAIN=silermeals           # only for the optional ddns updater (A record)
```

The A record for `DOMAIN` must point at your home IP — via your router's dynamic
DNS, or the optional `ddns` profile (step 4).

## 4. Build & start

```sh
docker compose up -d --build           # add: --profile ddns   (to run the DuckDNS A-record updater)
```

First build takes a few minutes (compiles the PWA, downloads PocketBase, builds
Caddy with the DuckDNS plugin). Confirm the certificate:

```sh
docker compose logs caddy | grep -i "certificate obtained"
```

> Note: right after a reboot, Caddy may log a few DNS "network is unreachable"
> retries while rootless networking comes up, then succeed on its own. The cert
> is cached in `pb_data`/`caddy_data`, so reboots don't re-issue it anyway.

## 5. Create the PocketBase superuser (server operator)

Separate from app users:

```sh
docker compose exec pocketbase ./pocketbase superuser upsert you@example.com '<a-strong-password>'
docker compose restart pocketbase      # so the running server picks it up
```

## 6. Bootstrap the first family admin

Run on the Pi via Compose — it reaches PocketBase over the internal Docker
network (don't point it at the public URL from home; NAT loopback blocks that):

```sh
PB_SUPERUSER_EMAIL=you@example.com \
PB_SUPERUSER_PASSWORD='<a-strong-password>' \
ADMIN_NAME="Adam" \
docker compose --profile seed run --rm seed-admin
```

It prints a one-time invite link. Open it once on your phone → you're the first
admin (and the starter recipes/plan are seeded). Then **Account → Manage family**
to add your wife (set her role to Admin) and the kids; share each their link.

## 7. Verify

- From a LAN machine **other than the Pi** (pointing the domain at the Pi's LAN
  IP to bypass NAT loopback):
  ```sh
  curl --resolve silermeals.duckdns.org:443:<pi-lan-ip> https://silermeals.duckdns.org/api/health
  ```
  Expect `{"message":"API is healthy."...}` over a valid cert.
- From a phone **on cellular** (true outside test): open
  `https://silermeals.duckdns.org`.
- Reaching it from home Wi-Fi depends on whether your router supports NAT
  hairpin; cellular is the reliable check.

## Backups

```sh
docker run --rm -v meal-planner_pb_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/pb_data_$(date +%F).tgz -C /data .
```

Restore by extracting back into the volume while the stack is stopped.

## Updating

```sh
cd ~/projects/meal-planner && git pull && docker compose up -d --build
```

Schema changes ship as PocketBase migrations in the image and apply on startup.

## Troubleshooting

- **Caddy: "permission denied" binding 443** → the rootless port sysctl (step 2)
  isn't applied: `sudo sysctl -p /etc/sysctl.d/99-unprivileged-ports.conf`.
- **Caddy: `dial udp …:53: network is unreachable`** → you (or a previous
  attempt) set a Docker `dns` override. Remove `~/.config/docker/daemon.json`
  and `/etc/docker/daemon.json` if present, then `systemctl --user restart docker`
  and `docker compose up -d`. The embedded resolver must be left in place.
- **Caddy won't start / 443 in use** → Pi-hole still has 443; redo step 1 and
  `ss -tlnp | grep ':443 '` to confirm only Caddy holds it.
- **DNS-01 fails** → check `DUCKDNS_TOKEN` matches your account and `DOMAIN` is
  your DuckDNS subdomain; `docker compose logs caddy`.
- **Stack didn't come back after reboot** → confirm lingering:
  `loginctl show-user adam | grep Linger` should say `Linger=yes` (step 2).
- **Pi-hole admin** is at `http://raspberrypi.local/admin`; the PocketBase
  operator dashboard is at `https://silermeals.duckdns.org/_/`.
