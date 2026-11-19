# County Search QC: the shared, read-only copy (docs/REMOTE_ACCESS.md).
# The image holds code only. No data and no secrets are built in: the data arrives encrypted from GitHub at run time
# and is unlocked inside the running container with the passphrase from a Docker secret.

FROM node:24.22.3-alpine AS build
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/ ./
COPY apps-script/ /app/apps-script/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:24.22.3-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 QC_READ_ONLY=1 QC_ROOT=/app
COPY --from=build /app/dashboard/.next /app/dashboard/.next
COPY --from=build /app/dashboard/node_modules /app/dashboard/node_modules
COPY --from=build /app/dashboard/package.json /app/dashboard/next.config.ts /app/dashboard/
COPY apps-script/ /app/apps-script/
COPY scripts/vault.mjs scripts/remote-sync.mjs /app/scripts/
# the app runs as an unprivileged user and may write only its data folder
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
CMD ["node", "scripts/remote-sync.mjs"]
