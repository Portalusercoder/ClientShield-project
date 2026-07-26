# Contributing to ClientShield

## Before you start

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries.
2. Prefer small, reviewable changes that preserve behavior unless the phase explicitly adds features.
3. Do **not** change Prisma schema or add migrations unless the task explicitly authorizes it.
4. Do **not** modify Wazuh/Tailscale/Docker agent mappings unless approved.

## Local development

```bash
npm install
cp .env.example .env   # if needed
npm run db:generate
npm run dev            # http://localhost:3001
```

See [README.md](./README.md) for Auth0, database, and worker notes.

## Coding conventions

### TypeScript & modules

- Prefer explicit types on public service/action boundaries.
- Shared mutation results use `ActionResult` from `@/types/action-result` (re-exported by `@/lib/actions`).
- Domain-specific aliases (`ClientActionResult`, etc.) are deprecated aliases — use `ActionResult` in new code.

### Server Actions

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertMinimumRole } from "@/lib/auth";
import { toActionError, type ActionResult } from "@/lib/actions";

export async function exampleAction(...): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireSession();
    assertMinimumRole(session, "ANALYST");
    // Zod validate → service call → revalidatePath
    return { success: true, data: { id: "..." } };
  } catch (error) {
    return toActionError(error);
  }
}
```

- Organization ID always comes from the session.
- Validate with Zod schemas under `lib/validations/`.
- Catch → `toActionError`; do not return raw stacks.

### Services

- Keep org scoping on every Prisma query.
- Split large files by responsibility (`queries` / `commands` / `lifecycle`) but keep a stable public barrel when the package already has one.
- Avoid speculative abstraction (no generic repositories unless clearly needed).

### UI

- Feature folders under `components/<domain>/`.
- Large detail views: orchestrator + `detail/` children (header, tabs). Keep public props stable.
- Reuse `components/ui/*` and `components/workflow/*` before inventing new chrome.
- No UX redesign during refactor-only work.

### Naming

- Server Actions: `*Action` suffix (`createIncidentAction`).
- Services: verb phrases (`listIncidents`, `updateIncidentStatus`).
- Components: PascalCase matching file name.

## Quality gates

Run before opening a PR (or when a phase asks for full regression):

```bash
npm run typecheck
npm run lint
npm run build
```

Run the relevant `npm run test:*` scripts for the areas you touched. For broad refactors, run **all** existing `test:*` scripts.

## Documentation

- Update `ARCHITECTURE.md` when module boundaries change.
- Update domain docs (`SECURITY.md`, `OBSERVABILITY.md`, `DEPLOYMENT.md`) when those areas change.
- Keep README project-structure pointers accurate.

## Commits & PRs

- Do not commit secrets (`.env`, credentials).
- Prefer focused commits; message should explain **why**.
- Only commit/push when explicitly asked (many contributors use GitHub Desktop).

## Refactoring checklist

- [ ] Public APIs (component props, service exports, action names) unchanged unless intentional
- [ ] No schema/migration drift
- [ ] No intentional behavior/UX change
- [ ] Dead code removed only when clearly unused (keep intentional placeholders)
- [ ] Typecheck, lint, build, and relevant tests pass
