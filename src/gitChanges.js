'use strict';

const { execFile } = require('child_process');

/**
 * Local-only git helper: which files in the scanned folder are changed / staged.
 * Runs `git` with a short timeout and never touches the network.
 *
 *   getGitChanges(cwd, isSelectable) → { changed: string[], staged: string[] } | null
 *
 * null = not a git repo, git missing, timeout, or any other failure
 * (the picker then simply hides its git buttons — no error popup).
 *
 * All returned paths are relative to `cwd` (the scanned folder), posix style.
 */

const GIT_TIMEOUT_MS = 5000;
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

function runGit(args, cwd) {
    return new Promise((resolve) => {
        execFile(
            'git',
            args,
            {
                cwd,
                timeout: GIT_TIMEOUT_MS,
                maxBuffer: GIT_MAX_BUFFER,
                windowsHide: true,
                encoding: 'utf8',
                // Read-only: don't let `git status` refresh/lock the index.
                env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
            },
            (err, stdout) => resolve(err ? null : stdout),
        );
    });
}

/**
 * Parses `git status --porcelain=v1 -z` output.
 * Each record is `XY <path>\0`; renames / copies are followed by an extra
 * `<original path>\0` record (v1 -z order: new path first, then old path).
 *
 * @param {string} output
 * @returns {{ x: string, y: string, path: string, orig: string|null }[]}
 */
function parseStatusZ(output) {
    const parts = String(output || '').split('\0');
    const records = [];
    for (let i = 0; i < parts.length; i++) {
        const entry = parts[i];
        if (entry.length < 4 || entry[2] !== ' ') continue; // "XY " + at least 1 char
        const x = entry[0];
        const y = entry[1];
        let orig = null;
        if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
            orig = parts[++i] || null;
        }
        records.push({ x, y, path: entry.slice(3), orig });
    }
    return records;
}

function isUnmerged(x, y) {
    return x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
}

/** Repo-relative path → scanned-folder-relative path, or null when outside it. */
function toScannedRelative(repoRel, prefix) {
    if (repoRel.endsWith('/')) return null; // a folder / submodule, not a file
    if (!prefix) return repoRel;
    return repoRel.startsWith(prefix) ? repoRel.slice(prefix.length) : null;
}

/**
 * @param {ReturnType<typeof parseStatusZ>} records
 * @param {string} prefix        scanned folder relative to the repo root ('' or 'a/b/')
 * @param {(rel: string) => boolean} [isSelectable]  extra filter (e.g. not default-ignored)
 * @returns {{ changed: string[], staged: string[] }}
 *
 *   Changed = modified + added + renamed (new path) + untracked (deleted files dropped)
 *   Staged  = first status column is set (conflicts and deletions dropped)
 */
function buildChangeLists(records, prefix = '', isSelectable = () => true) {
    const changed = new Set();
    const staged = new Set();

    for (const { x, y, path: repoRel } of records) {
        if (x === '!' && y === '!') continue; // ignored by git
        if (x === 'D' || y === 'D') continue; // deleted: nothing to snapshot

        const rel = toScannedRelative(repoRel, prefix);
        if (!rel || !isSelectable(rel)) continue;

        changed.add(rel);
        if (x !== ' ' && x !== '?' && !isUnmerged(x, y)) staged.add(rel);
    }

    const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b));
    return { changed: sorted(changed), staged: sorted(staged) };
}

/**
 * @param {string} cwd  scanned folder
 * @param {(rel: string) => boolean} [isSelectable]
 * @returns {Promise<{ changed: string[], staged: string[] } | null>}
 */
async function getGitChanges(cwd, isSelectable) {
    // Where the scanned folder sits inside the repo ('' at the root, else 'a/b/').
    const prefixOut = await runGit(['rev-parse', '--show-prefix'], cwd);
    if (prefixOut === null) return null; // not a repo, or git missing
    const prefix = prefixOut.replace(/\r?\n$/, '');

    // --untracked-files=all lists files inside new folders, not just the folder.
    const statusOut = await runGit(
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
        cwd,
    );
    if (statusOut === null) return null;

    return buildChangeLists(parseStatusZ(statusOut), prefix, isSelectable);
}

module.exports = { getGitChanges, parseStatusZ, buildChangeLists };