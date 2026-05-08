require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function githubHeaders() {
  const headers = { 'User-Agent': 'GitMatch-Server' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:8080,http://127.0.0.1:8080,http://localhost:5500,http://127.0.0.1:5500'
).split(',').map((o) => o.trim());

function isAllowedOrigin(origin) {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname.endsWith('.vercel.app')) return true;
    if (process.env.VERCEL_URL && origin === `https://${process.env.VERCEL_URL}`) return true;
  } catch (_) {
    return false;
  }

  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json({ limit: '10kb' }));

const CACHE = new Map();
const TTL_ISSUES = 5 * 60 * 1000;
const TTL_REPOS = 10 * 60 * 1000;

function getCached(key) {
  const item = CACHE.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    CACHE.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttl) {
  CACHE.set(key, { data, expiry: Date.now() + ttl });
}

if (require.main === module && !process.env.VERCEL) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of CACHE.entries()) {
      if (now > val.expiry) CACHE.delete(key);
    }
  }, 60 * 1000);
}

const alphanumDash = (str) => String(str).replace(/[^a-zA-Z0-9\-+#]/g, '');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token.' });

  req.user = user;
  next();
}

app.post('/api/save-profile', requireAuth, async (req, res) => {
  const { skills, experience_level } = req.body;
  const userId = req.user.id;

  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'skills must be a non-empty array.' });
  }

  const VALID_LEVELS = ['beginner', 'intermediate', 'expert'];
  if (!VALID_LEVELS.includes(experience_level)) {
    return res.status(400).json({
      error: `experience_level must be one of: ${VALID_LEVELS.join(', ')}`
    });
  }

  const sanitisedSkills = skills
    .map((s) => String(s).trim().slice(0, 60))
    .filter((s) => s.length > 0)
    .slice(0, 5);

  if (sanitisedSkills.length === 0) {
    return res.status(400).json({ error: 'No valid skills provided.' });
  }

  try {
    const { data, error } = await supabase.rpc('save_user_profile', {
      p_user_id: userId,
      p_experience_level: experience_level,
      p_skills: sanitisedSkills
    });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    res.json({ success: true, skills: sanitisedSkills, experience_level });
  } catch (err) {
    console.error('[api/save-profile]', err.message);
    res.status(500).json({ error: err.message || 'Failed to save profile.' });
  }
});

app.get('/api/get-profile', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data: user, error: userErr } = await supabase
      .from('Users')
      .select('experience_level')
      .eq('supabase_id', userId)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: 'Profile not found. Please complete onboarding.' });
    }

    const { data: userSkills, error: skillsErr } = await supabase
      .from('User_Skills')
      .select('skill_id, Skills(name)')
      .eq('user_id', userId);

    if (skillsErr) throw new Error(skillsErr.message);

    const skills = (userSkills || []).map((us) => us.Skills?.name).filter(Boolean);

    const levelToLabel = {
      beginner: 'good first issue',
      intermediate: 'help wanted',
      expert: 'enhancement'
    };

    res.json({
      experience_level: user.experience_level,
      level: levelToLabel[user.experience_level] || 'good first issue',
      languages: skills
    });
  } catch (err) {
    console.error('[api/get-profile]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch profile.' });
  }
});

app.post('/api/issues', async (req, res) => {
  const { languages, level, page = 1, filterLang = 'All' } = req.body;

  if (!Array.isArray(languages) || languages.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid languages array.' });
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const dateStr = sixMonthsAgo.toISOString().split('T')[0];

  let q = `is:issue is:open created:>${dateStr}`;

  const levelMap = {
    beginner: 'label:"good first issue"',
    'good first issue': 'label:"good first issue"',
    intermediate: 'label:"help wanted"',
    'help wanted': 'label:"help wanted"',
    expert: 'label:"enhancement"',
    enhancement: 'label:"enhancement"'
  };

  if (level && levelMap[level]) q += ` ${levelMap[level]}`;

  if (filterLang && filterLang !== 'All') {
    q += ` language:"${alphanumDash(filterLang)}"`;
  } else {
    const validLanguages = languages
      .map((l) => alphanumDash(l))
      .filter(Boolean);

    if (validLanguages.length === 1) {
      q += ` language:"${validLanguages[0]}"`;
    } else if (validLanguages.length > 1) {
      const languageQuery = validLanguages
        .map((lang) => `language:"${lang}"`)
        .join(' OR ');
      q += ` (${languageQuery})`;
    }
  }

  const cacheKey = `issues:${q}:page:${page}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=30&page=${page}`;
    const response = await fetch(url, { headers: githubHeaders() });
    const data = await response.json();

    if (data.message) {
      const status = data.message.toLowerCase().includes('rate limit') ? 429 : 502;
      return res.status(status).json({ error: data.message });
    }

    const issues = (data.items || []).map((i) => ({
      id: String(i.id),
      title: i.title,
      url: i.html_url,
      repo: i.repository_url.split('/').slice(-2).join('/'),
      labels: i.labels.map((l) => l.name),
      created_at: i.created_at
    }));

    setCache(cacheKey, issues, TTL_ISSUES);
    res.json(issues);
  } catch (err) {
    console.error('[api/issues]', err.message);
    res.status(500).json({ error: 'Failed to fetch issues.' });
  }
});

app.get('/api/trending-repos', async (req, res) => {
  const skill = alphanumDash(req.query.skill || '');

  let q = 'stars:>1000';
  if (skill && skill !== 'AllEcosystems' && skill !== 'All') {
    q += ` language:${skill}`;
  }

  const cacheKey = `repos:${skill || 'all'}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=9`;
    const response = await fetch(url, { headers: githubHeaders() });
    const data = await response.json();

    if (data.message) {
      const status = data.message.toLowerCase().includes('rate limit') ? 429 : 502;
      return res.status(status).json({ error: data.message });
    }

    const repos = (data.items || []).map((r) => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      language: r.language,
      avatar: r.owner.avatar_url,
      url: r.html_url
    }));

    setCache(cacheKey, repos, TTL_REPOS);
    res.json(repos);
  } catch (err) {
    console.error('[api/trending-repos]', err.message);
    res.status(500).json({ error: 'Failed to fetch repositories.' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cache_size: CACHE.size,
    uptime_seconds: Math.round(process.uptime()),
    github_token: !!process.env.GITHUB_TOKEN
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nGitMatch backend running on port ${PORT}`);
    console.log(`Health check -> http://localhost:${PORT}/health`);
    if (!process.env.GITHUB_TOKEN) {
      console.warn('GITHUB_TOKEN missing - GitHub rate limit: 10 req/min without it.');
    } else {
      console.log('GitHub token loaded');
    }
  });
}

module.exports = app;
