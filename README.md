# Meal Planner

Plan the week's lunches and dinners from recipes you like, shop from a list built from the plan,
and keep track of what's on hand so less goes to waste.

- **Plan:** a week at a time, with lunch and dinner for each day. Add a recipe, leftovers from an
  earlier dinner, or a note ("Eating out"). "Make extra for lunch tomorrow" adds a leftovers lunch
  and buys enough for it. The recipe picker puts recipes that use what you have (especially things
  to use soon) at the top. Tap "Mark cooked" to record what's left of each ingredient.
- **Groceries:** everything the next few days' meals need, minus what's on hand, with amounts added
  up across recipes and grouped by store section. Things you have are listed separately (tap
  "Need it" to buy anyway); things running low or expiring before they're needed are flagged.
  Check items off as you shop, then tap "Done shopping" to move them to On hand with a guessed
  use-by date.
- **On hand:** what's in the fridge, freezer and pantry, each marked Have / Low / Out with a
  color-coded use-by date. Staples ("Always have") never go on the grocery list.
- **Recipes:** ingredients, steps, tags, a source link, notes and a rating. Paste a whole ingredient
  list and it's split into amounts, units and ingredients for you.
  - **Import from a link:** paste a recipe page's address and the title, servings, ingredients, steps,
    times and tags are filled in for you to check before saving. This reads the structured recipe data
    most recipe sites publish (schema.org `Recipe`), through the `api/import-recipe` server function;
    no AI or paid service is involved. Some sites block it, and some don't publish the data.
  - **From a cookbook:** copy the text from a photo with Live Text on iPhone or iPad and paste it in.
    Steps pasted this way have their page line-wraps joined back into whole steps. Ingredients are shared across
  recipes, so the app knows the onion in one recipe is the onion in another.
- **Works offline:** changes are saved on the device first and synced when there's a connection,
  so the grocery list works in a store with no signal.

## Setup

The app is a static Vite + React site that uses [Supabase](https://supabase.com) for sign-in and
storage. It can share a Supabase project with other apps: everything it adds starts with `meal_`.

1. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql). It's safe to run
   more than once.
2. In Supabase **Authentication → URL Configuration**, add the deployed site's address (and
   `http://localhost:5173` for development) under **Redirect URLs**. Leave the Site URL as it is if
   another app uses this project.
3. Copy `.env.example` to `.env.local` and fill in the project's URL and anon/public key (Supabase
   **Project Settings → API**).

The first time you sign in, the app creates your household and adds about 160 common ingredients
with store sections and typical shelf lives. You can change or delete any of them.

## Data

Everything belongs to a household rather than a single account, and Row Level Security limits each
account to households it's a member of. That's so a partner can be added later without moving data.

| Table | What's in it |
| --- | --- |
| `meal_households`, `meal_household_members` | The household, its settings, and who's in it |
| `meal_ingredients` | Every ingredient, plus its On hand status and use-by date |
| `meal_recipes` | Recipes; ingredient lines are a JSON list pointing at ingredients |
| `meal_plan_entries` | Planned lunches and dinners |
| `meal_grocery_items` | Items added to the list by hand, and items checked off |

The grocery list itself isn't stored: it's worked out from the plan, On hand and those items.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
```

`npm run dev` doesn't run the `api/` server function, so link import only works on a Vercel
deployment (or locally with `npx vercel dev`). The function reads the same `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` variables to check that the caller is signed in.

## Deploying (Vercel)

Import this repository as a Vercel project (the Vite preset is detected automatically) and set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the project's environment variables. They
aren't secret (the anon key is meant for use in the browser), but the build needs them.
`vercel.json` sends every path to the app so links to recipes work. Every push to `main` deploys.

## Installing on iPhone or iPad

Open the site in Safari, tap **Share → Add to Home Screen**. It opens full screen with its own icon.
Home Screen apps keep their own sign-in, so sign in once inside the app.
