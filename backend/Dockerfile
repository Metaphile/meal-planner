# PocketBase, containerized. Multi-arch: TARGETARCH is set by buildkit to
# amd64 / arm64, matching PocketBase's release asset names.
FROM alpine:3.20

ARG PB_VERSION=0.39.4
ARG TARGETARCH

RUN apk add --no-cache unzip ca-certificates wget

WORKDIR /pb
RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && unzip "pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
    && rm "pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"

EXPOSE 8090
CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]
