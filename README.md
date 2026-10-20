# Caddy

A private household PWA for an Irish family. It watches Cost Rental listings (with nearby schools, childcare, bus stops, mosques and halal food), organises bills and Work From Home tax evidence, flags utility contracts 14 days before they end, runs the family's tasks and calendar, and compares holiday options by total family cost.

- **Plan (start here):** [`docs/PLAN.md`](docs/PLAN.md)
- **Original spec:** [`SPEC.md`](SPEC.md)
- **Rules for Claude Code sessions:** [`CLAUDE.md`](CLAUDE.md)

Stack: Next.js + TypeScript on Vercel, Supabase (Postgres, Auth, Storage), GitHub Actions for scheduled jobs and the document worker.

## Run it locally

Requires Node 22 and pnpm 10 (`corepack enable` installs the pinned pnpm).

```bash
pnpm install
cp .env.example .env.local   # fill in the Supabase URL and publishable key
pnpm dev                     # http://localhost:3000
```

## Checks (CI runs the same)

```bash
pnpm lint         # ESLint
pnpm typecheck    # next typegen + tsc
pnpm test         # Vitest unit and component tests
pnpm format:check # Prettier
pnpm build        # production build
```

`pnpm icons` regenerates the app icons in `public/icons` from `scripts/generate-icons.mjs`.

## Deployment

- **Vercel** builds every PR as a preview and deploys `main` to production.
- **Supabase**: one project (`caddy-prod`). Schema changes are applied by GitHub Actions on merge to `main`.
- Where each secret lives is listed in `docs/PLAN.md` §10. Never commit `.env.local` or real household data.

## Status

Foundation in place (app shell, theme, installable PWA, CI). Next: PR-2, data and logins. See the 2-day sprint in `docs/PLAN.md` §9.
