'use strict';

/**
 * Builds two trees:
 *
 *   workspaceTreeLines — the full repository minus default-ignored paths
 *                        (mirrors what you see in the Explorer sidebar)
 *
 *   snapshotTreeLines  — only the files the user checked and included
 *                        in this snapshot run
 *
 * The workspace tree reuses the scanner's verdict (`ignoredByDefault` on each
 * entry), so it hides exactly what the picker leaves unchecked by default:
 * .gitignore rules, built-in patterns and user patterns, with no second matcher.
 *
 * @param {string[]} files - relative paths of INCLUDED files
 * @param {Array<{rel:string,isDir:boolean,ignoredByDefault?:boolean}>} [allEntries] - flat entry list from scanner
 * @returns {{ workspaceTreeLines: string[], snapshotTreeLines: string[] }}
 */
function buildTree(files, allEntries = []) {
    // ── Workspace tree ────────────────────────────────────────────────────────
    const workspacePaths = allEntries
        .filter((e) => !e.isDir && !e.ignoredByDefault) // dirs are implied by their files
        .map((e) => e.rel);

    const workspaceTreeLines = renderTree(workspacePaths);

    // ── Snapshot tree ─────────────────────────────────────────────────────────
    // Show only the files that were actually included (checked + not skipped).
    const snapshotTreeLines = renderTree(files);

    return { workspaceTreeLines, snapshotTreeLines };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Given a flat list of relative file paths, builds a nested object tree and
 * renders it as an array of CLI-style connector lines.
 *
 * @param {string[]} filePaths
 * @returns {string[]}
 */
function renderTree(filePaths) {
    const root = {};

    for (const filePath of filePaths) {
        const parts = filePath.split('/');
        let node = root;
        for (const part of parts) {
            if (!node[part]) node[part] = {};
            node = node[part];
        }
        node.__file = true;
    }

    const lines = [];
    renderNode(root, '', lines);
    return lines;
}

function renderNode(node, prefix, lines) {
    const keys = Object.keys(node).filter((k) => k !== '__file');

    const hasChildren = (k) =>
        Object.keys(node[k]).filter((x) => x !== '__file').length > 0;

    const dirs = keys.filter(hasChildren);
    const fileKeys = keys.filter((k) => !hasChildren(k));

    const sorted = [
        ...dirs.sort((a, b) => a.localeCompare(b)),
        ...fileKeys.sort((a, b) => a.localeCompare(b)),
    ];

    sorted.forEach((key, index) => {
        const isLast = index === sorted.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        lines.push(`${prefix}${connector}${key}`);

        if (hasChildren(key)) {
            renderNode(node[key], prefix + childPrefix, lines);
        }
    });
}

module.exports = { buildTree };