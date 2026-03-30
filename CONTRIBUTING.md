# Contributing

## Development Flow

1. Sync your branch with the latest mainline changes.
2. Make focused changes in one area at a time.
3. Run the relevant checks before opening a PR:
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:server` when backend behavior changes

## Environment Setup

- Copy `server/.env.example` to `server/.env`
- Copy `client/.env.example` to `client/.env`

## Pull Requests

- Keep PRs scoped to one feature/fix where possible.
- Include a short summary of what changed.
- Mention any known risks, follow-ups, or skipped tests.

## Coding Expectations

- Prefer reusable UI components over page-local styling.
- Keep TypeScript passing before requesting review.
- Avoid committing secrets, local env files, logs, and generated build output.
