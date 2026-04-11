'use strict';

function buildTree(files) {
  const root = {};

  for (const filePath of files) {
    const parts = filePath.split('/');
    let node = root;
    for (const part of parts) {
      if (!node[part]) node[part] = {};
      node = node[part];
    }
    node.__file = true;  // sentinel: marks leaf nodes
  }

  const lines = [];
  renderNode(root, '', lines);
  return lines;
}

function renderNode(node, prefix, lines) {
  const keys = Object.keys(node).filter((k) => k !== '__file');

  const hasChildren = (k) => Object.keys(node[k]).filter((x) => x !== '__file').length > 0;
  const dirs     = keys.filter(hasChildren);
  const fileKeys = keys.filter((k) => !hasChildren(k));

  // Directories before files, each group sorted alphabetically
  const sorted = [
    ...dirs.sort((a, b) => a.localeCompare(b)),
    ...fileKeys.sort((a, b) => a.localeCompare(b)),
  ];

  sorted.forEach((key, index) => {
    const isLast      = index === sorted.length - 1;
    const connector   = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    lines.push(`${prefix}${connector}${key}`);

    const child = node[key];
    if (Object.keys(child).filter((k) => k !== '__file').length > 0) {
      renderNode(child, prefix + childPrefix, lines);
    }
  });
}

module.exports = { buildTree };