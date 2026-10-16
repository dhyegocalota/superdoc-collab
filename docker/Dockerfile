FROM node:24-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm deploy --prod --filter @superdoc-history/server /workspace/deploy

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_DIR=/data \
    WEB_DIST_DIR=/app/web
COPY --from=build /workspace/deploy/node_modules ./node_modules
COPY --from=build /workspace/deploy/package.json ./package.json
COPY --from=build /workspace/apps/server/dist ./dist
COPY --from=build /workspace/apps/server/drizzle ./drizzle
COPY --from=build /workspace/libs/history/drizzle ./libs/history/drizzle
COPY --from=build /workspace/apps/web/dist ./web
COPY docker/entrypoint.sh ./entrypoint.sh
RUN mkdir /data && chown node:node /data && chmod +x entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/entrypoint.sh"]
