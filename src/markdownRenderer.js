'use strict';

const path = require('path');
const fs = require('fs');
const { getLanguage } = require('./languageMap');

/**
 * Returns a human-readable local datetime string with timezone offset.
 * Format: YYYY MM DD HH:MM:SS AM/PM UTC±H
 * Example: 2026 04 10 06:35:22 PM UTC+6
 *
 * Uses the device's local time — so the output reflects wherever the
 * user is running VS Code, not UTC.
 */
function getLocalDateTimeString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  const year  = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day   = pad(now.getDate());

  const h24  = now.getHours();
  const h12  = h24 % 12 || 12;           // convert to 12-hour, 0 → 12
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const min  = pad(now.getMinutes());
  const sec  = pad(now.getSeconds());

  // getTimezoneOffset() returns minutes WEST of UTC (negative for east)
  // e.g. UTC+6 → -360, UTC-5 → 300
  const offsetTotalMin = -now.getTimezoneOffset();
  const offsetSign     = offsetTotalMin >= 0 ? '+' : '-';
  const offsetHours    = Math.floor(Math.abs(offsetTotalMin) / 60);
  const offsetMins     = Math.abs(offsetTotalMin) % 60;
  // Show minutes only if non-zero (e.g. UTC+5:30 for India)
  const offsetStr      = offsetMins > 0
    ? `UTC${offsetSign}${offsetHours}:${pad(offsetMins)}`
    : `UTC${offsetSign}${offsetHours}`;

  return `${year} ${month} ${day} ${pad(h12)}:${min}:${sec} ${ampm} ${offsetStr}`;
}

/**
 * Renders the full Markdown snapshot document.
 *
 * @param {string}   rootPath      - Absolute workspace root
 * @param {string[]} treeLines     - CLI tree lines from treeBuilder
 * @param {string[]} files         - Relative file paths
 * @param {number}   maxFileSizeKB - Max file size setting (shown in header)
 * @returns {string}               - Complete Markdown string
 */
function renderMarkdown(rootPath, treeLines, files, maxFileSizeKB) {
  const projectName = path.basename(rootPath);
  // FIX: use local device time with timezone, not UTC ISO string
  const displayTime = getLocalDateTimeString();
  const parts = [];

  // ── Header ──────────────────────────────────────────────────────────────
  parts.push(`# Workspace Snapshot: \`${projectName}\``);
  parts.push('');
  parts.push(`> **Generated:** ${displayTime}  `);
  parts.push(`> **Files included:** ${files.length}  `);
  parts.push(`> **Max file size:** ${maxFileSizeKB} KB  `);
  parts.push('');
  parts.push('---');
  parts.push('');

  // ── Project Tree ──────────────────────────────────────────────────────────
  parts.push('## Project Tree');
  parts.push('');
  parts.push('```');
  parts.push(projectName + '/');
  parts.push(...treeLines);
  parts.push('```');
  parts.push('');
  parts.push('---');
  parts.push('');

  // ── File Contents ─────────────────────────────────────────────────────────
  parts.push('## File Contents');
  parts.push('');

  for (const rel of files) {
    const abs = path.join(rootPath, rel);
    const lang = getLanguage(rel);

    parts.push(`### \`${rel}\``);
    parts.push('');

    try {
      const content = fs.readFileSync(abs, 'utf8');
      // Detect binary files by presence of null bytes and skip them
      if (content.includes('\u0000')) {
        parts.push('*Skipped: binary file detected.*');
      } else {
        parts.push(`\`\`\`${lang}`);
        parts.push(content.trimEnd());
        parts.push('```');
      }
    } catch (err) {
      parts.push(`*Skipped: could not read file (${err.code || err.message}).*`);
    }

    parts.push('');
  }

  return parts.join('\n');
}

module.exports = { renderMarkdown };