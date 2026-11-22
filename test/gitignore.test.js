'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { BUILTIN_IGNORE_PATTERNS } = require('../src/ignorePatterns');
const { buildTree } = require('../src/treeBuilder');
const { scanWorkspace } = require('../src/scanner');

function makeProject(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-mapper-gi-'));
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return root;
}

const BUILTIN = [...BUILTIN_IGNORE_PATTERNS];

function ignoredSet(res) {
    return new Set(res.entries.filter((e) => e.ignoredByDefault).map((e) => e.rel));
}

test('root .gitignore rules (folder + glob) start excluded', async () => {
    const root = makeProject({
        '.gitignore': 'out/\n*.local\n',
        'src/a.js': 'x',
        'src/x.local': 'x',
        'out/b.js': 'x',
        'config.local': 'x',
    });
    const res = await scanWorkspace(root, 2048, BUILTIN);
    const ign = ignoredSet(res);
    assert.ok(ign.has('out/b.js'));
    assert.ok(ign.has('config.local'));
    assert.ok(ign.has('src/x.local'));
    assert.ok(!ign.has('src/a.js'));
    assert.ok(!ign.has('.gitignore'));
});

test('nested .gitignore only applies under its own folder', async () => {
    const root = makeProject({
        'packages/app/.gitignore': 'generated/\n*.tmp\n/only-here.js\n',
        'packages/app/generated/x.js': 'x',
        'packages/app/a.tmp': 'x',
        'packages/app/only-here.js': 'x',
        'packages/app/sub/only-here.js': 'x', // anchored rule must NOT match here
        'packages/app/src/b.js': 'x',
        'packages/other/a.tmp': 'x',           // outside the nested file's folder
    });
    const res = await scanWorkspace(root, 2048, BUILTIN);
    const ign = ignoredSet(res);
    assert.ok(ign.has('packages/app/generated/x.js'));
    assert.ok(ign.has('packages/app/a.tmp'));
    assert.ok(ign.has('packages/app/only-here.js'));
    assert.ok(!ign.has('packages/app/sub/only-here.js'));
    assert.ok(!ign.has('packages/app/src/b.js'));
    assert.ok(!ign.has('packages/other/a.tmp'));
});

test('negation (!) re-includes a file, and deeper .gitignore wins', async () => {
    const root = makeProject({
        '.gitignore': '*.gen\n!keep.gen\n',
        'a.gen': 'x',
        'keep.gen': 'x',
        'sub/.gitignore': '!a.gen\n',
        'sub/a.gen': 'x',
        'sub/b.gen': 'x',
    });
    const res = await scanWorkspace(root, 2048, BUILTIN);
    const ign = ignoredSet(res);
    assert.ok(ign.has('a.gen'));
    assert.ok(!ign.has('keep.gen'));
    assert.ok(!ign.has('sub/a.gen'), 'nested negation overrides the parent rule');
    assert.ok(ign.has('sub/b.gen'));
});

test('subfolder scan also reads parent .gitignore files up to the repo root', async () => {
    const repo = makeProject({
        '.git/HEAD': 'ref: refs/heads/main',
        '.gitignore': 'secret-dir/\n*.local\n/packages/app/root-anchored.js\n',
        'packages/.gitignore': '*.mid\n',
        'packages/app/root-anchored.js': 'x',
        'packages/app/a.mid': 'x',
        'packages/app/c.local': 'x',
        'packages/app/secret-dir/s.js': 'x',
        'packages/app/keep.js': 'x',
    });
    const res = await scanWorkspace(path.join(repo, 'packages', 'app'), 2048, BUILTIN);
    const ign = ignoredSet(res);
    assert.ok(ign.has('root-anchored.js'), 'anchored rule resolved relative to the repo root');
    assert.ok(ign.has('a.mid'), 'parent folder .gitignore');
    assert.ok(ign.has('c.local'));
    assert.ok(ign.has('secret-dir/s.js'));
    assert.ok(!ign.has('keep.js'));
});

test('without a .git folder, parent .gitignore files are not read', async () => {
    const parent = makeProject({
        '.gitignore': '*.local\n',
        'proj/a.local': 'x',
        'proj/b.js': 'x',
    });
    const res = await scanWorkspace(path.join(parent, 'proj'), 2048, BUILTIN);
    assert.ok(!ignoredSet(res).has('a.local'));
});

test('respectGitignore: false turns .gitignore off', async () => {
    const root = makeProject({ '.gitignore': '*.local\n', 'a.local': 'x', 'b.js': 'x' });
    const res = await scanWorkspace(root, 2048, BUILTIN, { respectGitignore: false });
    assert.strictEqual(ignoredSet(res).size, 0);
});

test('precedence: built-in secret protection beats .gitignore negation; user patterns beat .gitignore', async () => {
    const root = makeProject({
        '.gitignore': '!.env\nout/\n',
        '.env': 'SECRET=1',
        'out/keep.js': 'x',
        'out/drop.js': 'x',
    });
    const res = await scanWorkspace(root, 2048, [...BUILTIN, '!out/keep.js']);
    const ign = ignoredSet(res);
    assert.ok(ign.has('.env'), 'a .gitignore "!" can never un-protect a secret');
    assert.ok(!ign.has('out/keep.js'), 'user pattern (last) re-includes');
    assert.ok(ign.has('out/drop.js'));
});

test('unreadable or odd .gitignore is skipped silently', async () => {
    const root = makeProject({ 'a.js': 'x' });
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', '.gitignore'), Buffer.from([0xff, 0xfe, 0x00]));
    const res = await scanWorkspace(root, 2048, BUILTIN);
    assert.ok(res.entries.some((e) => e.rel === 'a.js'));
});

test('Workspace Tree lists the paths the picker leaves unchecked, by name only', async () => {
    const root = makeProject({
        '.gitignore': 'out/\n*.local\n',
        'src/a.js': 'x',
        'out/b.js': 'x',
        'c.local': 'x',
    });
    const res = await scanWorkspace(root, 2048, BUILTIN);
    const text = buildTree([], res.entries, res.prunedDirs).workspaceTreeLines.join('\n');
    assert.ok(text.includes('a.js'));
    assert.ok(/out\/$/m.test(text), 'ignored folder is listed by name');
    assert.ok(!text.includes('b.js'), 'but not what is inside it');
    assert.ok(/c\.local$/m.test(text), 'ignored file is listed by name');
});