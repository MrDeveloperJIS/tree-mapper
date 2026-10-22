'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { dedupePatterns, BUILTIN_IGNORE_PATTERNS } = require('../src/ignorePatterns');
const { buildTree } = require('../src/treeBuilder');
const { scanWorkspace } = require('../src/scanner');
const { buildPickerHtml } = require('../src/pickerHtml');
const {
    renderMarkdown,
    renderStructureOnly,
    fenceFor,
    slugifyText,
} = require('../src/markdownRenderer');

function makeProject(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-mapper-'));
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return root;
}

test('dedupePatterns keeps the last copy and drops blanks', () => {
    assert.deepStrictEqual(dedupePatterns(['a', 'b', 'a', '', '  ']), ['b', 'a']);
});

test('built-in list protects .env but keeps .env.example', () => {
    assert.ok(BUILTIN_IGNORE_PATTERNS.includes('.env'));
    assert.ok(BUILTIN_IGNORE_PATTERNS.includes('!.env.example'));
});

test('fenceFor is longer than any backtick run in the content', () => {
    assert.strictEqual(fenceFor('no fences'), '```');
    assert.strictEqual(fenceFor('```js\ncode\n```'), '````');
    assert.strictEqual(fenceFor('`````x'), '``````');
});

test('files containing code fences do not break the snapshot', () => {
    const root = makeProject({ 'README.md': '# Hi\n```js\nlet a = 1;\n```\n' });
    const md = renderMarkdown(root, ['└── README.md'], ['└── README.md'], ['README.md'], 10);
    assert.ok(md.includes('````markdown\n# Hi\n```js\nlet a = 1;\n```\n````'));
});

test('slugifyText keeps non-ASCII letters like GitHub', () => {
    assert.strictEqual(slugifyText('src/Café.js'), 'srccafé' + 'js');
    assert.strictEqual(slugifyText('File Contents'), 'file-contents');
});

test('structure-only output is just a title and the tree', () => {
    const root = makeProject({ 'a.txt': 'x' });
    const md = renderStructureOnly(root, ['├── src', '└── a.txt']);
    assert.ok(md.startsWith('# Project Structure:'));
    assert.ok(md.includes('├── src'));
    for (const unwanted of ['## Index', '## File Contents', 'Snapshot Tree', 'Est. token count']) {
        assert.ok(!md.includes(unwanted), `should not contain ${unwanted}`);
    }
});

test('scanner prunes node_modules and .git but keeps normal files', async () => {
    const root = makeProject({
        'src/index.js': 'x',
        'node_modules/pkg/index.js': 'x',
        '.git/HEAD': 'ref',
        '.env': 'SECRET=1',
    });
    const res = await scanWorkspace(root, 2048, [...BUILTIN_IGNORE_PATTERNS]);
    const rels = res.entries.map((e) => e.rel);
    assert.ok(rels.includes('src/index.js'));
    assert.ok(!rels.some((r) => r.startsWith('node_modules')));
    assert.ok(!rels.some((r) => r.startsWith('.git')));
    const env = res.entries.find((e) => e.rel === '.env');
    assert.ok(env && env.ignoredByDefault, '.env is listed but unchecked by default');
});

test('workspace tree omits default-ignored files', async () => {
    const root = makeProject({ 'src/a.js': 'x', '.env': 's' });
    const res = await scanWorkspace(root, 2048, [...BUILTIN_IGNORE_PATTERNS]);
    const { workspaceTreeLines } = buildTree([], [...BUILTIN_IGNORE_PATTERNS], res.entries); const text = workspaceTreeLines.join('\n');
    assert.ok(text.includes('a.js'));
    assert.ok(!text.includes('.env'));
});

test('picker HTML cannot be broken out of by a hostile file name', () => {
    const evil = [{ rel: '</script><script>alert(1)</script>', name: '</script><script>alert(1)</script>', isDir: false }];
    const html = buildPickerHtml(evil, 'proj', null);
    assert.ok(!html.includes('</script><script>alert(1)'));
    assert.ok(html.includes('\\u003c/script'));
    assert.ok(html.includes('Content-Security-Policy'));
    assert.ok(!html.includes('fonts.googleapis.com'));
});