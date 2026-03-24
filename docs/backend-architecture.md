# Backend Architecture

## Recommended Folder Tree

```text
.
├── .env
├── .env.example
├── .gitignore
├── drizzle.config.ts
├── drizzle/
│   ├── README.md
│   └── meta/
│       └── README.md
├── docs/
│   └── backend-architecture.md
├── src/
│   ├── index.ts
│   ├── bootstrap/
│   │   └── dependencies.ts
│   ├── config/
│   │   └── env.ts
│   ├── agents/
│   │   ├── root/
│   │   │   ├── agent.ts
│   │   │   └── instructions.ts
│   │   └── users/
│   │       ├── agent.ts
│   │       └── instructions.ts
│   ├── features/
│   │   └── users/
│   │       ├── index.ts
│   │       ├── user.dto.ts
│   │       ├── user.entity.ts
│   │       ├── user.repository.ts
│   │       ├── user.response.ts
│   │       ├── user.service.ts
│   │       └── user.tools.ts
│   ├── infrastructure/
│   │   └── database/
│   │       ├── client.ts
│   │       └── schema/
│   │           ├── index.ts
│   │           └── user.schema.ts
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── app-error.ts
│   │   │   ├── conflict-error.ts
│   │   │   └── not-found-error.ts
│   │   ├── helpers/
│   │   │   └── timestamps.ts
│   │   └── types/
│   │       ├── agent-definition.ts
│   │       ├── pagination.ts
│   │       └── tool-definition.ts
│   └── tools/
│       └── shared/
│           └── health.tool.ts
└── tests/
    ├── integration/
    │   └── users/
    │       └── README.md
    └── unit/
        └── users/
            └── README.md
```

## Why Each Folder Exists

### Root

- `.env`: local runtime secrets. Keep it at the repository root so Node, Drizzle, and local tooling all resolve it the same way.
- `.env.example`: committed template for onboarding and CI setup.
- `drizzle.config.ts`: root-level Drizzle entrypoint. Keep it outside `src/` because it is a tooling concern, not application code.
- `drizzle/`: generated SQL migrations and Drizzle metadata. Keep generated migration output outside `src/` so database history does not mix with runtime code.

### `src/bootstrap`

- `dependencies.ts`: the composition root. This is where repositories, services, and agent dependencies are wired together.

### `src/config`

- `env.ts`: explicit environment parsing with Zod. Config is validated once and then consumed as trusted values everywhere else.

### `src/agents`

- One folder per agent.
- `root/agent.ts`: root orchestrator agent setup.
- `root/instructions.ts`: root agent system prompt or instruction string.
- `users/agent.ts`: specialized users agent.
- `users/instructions.ts`: users agent instructions.

Keep agent composition here. Do not put repository or SQL code in this layer.

### `src/features`

- One folder per business feature.
- Each feature owns its DTOs, response contracts, service, repository, and tools.

This is the core application layer. Feature code should stay modular and feature-local.

### `src/infrastructure`

- `database/client.ts`: PostgreSQL and Drizzle connection setup.
- `database/schema/`: table definitions only.

This layer contains implementation details that support the application. Business logic should depend on abstractions and feature contracts, not raw infrastructure details.

### `src/shared`

- `errors/`: cross-feature errors.
- `helpers/`: small generic utilities.
- `types/`: shared contracts used by multiple features and agents.

This folder is for true cross-cutting code only. If something is specific to one feature, keep it inside that feature.

### `src/tools/shared`

- Reusable tools that are not owned by a single feature.

Use this for capability-style tools such as health checks, audit logs, or generic retrieval helpers.

### `tests`

- `unit/`: service, tool, and schema tests with infrastructure mocked or isolated.
- `integration/`: repository and database integration tests.

Mirror the feature structure under tests so the test suite stays easy to navigate.

## Placement Decisions

- `agent.ts`: `src/agents/root/agent.ts` for the root agent. Additional agents follow `src/agents/<agent-name>/agent.ts`.
- `user.tools.ts`: `src/features/users/user.tools.ts`
- `user.dto.ts`: `src/features/users/user.dto.ts`
- `user.repository.ts`: `src/features/users/user.repository.ts`
- `user.service.ts`: `src/features/users/user.service.ts`
- `user.schema.ts`: `src/infrastructure/database/schema/user.schema.ts`
- `drizzle.config.ts`: repository root
- `.env`: repository root
- Migration files: `drizzle/*.sql` and `drizzle/meta/*`

## Sample Users Module

### `user.dto.ts`

- Input contracts for tools and services.
- Use Zod here for request validation.

### `user.response.ts`

- Output contracts returned to agents or external callers.
- Keep response validation explicit instead of returning raw repository rows.

### `user.entity.ts`

- Domain shape used inside the feature.
- Keep it independent from transport schemas and database table definitions.

### `user.service.ts`

- Business rules.
- Coordinates repository calls.
- No SQL and no agent wiring.

### `user.repository.ts`

- Data access for the `users` feature.
- Converts Drizzle rows into domain entities.

### `user.tools.ts`

- Feature-owned tools exposed to agents.
- Validates input with Zod before calling the service.
- Validates output before returning.

## Execution Flow

```text
user request
  -> root ADK agent
  -> selected tool
  -> Zod input validation
  -> feature service
  -> feature repository
  -> Drizzle database client
  -> PostgreSQL
  -> repository maps row to domain entity
  -> response schema validation
  -> agent response
```

### Concrete Path In This Scaffold

```text
User request
  -> src/agents/root/agent.ts
  -> src/features/users/user.tools.ts
  -> src/features/users/user.dto.ts
  -> src/features/users/user.service.ts
  -> src/features/users/user.repository.ts
  -> src/infrastructure/database/client.ts
  -> src/infrastructure/database/schema/user.schema.ts
  -> PostgreSQL
  -> src/features/users/user.response.ts
  -> agent output
```

## Opinionated Rules

- Keep features flat until they become too large. Do not split into `controllers/`, `services/`, `repositories/`, and `schemas/` top-level folders across the whole codebase.
- Keep Drizzle schema files out of feature folders. Database schema is infrastructure, not business logic.
- Keep Zod DTOs and response schemas in the feature folder. Validation belongs close to the use case boundary.
- Keep agent instructions separate from agent construction. Prompt edits should not force unrelated code edits.
- Keep tool registration inside the feature that owns the capability.
- Keep `src/index.ts` thin. It should only assemble dependencies and start the runtime.

## Notes From Current Docs

- ADK TypeScript supports a root agent with sub-agents, which maps well to `src/agents/root` plus one folder per specialist agent.
- Drizzle recommends a clear split between schema files, database client setup, and generated migrations.
- Zod works best when parsing untrusted input at the edge and inferring types from those schemas through the service boundary.
