'use strict';

/**
 * Splits the picker's selection into what goes into the snapshot and what
 * doesn't, and works out the counts shown in the snapshot header.
 *
 *   - validFiles     selected, readable files that will be included
 *   - skippedFiles   selected but binary / over the size limit (with a reason)
 *   - skippedCount   skippedFiles.length
 *   - excludedCount  files the user left unchecked (a skipped file is reported
 *                    once, under "skipped", and never again as "excluded")
 *   - totalSizeBytes size of validFiles
 *
 * Kept free of `vscode` so it can be unit-tested.
 *
 * @param {string[]} selected   relative paths ticked in the picker
 * @param {Array<{rel:string,isDir?:boolean,skipped?:boolean,isBinary?:boolean,size:number}>} entries
 * @param {number} maxFileSizeKB
 */
function partitionSelection(selected, entries, maxFileSizeKB) {
    const entryByRel = new Map(entries.map((e) => [e.rel, e]));
    const limitBytes = maxFileSizeKB * 1024;

    let totalSizeBytes = 0;
    /** @type {{ rel: string, reason: string }[]} */
    const skippedFiles = [];
    const validFiles = [];

    for (const rel of selected) {
        const entry = entryByRel.get(rel);
        if (!entry || entry.isDir) continue;

        // The scan may have flagged a file as too large under an older limit.
        if (entry.skipped && !entry.isBinary && entry.size <= limitBytes) {
            entry.skipped = false;
        }

        if (entry.skipped) {
            skippedFiles.push({
                rel,
                reason: entry.isBinary
                    ? 'binary file'
                    : `exceeds size limit (${(entry.size / 1024).toFixed(1)} KB)`,
            });
            continue;
        }

        totalSizeBytes += entry.size;
        validFiles.push(rel);
    }

    const validSet = new Set(validFiles);
    const skippedSet = new Set(skippedFiles.map((sf) => sf.rel));
    const excludedCount = entries.filter(
        (e) => !e.isDir && !validSet.has(e.rel) && !skippedSet.has(e.rel)
    ).length;

    return {
        validFiles,
        skippedFiles,
        skippedCount: skippedFiles.length,
        excludedCount,
        totalSizeBytes,
    };
}

module.exports = { partitionSelection };