# Caddy

A private household PWA for an Irish family. It watches Cost Rental listings (with nearby schools, childcare, bus stops, mosques and halal food), organises bills and Work From Home tax evidence, flags utility contracts 14 days before they end, runs the family's tasks and calendar, and compares holiday options by total family cost.

- **Plan (start here):** [`docs/PLAN.md`](docs/PLAN.md)
- **Original spec:** [`SPEC.md`](SPEC.md)
- **Rules for Claude Code sessions:** [`CLAUDE.md`](CLAUDE.md)

Stack: Next.js + TypeScript on Vercel, Supabase (Postgres, Auth, Storage), GitHub Actions for scheduled jobs and the document worker.

## Run it locally

Full step-by-step guide (local Supabase in Docker, your local login, working with Claude Code):
**[docs/LOCAL_DEV.md](docs/LOCAL_DEV.md)**.

Short version (Node 22, pnpm 10 via `corepack enable`, Docker running):

```bash
pnpm install
pnpm exec supabase start          # local database with every migration applied
pnpm exec supabase status -o env  # copy API_URL / PUBLISHABLE_KEY / SECRET_KEY into .env.local
pnpm dev                          # http://localhost:3000
```

## Checks (CI runs the same)

```bash
pnpm lint         # ESLint
pnpm typecheck    # next typegen + tsc
pnpm test         # Vitest unit and component tests
pnpm format:check # Prettier
pnpm build        # production build
```

Database tests run migrations and the row-level security tests against a throwaway Postgres in Docker:

```bash
pnpm db:local                                                            # start Postgres on port 54329
DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres pnpm test:db
DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres pnpm db:types   # regenerate types
```

`pnpm icons` regenerates the app icons in `public/icons` from `scripts/generate-icons.mjs`.

## Deployment

- **Vercel** builds every PR as a preview and deploys `main` to production.
- **Supabase**: one project (`caddy-prod`). Schema changes are applied by GitHub Actions on merge to `main`. One-time dashboard setup: [`docs/setup/supabase.md`](docs/setup/supabase.md).
- **First sign-in**: sign-ups are off. Run **Actions → Add household member** for the first adult, then invite others from Settings.
- Where each secret lives is listed in `docs/PLAN.md` §10. Never commit `.env.local` or real household data.

## Status

Foundation, database and sign-in in place. Next: PR-3, background jobs, alerts and deploy. See the 2-day sprint in `docs/PLAN.md` §9.
