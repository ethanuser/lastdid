# Last Did

Live at **https://ethanuser.github.io/lastdid/** (GitHub Pages; every push to `main` updates it).

Track when you last did each chore (sweeping, laundry, working out), sorted by what's most overdue. Lists can be shared: everyone in a household sees who did what, and a tap on one phone shows up on the others right away.

- **Site:** plain HTML/CSS/JS with no build step, hosted on GitHub Pages.
- **Data and sign-in:** Supabase (free tier). Sign in with Google or an emailed link.
- **Privacy:** row-level security rules in `supabase/schema.sql` mean each person only ever gets their own lists' rows from the database.

## Try it without setting anything up

With `config.js` left empty the app runs in **demo mode**: no sign-in, data saved in that browser only.

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Set up for real (about 20 minutes)

### 1. Supabase

1. Create a free project at https://supabase.com.
2. **SQL Editor → New query**: paste all of `supabase/schema.sql`, then **Run**.
3. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `config.js`. Both are safe to commit, because the security rules decide what the key can do.

### 2. GitHub Pages

1. Push this folder to a public GitHub repo.
2. In the repo: **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`. There's no build step; `.nojekyll` tells GitHub to serve the files as they are.
3. The site appears at `https://YOUR-NAME.github.io/REPO/` within a minute or two, and every push to `main` updates it.

(Netlify or any other static host works too. New free Netlify sites show a "Powered by Netlify" badge that can't be turned off, which is why this one moved to GitHub Pages.)

### 3. Sign-in

In Supabase **Authentication → URL Configuration**:
- **Site URL**: your GitHub Pages URL.
- **Redirect URLs**: add `https://YOUR-NAME.github.io/REPO/**` and `http://localhost:8000/**`.

Email links work at this point. For **Google**:
1. In Google Cloud Console, go to **APIs & Services → Credentials → Create credentials → OAuth client ID** and choose **Web application**.
2. Under **Authorized redirect URIs**, add `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Paste the client ID and secret into Supabase under **Authentication → Providers → Google** and enable it.

(Supabase's built-in email sender is limited to a few emails an hour. That's fine for a handful of people. Add your own SMTP under **Authentication → Emails** if more people sign up.)

## On your phone

Open the site and use **Share → Add to Home Screen** (Safari) or **⋮ → Add to Home screen** (Chrome). It then opens full-screen like an app.

## How it works

- **Lists (households):** everyone gets one or more lists. Invite people with the code or link under the **people** button in the header. **New code** cancels the old one.
- **Order:** chores are sorted by *time since last done ÷ target interval*, so "laundry, 9 days, every 7" ranks above "vacuum, 10 days, every 14". Chores never done come first.
- **Colors:** green means under 75% of the interval (you can change the threshold), amber means close, red means overdue.
- **Settings** (sliders button, or press `,`): sort order, amber threshold, density, progress bars, who did it, suggestions, 7 color themes plus a custom hue, light/dark/auto, 3 fonts, and sound effects. Saved per device.
- **Import & export** (the ⇅ button above the list, or the list's people view): export a file with every chore's full history, or copy a plain-text list. Import takes that file, any JSON list of chores, or plain text with one chore per line (`Water plants, every 4 days`, `Laundry (weekly), last 2026-11-05`, `Change sheets | 2w`). It previews every change before saving, and it only ever adds: no deletes or renames, your intervals win unless you tick the imported one, and history you already have is skipped, so importing the same thing twice changes nothing. One Undo reverses a whole import, and a failed import rolls itself back. Handy for asking an AI to write a list for you.
- **Fixing mistakes:** **Undo** in the toast, or open a chore and remove an entry from its history. You can only remove your own entries. **Did it earlier?** logs a past time.

## Files

| File | What |
|---|---|
| `index.html`, `style.css`, `app.js` | the app |
| `transfer.js`, `transfer.test.js` | import/export parsing and merge rules, and their tests (`node transfer.test.js`) |
| `theme.js`, `ui.js`, `sound.js` | themes, shared controls and tooltips, UI sounds (same system as VidAnki) |
| `config.js` | Supabase URL and anon key (empty = demo mode) |
| `supabase/schema.sql` | tables, security rules, join/create functions |
| `.nojekyll` | tells GitHub Pages to serve the files as they are |
| `manifest.webmanifest`, `icon*` | home-screen app icon |
