# SOLVANTA Business Suite

SOLVANTA is a modular business application with a React/Vite frontend, an Express/Prisma API, and an optional Electron POS shell.

## Workspace Structure

- `client/`: React 19 + Vite + TypeScript application
- `server/`: Express + Prisma + TypeScript API
- `pos-electron/`: optional Electron wrapper for POS printing/runtime integration
- `scripts/`: workspace-level helper scripts

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB connection string for the server

## Quick Start

1. Create local environment files:
   - `server/.env` from [server/.env.example](D:/personal project/Solvanta-Business-Suite/server/.env.example)
   - `client/.env` from [client/.env.example](D:/personal project/Solvanta-Business-Suite/client/.env.example)
2. Install dependencies:
   - `npm install` in `server/`
   - `npm install` in `client/`
3. Generate Prisma client if needed:
   - `npm run db:generate`
4. Start both apps from the repo root:
   - `npm run dev`

## Common Commands

From the repo root:

- `npm run dev`: start client and server together
- `npm run build`: build server and client
- `npm run typecheck`: run TypeScript checks for both apps
- `npm run test:server`: run server integration tests
- `npm run db:generate`: generate Prisma client
- `npm run db:push`: push Prisma schema changes
- `npm run db:migrate`: run Prisma migrations in development
- `npm run seed`: seed the backend database

## Environment Variables

Server variables are documented in [server/.env.example](D:/personal project/Solvanta-Business-Suite/server/.env.example).

Client variables are documented in [client/.env.example](D:/personal project/Solvanta-Business-Suite/client/.env.example).

## Build And CI

- `client/` builds with `tsc -b && vite build`
- `server/` builds with `tsc`
- GitHub Actions runs both builds on push and pull request

## Notes

- The server test suite exists, but if you use it in CI later, make sure the test database/runtime is configured correctly.
- `pos-electron/` is intentionally excluded from normal workspace tracking and CI in this baseline setup.
