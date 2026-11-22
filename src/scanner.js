'use strict';

const path = require('path');
const fs = require('fs');
const fg = require('fast-glob');
const ignore = require('ignore');
const { scanText } = require('./secretScanner');

/**
 * Scans the workspace and returns a tree structure with ignore metadata.
 *
 * Ignore rules are layered, LAST MATCH WINS:
 *   1. .gitignore files   (only when `respectGitignore` is true)
 *   2. built-in list      (secrets, credentials, build noise)
 *   3. user `defaultIgnorePatterns`
 * Layers 2 + 3 always run after .gitignore, so a `!` rule in a .gitignore can
 * never re-include a protected secret file.
 *
 * Returns:
 *   {
 *     tree: TreeNode[],       // nested tree for the webview
 *     entries: EntryMeta[],   // flat list of all entries with metadata
 *                             // (files also carry secretCount + secretRules —
 *                             //  rule names only, never the secret itself)
 *     total: number,          // total file count
 *     ignored: number,        // files flagged as ignoredByDefault
 *     prunedDirs: string[],   // node_modules / .git folders that were pruned
 *                             // from the scan. Never opened or read; only their
 *                             // NAMES are kept so the Workspace Tree can list them.
 *   }
 */
const BINARY_SNIFF_BYTES = 8192;

// Heavy folders that are never useful in a snapshot. Pruned at glob time.
const ALWAYS_PRUNE = ['**/node_modules/**', '**/.git/**', '**/.tree/**'];

// Of the pruned folders, these are still shown BY NAME in the Workspace Tree
// (as `node_modules/`), so you can see where they sit. Their contents are never
// scanned. `.tree/` is the tool's own output folder, so it is not listed.
const LISTED_PRUNED_DIRS = ['node_modules', '.git'];

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

/**
 * Looks for secrets in one text file. Returns ONLY the number of findings and
 * the distinct rule names — the matched values are never kept or returned.
 */
function scanFileForSecrets(fullPath) {
    try {
        const findings = scanText(fs.readFileSync(fullPath, 'utf8'));
        return { count: findings.length, rules: [...new Set(findings.map((f) => f.rule))] };
    } catch {
        return { count: 0, rules: [] };
    }
}

// ── .gitignore support ────────────────────────────────────────────────────────

function toPosix(p) {
    return p.split(path.sep).join('/');
}

/** Nearest folder at or above `startDir` that contains `.git` (dir or file). */
function findRepoRoot(startDir) {
    let dir = path.resolve(startDir);
    for (;;) {
        if (fs.existsSync(path.join(dir, '.git'))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/** Reads one .gitignore into a matcher. Unreadable / broken file → null. */
function readGitignore(file) {
    try {
        const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
        return ignore().add(text);
    } catch {
        return null;
    }
}

/**
 * Collects every applicable .gitignore, ordered shallow → deep (deeper files
 * override shallower ones, like git):
 *   - parent folders of the scanned folder, up to the repo root
 *   - the scanned folder itself
 *   - nested ones found inside the scanned folder
 *
 * Each source remembers how to turn a scanned-folder-relative path into a path
 * relative to its OWN folder (`prepend` for parents, `strip` for nested):
 *   { ig, strip: 'packages/app' | '', prepend: 'a/b' | '' }
 *
 * @param {string}   rootPath
 * @param {string[]} relFiles  scanned-folder-relative file paths (posix)
 */
function collectGitignores(rootPath, relFiles) {
    const sources = [];
    const root = path.resolve(rootPath);

    // Parents up to (and including) the repo root. No repo → none.
    const repoRoot = findRepoRoot(root);
    if (repoRoot && repoRoot !== root) {
        const chain = [];
        for (let dir = path.dirname(root); ; dir = path.dirname(dir)) {
            chain.unshift(dir);
            if (dir === repoRoot || path.dirname(dir) === dir) break;
        }
        for (const dir of chain) {
            const ig = readGitignore(path.join(dir, '.gitignore'));
            if (ig) sources.push({ ig, strip: '', prepend: toPosix(path.relative(dir, root)) });
        }
    }

    // Scanned folder + nested, from the scan itself (no second filesystem walk).
    const suffix = '/.gitignore';
    const found = [];
    for (const rel of relFiles) {
        if (rel === '.gitignore') found.push('');
        else if (rel.endsWith(suffix)) found.push(rel.slice(0, -suffix.length));
    }
    const depth = (dir) => (dir === '' ? 0 : dir.split('/').length);
    found.sort((a, b) => depth(a) - depth(b));

    for (const dir of found) {
        const file = path.join(root, dir, '.gitignore');
        const ig = readGitignore(file);
        if (ig) sources.push({ ig, strip: dir, prepend: '' });
    }

    return sources;
}

/** Path of `rel` relative to the source's own folder, or null if out of scope. */
function toLocalPath(src, rel) {
    let local = rel;
    if (src.strip) {
        if (!rel.startsWith(src.strip + '/')) return null;
        local = rel.slice(src.strip.length + 1);
    }
    if (src.prepend) local = src.prepend + '/' + local;
    return local || null;
}

/**
 * Verdict of all .gitignore files for one path:
 * true = ignored, false = re-included by `!`, null = no rule matched.
 */
function gitignoreVerdict(sources, rel, isDir) {
    let verdict = null;
    for (const src of sources) {
        const local = toLocalPath(src, rel);
        if (!local) continue;
        const res = src.ig.test(isDir ? local + '/' : local);
        if (res.ignored) verdict = true;
        else if (res.unignored) verdict = false;
    }
    return verdict;
}

// ── Scanner ───────────────────────────────────────────────────────────────────

/**
 * @param {string}   rootPath
 * @param {number}   [maxFileSizeKB]
 * @param {string[]} [defaultIgnorePatterns] built-in + user patterns
 * @param {{ respectGitignore?: boolean }} [options]
 */
async function scanWorkspace(rootPath, maxFileSizeKB = 2048, defaultIgnorePatterns = [], options = {}) {
    const respectGitignore = options.respectGitignore !== false;

    // Built-in + user patterns. Always applied AFTER .gitignore.
    const ig = ignore();
    if (defaultIgnorePatterns.length > 0) {
        ig.add(defaultIgnorePatterns);
    }

    // Always hard-ignore .tree/ output dir itself
    ig.add('.tree/');

    const entries = await fg('**/*', {
        cwd: rootPath,
        // Prune these folders during traversal instead of walking (and stat-ing)
        // every file inside them first. They never appear in the picker.
        ignore: ALWAYS_PRUNE,
        dot: true,
        followSymbolicLinks: false,
        onlyFiles: false,   // include dirs too for tree display
        markDirectories: true,
        suppressErrors: true,
    });

    const gitignores = respectGitignore
        ? collectGitignores(rootPath, entries.filter((r) => !r.endsWith('/')))
        : [];

    const maxBytes = maxFileSizeKB * 1024;
    const entryMetas = [];
    let totalFiles = 0;
    let ignoredFiles = 0;

    // Process each entry
    for (const rel of entries) {
        const isDir = rel.endsWith('/');
        const cleanRel = isDir ? rel.slice(0, -1) : rel;

        // Layer 1: .gitignore. Layers 2 + 3 (built-in, user) override it.
        let ignoredByDefault = gitignores.length > 0
            ? gitignoreVerdict(gitignores, cleanRel, isDir) === true
            : false;

        const own = ig.test(isDir ? cleanRel + '/' : cleanRel);
        if (own.ignored) ignoredByDefault = true;
        else if (own.unignored) ignoredByDefault = false;

        let size = 0;
        let skipped = false;
        let isBinary = false;
        let secretCount = 0;
        let secretRules = [];

        if (!isDir) {
            totalFiles++;
            if (ignoredByDefault) ignoredFiles++;

            try {
                const stat = fs.statSync(path.join(rootPath, cleanRel));
                size = stat.size;

                if (size > maxBytes) {
                    skipped = true;
                } else if (isLikelyBinary(path.join(rootPath, cleanRel))) {
                    // Binary check — only sniff the first few KB instead of reading
                    // the whole file into memory just to look for a null byte.
                    isBinary = true;
                    skipped = true;
                } else if (!ignoredByDefault) {
                    // Secret scan (after the binary/size check, so only text
                    // files within the size limit are read). Default-ignored
                    // files start unchecked anyway, so they are not read here;
                    // redaction still applies if one is ticked.
                    const found = scanFileForSecrets(path.join(rootPath, cleanRel));
                    secretCount = found.count;
                    secretRules = found.rules;
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
            secretCount,
            secretRules,
            name: path.basename(cleanRel),
        });
    }

    // Build nested tree structure for the webview
    const tree = buildNestedTree(entryMetas);

    return {
        tree,
        entries: entryMetas,
        total: totalFiles,
        ignored: ignoredFiles,
        prunedDirs: findPrunedDirs(rootPath, entryMetas),
    };
}

/**
 * Finds the pruned folders (node_modules, .git) that exist, WITHOUT walking
 * into them: for every scanned folder (and the root) it only checks whether a
 * child with that name exists. Returns scanned-folder-relative posix paths.
 *
 * @param {string} rootPath
 * @param {Array<{rel:string,isDir:boolean}>} entryMetas
 * @returns {string[]}
 */
function findPrunedDirs(rootPath, entryMetas) {
    const parents = [''];
    for (const e of entryMetas) {
        if (e.isDir) parents.push(e.rel);
    }

    const found = [];
    for (const parent of parents) {
        for (const name of LISTED_PRUNED_DIRS) {
            const rel = parent ? `${parent}/${name}` : name;
            try {
                if (fs.lstatSync(path.join(rootPath, rel)).isDirectory()) found.push(rel);
            } catch {
                /* not there, or unreadable: nothing to list */
            }
        }
    }
    return found.sort((a, b) => a.localeCompare(b));
}

/**
 * Builds a nested tree from flat entry list.
 * Directories come before files at each level, both sorted alphabetically.
 */
function buildNestedTree(entryMetas) {
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