'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    loadPresets,
    savePreset,
    deletePreset,
    normalizeName,
    resolvePreset,
    MAX_NAME_LENGTH,
} = require('../src/presets');
const { buildPickerHtml } = require('../src/pickerHtml');

function tmpRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'tm-presets-'));
}
const fileOf = (root) => path.join(root, '.tree', 'presets.json');

test('loadPresets: no file → empty list', () => {
    assert.deepStrictEqual(loadPresets(tmpRoot()), []);
});

test('save → load round trip, stored in the documented format', () => {
    const root = tmpRoot();
    savePreset(root, 'frontend', ['src/a.js', 'src/b.js']);
    savePreset(root, 'auth flow', ['src/auth.js']);

    assert.deepStrictEqual(loadPresets(root), [
        { name: 'auth flow', files: ['src/auth.js'] },
        { name: 'frontend', files: ['src/a.js', 'src/b.js'] },
    ]);

    const raw = JSON.parse(fs.readFileSync(fileOf(root), 'utf8'));
    assert.strictEqual(raw.version, 1);
    assert.deepStrictEqual(raw.presets.frontend, ['src/a.js', 'src/b.js']);
});

test('save overwrites the same name and leaves no .tmp or .bak', () => {
    const root = tmpRoot();
    savePreset(root, 'x', ['one.js']);
    const list = savePreset(root, 'x', ['two.js']);

    assert.deepStrictEqual(list, [{ name: 'x', files: ['two.js'] }]);
    assert.ok(!fs.existsSync(fileOf(root) + '.bak'));
    assert.ok(!fs.existsSync(fileOf(root) + '.tmp'));
});

test('deletePreset removes only that preset; unknown name changes nothing', () => {
    const root = tmpRoot();
    savePreset(root, 'a', ['1.js']);
    savePreset(root, 'b', ['2.js']);

    assert.deepStrictEqual(deletePreset(root, 'a'), [{ name: 'b', files: ['2.js'] }]);
    assert.deepStrictEqual(deletePreset(root, 'nope'), [{ name: 'b', files: ['2.js'] }]);
    assert.deepStrictEqual(loadPresets(root), [{ name: 'b', files: ['2.js'] }]);
});

test('corrupt presets.json → treated as empty, and saving recovers', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.tree'));
    fs.writeFileSync(fileOf(root), '{ not json');

    assert.deepStrictEqual(loadPresets(root), []);

    savePreset(root, 'fresh', ['a.js']);
    assert.deepStrictEqual(loadPresets(root), [{ name: 'fresh', files: ['a.js'] }]);
});

test('wrong shapes are ignored instead of throwing', () => {
    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.tree'));
    for (const bad of ['null', '[]', '{"presets":[]}', '{"presets":{"a":"not-an-array","b":["ok.js",5,""]}}']) {
        fs.writeFileSync(fileOf(root), bad);
        assert.doesNotThrow(() => loadPresets(root));
    }
    assert.deepStrictEqual(loadPresets(root), [{ name: 'b', files: ['ok.js'] }]);
});

test('names: trimmed, single line, max 60 chars; empty name is rejected', () => {
    assert.strictEqual(normalizeName('  my preset \n'), 'my preset');
    assert.strictEqual(normalizeName('a'.repeat(100)).length, MAX_NAME_LENGTH);
    assert.strictEqual(normalizeName(null), '');

    const root = tmpRoot();
    assert.throws(() => savePreset(root, '   ', ['a.js']));
    savePreset(root, '  spaced  ', ['a.js']);
    assert.strictEqual(loadPresets(root)[0].name, 'spaced');
});

test('a preset called "__proto__" is stored and loaded like any other', () => {
    const root = tmpRoot();
    savePreset(root, '__proto__', ['a.js']);
    assert.deepStrictEqual(loadPresets(root), [{ name: '__proto__', files: ['a.js'] }]);
});

test('duplicate paths are stored once', () => {
    const root = tmpRoot();
    savePreset(root, 'd', ['a.js', 'a.js', 'b.js']);
    assert.deepStrictEqual(loadPresets(root)[0].files, ['a.js', 'b.js']);
});

test('resolvePreset: missing paths are dropped and counted', () => {
    const known = new Set(['a.js', 'b.js']);
    assert.deepStrictEqual(resolvePreset(['a.js', 'gone.js', 'b.js', 'also-gone.js'], known), {
        present: ['a.js', 'b.js'],
        missing: 2,
    });
    assert.deepStrictEqual(resolvePreset(['a.js'], known), { present: ['a.js'], missing: 0 });
});

test('picker: preset names are data, never HTML or script', () => {
    const evil = '</script><img src=x onerror=alert(1)>';
    const html = buildPickerHtml([], 'proj', null, null, [{ name: evil, files: [evil] }]);
    assert.ok(!html.includes(evil));
    // The picker embeds the same resolvePreset the tests above exercise.
    assert.ok(html.includes('function resolvePreset('));
});