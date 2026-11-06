'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Named file selections ("presets"), stored per scanned folder in
 * `.tree/presets.json`:
 *
 *   { "version": 1, "presets": { "frontend": ["src/a.js"], "auth flow": ["..."] } }
 *
 *   loadPresets(root)               → [{ name, files }]   (sorted by name)
 *   savePreset(root, name, files)   → [{ name, files }]   (updated list)
 *   deletePreset(root, name)        → [{ name, files }]   (updated list)
 *
 * Writes are atomic (temp file → rename). A missing or corrupt file is
 * treated as "no presets".
 * Presets are handed around as an ARRAY (never an object keyed by name), so a
 * preset called "__proto__" can't touch an object prototype in the webview.
 */

const FILE_NAME = 'presets.json';
const MAX_NAME_LENGTH = 60;

function presetsPath(rootPath) {
    return path.join(rootPath, '.tree', FILE_NAME);
}

/** Trimmed, single-line, max 60 chars. Returns '' when nothing usable is left. */
function normalizeName(name) {
    return String(name === null || name === undefined ? '' : name)
        .replace(/[\r\n\t]+/g, ' ')
        .trim()
        .slice(0, MAX_NAME_LENGTH)
        .trim();
}

function cleanFiles(files) {
    if (!Array.isArray(files)) return [];
    return [...new Set(files.filter((f) => typeof f === 'string' && f.length > 0))];
}

/** Reads the file into a Map(name → files). Missing / corrupt / odd shape → empty. */
function readMap(rootPath) {
    const map = new Map();
    try {
        const data = JSON.parse(fs.readFileSync(presetsPath(rootPath), 'utf8'));
        const stored = data && typeof data === 'object' ? data.presets : null;
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return map;
        for (const [name, files] of Object.entries(stored)) {
            const clean = normalizeName(name);
            if (clean && Array.isArray(files)) map.set(clean, cleanFiles(files));
        }
    } catch {
        // missing or corrupt → no presets
    }
    return map;
}

function toList(map) {
    return [...map.entries()]
        .map(([name, files]) => ({ name, files }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** temp file → rename. Throws on failure. */
function writeMap(rootPath, map) {
    const file = presetsPath(rootPath);
    const tmp = file + '.tmp';

    const presets = Object.create(null);
    for (const { name, files } of toList(map)) presets[name] = files;
    const json = JSON.stringify({ version: 1, presets }, null, 2);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
        fs.writeFileSync(tmp, json, 'utf8');
        fs.renameSync(tmp, file);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch { /* nothing to clean */ }
        throw err;
    }
}

function loadPresets(rootPath) {
    return toList(readMap(rootPath));
}

/** @throws when the name is empty or the file can't be written */
function savePreset(rootPath, name, files) {
    const clean = normalizeName(name);
    if (!clean) throw new Error('Preset name is empty');
    const map = readMap(rootPath);
    map.set(clean, cleanFiles(files));
    writeMap(rootPath, map);
    return toList(map);
}

/** @throws when the file can't be written. Unknown name → list unchanged. */
function deletePreset(rootPath, name) {
    const map = readMap(rootPath);
    if (!map.delete(normalizeName(name))) return toList(map);
    writeMap(rootPath, map);
    return toList(map);
}

/**
 * Which of a preset's paths still exist. MUST stay self-contained (no
 * closures, no imports): picker HTML embeds this function's source, so the
 * webview and the unit tests run the exact same code.
 *
 * @param {string[]} files  paths stored in the preset
 * @param {Set<string>} known  file paths currently in the picker
 * @returns {{ present: string[], missing: number }}
 */
function resolvePreset(files, known) {
    const present = [];
    for (const f of files) if (known.has(f)) present.push(f);
    return { present, missing: files.length - present.length };
}

module.exports = {
    loadPresets,
    savePreset,
    deletePreset,
    normalizeName,
    resolvePreset,
    MAX_NAME_LENGTH,
};