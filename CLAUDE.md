# Meal Planner

## Working with Norah

- **Plan before executing.** For every new feature or change request, first reply with a
  plan (what it will look like and how it will work, options with a recommendation) and
  wait for an explicit go-ahead before changing any code. This applies even when the
  request doesn't ask for a plan.
- Norah tests on iPad and iPhone (Safari, and installed to the Home Screen), so plans and
  checks should consider touch and small screens.

## Project

- React + TypeScript + Vite, with Supabase (auth, Postgres). Deployed on Vercel, which
  redeploys on every push to `main`.
- The Supabase project is shared with Norah's Run Planner app (marathontrainingplan): only
  ever touch `meal_`-prefixed tables and functions, and never change the project's Site URL.
  Schema changes go in `supabase/schema.sql`, kept safe to re-run; tell Norah to run it in the
  SQL Editor, since nothing applies it automatically.
- Data lives in `src/data/store.ts`: changes apply locally, persist to localStorage and sync
  through a queue, so the app works offline. All writes go through `src/data/actions.ts`.
- Checks before pushing: `npx tsc -b` and `npm run build`.
