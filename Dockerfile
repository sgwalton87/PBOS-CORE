FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/connector-sdk/package.json packages/connector-sdk/package.json
RUN npm ci --include=dev && npm cache clean --force

COPY tsconfig.json ./
COPY pbos ./pbos
COPY packages ./packages

USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "pbos/api/cloud-run-entrypoint.ts"]
