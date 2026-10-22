FROM node:24-bookworm-slim AS base

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

# The application uses only Node.js built-ins; no dependency download is needed.
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node package.json package-lock.json server.js world.js ./
COPY --chown=node:node public/ ./public/

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/games').then(async r => { if (!r.ok || !Array.isArray((await r.json()).games)) process.exit(1); }).catch(() => process.exit(1))"
CMD ["node", "server.js"]

# Optional test target; test files are not included in the runtime image.
FROM base AS test
COPY --chown=node:node test/ ./test/
RUN npm run check && npm test

FROM base AS runtime
