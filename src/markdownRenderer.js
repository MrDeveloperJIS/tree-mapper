'use strict';

const path = require('path');
const fs = require('fs');
const { getLanguage } = require('./languageMap');

function getLocalDateTimeString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());

  const h24 = now.getHours();
  const h12 = h24 % 12 || 12;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const min = pad(now.getMinutes());
  const sec = pad(now.getSeconds());

  const offsetTotalMin = -now.getTimezoneOffset();
  const offsetSign = offsetTotalMin >= 0 ? '+' : '-';
  const offsetHours = Math.floor(Math.abs(offsetTotalMin) / 60);
  const offsetMins = Math.abs(offsetTotalMin) % 60;
  const offsetStr = offsetMins > 0
    ? `UTC${offsetSign}${offsetHours}:${pad(offsetMins)}`
    : `UTC${offsetSign}${offsetHours}`;

  return `${year} ${month} ${day} ${pad(h12)}:${min}:${sec} ${ampm} ${offsetStr}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Estimates token count using a simple heuristic:
 * ~4 characters per token (GPT/Claude approximation).
 * Returns a formatted string like "~12,400 tokens".
 */
function estimateTokens(text) {
  const count = Math.round(text.length / 4);
  return `~${count.toLocaleString('en-US')} tokens`;
}

/**
 * Converts heading text into the same anchor slug that GitHub / VS Code's
 * markdown preview generate automatically: lowercase, strip everything that
 * isn't a letter/number/underscore/hyphen/space, then turn spaces into
 * hyphens. No HTML `<a>` tags needed — the heading itself becomes the anchor.
 */
function slugifyText(text) {
  const base = text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]+/g, '')
    .replace(/\s+/g, '-');
  return base || '-';
}

/**
 * Returns a slug() function that mimics GitHub's duplicate-heading handling:
 * the first heading with a given text keeps the plain slug, later headings
 * with the same text get `-1`, `-2`, etc. appended. Must be called once per
 * heading, in the exact order those headings appear in the document, or the
 * generated links won't line up with what the renderer actually produces.
 */
function makeSlugger() {
  const counts = new Map();
  return function slug(text) {
    const base = slugifyText(text);
    const n = counts.get(base) || 0;
    counts.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

/**
 * @param {string}   rootPath
 * @param {string[]} workspaceTreeLines  - full workspace tree (excl. default-ignored)
 * @param {string[]} snapshotTreeLines   - only the included files
 * @param {string[]} files               - included file relative paths
 * @param {number}   totalSizeBytes
 * @param {number}   skippedCount        - count of binary/oversized files
 * @param {number}   excludedCount       - count of user-unchecked files
 * @param {Array<{rel:string,reason:string}>} [skippedFiles] - details of each skipped file
 */
function renderMarkdown(
  rootPath,
  workspaceTreeLines,
  snapshotTreeLines,
  files,
  totalSizeBytes,
  skippedCount = 0,
  excludedCount = 0,
  skippedFiles = [],
) {
  const projectName = path.basename(rootPath);
  const parts = [];

  // Build body first (without header) so we can count tokens accurately
  const bodyParts = [];

  // ── Anchor slugs ─────────────────────────────────────────────────────────
  // Computed in the exact order headings appear below, so they match what a
  // markdown renderer (GitHub, VS Code preview) auto-generates for each
  // heading — including the "-1", "-2" suffixes on repeated slugs. The H1
  // title and "## Index" itself are slugged too (even though unused here)
  // purely to keep that ordering/dedup count accurate.
  const slug = makeSlugger();
  slug(`Workspace Snapshot: ${projectName}`); // H1 — not linked to, kept for correct ordering
  slug('Index'); // not linked to, kept for correct ordering
  const workspaceTreeAnchor = slug('Workspace Tree');
  const snapshotTreeAnchor = slug('Snapshot Tree');
  const skippedFilesAnchor = skippedFiles.length > 0 ? slug('Skipped Files') : null;
  const fileContentsAnchor = slug('File Contents');
  const fileAnchors = files.map((rel) => slug(rel));

  // ── Index ────────────────────────────────────────────────────────────────
  bodyParts.push('## Index');
  bodyParts.push('');
  bodyParts.push(`- [Workspace Tree](#${workspaceTreeAnchor})`);
  bodyParts.push(`- [Snapshot Tree](#${snapshotTreeAnchor})`);
  if (skippedFilesAnchor) {
    bodyParts.push(`- [Skipped Files](#${skippedFilesAnchor})`);
  }
  bodyParts.push(`- [File Contents](#${fileContentsAnchor})`);
  bodyParts.push('');
  bodyParts.push('---');
  bodyParts.push('');

  // ── Workspace Tree ────────────────────────────────────────────────────────
  bodyParts.push('## Workspace Tree');
  bodyParts.push('');
  bodyParts.push('> Full repository structure, excluding default-ignored paths.');
  bodyParts.push('');
  bodyParts.push('```');
  bodyParts.push(projectName + '/');
  bodyParts.push(...workspaceTreeLines);
  bodyParts.push('```');
  bodyParts.push('');

  // ── Snapshot Tree ─────────────────────────────────────────────────────────
  bodyParts.push('## Snapshot Tree');
  bodyParts.push('');
  bodyParts.push('> Only the files mapped and included in this snapshot.');
  bodyParts.push('');
  bodyParts.push('```');
  bodyParts.push(projectName + '/');
  bodyParts.push(...snapshotTreeLines);
  bodyParts.push('```');
  bodyParts.push('');
  bodyParts.push('---');
  bodyParts.push('');

  // ── Skipped files notice ──────────────────────────────────────────────────
  if (skippedFiles.length > 0) {
    bodyParts.push('## Skipped Files');
    bodyParts.push('');
    bodyParts.push('> The following files were selected but could not be included in the snapshot.');
    bodyParts.push('');
    for (const sf of skippedFiles) {
      bodyParts.push(`- \`${sf.rel}\` — *${sf.reason}*`);
    }
    bodyParts.push('');
    bodyParts.push('---');
    bodyParts.push('');
  }

  // ── File Contents ─────────────────────────────────────────────────────────
  bodyParts.push('## File Contents');
  bodyParts.push('');

  // Jump-list so a specific file can be found without scrolling — the
  // Snapshot Tree above stays plain ASCII (it's inside a code fence, so
  // links there wouldn't be clickable anyway).
  for (let i = 0; i < files.length; i++) {
    bodyParts.push(`- [\`${files[i]}\`](#${fileAnchors[i]})`);
  }
  bodyParts.push('');

  for (let i = 0; i < files.length; i++) {
    const rel = files[i];
    const abs = path.join(rootPath, rel);
    const lang = getLanguage(rel);

    bodyParts.push(`### \`${rel}\``);
    bodyParts.push('');

    try {
      const content = fs.readFileSync(abs, 'utf8');
      bodyParts.push(`\`\`\`${lang}`);
      bodyParts.push(content.trimEnd());
      bodyParts.push('```');
    } catch (err) {
      bodyParts.push(`*Skipped: could not read file (${err.code || err.message}).*`);
    }

    bodyParts.push('');
    bodyParts.push(`[Back to top](#${fileContentsAnchor})`);
    bodyParts.push('');
  }

  const bodyText = bodyParts.join('\n');
  const tokenEstimate = estimateTokens(bodyText);

  // ── Header ────────────────────────────────────────────────────────────────
  parts.push(`# Workspace Snapshot: \`${projectName}\``);
  parts.push('');
  parts.push(`> **Generated:** ${getLocalDateTimeString()}  `);
  parts.push(`> **Files included:** ${files.length}  `);
  if (skippedCount > 0) {
    parts.push(`> **Files skipped:** ${skippedCount}  `);
  }
  if (excludedCount > 0) {
    parts.push(`> **Files excluded:** ${excludedCount}  `);
  }
  parts.push(`> **Repo size:** ${formatBytes(totalSizeBytes)}  `);
  parts.push(`> **Est. token count:** ${tokenEstimate}  `);
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push(bodyText);

  return parts.join('\n');
}

module.exports = { renderMarkdown };