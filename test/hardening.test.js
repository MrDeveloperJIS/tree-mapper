'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scanText, redactText } = require('../src/secretScanner');
const { scanWorkspace } = require('../src/scanner');
const { buildPickerHtml } = require('../src/pickerHtml');
const { BUILTIN_IGNORE_PATTERNS } = require('../src/ignorePatterns');

test('picker HTML escapes the folder name', () => {
    const evil = '<img src=x onerror=alert(1)>&"\'';
    const html = buildPickerHtml([], evil, null, null);
    assert.ok(!html.includes(evil));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;'));
});

test('unquoted .env / YAML assignments are redacted, keys stay readable', () => {
    const text = 'DB_PASSWORD=hunter2hunter2\nexport API_KEY=abcd1234efgh5678 # prod\npassword: hunter2hunter2\n';
    const res = redactText(text);
    assert.strictEqual(res.count, 3);
    assert.strictEqual(res.text, 'DB_PASSWORD=[REDACTED]\nexport API_KEY=[REDACTED] # prod\npassword: [REDACTED]\n');
    assert.strictEqual(redactText('PASSWORD=hunter2hunter2\r\nOTHER=1\r\n').text, 'PASSWORD=[REDACTED]\r\nOTHER=1\r\n');
});

test('unquoted rule leaves ordinary code and placeholders alone', () => {
    const clean = [
        '  password: this.password,',
        'password = newPassword',
        'token: string',
        'const token = getToken123(x)',
        'API_KEY=your_api_key_1234',
        'TOKEN=${TOKEN}',
        'PASSWORD=changeme123',
    ].join('\n');
    assert.deepStrictEqual(scanText(clean), []);
});

test('URL credentials and AWS secret keys are redacted', () => {
    const url = redactText('DATABASE_URL=postgres://admin:s3cretpass@db.example.com:5432/app\n');
    assert.strictEqual(url.text, 'DATABASE_URL=postgres://admin:[REDACTED]@db.example.com:5432/app\n');
    assert.strictEqual(scanText('url=postgres://user:password@localhost/db').length, 0, 'sample password');

    const aws = 'aws_secret_access_key = ' + 'wJalrXUtnFEMI/K7MDENG/bPxRfiCY' + 'EXAMPLEKEY';
    assert.deepStrictEqual(scanText(aws).map((f) => f.rule), ['aws-secret-key']);
});

test('placeholder words only count as whole words, not inside real values', () => {
    assert.strictEqual(scanText('password = "MyExamplePassw0rd"').length, 1);
    assert.strictEqual(scanText('token = "todoapp_prod_9f8a7b6c"').length, 1);
    assert.strictEqual(scanText('token = "your_token_here_1234"').length, 0);
    assert.strictEqual(scanText('token = "my_example_value_1"').length, 0);
});

test('scanning odd large input stays fast', () => {
    const mk = (s, n) => s.repeat(Math.ceil(n / s.length)).slice(0, n);
    const inputs = [
        mk('-----BEGIN RSA PRIVATE KEY----- abc ', 2e6),
        mk('token', 2e6),
        mk('abcdefghij', 2e6),
        mk('password=ab\n', 2e6),
    ];
    const start = Date.now();
    for (const text of inputs) scanText(text);
    assert.ok(Date.now() - start < 1500, 'took ' + (Date.now() - start) + ' ms');
});

test('multiple private keys, and a BEGIN without END, are handled', () => {
    const body = 'abcdefghij'.repeat(6);
    const key = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
    const text = `${key}\nmid\n-----BEGIN PRIVATE KEY-----\nno end here\n${key}\n`;
    const res = redactText(text);
    assert.strictEqual(res.count, 2);
    assert.ok(!res.text.includes(body));
});

test('default-ignored files are not secret-scanned, normal files are', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hard-'));
    fs.writeFileSync(path.join(root, '.env'), 'DB_PASSWORD=hunter2hunter2\n');
    fs.writeFileSync(path.join(root, 'config.txt'), 'DB_PASSWORD=hunter2hunter2\n');
    const res = await scanWorkspace(root, 2048, [...BUILTIN_IGNORE_PATTERNS]);
    const env = res.entries.find((e) => e.rel === '.env');
    const cfg = res.entries.find((e) => e.rel === 'config.txt');
    assert.strictEqual(env.ignoredByDefault, true);
    assert.strictEqual(env.secretCount, 0);
    assert.strictEqual(cfg.secretCount, 1);
});