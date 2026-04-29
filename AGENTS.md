# AGENTS.md

## Purpose

This repository is a Node.js 20+ TypeScript backend using Express, Google ADK, Drizzle ORM, Zod, and PostgreSQL.

When working in this repo, follow the project structure, architecture boundaries, and coding conventions below. Keep changes small, targeted, and easy to review.

## Token and Context Efficiency Rules

- Use lean-ctx tools first before reading large files.
- Start with repo structure, symbols, summaries, or deltas before full-file reads.
- Only open files directly related to the task.
- Do not scan unrelated folders.
- Do not reread unchanged files unless needed.
- Prefer concise summaries of logs and command output over pasting full output.
- When debugging, inspect only the failing path, related DTO, service, controller, route, schema, or test.
- Before editing, identify the smallest set of files needed.

## Project Structure

- Runtime code lives in `src/`.
- `src/index.ts` starts the server.
- `src/server/create-app.ts` wires Express routes and error handling.
- `src/bootstrap/dependencies.ts` is the composition root.
- Feature modules live under `src/features/<feature>/`.

A feature module usually contains:
- `*.dto.ts`
- `*.response.ts`
- `*.service.ts`
- `*.controller.ts`
- `*.routes.ts`
- `*.tools.ts`

Other important areas:
- Agents: `src/agents/`
- Shared utilities: `src/shared/`
- Database setup: `src/infrastructure/database/`
- Table definitions: `src/infrastructure/database/schema/`
- Drizzle migrations: `drizzle/`
- Docs and architecture notes: `docs/`
- Tests: `tests/unit/` and `tests/integration/`, mirroring feature structure

## Architecture Rules

- Keep business logic in feature services.
- Keep request validation in DTO schemas.
- Keep HTTP handling in controllers and routes.
- Keep database table definitions in `src/infrastructure/database/schema/`.
- Keep dependency wiring in `src/bootstrap/dependencies.ts`.
- Do not move business logic into controllers.
- Do not place validation logic inside routes unless it is trivial route wiring.
- Prefer extending the existing feature module structure over inventing new patterns.

## Coding Style

- Use strict TypeScript.
- Use ES modules.
- Use semicolons.
- Use 2-space indentation.
- Prefer named exports for schemas, services, route factories, and dependency creators.
- Use PascalCase for classes and types.
- Use camelCase for functions and variables.
- Use `camelCaseSchema` for Zod schemas.

## Change Rules

- Match the existing folder and naming conventions.
- Make the smallest correct change first.
- Do not do broad refactors unless asked.
- When adding a feature, keep files inside the proper feature module.
- When changing schema, also update Drizzle migration flow if needed.
- When changing API contracts, update DTOs, responses, docs, and tests as needed.
- Preserve existing architecture boundaries.

## Commands

Use these commands when relevant:

- `npm install`
- `npm run dev`
- `npm run build`
- `npm start`
- `npm run typecheck`
- `npm test`
- `npm run test:watch`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:studio`

## Testing Expectations

- Place unit tests under `tests/unit/`.
- Place integration tests under `tests/integration/`.
- Mirror the feature structure when possible.
- Add or update tests for behavior changes.
- Run targeted tests first before broader test runs when possible.

## Database and Migration Rules

- Keep generated SQL and Drizzle metadata in `drizzle/`.
- After schema changes, generate migrations with `npm run db:generate`.
- Apply migrations with `npm run db:migrate`.
- Do not handwave schema changes. Keep schema, migration, and code aligned.

## Security Rules

- Never commit real secrets.
- Never commit real `DATABASE_URL`, `GOOGLE_GENAI_API_KEY`, or upstream API credentials.
- Document new environment variables in `.env.example`.
- Assume `.env` is local-only.
- Be careful not to expose secrets in logs, examples, or test fixtures.

## Commit Style

Use concise Conventional Commit-style messages:
- `feat:`
- `fix:`
- `docs:`
- `test:`
- `refactor:`

Keep messages imperative and scoped.

## What to do before finishing a task

Before finalizing:
- confirm the change follows module boundaries
- confirm naming follows repo conventions
- confirm only necessary files were touched
- confirm tests or typechecks relevant to the change were considered
- summarize changed files and why