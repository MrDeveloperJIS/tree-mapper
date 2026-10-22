'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { BUILTIN_IGNORE_PATTERNS } = require('../src/ignorePatterns');

// Keeps docs/IGNORE_PATTERNS.md honest: every built-in pattern must be listed.
test('docs/IGNORE_PATTERNS.md lists every built-in pattern', () => {
    const md = fs.readFileSync(path.join(__dirname, '..', 'docs', 'IGNORE_PATTERNS.md'), 'utf8');
    const missing = BUILTIN_IGNORE_PATTERNS.filter((p) => !md.includes('`' + p + '`'));
    assert.deepStrictEqual(missing, []);
});