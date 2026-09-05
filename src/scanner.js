'use strict';

const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
const ignore = require('ignore');

/**
 * Scans the workspace and returns a tree structure with ignore metadata.
 * No .treeignore — ignore rules come purely from defaultIgnorePatterns setting.
 *
 * Returns:
 *   {
 *     tree: TreeNode[],       // nested tree for the webview
 *     entries: EntryMeta[],   // flat list of all entries with metadata
 *     total: number,          // total file count
 *     ignored: number,        // files flagged as ignoredByDefault
 *   }
 */
const BINARY_SNIFF_BYTES = 8192;

/**
 * Cheap binary-file detection: reads only the first BINARY_SNIFF_BYTES of the
 * file (not the whole thing) and checks for a null byte, the same heuristic
 * git and most editors use. Avoids loading large files fully into memory
 * just to classify them.
 */
function isLikelyBinary(fullPath) {
  let fd;
  try {
    fd = fs.openSync(fullPath, 'r');
    const buf = Buffer.alloc(BINARY_SNIFF_BYTES);
    const bytesRead = fs.readSync(fd, buf, 0, BINARY_SNIFF_BYTES, 0);
    return buf.subarray(0, bytesRead).includes(0);
  } catch {
    return false;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* non-fatal */ }
    }
  }
}

async function scanWorkspace(rootPath, maxFileSizeKB = 2048, defaultIgnorePatterns = []) {
  const ig = ignore();
  if (defaultIgnorePatterns.length > 0) {
    ig.add(defaultIgnorePatterns);
  }

  // Always hard-ignore .tree/ output dir itself
  ig.add('.tree/');

  const entries = await fg('**/*', {
    cwd: rootPath,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: false,   // include dirs too for tree display
    markDirectories: true,
    suppressErrors: true,
  });

  const maxBytes = maxFileSizeKB * 1024;
  const entryMetas = [];
  let totalFiles = 0;
  let ignoredFiles = 0;

  // Process each entry
  for (let rel of entries) {
    const isDir = rel.endsWith('/');
    const cleanRel = isDir ? rel.slice(0, -1) : rel;

    // Check if ignored by default patterns
    const ignoredByDefault = ig.ignores(isDir ? cleanRel + '/' : cleanRel)
      || ig.ignores(cleanRel);

    let size = 0;
    let skipped = false;
    let isBinary = false;

    if (!isDir) {
      totalFiles++;
      if (ignoredByDefault) ignoredFiles++;

      try {
        const stat = fs.statSync(path.join(rootPath, cleanRel));
        size = stat.size;

        if (size > maxBytes) {
          skipped = true;
        } else {
          // Binary check — only sniff the first few KB instead of reading
          // the whole file into memory just to look for a null byte.
          if (isLikelyBinary(path.join(rootPath, cleanRel))) {
            isBinary = true;
            skipped = true;
          }
        }
      } catch {
        skipped = true;
      }
    }

    entryMetas.push({
      rel: cleanRel,
      isDir,
      ignoredByDefault,
      size,
      skipped,
      isBinary,
      name: path.basename(cleanRel),
    });
  }

  // Build nested tree structure for the webview
  const tree = buildNestedTree(entryMetas, rootPath);

  return {
    tree,
    entries: entryMetas,
    total: totalFiles,
    ignored: ignoredFiles,
  };
}

/**
 * Builds a nested tree from flat entry list.
 * Directories come before files at each level, both sorted alphabetically.
 */
function buildNestedTree(entryMetas, rootPath) {
  // Build a map of dir path → children
  const dirMap = new Map(); // dirPath → EntryMeta[]
  dirMap.set('', []);

  for (const e of entryMetas) {
    const parentDir = path.dirname(e.rel);
    const normalParent = parentDir === '.' ? '' : parentDir;
    if (!dirMap.has(normalParent)) dirMap.set(normalParent, []);
    if (!dirMap.has(e.rel) && e.isDir) dirMap.set(e.rel, []);
    dirMap.get(normalParent).push(e);
  }

  function buildLevel(dirPath) {
    const children = dirMap.get(dirPath) || [];
    const dirs = children.filter(e => e.isDir).sort((a, b) => a.name.localeCompare(b.name));
    const files = children.filter(e => !e.isDir).sort((a, b) => a.name.localeCompare(b.name));

    return [...dirs, ...files].map(e => ({
      ...e,
      children: e.isDir ? buildLevel(e.rel) : undefined,
    }));
  }

  return buildLevel('');
}

module.exports = { scanWorkspace };