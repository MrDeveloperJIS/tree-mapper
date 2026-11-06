'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { partitionSelection } = require('../src/selection');

const KB = 1024;
const file = (rel, size = 10, extra = {}) => ({ rel, size, isDir: false, skipped: false, isBinary: false, ...extra });

test('partitionSelection: ticked files are included, unticked ones are "excluded"', () => {
    const entries = [file('a.js', 100), file('b.js', 200), file('c.js', 300)];
    const r = partitionSelection(['a.js', 'b.js'], entries, 2048);

    assert.deepStrictEqual(r.validFiles, ['a.js', 'b.js']);
    assert.strictEqual(r.totalSizeBytes, 300);
    assert.strictEqual(r.skippedCount, 0);
    assert.strictEqual(r.excludedCount, 1);
});

test('partitionSelection: a skipped file is counted once, under skipped, never as excluded', () => {
    const entries = [
        file('ok.js'),
        file('image.png', 5, { skipped: true, isBinary: true }),
        file('huge.log', 5000 * KB, { skipped: true }),
        file('unticked.js'),
    ];
    const r = partitionSelection(['ok.js', 'image.png', 'huge.log'], entries, 2048);

    assert.deepStrictEqual(r.validFiles, ['ok.js']);
    assert.strictEqual(r.skippedCount, 2);
    assert.deepStrictEqual(r.skippedFiles.map((s) => s.rel), ['image.png', 'huge.log']);
    assert.strictEqual(r.skippedFiles[0].reason, 'binary file');
    assert.match(r.skippedFiles[1].reason, /^exceeds size limit \(5000\.0 KB\)$/);
    assert.strictEqual(r.excludedCount, 1, 'only unticked.js is excluded');
});

test('partitionSelection: a file flagged too large is re-admitted when it fits the current limit', () => {
    const entries = [file('mid.txt', 3000 * KB, { skipped: true })];

    assert.strictEqual(partitionSelection(['mid.txt'], entries, 2048).skippedCount, 1);

    const r = partitionSelection(['mid.txt'], [file('mid.txt', 3000 * KB, { skipped: true })], 4096);
    assert.deepStrictEqual(r.validFiles, ['mid.txt']);
    assert.strictEqual(r.skippedCount, 0);
});

test('partitionSelection: binary files stay skipped whatever the size limit', () => {
    const r = partitionSelection(['x.bin'], [file('x.bin', 1, { skipped: true, isBinary: true })], 999999);
    assert.strictEqual(r.skippedCount, 1);
    assert.strictEqual(r.validFiles.length, 0);
});

test('partitionSelection: folders and unknown paths are ignored and never counted', () => {
    const entries = [{ rel: 'src', isDir: true, size: 0 }, file('src/a.js')];
    const r = partitionSelection(['src', 'ghost.js', 'src/a.js'], entries, 2048);

    assert.deepStrictEqual(r.validFiles, ['src/a.js']);
    assert.strictEqual(r.skippedCount, 0);
    assert.strictEqual(r.excludedCount, 0);
});

test('partitionSelection: nothing selected → everything is excluded (structure-only case)', () => {
    const r = partitionSelection([], [file('a.js'), file('b.js')], 2048);
    assert.strictEqual(r.validFiles.length, 0);
    assert.strictEqual(r.excludedCount, 2);
});