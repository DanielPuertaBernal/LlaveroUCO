# Image for the LlaveroUCO frontend (Vite dev server).
#
# Mirrors the backend layout: the repository is bind-mounted at /repo so Vite's
# `envDir` (one level above LlaveroFront) finds the same root `.env`.
FROM node:24-alpine

RUN corepack enable

WORKDIR /repo/LlaveroFront

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173

# Call vite directly for the same reason as the backend image; --host binds
# 0.0.0.0 so the dev server is reachable from the host.
CMD ["./node_modules/.bin/vite", "--host"]
