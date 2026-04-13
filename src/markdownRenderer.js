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

function renderMarkdown(rootPath, treeLines, files, totalSizeBytes, skippedCount = 0) {
  const projectName = path.basename(rootPath);
  const parts = [];

  parts.push(`# Workspace Snapshot: \`${projectName}\``);
  parts.push('');
  parts.push(`> **Generated:** ${getLocalDateTimeString()}  `);
  parts.push(`> **Files included:** ${files.length}  `);
  if (skippedCount > 0) {
    parts.push(`> **Files skipped:** ${skippedCount}  `);
  }
  parts.push(`> **Repo size:** ${formatBytes(totalSizeBytes)}  `);
  parts.push('');
  parts.push('---');
  parts.push('');

  parts.push('## Project Tree');
  parts.push('');
  parts.push('```');
  parts.push(projectName + '/');
  parts.push(...treeLines);
  parts.push('```');
  parts.push('');
  parts.push('---');
  parts.push('');

  parts.push('## File Contents');
  parts.push('');

  for (const rel of files) {
    const abs = path.join(rootPath, rel);
    const lang = getLanguage(rel);

    parts.push(`### \`${rel}\``);
    parts.push('');

    try {
      const content = fs.readFileSync(abs, 'utf8');
      parts.push(`\`\`\`${lang}`);
      parts.push(content.trimEnd());
      parts.push('```');
    } catch (err) {
      parts.push(`*Skipped: could not read file (${err.code || err.message}).*`);
    }

    parts.push('');
  }

  return parts.join('\n');
}

module.exports = { renderMarkdown };