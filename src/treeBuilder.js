'use strict';

/**
 * Builds two trees:
 *
 *   workspaceTreeLines — the whole repository structure, so you can see where
 *                        every file lives. Default-ignored paths (secrets,
 *                        .gitignore matches, built-in and user patterns) are
 *                        listed BY NAME ONLY and their contents are never
 *                        included:
 *                          - an ignored file is listed as a normal file
 *                          - an ignored folder (node_modules/, dist/, .git/ …)
 *                            is listed as `name/` with nothing under it
 *
 *   snapshotTreeLines  — only the files the user checked and included
 *                        in this snapshot run
 *
 * Folders always end with `/`. The workspace tree reuses the scanner's verdict
 * (`ignoredByDefault` on each entry), so it collapses exactly what the picker
 * leaves unchecked by default, with no second matcher.
 *
 * @param {string[]} files - relative paths of INCLUDED files
 * @param {Array<{rel:string,isDir:boolean,ignoredByDefault?:boolean}>} [allEntries] - flat entry list from scanner
 * @param {string[]} [prunedDirs] - folders the scanner never opened (node_modules, .git); names only
 * @returns {{ workspaceTreeLines: string[], snapshotTreeLines: string[] }}
 */
function buildTree(files, allEntries = [], prunedDirs = []) {
    // ── Workspace tree ────────────────────────────────────────────────────────
    const ignoredDirs = new Set(prunedDirs);
    for (const e of allEntries) {
        if (e.isDir && e.ignoredByDefault) ignoredDirs.add(e.rel);
    }

    // One node per path. Pruned folders first, scanner entries after.
    const nodes = new Map();
    for (const rel of prunedDirs) nodes.set(rel, { path: rel, isDir: true });
    for (const e of allEntries) nodes.set(e.rel, { path: e.rel, isDir: !!e.isDir });

    // Anything inside an ignored folder is hidden: the folder itself stays.
    const workspaceNodes = [...nodes.values()].filter(
        (n) => !hasIgnoredAncestor(n.path, ignoredDirs)
    );

    const workspaceTreeLines = renderTree(workspaceNodes);

    // ── Snapshot tree ─────────────────────────────────────────────────────────
    // Show only the files that were actually included (checked + not skipped).
    const snapshotTreeLines = renderTree(files.map((rel) => ({ path: rel, isDir: false })));

    return { workspaceTreeLines, snapshotTreeLines };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** True when any parent folder of `rel` (not `rel` itself) is in `ignoredDirs`. */
function hasIgnoredAncestor(rel, ignoredDirs) {
    let i = rel.indexOf('/');
    while (i !== -1) {
        if (ignoredDirs.has(rel.slice(0, i))) return true;
        i = rel.indexOf('/', i + 1);
    }
    return false;
}

/**
 * Given a flat list of `{ path, isDir }` nodes (posix relative paths), builds a
 * nested tree and renders it as an array of CLI-style connector lines.
 * Every parent segment of a path is a folder; the last segment is a folder only
 * when `isDir` is true.
 *
 * Uses Maps, so a file called `constructor` or `__proto__` can't clash with
 * object internals.
 *
 * @param {Array<{path:string,isDir:boolean}>} items
 * @returns {string[]}
 */
function renderTree(items) {
    const root = { isDir: true, children: new Map() };

    for (const item of items) {
        const parts = item.path.split('/');
        let node = root;
        parts.forEach((part, i) => {
            const isLast = i === parts.length - 1;
            let child = node.children.get(part);
            if (!child) {
                child = { isDir: !isLast || item.isDir, children: new Map() };
                node.children.set(part, child);
            } else if (!isLast || item.isDir) {
                child.isDir = true;
            }
            node = child;
        });
    }

    const lines = [];
    renderNode(root, '', lines);
    return lines;
}

function renderNode(node, prefix, lines) {
    const byName = ([a], [b]) => a.localeCompare(b);
    const all = [...node.children.entries()];
    const dirs = all.filter(([, child]) => child.isDir).sort(byName);
    const fileKeys = all.filter(([, child]) => !child.isDir).sort(byName);
    const sorted = [...dirs, ...fileKeys];

    sorted.forEach(([name, child], index) => {
        const isLast = index === sorted.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        lines.push(`${prefix}${connector}${name}${child.isDir ? '/' : ''}`);

        if (child.isDir) {
            renderNode(child, prefix + childPrefix, lines);
        }
    });
}

module.exports = { buildTree };