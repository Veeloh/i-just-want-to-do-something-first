# Daily Question

A one-page site: today's question in the middle, an answer box beneath it,
and yesterday's question with everyone's answers below that.

It's a single static file (`index.html`) that talks directly to a free
Supabase database — no server to run or maintain.

## 1. Create the database (Supabase, free)

1. Go to [supabase.com](https://supabase.com) and create a free account and a new project.
2. Once it's ready, open **SQL Editor** → **New query**, paste in everything
   from `supabase-setup.sql`, and click **Run**. This creates the two tables
   (`quotes` and `responses`) and the permissions that let visitors read and
   submit without logging in.
3. Go to **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.

## 2. Connect the site to it

Open `index.html` and near the top of the `<script>` tag, replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

with the values you copied.

## 3. Put it on GitHub Pages

1. Create a new GitHub repository and push `index.html` to it (the SQL file
   and this README don't need to go live, but there's no harm leaving them).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch",
   pick your main branch and the `/ (root)` folder, then save.
4. GitHub gives you a URL (something like `https://yourname.github.io/repo-name/`)
   within a minute or two.

## 4. Post a question each day

There's no admin screen — you add each day's question by hand, which takes
about ten seconds:

1. In Supabase, open **Table Editor → quotes**.
2. Click **Insert row**.
3. Set `date` to today's date and `text` to the question.
4. Save.

The site automatically shows whatever row's `date` matches today, and shows
yesterday's question + all of yesterday's responses in the section below it.
If you forget a day, it just shows "No question posted yet today" until you
add one — nothing breaks.

## Notes

- Anyone can submit a response and everyone can read them — there's no
  moderation or login. Delete a row in the `responses` table (Table Editor)
  if something needs to come down.
- Dates are compared in UTC, so "today" flips at UTC midnight rather than
  the visitor's local midnight.
