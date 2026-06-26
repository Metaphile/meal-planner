# Caddy with the DuckDNS DNS provider, so we can solve the ACME DNS-01 challenge
# (no inbound port 80 needed — leaves it free for Pi-hole).
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/duckdns

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
