# Image for the LlaveroUCO backend (hot reload via nodemon).
#
# The whole repository is bind-mounted at /repo by docker-compose so that
# `src/shared/config/env.js` resolves the root `.env` at /repo/.env exactly as
# it does on the host. Container-installed node_modules are shadowed back in
# by an anonymous volume declared in the compose file.
FROM node:24-alpine

RUN corepack enable

WORKDIR /repo/LlaveroBack

# Manifests first so dependency layers are reused when only source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 8080

# Call nodemon directly instead of `pnpm dev`: pnpm re-checks dependency
# status on every run and, because node_modules lives in an anonymous volume
# over the bind-mounted repo, it tries to reinstall and aborts.
CMD ["./node_modules/.bin/nodemon", "src/server.js"]
