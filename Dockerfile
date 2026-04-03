FROM oven/bun:1.3.11 AS runtime

WORKDIR /app

COPY package.json tsconfig.json ./
COPY index.ts config.ts types.ts ./
COPY calibre ./calibre
COPY server ./server

ENV HOST=0.0.0.0 \
    PORT=8787 \
    CALIBRE_ROOT=/books \
    BASE_URL=http://localhost:8787 \
    FEED_LIMIT=100 \
    REFRESH_MS=600000

EXPOSE 8787

CMD ["bun", "run", "index.ts"]
