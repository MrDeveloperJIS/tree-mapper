'use strict';

const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
const ignore = require('ignore');

// Patterns always excluded regardless of .treeignore
// NOTE: .treeignore itself is intentionally NOT excluded here — it should
// appear in the snapshot so users can see what ignore rules are in effect.
const ALWAYS_IGNORE = [
  '.tree/**',
  '.treeignore',
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '**/*.log',
];

/**
 * Scans the workspace and returns an array of relative file paths.
 *
 * @param {string} rootPath      - Absolute workspace root
 * @param {string[]} extraIgnore - Extra patterns from settings
 * @param {number} maxFileSizeKB - Files larger than this are skipped
 * @returns {Promise<string[]>}  - Sorted relative paths
 */
async function scanWorkspace(rootPath, extraIgnore = [], maxFileSizeKB = 2048) {
  // ── 1. Load .treeignore ─────────────────────────────────────────────────
  const ig = ignore();
  const treeignorePath = path.join(rootPath, '.treeignore');
  if (fs.existsSync(treeignorePath)) {
    const content = fs.readFileSync(treeignorePath, 'utf8');
    ig.add(content);
  }
  if (extraIgnore.length > 0) {
    ig.add(extraIgnore);
  }

  // ── 2. Glob all files ───────────────────────────────────────────────────
  const entries = await fg('**/*', {
    cwd: rootPath,
    dot: true,                 // include hidden files
    followSymbolicLinks: false,
    onlyFiles: true,
    ignore: ALWAYS_IGNORE,
    suppressErrors: true,
  });

  // ── 3. Apply .treeignore filter + size filter ───────────────────────────
  const maxBytes = maxFileSizeKB * 1024;
  const filtered = [];

  for (const rel of entries) {
    // Skip if matches .treeignore
    if (ig.ignores(rel)) continue;

    // Skip if file is too large or unreadable
    try {
      const abs = path.join(rootPath, rel);
      const stat = fs.statSync(abs);
      if (stat.size > maxBytes) continue;
    } catch (err) {
      continue; // unreadable — skip safely
    }

    filtered.push(rel);
  }

  // Sort alphabetically — tree builder constructs hierarchy from path structure
  filtered.sort((a, b) => a.localeCompare(b));

  return filtered;
}

module.exports = { scanWorkspace };