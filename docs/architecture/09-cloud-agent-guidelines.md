# 09 — Cloud Agent Guidelines

> Rules of engagement for autonomous/remote coding agents working in
> this repo. These are **non-negotiable** — they exist so a fleet of
> parallel agents can ship code that looks like it was written by one
> careful engineer. For the always-on conduct layer, see
> `.cursor/rules/01-cloud-agent-conduct.mdc`.

---

## 1. Before you touch code

1. **Bootstrap first.** Run
   `bash setup-agent-envs.sh` (or invoke the `bootstrap-env` skill).
   This materializes `apps/web/.env.local` and `apps/mobile/.env`
   from the `WEB_*` / `MOBILE_*` host variables. Do not hand-edit
   those files.
2. **Identify the surface.** Is this a web-only change
   (`apps/web/**`), a mobile-only change (`apps/mobile/**`), or a
   shared-types change (`packages/types/**`)?
3. **Read before you write.** Open the closest existing file of the
   same kind (action, service, screen, tool handler, schema). Your
   change should read like a sibling of that file, not a new species.
4. **Consult the rules.** The scoped `.cursor/rules/*.mdc` files
   auto-attach based on path globs. Always-applied rules cover
   navigation and conduct.

If you're about to do something that doesn't fit a pattern in this
repo, stop and ask. Novel patterns are the most expensive thing you
can ship.

---

## 2. The 3-layer contract (web)

> Full spec: [02-layer-patterns.md](./02-layer-patterns.md) and
> `.cursor/rules/web-server-actions.mdc`.

```
UI (RSC / client) → Action ("use server") → Service → Model → MongoDB
```

- **UI** calls Server Actions. It never imports `@/server/...`
  directly.
- **Actions** run `"use server"`, parse input with Zod, call
  `getLocationContext()` for tenant scoping, delegate to a service,
  map errors, and call `revalidatePath` / `revalidateTag`.
- **Services** own business logic. Pure, testable, return DTOs.
- **Models** are Mongoose schemas under
  `apps/web/src/server/models/`.

Do not invent a fourth layer. Do not skip a layer. Do not reach
"down" across modules (UI → Service, Action → Model).

---

## 3. Multi-tenancy is not optional

Every query that reads or writes tenant-owned data **must** filter
by `orgId` and (where applicable) `locationId`. Use
`getLocationContext()` in actions to derive those values from the
Clerk session. Never accept them from request bodies or URL params.

Forgetting the tenant filter is a security bug. Treat any code that
queries `await Model.find({...})` without a tenant filter as broken,
even if it "works" in dev.

---

## 4. AI mutations go through the proposal funnel

> Full spec: [07-ai-orchestrator.md](./07-ai-orchestrator.md) and
> `.cursor/rules/web-ai-orchestrator.mdc`.

The LLM never writes to the DB directly. If you add a new mutation
the assistant can trigger:

1. Add a `propose_<thing>` tool definition (schema + handler).
2. Validate and build a `StoredProposal` with an OCC `dataVersion`.
3. Wire the `toolName` branch in `execute-proposal.ts`.
4. Add the `AIPermission` to `permissions.ts` and to every role's
   `ROLE_PERMISSIONS` entry that should get it.

If you're writing code that mutates data and bypasses this flow, it
is not an AI feature — it belongs as a plain server action.

---

## 5. Shared types, one source of truth

> Full spec: `.cursor/rules/shared-types.mdc`.

DTOs and Zod schemas shared between web and mobile live in
`packages/types`. **Never duplicate them** in `apps/web` or
`apps/mobile`. If you need a new shared shape:

1. Add the Zod schema to `packages/types/src/validations/`.
2. Derive the DTO via `z.infer<typeof …Schema>`.
3. Re-export from `packages/types/src/index.ts`.
4. Consume it as `import type { FooDTO } from "@sous/types"` on
   both sides.

Nothing in `packages/types` may import `mongoose`, `next`, or any
app-only module. It must stay pure.

---

## 6. Coding style

### TypeScript

- Strict mode is on across the monorepo. `any` is forbidden except
  in narrow, commented casts where no better option exists.
- Prefer `import type` for type-only imports.
- Prefer `interface` for DTOs and component props; prefer `type` for
  unions and discriminated aliases.
- `unknown` over `any` for untrusted input; validate with Zod before
  narrowing.

### Files and exports

- One default export per file is fine for React components; services
  and libs should use named exports.
- Keep file names kebab-case (`schedule-agent.service.ts`) except
  React components (`AIAssistantPanel.tsx`).
- Barrel-export from `index.ts` only where it already exists (tool
  definitions, validations). Don't add new barrels without cause.

### React

- Server Components by default. Add `"use client"` only when you
  need state, effects, or browser APIs.
- Forms use React Hook Form + Zod via `@hookform/resolvers/zod`.
  Do not roll ad-hoc validation.
- Server state is TanStack Query. Never put server data in Zustand.

### Styling

- Tailwind v4 utility classes, not inline `style=` objects, not CSS
  modules.
- Tokens from `globals.css` / `global.css` (e.g. `bg-primary`,
  `text-foreground`), not raw hex.
- Don't pull in UI kits we don't already use.

### Comments

- Comments explain **why**, not what. Do not narrate the code.
- Bad: `// increment the counter`.
- Good: `// Match service-level 409 so the optimistic card can
  rehydrate.`

### Errors

- Throw domain-specific error classes from services, not strings.
- Re-throw in actions only after translating to a UI-safe shape.
- Never swallow errors silently. `catch` blocks must log **and**
  surface or rethrow.

### Logging

- Use `console.log` / `console.error` with a prefix like
  `[scheduling-agent]` so multi-service logs are greppable. No
  `winston`, `pino`, or similar unless we already have it.

### Emojis

- Do not add emojis to code, comments, PR descriptions, commit
  messages, or generated UI strings unless the user explicitly asks
  for them.

---

## 7. Don't do these things

- **Don't** start a dev server from the repo root. Always
  `cd apps/web` or `cd apps/mobile` first.
- **Don't** run `npm install` inside an app directory. Always
  install from the repo root so workspaces resolve correctly.
- **Don't** create a new `.env` file by hand. Use
  `setup-agent-envs.sh`.
- **Don't** add a new Next.js Route Handler unless it's for a
  webhook, a streaming response, a client-polled status endpoint,
  billing redirects, or the public API consumed by mobile. Server
  Actions cover the rest. See
  [05-api-and-testing.md](./05-api-and-testing.md).
- **Don't** add a second OpenAI wrapper. Chat uses the Vercel AI
  SDK, one-shot calls use `openai-client.ts`. Pick one.
- **Don't** mutate Mongo from an AI tool handler. Build a proposal.
- **Don't** store secrets in git. Ever. Use host env vars.
- **Don't** commit unless the user explicitly asks you to.
- **Don't** use `git commit --amend` or `--force` unless explicitly
  asked; never on shared branches.

---

## 8. Verifying your work

Before declaring a change done, run the appropriate local checks:

- **Web**: `cd apps/web && npm run lint && npm run typecheck`.
  Boot the dev server if you touched a route, action, or page.
- **Mobile**: `cd apps/mobile && npm run lint`. Start `npm run dev`
  if you touched a screen, provider, or native config.
- **Shared types**: ensure both `apps/web` and `apps/mobile` still
  typecheck after you change `packages/types`.
- **Docs / rules**: no build step, but re-read the file for tone and
  link correctness.

If the change touches the AI orchestrator, run the chat manually
against at least one happy-path prompt and confirm the proposal
card renders and resolves. Automated tests here are thin; manual
verification matters.

---

## 9. When you're stuck

- Re-read the closest sibling file.
- Search the repo for the pattern you're trying to copy — odds are
  it exists already.
- If two files disagree, prefer the **newer** pattern (check
  `git log -p`).
- If you've spent more than ~30 minutes exploring the same question
  without progress, stop and ask. Burning tokens on wandering is
  worse than asking.

---

## 10. Communication style

- Write PR descriptions like you're writing to a senior engineer
  who has 90 seconds. Lead with the change, not the context.
- Describe trade-offs explicitly. "I chose X over Y because…" saves
  a review cycle.
- No filler, no hedging, no emojis, no generated-by-AI disclaimers.

---

## 11. Files every agent should open on day one

- `README.md`
- `ARCHITECTURE.md`
- `.cursor/rules/00-monorepo-navigation.mdc`
- `.cursor/rules/01-cloud-agent-conduct.mdc`
- `.cursor/rules/web-nextjs.mdc`
- `.cursor/rules/web-server-actions.mdc`
- `.cursor/rules/web-ai-orchestrator.mdc`
- `.cursor/rules/mobile-expo.mdc`
- `.cursor/rules/shared-types.mdc`
- `.cursor/skills/bootstrap-env/SKILL.md`
- `docs/architecture/01-data-models.md` through
  `docs/architecture/08-mobile-architecture.md`

That ordered reading list takes about 30 minutes and removes 80% of
the questions a new agent is likely to ask.
