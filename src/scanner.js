'use strict';

const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
const ignore = require('ignore');

// .treeignore itself is excluded via ig.ignores(), not here, so it appears in snapshots
const ALWAYS_IGNORE = [
  '.tree/**',
  '.treeignore',
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '**/*.log',
];

async function scanWorkspace(rootPath, extraIgnore = [], maxFileSizeKB = 2048) {
  const ig = ignore();
  const treeignorePath = path.join(rootPath, '.treeignore');
  if (fs.existsSync(treeignorePath)) {
    ig.add(fs.readFileSync(treeignorePath, 'utf8'));
  }
  if (extraIgnore.length > 0) {
    ig.add(extraIgnore);
  }

  const entries = await fg('**/*', {
    cwd: rootPath,
    dot: true,                 // include hidden files
    followSymbolicLinks: false,
    onlyFiles: true,
    ignore: ALWAYS_IGNORE,
    suppressErrors: true,
  });

  const maxBytes = maxFileSizeKB * 1024;
  const filtered = [];
  let totalSizeBytes = 0;

  for (const rel of entries) {
    if (ig.ignores(rel)) continue;

    try {
      const stat = fs.statSync(path.join(rootPath, rel));
      if (stat.size > maxBytes) continue;
      totalSizeBytes += stat.size;
    } catch {
      continue;
    }

    filtered.push(rel);
  }

  filtered.sort((a, b) => a.localeCompare(b));

  return { files: filtered, totalSizeBytes };
}

module.exports = { scanWorkspace };