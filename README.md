# chimera2

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, React Router, Fastify, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **React Router** - Declarative routing for React
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Fastify** - Fast, low-overhead web framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **SQLite/Turso** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses SQLite with Drizzle ORM.

1. Start the local SQLite database (optional):

```bash
bun run db:local
```

2. Update your `.env` file in the `apps/server` directory with the appropriate connection details if needed.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@chimera2/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `bun run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: bun run docker:build
- Start: bun run docker:up
- Logs: bun run docker:logs
- Stop: bun run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

Docker Compose uses the local `./.data/local.db` file. Run `bun run db:push` before starting the stack.

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Producao (guia em portugues)

Teste feito em 2026-10-03: `bun run build` passou (server + web), imagens
`chimera2-server` e `chimera2-web` construidas com sucesso e ambas
responderam `200` na rota `/` em teste de runtime.

### Build nativo (sem Docker)

```bash
bun run build
```

Sobe cada app a partir do artefato compilado:

```bash
cd apps/server && bun run dist/index.mjs   # API na porta 3000
cd apps/web && PORT=3001 bun run start     # web na porta 3001
```

O server usa o `DATABASE_URL` do `apps/server/.env`
(`file:../../.data/local.db`). A web usa o `VITE_SERVER_URL` gravado no
build para falar com a API no navegador.

### Docker em producao local (localhost)

```bash
bun run db:push
bun run docker:up
```

Web em [http://localhost:3001](http://localhost:3001), API em
[http://localhost:3000](http://localhost:3000). Pare o `bun run dev` antes:
as portas 3000/3001 conflitam com o compose.

### Docker na rede ZeroTier

O IP desta maquina na ZeroTier hoje e `192.168.194.126` (interface
`ztyou4dsnv`). Confira com `ip -brief addr` antes de subir, pois o IP pode
mudar. O IP entra so no `.env` da raiz (o compose le sozinho), sem rebuild:

- `VITE_SERVER_URL`: para onde o navegador chama a API
  (ex.: `http://192.168.194.126:3000`)
- `CORS_ORIGIN`: origem da web
  (ex.: `http://192.168.194.126:3001`)
- `BETTER_AUTH_URL`: URL publica da API
  (ex.: `http://192.168.194.126:3000`)

Depois de editar, basta recriar os containers (sem `--build`):

```bash
docker compose up -d
```

Funciona porque o entrypoint da web gera o `/__config.js` na subida a
partir do `VITE_SERVER_URL` do compose. Testado: mesma imagem serviu
o IP ZeroTier e localhost em subidas seguidas, so trocando o env.
O `apps/web/.env` continua com localhost para o dev local e nao
afeta o Docker.

Os cookies de sessao acompanham o protocolo do `BETTER_AUTH_URL`:
em http saem sem `Secure` (navegador recusava o cookie `Secure` em IP
sem TLS e o login caia logo depois do sucesso), em https mantem
`Secure` + `SameSite=None`.

Acesso na rede ZeroTier: web em `http://192.168.194.126:3001`, API em
`http://192.168.194.126:3000`. Logs com `bun run docker:logs`, parada com
`bun run docker:down`.

Atencao: qualquer dispositivo na sua rede ZeroTier alcanca o app. Troque o
`BETTER_AUTH_SECRET` do `apps/server/.env` por um valor novo e exclusivo de
producao antes de expor (ele e lido pelo container via `env_file`).

### Reset de dados (SQLite local)

O banco mora em `.data/local.db` (montado no container como
`/data/local.db`). Como a pasta tem ponto no nome e some em alguns
exploradores de arquivo, ha um link visivel na raiz: `data/` aponta
para `.data/`. Uploads em `.data/uploads/` (ou `data/uploads/`).

Backup antes de apagar:

```bash
cp .data/local.db /tmp/opencode/local.db.bak-$(date +%Y%m%d-%H%M%S)
```

Apaga tudo (users, accounts, sessions, rooms, membros, eventos, fichas,
templates) e limpa uploads:

```bash
sqlite3 .data/local.db "PRAGMA foreign_keys=OFF; DELETE FROM verification; DELETE FROM session; DELETE FROM account; DELETE FROM room_event; DELETE FROM character_custom_field; DELETE FROM character_sheet; DELETE FROM room_sheet_template; DELETE FROM room_member; DELETE FROM character_template; DELETE FROM room; DELETE FROM \"user\"; DELETE FROM sqlite_sequence WHERE name='room_event'; PRAGMA foreign_keys=ON; VACUUM;"
rm -f .data/uploads/*
```

Ultimo reset: 2026-10-03, banco de 4,7M para 128K, todas as tabelas zeradas.

## Project Structure

```
chimera2/
├── apps/
│   ├── web/         # Frontend application (React + React Router)
│   └── server/      # Backend API (Fastify, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run db:local`: Start the local SQLite database
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack

## Better Auth Schema Generation

After changing auth plugins or schema options, run `bun run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.
