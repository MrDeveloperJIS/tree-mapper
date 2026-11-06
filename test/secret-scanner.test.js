'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanText, redactText } = require('../src/secretScanner');
const { scanWorkspace } = require('../src/scanner');
const { renderMarkdown } = require('../src/markdownRenderer');
const { buildPickerHtml } = require('../src/pickerHtml');
const { BUILTIN_IGNORE_PATTERNS } = require('../src/ignorePatterns');

// Samples are built at runtime so this file itself never contains a
// real-looking token (keeps GitHub push protection / scanners quiet).
const MIXED = 'aB3dE5gH7jK9mN2pQ4sT6vX8zC1';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function fill(len, alphabet = MIXED) {
    let out = '';
    for (let i = 0; i < len; i++) out += alphabet[(i * 7 + 3) % alphabet.length];
    return out;
}

const SAMPLES = {
    'aws-access-key': 'AKIA' + fill(16, UPPER),
    'github-token': 'ghp_' + fill(36),
    'slack-token': 'xoxb-' + fill(24),
    'stripe-live-key': ['sk', 'live', fill(24)].join('_'),
    'google-api-key': 'AIza' + fill(35),
    jwt: ['eyJ' + fill(20), 'eyJ' + fill(30), fill(43)].join('.'),
    'bearer-token': 'Bearer ' + fill(40),
};

function makeProject(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-mapper-sec-'));
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(root, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
    }
    return root;
}

test('each rule detects its sample and reports the right line', () => {
    for (const [rule, sample] of Object.entries(SAMPLES)) {
        const found = scanText(`line one\nconst x = "${sample}";\n`);
        assert.strictEqual(found.length, 1, rule);
        assert.strictEqual(found[0].rule, rule);
        assert.strictEqual(found[0].line, 2, rule);
    }
});

test('private key blocks are detected across lines and fully redacted', () => {
    const body = fill(64) + '\n' + fill(64);
    const key = `-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`;
    const text = `before\n${key}\nafter\n`;
    const found = scanText(text);
    assert.deepStrictEqual(found, [{ rule: 'private-key', line: 2 }]);
    const res = redactText(text);
    assert.strictEqual(res.count, 1);
    assert.strictEqual(res.text, 'before\n[REDACTED]\nafter\n');
});

test('password/token/api_key assignments are detected; only the value is redacted', () => {
    const text = [
        'const password = "' + fill(14) + '";',
        "api_key: '" + fill(20) + "',",
        '"clientSecret": "' + fill(18) + '"',
    ].join('\n');
    const found = scanText(text);
    assert.deepStrictEqual(found.map((f) => f.rule), ['secret-assignment', 'secret-assignment', 'secret-assignment']);
    assert.deepStrictEqual(found.map((f) => f.line), [1, 2, 3]);
    const res = redactText(text);
    assert.strictEqual(res.count, 3);
    assert.ok(res.text.includes('const password = "[REDACTED]";'));
    assert.ok(res.text.includes("api_key: '[REDACTED]',"));
    assert.ok(res.text.includes('"clientSecret": "[REDACTED]"'));
});

test('placeholders, env lookups and normal base64 are NOT flagged', () => {
    const clean = [
        'const apiKey = "your_key_here";',
        'const token = "xxxxxxxxxxxx";',
        'password = "<your-password>"',
        'secret: "${SECRET_FROM_VAULT}"',
        'const token = process.env.API_TOKEN;',
        'token = "process.env.API_TOKEN"',
        'const password = getPassword();',
        'if (token === "abcdefghijkl") {}',
        'api_key = "changeme-please"',
        'Authorization: Bearer ${token}',
        'Authorization: Bearer <token>',
        'Authorization: Bearer YOUR_TOKEN_GOES_HERE_PLEASE',
        'const img = "data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAAAAUA'.repeat(10) + '";',
        'const hash = "' + fill(64) + '";',
        'The quick brown fox jumps over the lazy dog.',
    ].join('\n');
    assert.deepStrictEqual(scanText(clean), []);
    assert.deepStrictEqual(redactText(clean), { text: clean, count: 0 });
});

test('overlapping matches count once, and scanText count equals redactText count', () => {
    const jwt = SAMPLES.jwt;
    const text = `token = "${jwt}"\nother = "${SAMPLES['github-token']}"`;
    const found = scanText(text);
    assert.strictEqual(found.length, 2);
    assert.strictEqual(found[0].rule, 'jwt', 'specific rule wins over the generic assignment rule');
    assert.strictEqual(redactText(text).count, found.length);
});

test('findings never contain the secret value', () => {
    for (const sample of Object.values(SAMPLES)) {
        const json = JSON.stringify(scanText(`x = "${sample}"`));
        assert.ok(!json.includes(sample.slice(8)));
    }
});

test('scanner stores only rule names + count on the entry, and skips binary files', async () => {
    const aws = SAMPLES['aws-access-key'];
    const root = makeProject({
        'src/config.js': `const k = "${aws}";\n`,
        'src/clean.js': 'module.exports = 1;\n',
    });
    fs.writeFileSync(path.join(root, 'bin.dat'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(aws)]));

    const res = await scanWorkspace(root, 2048, [...BUILTIN_IGNORE_PATTERNS]);
    const cfg = res.entries.find((e) => e.rel === 'src/config.js');
    const clean = res.entries.find((e) => e.rel === 'src/clean.js');
    const bin = res.entries.find((e) => e.rel === 'bin.dat');

    assert.strictEqual(cfg.secretCount, 1);
    assert.deepStrictEqual(cfg.secretRules, ['aws-access-key']);
    assert.strictEqual(clean.secretCount, 0);
    assert.deepStrictEqual(clean.secretRules, []);
    assert.strictEqual(bin.secretCount, 0, 'binary files are not scanned');

    // Nothing sent to the webview contains the secret itself.
    assert.ok(!JSON.stringify(res.tree).includes(aws));
    assert.ok(!buildPickerHtml(res.tree, 'proj', null).includes(aws));
});

test('picker HTML has the ⚠ badge and starts flagged files unchecked', () => {
    const html = buildPickerHtml([], 'proj', null);
    assert.ok(html.includes('secret-chip'));
    assert.ok(html.includes('function startsChecked'));
    assert.ok(html.includes('!hasSecrets(node)'));
});

test('renderMarkdown redacts when asked, adds the header line, and leaves clean files alone', () => {
    const aws = SAMPLES['aws-access-key'];
    const root = makeProject({
        'a.js': `const k = "${aws}";\nconsole.log("hi");\n`,
        'b.js': 'module.exports = 1;\n',
    });
    const args = [root, ['├── a.js', '└── b.js'], ['├── a.js', '└── b.js'], ['a.js', 'b.js'], 10, 0, 0, []];

    const redacted = renderMarkdown(...args, { redactSecrets: true });
    assert.ok(!redacted.includes(aws));
    assert.ok(redacted.includes('const k = "[REDACTED]";'));
    assert.ok(redacted.includes('**Secrets redacted:** 1'));
    assert.ok(redacted.includes('module.exports = 1;'));

    const plain = renderMarkdown(...args, { redactSecrets: false });
    assert.ok(plain.includes(aws));
    assert.ok(!plain.includes('Secrets redacted'));

    const clean = renderMarkdown(root, ['└── b.js'], ['└── b.js'], ['b.js'], 10, 0, 0, [], { redactSecrets: true });
    assert.ok(!clean.includes('Secrets redacted'));
});

test('redaction runs before fenceFor, so a redacted key block cannot break the fence', () => {
    const key = `-----BEGIN PRIVATE KEY-----\n${fill(60)}\n-----END PRIVATE KEY-----`;
    const root = makeProject({ 'k.txt': '````\n' + key + '\n' });
    const md = renderMarkdown(root, ['└── k.txt'], ['└── k.txt'], ['k.txt'], 10, 0, 0, [], { redactSecrets: true });
    assert.ok(md.includes('[REDACTED]'));
    assert.ok(!md.includes('BEGIN PRIVATE KEY'));
});