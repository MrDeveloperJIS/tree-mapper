'use strict';

const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
const ignore = require('ignore');

async function scanWorkspace(rootPath, maxFileSizeKB = 2048) {
  const ig = ignore();
  const treeignorePath = path.join(rootPath, '.treeignore');
  if (fs.existsSync(treeignorePath)) {
    ig.add(fs.readFileSync(treeignorePath, 'utf8'));
  }

  const entries = await fg('**/*', {
    cwd: rootPath,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: true,
    suppressErrors: true,
  });

  const maxBytes = maxFileSizeKB * 1024;
  const filtered = [];
  let totalSizeBytes = 0;
  let skippedCount = 0;

  for (const rel of entries) {
    if (ig.ignores(rel)) continue;

    let stat;
    try {
      stat = fs.statSync(path.join(rootPath, rel));
    } catch {
      skippedCount++;
      continue;
    }

    if (stat.size > maxBytes) {
      skippedCount++;
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(path.join(rootPath, rel));
    } catch {
      skippedCount++;
      continue;
    }

    if (content.includes(0)) {
      skippedCount++;
      continue;
    }

    totalSizeBytes += stat.size;
    filtered.push(rel);
  }

  filtered.sort((a, b) => a.localeCompare(b));

  return { files: filtered, totalSizeBytes, skippedCount };
}

module.exports = { scanWorkspace };