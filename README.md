# GitMatch

Match developers to open-source GitHub issues based on their tech stack and experience level.

---

## Tech Stack

| Layer     | Technology |
|-----------|-----------|
| Frontend  | HTML, CSS, Vanilla JavaScript, **AngularJS 1.8** |
| Backend   | Node.js, Express.js |
| Database  | Supabase (PostgreSQL + Auth + RLS) |
| APIs      | GitHub Search API, GitHub OAuth |

**AngularJS** is used in `find-issues.html` (sidebar + filter pills) and `explore.html` (full repo grid + skill pills). See the [AngularJS Usage](#angularjs-usage) section for details.

---

## Project Structure

```
gitmatch/
├── index.html           # Landing page (hero, how-it-works, tech scroll, CTA)
├── signup.html          # Account creation (email + GitHub OAuth)
├── login.html           # Sign in (email + GitHub OAuth)
├── auth-callback.html   # OAuth & email confirmation handler
├── onboarding.html      # Stack & experience level picker (first-time setup)
├── find-issues.html     # Personalised issue feed — AngularJS sidebar + filters
├── saveissue.html       # Saved issues backlog (auth required)
├── explore.html         # Trending repos browser — fully AngularJS powered
├── 404.html             # Not-found page
│
├── supabase-client.js   # Supabase anon client — loaded by every page
├── config.js            # API_BASE URL — only file to change before deploying
├── toast.js             # Lightweight toast notification utility
│
├── index.js             # Express backend: GitHub API proxy + Supabase RPC
├── package.json
├── supabase-schema.sql  # Full database schema — run once in Supabase SQL Editor
├── .env.example         # Environment variable template — copy to .env and fill in
└── .gitignore
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

| Variable                    | Where to find it                                              |
|-----------------------------|---------------------------------------------------------------|
| `SUPABASE_URL`              | Supabase → Project Settings → API → Project URL              |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key         |
| `GITHUB_TOKEN`              | github.com/settings/tokens → New token (no scopes needed)    |
| `ALLOWED_ORIGINS`           | Your frontend URL(s), comma-separated                         |

> **`GITHUB_TOKEN` is strongly recommended.** Without it GitHub rate-limits at 10 req/min.

### 3. Set up the database

Run the **entire** `supabase-schema.sql` file in **Supabase → SQL Editor** (safe to re-run):

```sql
-- Drop everything cleanly
DROP TRIGGER  IF EXISTS on_auth_user_created         ON auth.users;
DROP FUNCTION IF EXISTS handle_new_auth_user();
DROP FUNCTION IF EXISTS save_user_profile(UUID, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE    IF EXISTS "Saved_Issues"  CASCADE;
DROP TABLE    IF EXISTS "User_Skills"   CASCADE;
DROP TABLE    IF EXISTS "Skills"        CASCADE;
DROP TABLE    IF EXISTS "Users"         CASCADE;
DROP TYPE     IF EXISTS experience_level_enum;

CREATE TYPE experience_level_enum AS ENUM ('beginner','intermediate','expert');

CREATE TABLE "Users" (
    id               BIGSERIAL             PRIMARY KEY,
    supabase_id      UUID                  NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    experience_level experience_level_enum NOT NULL DEFAULT 'beginner',
    created_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

CREATE TABLE "Skills" (
    id         BIGSERIAL   PRIMARY KEY,
    name       VARCHAR(60) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "User_Skills" (
    user_id  UUID   NOT NULL REFERENCES "Users"(supabase_id) ON DELETE CASCADE,
    skill_id BIGINT NOT NULL REFERENCES "Skills"(id)         ON DELETE CASCADE,
    PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE "Saved_Issues" (
    id               BIGSERIAL   PRIMARY KEY,
    user_id          UUID        NOT NULL REFERENCES "Users"(supabase_id) ON DELETE CASCADE,
    github_issue_id  VARCHAR     NOT NULL,
    title            VARCHAR     NOT NULL,
    repo_name        VARCHAR     NOT NULL,
    url              VARCHAR     NOT NULL,
    difficulty_label VARCHAR,
    saved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, github_issue_id)
);

CREATE INDEX idx_user_skills_user  ON "User_Skills"(user_id);
CREATE INDEX idx_user_skills_skill ON "User_Skills"(skill_id);
CREATE INDEX idx_saved_issues_user ON "Saved_Issues"(user_id);
CREATE INDEX idx_skills_name       ON "Skills"(name);

-- Auto-update updated_at on Users
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON "Users"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create Users row on every new signup (email OR GitHub OAuth)
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO "Users" (supabase_id, experience_level)
    VALUES (NEW.id, 'beginner')
    ON CONFLICT (supabase_id) DO NOTHING;
    RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Enable RLS
ALTER TABLE "Users"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skills"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User_Skills"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Saved_Issues" ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users: select own" ON "Users" FOR SELECT USING (supabase_id = auth.uid());
CREATE POLICY "Users: insert own" ON "Users" FOR INSERT WITH CHECK (supabase_id = auth.uid());
CREATE POLICY "Users: update own" ON "Users" FOR UPDATE USING (supabase_id = auth.uid());

CREATE POLICY "Skills: authenticated read" ON "Skills" FOR SELECT TO authenticated USING (true);

CREATE POLICY "User_Skills: select own" ON "User_Skills" FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "User_Skills: insert own" ON "User_Skills" FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "User_Skills: delete own" ON "User_Skills" FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Saved_Issues: select own" ON "Saved_Issues" FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Saved_Issues: insert own" ON "Saved_Issues" FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Saved_Issues: delete own" ON "Saved_Issues" FOR DELETE USING (user_id = auth.uid());

-- SECURITY DEFINER function — backend calls this via RPC to bypass RLS
CREATE OR REPLACE FUNCTION save_user_profile(
    p_user_id UUID, p_experience_level TEXT, p_skills TEXT[]
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_skill TEXT;
BEGIN
    IF p_experience_level NOT IN ('beginner','intermediate','expert') THEN
        RETURN jsonb_build_object('error','Invalid experience_level');
    END IF;
    INSERT INTO "Users" (supabase_id, experience_level)
    VALUES (p_user_id, p_experience_level::experience_level_enum)
    ON CONFLICT (supabase_id) DO UPDATE SET experience_level = EXCLUDED.experience_level;
    FOREACH v_skill IN ARRAY p_skills LOOP
        INSERT INTO "Skills" (name) VALUES (v_skill) ON CONFLICT (name) DO NOTHING;
    END LOOP;
    DELETE FROM "User_Skills" WHERE user_id = p_user_id;
    INSERT INTO "User_Skills" (user_id, skill_id)
    SELECT p_user_id, s.id FROM "Skills" s WHERE s.name = ANY(p_skills);
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END; $$;

GRANT EXECUTE ON FUNCTION save_user_profile(UUID, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION save_user_profile(UUID, TEXT, TEXT[]) TO service_role;
```

### 4. Enable GitHub OAuth (for "Continue with GitHub" button)

1. Go to **github.com/settings/developers** → OAuth Apps → New OAuth App
2. Set **Homepage URL** to `http://localhost:8080`
3. Set **Authorization callback URL** to your Supabase callback:
   `https://your-project.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret**
5. In Supabase → **Authentication → Providers → GitHub** → paste them in and enable
6. In Supabase → **Authentication → URL Configuration → Redirect URLs** → add `http://localhost:8080/auth-callback.html`

### 5. Run the backend

```bash
npm start
# or with auto-reload:
npm run dev
```

Expected output:
```
🚀 GitMatch backend running on port 3000
   ✓ Health check → http://localhost:3000/health
   ✓ GitHub token loaded
```

### 6. Open the frontend

```bash
# Option A — npx serve (recommended, handles routing correctly)
npx serve .

# Option B — VS Code Live Server (right-click index.html → Open with Live Server)

# Option C — Python
python3 -m http.server 8080
```

Then open **http://localhost:8080**

---

## User Flow

```
index.html  (landing — works without login)
    ├─► signup.html ──► auth-callback.html ──► onboarding.html ──► find-issues.html
    ├─► login.html  ──(has prefs?) ──────────────────────────────► find-issues.html
    │               ──(no prefs?)  ──────────────────────────────► onboarding.html
    ├─► find-issues.html  (auth — personalised feed, AngularJS sidebar + filters)
    ├─► saveissue.html    (auth — saved issues backlog)
    └─► explore.html      (public — trending repos, fully AngularJS powered)
```

**Preference persistence:** Stored in `localStorage` (fast) and Supabase (cross-device). On load, `find-issues.html` tries `localStorage` first; if empty, calls `GET /api/get-profile`. If neither has data, redirects to `onboarding.html`.

---

## AngularJS Usage

AngularJS 1.8 is used in two pages. Here is a summary for reference:

### `explore.html` — AngularJS owns the entire page

The `ExploreCtrl` controller manages all state. `$http` (AngularJS's built-in HTTP service) fetches repos from the backend.

| Directive | Purpose |
|-----------|---------|
| `ng-app="exploreApp"` | Bootstraps the Angular app on `<html>` |
| `ng-controller="ExploreCtrl"` | Attaches controller to `<body>` |
| `ng-repeat="skill in skills"` | Renders one skill pill per language |
| `ng-class="{ active: activeSkill === skill }"` | Highlights the selected pill |
| `ng-click="setSkill(skill)"` | Triggers filtered repo fetch |
| `ng-if="loading"` | Shows spinner while fetching |
| `ng-if="!loading && error"` | Shows error state if API fails |
| `ng-repeat="repo in repos"` | Renders every repo card from API data |
| `ng-src="{{ repo.avatar }}"` | Safely binds avatar image URLs |
| `ng-bind` / `{{ }}` | Binds name, description, stars, language |
| `ng-if="isLoggedIn"` | Shows Dashboard vs Login in nav |

### `find-issues.html` — AngularJS powers the sidebar and filter pills

The main issue card feed uses vanilla JS (for async/await + XSS-safe DOM building). AngularJS controls all reactive UI. A lightweight bridge (`window._ngSetPrefs`, `window._fetchIssues`) connects the two layers.

| Directive | Purpose |
|-----------|---------|
| `ng-app="gitMatchApp"` | Bootstraps the app on `<html>` |
| `ng-controller="DashboardCtrl"` | Attaches controller to `<body>` |
| `ng-repeat="lang in sidebar.languages"` | Renders sidebar stack chips |
| `ng-bind="sidebar.levelLabel"` | Reactive level badge text |
| `ng-style="sidebar.levelStyle"` | Level badge colour (green/amber/purple) |
| `ng-bind="sidebar.issueCount"` | Live count of loaded issues |
| `ng-bind="sidebar.savedCount"` | Live saved issues count |
| `ng-repeat="lang in filters.langs"` | Renders All + each language filter pill |
| `ng-class="{ active: filters.active === lang }"` | Highlights active filter |
| `ng-click="setFilter(lang)"` | Triggers filtered fetch |

---

## API Reference

| Method | Path                  | Auth       | Description                              |
|--------|-----------------------|------------|------------------------------------------|
| GET    | `/health`             | None       | Server status, uptime, cache size        |
| POST   | `/api/save-profile`   | Bearer JWT | Save user skills + level (calls SQL RPC) |
| GET    | `/api/get-profile`    | Bearer JWT | Restore user profile on new device       |
| POST   | `/api/issues`         | None       | GitHub issues filtered by language/level |
| GET    | `/api/trending-repos` | None       | Top starred GitHub repos by language     |

### POST `/api/save-profile`
```json
{ "skills": ["JavaScript", "TypeScript"], "experience_level": "beginner" }
```

### GET `/api/get-profile`
```json
{ "experience_level": "beginner", "level": "good first issue", "languages": ["JavaScript"] }
```

### POST `/api/issues`
```json
{ "languages": ["JavaScript"], "level": "good first issue", "page": 1, "filterLang": "All" }
```

### GET `/api/trending-repos`
Query param `skill` (optional) — e.g. `?skill=Python`

---

## Deploying

### Backend — Railway / Render / Fly.io

1. Push repo to GitHub
2. Connect to your platform and select the repo
3. Set all env vars in the platform dashboard (same as `.env`)
4. Entry point: `npm start`

### Frontend — Vercel / Netlify / GitHub Pages

1. Update `config.js`:
   ```js
   const API_BASE = 'https://your-backend.railway.app';
   ```
2. Set `ALLOWED_ORIGINS` in backend env to your frontend URL
3. Deploy repo root as a static site — no build step needed

---

## Security

| Topic        | Detail                                                                     |
|--------------|----------------------------------------------------------------------------|
| XSS          | All GitHub data rendered via `textContent` / DOM API — never `innerHTML`   |
| CORS         | Restricted to `ALLOWED_ORIGINS` env var                                    |
| Auth         | Supabase JWT verified server-side on every protected route                 |
| RLS          | Enabled on all 4 tables — users can only access their own rows             |
| RLS bypass   | `save_user_profile()` uses `SECURITY DEFINER` to safely bypass RLS         |
| Secrets      | `SUPABASE_SERVICE_ROLE_KEY` is server-only, never in any frontend file     |
| `.env`       | In `.gitignore` — never committed to version control                       |

> The Supabase `anon` key in `supabase-client.js` is intentional and safe **only because RLS is enabled** on every table.

---

## Known Limitations

- In-memory cache is per-process — multiple backend instances have separate caches.
- `User_Skills` updates use delete-then-insert (not a true transaction). Fine for this scale.
- GitHub Search API can return slightly stale results for a few minutes after changes.