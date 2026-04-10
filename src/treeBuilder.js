'use strict';

/**
 * Builds a CLI-style tree representation from a flat list of relative paths.
 *
 * @param {string[]} files - Sorted relative file paths
 * @returns {string[]}     - Array of rendered tree lines
 */
function buildTree(files) {
  // Build a nested object representing the directory structure
  const root = {};

  for (const filePath of files) {
    const parts = filePath.split('/');
    let node = root;
    for (const part of parts) {
      if (!node[part]) {
        node[part] = {};
      }
      node = node[part];
    }
    // Mark as file (leaf node)
    node.__file = true;
  }

  const lines = [];
  renderNode(root, '', lines);
  return lines;
}

/**
 * Recursively renders a tree node into CLI-style lines.
 *
 * @param {object}   node   - Current tree node
 * @param {string}   prefix - Indentation prefix accumulated so far
 * @param {string[]} lines  - Output array to push rendered lines into
 */
function renderNode(node, prefix, lines) {
  const keys = Object.keys(node).filter((k) => k !== '__file');

  // Directories: nodes that have children (are not pure leaf nodes)
  const dirs = keys.filter(
    (k) => Object.keys(node[k]).filter((x) => x !== '__file').length > 0
  );

  // Files: leaf nodes (no children other than __file marker)
  const fileKeys = keys.filter(
    (k) => Object.keys(node[k]).filter((x) => x !== '__file').length === 0
  );

  // Render directories first (alphabetical), then files (alphabetical)
  const sorted = [
    ...dirs.sort((a, b) => a.localeCompare(b)),
    ...fileKeys.sort((a, b) => a.localeCompare(b)),
  ];

  sorted.forEach((key, index) => {
    const isLast = index === sorted.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${key}`);

    const child = node[key];
    const childKeys = Object.keys(child).filter((k) => k !== '__file');
    if (childKeys.length > 0) {
      renderNode(child, prefix + childPrefix, lines);
    }
  });
}

module.exports = { buildTree };