# GitMatch

Match developers to open-source GitHub issues based on their tech stack and experience level.

---

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | HTML, CSS, Vanilla JavaScript, AngularJS 1.8 |
| Backend  | Node.js, Express.js |
| Database | Supabase (PostgreSQL + Auth + RLS) |
| APIs     | GitHub Search API, GitHub OAuth |

AngularJS is used in `find-issues.html` for the sidebar and filter pills, and in `explore.html` for the full repo grid and skill pills.

---

## Project Structure

```text
gitmatch/
|- index.html           # Landing page
|- signup.html          # Account creation
|- login.html           # Sign in
|- auth-callback.html   # OAuth and email confirmation handler
|- onboarding.html      # Skill and experience selection
|- find-issues.html     # Personalised issue feed
|- saveissue.html       # Saved issues page
|- explore.html         # Trending repositories browser
|- 404.html             # Not-found page
|
|- supabase-client.js   # Supabase anon client loaded by every page
|- config.js            # API base URL helper for local dev + Vercel
|- toast.js             # Toast notification utility
|
|- api/
|  |- index.js          # Vercel serverless entrypoint
|
|- index.js             # Express backend app
|- vercel.json          # Vercel rewrites
|- package.json
|- supabase-schema.sql  # Database schema for Supabase SQL Editor
|- .env.example         # Environment variable template
`- .gitignore
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/gitmatch.git
cd gitmatch
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your real values:

| Variable                    | Where to find it |
|----------------------------|------------------|
| `SUPABASE_URL`             | Supabase -> Project Settings -> API -> Project URL |
| `SUPABASE_SERVICE_ROLE_KEY`| Supabase -> Project Settings -> API -> service_role key |
| `GITHUB_TOKEN`             | github.com/settings/tokens -> New token |
| `ALLOWED_ORIGINS`          | Your frontend URL(s), comma-separated |

`GITHUB_TOKEN` is strongly recommended. Without it, GitHub rate-limits much more aggressively.

### 3. Set up the database

Run the entire `supabase-schema.sql` file in Supabase -> SQL Editor.

### 4. Enable GitHub OAuth

1. Go to `github.com/settings/developers` -> OAuth Apps -> New OAuth App
2. Set Homepage URL to `http://localhost:8080`
3. Set Authorization callback URL to:
   `https://your-project.supabase.co/auth/v1/callback`
4. Copy the Client ID and Client Secret
5. In Supabase -> Authentication -> Providers -> GitHub, paste them in and enable
6. In Supabase -> Authentication -> URL Configuration -> Redirect URLs, add:
   `http://localhost:8080/auth-callback.html`

### 5. Run the backend locally

```bash
npm start
```

Expected output:

```text
GitMatch backend running on port 3000
Health check -> http://localhost:3000/health
GitHub token loaded
```

### 6. Open the frontend locally

```bash
# Option A
npx serve .

# Option B
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

---

## User Flow

```text
index.html
  -> signup.html -> auth-callback.html -> onboarding.html -> find-issues.html
  -> login.html -> find-issues.html if prefs exist
  -> login.html -> onboarding.html if prefs do not exist
  -> explore.html
  -> saveissue.html
```

Preference persistence is stored in both `localStorage` and Supabase. On load, `find-issues.html` first checks `localStorage`; if empty, it calls `GET /api/get-profile`.

---

## AngularJS Usage

### `explore.html`

AngularJS owns the entire page. `ExploreCtrl` manages:

- `repos[]`
- `skills[]`
- `activeSkill`
- `loading`
- `error`
- `isLoggedIn`

### `find-issues.html`

AngularJS powers:

- sidebar stack chips
- level badge
- issue count
- saved count
- language filter pills

The issue card feed itself uses vanilla JavaScript for async control and DOM-safe rendering.

---

## API Reference

| Method | Path                  | Auth       | Description |
|--------|-----------------------|------------|-------------|
| GET    | `/health`             | None       | Server status |
| POST   | `/api/save-profile`   | Bearer JWT | Save user skills and level |
| GET    | `/api/get-profile`    | Bearer JWT | Restore user profile |
| POST   | `/api/issues`         | None       | Fetch matched GitHub issues |
| GET    | `/api/trending-repos` | None       | Fetch trending repositories |

Example `POST /api/save-profile`

```json
{ "skills": ["JavaScript", "TypeScript"], "experience_level": "beginner" }
```

Example `GET /api/get-profile`

```json
{ "experience_level": "beginner", "level": "good first issue", "languages": ["JavaScript"] }
```

---

## Deploying on Vercel

This repo is configured for a single Vercel project that serves both the frontend and backend.

### How it works

- Static files like `index.html`, `login.html`, and `explore.html` are served directly by Vercel.
- `api/index.js` loads the Express app from `index.js`.
- `vercel.json` rewrites `/api/*` and `/health` to the Vercel Node function.
- `config.js` uses same-origin API calls on Vercel, so the frontend automatically calls `/api/...`.

### Deploy steps

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Use the `Other` framework preset.
4. Leave Build Command, Output Directory, and Install Command empty.
5. Add these environment variables in Vercel Project Settings:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GITHUB_TOKEN`
   - `ALLOWED_ORIGINS`
6. Deploy the project.

Recommended `ALLOWED_ORIGINS` value:

```text
https://your-project-name.vercel.app
```

### After deployment

1. Open:
   `https://your-project-name.vercel.app/health`
2. Confirm the API returns JSON.
3. In Supabase -> Authentication -> URL Configuration, set:
   - Site URL: `https://your-project-name.vercel.app`
   - Redirect URL: `https://your-project-name.vercel.app/auth-callback.html`
4. In your GitHub OAuth App, keep the callback URL as the Supabase callback URL and update the homepage URL to your Vercel domain.

---

## Security

| Topic   | Detail |
|---------|--------|
| XSS     | All GitHub data is rendered via `textContent` or DOM APIs, never `innerHTML` |
| CORS    | Restricted by `ALLOWED_ORIGINS` |
| Auth    | Supabase JWT verified server-side on protected routes |
| RLS     | Enabled on all main tables so users only access their own data |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` stays server-side only |
| `.env`  | Ignored by git |

The Supabase anon key in `supabase-client.js` is intentional and safe only because RLS is enabled.

---

## Known Limitations

- In-memory cache is per-process, so multiple backend instances have separate caches.
- `User_Skills` updates use delete-then-insert instead of a transaction.
- GitHub Search API can return slightly stale results for a few minutes.
