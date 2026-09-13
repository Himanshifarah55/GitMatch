// ============================================================
//  levels.js — Single source of truth for the experience-level
//  <-> GitHub-label mapping used across the whole app.
//
//  LOAD ORDER: after config.js, before any page script that
//  displays or interprets a difficulty level.
// ============================================================

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'expert'];

// Internal level key -> the GitHub issue label it searches/matches against.
const LEVEL_TO_GITHUB_LABEL = {
    beginner: 'good first issue',
    intermediate: 'help wanted',
    expert: 'enhancement'
};

// Reverse lookup: GitHub label -> internal level key.
const GITHUB_LABEL_TO_LEVEL = {
    'good first issue': 'beginner',
    'help wanted': 'intermediate',
    enhancement: 'expert'
};

// Display info for badges/tags, keyed by internal level key.
const LEVEL_DISPLAY = {
    beginner:     { text: 'Beginner',     cls: 'beginner',     badgeLabel: 'GOOD FIRST ISSUE', badgeBg: '#065f46' },
    intermediate: { text: 'Intermediate', cls: 'intermediate', badgeLabel: 'HELP WANTED',       badgeBg: '#92400e' },
    expert:       { text: 'Expert',       cls: 'expert',       badgeLabel: 'ENHANCEMENT',       badgeBg: '#581c87' }
};

// Accepts either an internal level key ("beginner") or a GitHub label
// ("good first issue") or a difficulty_label string from Saved_Issues,
// and returns the display info to render a badge/tag.
function getDifficultyDisplay(levelOrLabel) {
    if (!levelOrLabel) return LEVEL_DISPLAY.beginner;
    const level = EXPERIENCE_LEVELS.includes(levelOrLabel)
        ? levelOrLabel
        : (GITHUB_LABEL_TO_LEVEL[levelOrLabel] || 'beginner');
    return LEVEL_DISPLAY[level];
}