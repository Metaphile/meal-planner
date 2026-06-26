# Production image: builds the PWA and bundles it with PocketBase, which serves
# both the API and the app (single origin). Build for the Pi's arch:
#   docker buildx build --platform linux/arm64 -t meal-planner .
# (docker compose handles this automatically on the Pi.)

# --- Stage 1: build the PWA (VITE_PB_URL unset => same-origin "/") -----------
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: PocketBase + the built PWA ------------------------------------
FROM alpine:3.20
ARG PB_VERSION=0.39.4
ARG TARGETARCH
RUN apk add --no-cache unzip ca-certificates wget
WORKDIR /pb
RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip "pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && rm "pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"

# Schema + hooks travel with the image; the PWA is served from pb_public.
COPY backend/pb_migrations ./pb_migrations
COPY backend/pb_hooks ./pb_hooks
COPY --from=web /app/dist ./pb_public

EXPOSE 8090
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
