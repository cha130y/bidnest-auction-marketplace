# syntax=docker/dockerfile:1

# Builds apps/api only — apps/web is deployed to Vercel and never goes through
# this image.
#
# The build context is the repository root, not apps/api: this is a pnpm
# workspace, and pnpm-lock.yaml and pnpm-workspace.yaml both live at the root.
#
#   docker build -t bidnest-api .
#   docker run --rm -p 4000:4000 --env-file apps/api/.env bidnest-api

# Node 24 to match what the team runs locally. Debian rather than Alpine
# because the Prisma CLI's schema engine is a glibc binary; on musl it needs
# a separate build and fails at the least convenient moment, during a deploy.
FROM node:24-bookworm-slim AS base

# That same schema engine links against OpenSSL, and node:*-slim ships without
# it. It is what `prisma migrate deploy` runs at boot, so it is needed in the
# runtime image too and is installed here, in the shared base.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# The version the repo pins (devEngines in the root package.json), installed
# with npm rather than through Corepack: Corepack reads that same field and
# rejects it outright, because it accepts only an exact version and the repo
# records a `^11.10.0` range. Pinned here rather than left to `pnpm@latest`,
# which would resolve to whatever is newest on the day a build happens to run.
RUN npm install -g pnpm@11.10.0

WORKDIR /app


# ---------------------------------------------------------------- deps ------
FROM base AS deps

# Manifests only, so this layer is reused until a dependency actually changes
# — editing a source file must not cost a full reinstall. Every workspace
# package's manifest has to be here even though only `api` is installed:
# --frozen-lockfile validates the lockfile against the whole workspace, and a
# missing importer reads as a lockfile that no longer matches.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/

# apps/api runs `prisma generate` as a postinstall hook, so the schema and the
# config that points at it must already be in place when install runs.
COPY apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma

# The generator reads the tsconfig to decide how the client should import its
# own files. Without it here it cannot see `moduleResolution: nodenext`, falls
# back to `./internal/class.ts` specifiers, and the compiled client asks Node
# for .ts files that tsc has already turned into .js — a container that builds
# clean and dies on its first require.
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/

# prisma.config.ts reads DATABASE_URL. `generate` never opens a connection, but
# the config is still parsed, so a well-formed placeholder is enough. The real
# URL arrives from the environment at run time and never enters the image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

RUN pnpm install --frozen-lockfile --filter api...


# --------------------------------------------------------------- build ------
FROM deps AS build

# generated/ is excluded by .dockerignore, so this merges the sources over the
# Prisma client the install hook just produced rather than replacing it with
# whatever happened to be on the machine that ran the build.
COPY apps/api apps/api

RUN pnpm --filter api exec nest build


# ------------------------------------------------------------- runtime ------
FROM base AS runtime

ENV NODE_ENV=production
# Overridden by the platform's own PORT where there is one. It is set at all
# because env validation gives PORT no default: unset, the API refuses to boot.
ENV PORT=4000

# node_modules is copied whole rather than pruned to production dependencies:
# the entrypoint runs `prisma migrate deploy`, and the Prisma CLI is a
# devDependency. A few hundred megabytes buys a container that migrates itself,
# which is what makes a redeploy one step instead of two.
# --chown on each COPY rather than a `chown -R` afterwards: changing the owner
# of a file rewrites it, so a recursive chown lands a second full copy of
# node_modules in the next layer and doubles the image for nothing.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json /app/apps/api/prisma.config.ts ./apps/api/
# The migrations themselves, and the compiled server — which includes the
# generated client at dist/generated, where the compiled PrismaService looks
# for it.
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

# --chmod, because a Windows checkout has no execute bit to carry over.
COPY --chown=node:node --chmod=755 docker-entrypoint.sh ./

# node images ship a non-root `node` user; nothing here needs root.
USER node

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
