'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { getGitChanges, parseStatusZ, buildChangeLists } = require('../src/gitChanges');
const { buildPickerHtml } = require('../src/pickerHtml');

const z = (...records) => records.join('\0') + '\0';

test('parseStatusZ: modified, staged+modified, untracked, spaces in names', () => {
    const out = z(' M src/a.js', 'MM src/b.js', 'A  new file.txt', '?? docs/my notes.md');
    assert.deepStrictEqual(parseStatusZ(out), [
        { x: ' ', y: 'M', path: 'src/a.js', orig: null },
        { x: 'M', y: 'M', path: 'src/b.js', orig: null },
        { x: 'A', y: ' ', path: 'new file.txt', orig: null },
        { x: '?', y: '?', path: 'docs/my notes.md', orig: null },
    ]);
});

test('parseStatusZ: rename keeps the new path and consumes the old-path record', () => {
    const out = z('R  new name.js', 'old name.js', ' M after.js');
    const recs = parseStatusZ(out);
    assert.strictEqual(recs.length, 2);
    assert.deepStrictEqual(recs[0], { x: 'R', y: ' ', path: 'new name.js', orig: 'old name.js' });
    assert.strictEqual(recs[1].path, 'after.js');
});

test('parseStatusZ: empty output', () => {
    assert.deepStrictEqual(parseStatusZ(''), []);
});

test('buildChangeLists: changed vs staged, deleted and ignored dropped', () => {
    const recs = parseStatusZ(
        z(
            ' M a.js', // changed only
            'M  b.js', // staged only
            'MM c.js', // staged + modified
            'A  d.js', // staged add
            '?? e.js', // untracked
            'R  f-new.js', 'f-old.js', // staged rename
            ' D gone.js', // deleted in worktree
            'D  gone2.js', // staged delete
            'UU conflict.js', // unmerged: changed, not staged
            '!! ignored.js',
        ),
    );
    const { changed, staged } = buildChangeLists(recs);
    assert.deepStrictEqual(changed, [
        'a.js', 'b.js', 'c.js', 'conflict.js', 'd.js', 'e.js', 'f-new.js',
    ]);
    assert.deepStrictEqual(staged, ['b.js', 'c.js', 'd.js', 'f-new.js']);
});

test('buildChangeLists: converts to scanned-folder paths, drops outside paths and folders', () => {
    const recs = parseStatusZ(z(' M packages/app/src/x.js', ' M packages/other/y.js', '?? packages/app/dir/'));
    const { changed } = buildChangeLists(recs, 'packages/app/');
    assert.deepStrictEqual(changed, ['src/x.js']);
});

test('buildChangeLists: isSelectable filter (e.g. default-ignored files)', () => {
    const recs = parseStatusZ(z(' M .env', ' M src/a.js'));
    const { changed } = buildChangeLists(recs, '', (rel) => rel !== '.env');
    assert.deepStrictEqual(changed, ['src/a.js']);
});

function gitAvailable() {
    try {
        execFileSync('git', ['--version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

test('getGitChanges: not a git repo → null', { skip: !gitAvailable() }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-nogit-'));
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
    // Make sure no parent repo is picked up by pointing git at an empty ceiling.
    const prev = process.env.GIT_CEILING_DIRECTORIES;
    process.env.GIT_CEILING_DIRECTORIES = path.dirname(dir);
    try {
        assert.strictEqual(await getGitChanges(dir), null);
    } finally {
        if (prev === undefined) delete process.env.GIT_CEILING_DIRECTORIES;
        else process.env.GIT_CEILING_DIRECTORIES = prev;
    }
});

test('getGitChanges: edit 2 files + add 1 new (in a new folder) → exactly those 3', { skip: !gitAvailable() }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-git-'));
    const git = (...args) =>
        execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'ignore' });

    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '1');
    fs.writeFileSync(path.join(dir, 'src', 'b.js'), '1');
    fs.writeFileSync(path.join(dir, 'keep.js'), '1');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'init');

    fs.writeFileSync(path.join(dir, 'src', 'a.js'), '2');
    fs.writeFileSync(path.join(dir, 'src', 'b.js'), '2');
    fs.mkdirSync(path.join(dir, 'fresh'));
    fs.writeFileSync(path.join(dir, 'fresh', 'new file.js'), 'n');
    git('add', 'src/a.js');

    const res = await getGitChanges(dir);
    assert.deepStrictEqual(res.changed, ['fresh/new file.js', 'src/a.js', 'src/b.js']);
    assert.deepStrictEqual(res.staged, ['src/a.js']);

    // Scanning a subfolder gives subfolder-relative paths and drops the rest.
    const sub = await getGitChanges(path.join(dir, 'src'));
    assert.deepStrictEqual(sub.changed, ['a.js', 'b.js']);
    assert.deepStrictEqual(sub.staged, ['a.js']);
});

test('picker: git buttons only appear when git data is passed', () => {
    const none = buildPickerHtml([], 'proj', null, null);
    assert.ok(none.includes('let GIT_CHANGES = null;'));

    const html = buildPickerHtml([], 'proj', null, { changed: ['a.js'], staged: [] });
    assert.ok(html.includes('selectChangedBtn'));
    assert.ok(html.includes('"changed":["a.js"]'));
});

test('picker: has a reload button and hides git buttons that have nothing to select', () => {
    const html = buildPickerHtml([], 'proj', null, { changed: [], staged: [] });
    assert.ok(html.includes('id="rescanBtn"'));
    assert.ok(html.includes("command: 'rescan'"));
    // visibility is decided by the count, not just by "is a git repo"
    assert.ok(html.includes("btn.style.display = n > 0 ? '' : 'none';"));
});

test('picker: git paths cannot break out of the inline script', () => {
    const evil = '</script><script>alert(1)</script>.js';
    const html = buildPickerHtml([], 'proj', null, { changed: [evil], staged: [evil] });
    assert.ok(!html.includes(evil));
});