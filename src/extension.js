'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { scanWorkspace } = require('./scanner');
const { buildTree } = require('./treeBuilder');
const { partitionSelection } = require('./selection');
const { renderMarkdown, renderStructureOnly } = require('./markdownRenderer');
const { buildPickerHtml } = require('./pickerHtml');
const { resolveIgnorePatterns, cleanUserPatterns } = require('./ignorePatterns');
const { getGitChanges } = require('./gitChanges');
const { loadPresets, savePreset, deletePreset, normalizeName } = require('./presets');

/** @type {vscode.StatusBarItem} */
let statusBarItem;

function activate(context) {
    // Keep the saved user setting free of duplicates / built-in entries
    cleanUserPatterns(vscode);

    // ── Status bar ──────────────────────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.name = 'Tree Mapper';
    statusBarItem.text = '$(file-directory) Tree Mapper';
    statusBarItem.tooltip = 'Tree Mapper: Click to generate a snapshot';
    statusBarItem.command = 'tree-mapper.generate';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ── Command ─────────────────────────────────────────────────────────────────
    const disposable = vscode.commands.registerCommand('tree-mapper.generate', async (uri) => {
        let rootPath;

        if (uri && uri.fsPath) {
            const stat = fs.statSync(uri.fsPath);
            rootPath = stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
        } else {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('Tree Mapper: No workspace folder is open.');
                return;
            }
            let folder = workspaceFolders[0];
            if (workspaceFolders.length > 1) {
                folder = await vscode.window.showWorkspaceFolderPick({
                    placeHolder: 'Tree Mapper: choose a workspace folder to snapshot',
                });
                if (!folder) return; // cancelled
            }
            rootPath = folder.uri.fsPath;
        }

        let settings = loadSettings();

        // ── Step 1: Pre-scan everything (no ignore filtering) ──────────────────
        updateStatusBar('$(sync~spin) Scanning…', 'Tree Mapper: Scanning files…');

        let picker;
        try {
            picker = await loadPickerData(rootPath, settings);
        } catch (err) {
            vscode.window.showErrorMessage(`Tree Mapper scan error: ${err.message}`);
            resetStatusBar();
            return;
        }
        // Both are replaced when the picker's reload button rescans the project.
        let { allEntries, knownFiles } = picker;
        showScanStatus(allEntries);

        // ── Load last selection for this root ────────────────────────────────────
        const lastSelection = loadLastSelection(rootPath);

        // ── Step 2: Show interactive file picker ─────────────────────────────────
        const panel = vscode.window.createWebviewPanel(
            'treemapperPicker',
            'Tree Mapper — Select Files',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        panel.webview.html = buildPickerHtml(allEntries.tree, path.basename(rootPath), lastSelection, picker.gitChanges, picker.presets);

        let pickerClosed = false;
        let rescanning = false;

        // Reload button: scan again and send the picker the fresh data.
        async function handleRescan() {
            if (rescanning || pickerClosed) return;
            rescanning = true;
            updateStatusBar('$(sync~spin) Scanning…', 'Tree Mapper: Scanning files…');
            try {
                const nextSettings = loadSettings();
                const next = await loadPickerData(rootPath, nextSettings);
                if (pickerClosed) return;
                settings = nextSettings;
                allEntries = next.allEntries;
                knownFiles = next.knownFiles;
                showScanStatus(allEntries);
                panel.webview.postMessage({
                    command: 'rescanResult',
                    tree: next.allEntries.tree,
                    gitChanges: next.gitChanges,
                    presets: next.presets,
                });
            } catch (err) {
                resetStatusBar();
                try {
                    panel.webview.postMessage({ command: 'rescanResult', error: err.message });
                } catch {
                    // picker was closed while we were busy
                }
            } finally {
                rescanning = false;
            }
        }

        // Wait for user to confirm or cancel
        const selected = await new Promise((resolve) => {
            panel.webview.onDidReceiveMessage((msg) => {
                if (!msg) return;
                if (msg.command === 'confirm') {
                    resolve(msg.selected); // string[] of relative paths
                } else if (msg.command === 'cancel') {
                    resolve(null);
                } else if (msg.command === 'savePreset' || msg.command === 'deletePreset') {
                    handlePresetMessage(panel, rootPath, knownFiles, msg);
                } else if (msg.command === 'rescan') {
                    handleRescan();
                }
            });
            panel.onDidDispose(() => resolve(null));
        });

        pickerClosed = true;
        panel.dispose();

        if (!selected) {
            resetStatusBar();
            return;
        }

        // No files ticked → structure-only snapshot (just the project tree).
        const structureOnly = selected.length === 0;

        // ── Step 3: Generate snapshot from selected files ────────────────────────
        updateStatusBar('$(sync~spin) Generating…', 'Tree Mapper: Generating snapshot…');

        const {
            validFiles,
            skippedFiles,
            skippedCount,
            excludedCount,
            totalSizeBytes,
        } = partitionSelection(selected, allEntries.entries, settings.maxFileSizeKB);

        const { workspaceTreeLines, snapshotTreeLines } = buildTree(
            validFiles,
            allEntries.entries,
        );

        // The actual slow part is reading every selected file's contents — wrap
        // that in a real progress notification instead of an artificial delay.
        let markdown;
        let outFile = null;

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Tree Mapper', cancellable: false },
            async (progress) => {
                if (structureOnly) {
                    progress.report({ message: 'Building project structure…' });
                    markdown = renderStructureOnly(rootPath, workspaceTreeLines);
                    return;
                }
                progress.report({ message: `Reading ${validFiles.length} file(s)…` });
                markdown = renderMarkdown(
                    rootPath,
                    workspaceTreeLines,
                    snapshotTreeLines,
                    validFiles,
                    totalSizeBytes,
                    skippedCount,
                    excludedCount,
                    skippedFiles,
                    { redactSecrets: settings.redactSecrets },
                );
            }
        );

        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        syncGitignore(rootPath);
        // Don't overwrite a real saved selection with an empty one.
        if (!structureOnly) saveLastSelection(rootPath, selected);

        const snapshotTimestamp = getTimestamp();
        outFile = path.join(outDir, `${snapshotTimestamp}.md`);

        try {
            fs.writeFileSync(outFile, markdown, 'utf8');
        } catch (err) {
            vscode.window.showErrorMessage(`Tree Mapper write error: ${err.message}`);
            outFile = null;
        }

        pruneSnapshots(outDir, settings.keepLastSnapshots);

        resetStatusBar();

        // Write failed → no buttons.
        if (!outFile) return;

        // ── Snapshot-saved notification: Show in Folder | Open File | Copy File ────
        const timestamp = path.basename(outFile, '.md');

        const choice = await vscode.window.showInformationMessage(
            `Tree Mapper: Snapshot saved → .tree/${timestamp}.md`,
            'Show in Folder',
            'Open File',
            'Copy File'
        );

        if (choice === 'Open File') {
            const doc = await vscode.workspace.openTextDocument(outFile);
            await vscode.window.showTextDocument(doc);
        } else if (choice === 'Copy File') {
            await copySnapshotToClipboard(outFile);
        } else if (choice === 'Show in Folder') {
            await revealSnapshotInOS(outFile);
        }
    });

    context.subscriptions.push(disposable);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Current Tree Mapper settings (read again on every rescan). */
function loadSettings() {
    const config = vscode.workspace.getConfiguration('treemapper');
    return {
        maxFileSizeKB: config.get('maxFileSizeKB') || 2048,
        keepLastSnapshots: config.get('keepLastSnapshots') || 10,
        respectGitignore: config.get('respectGitignore') !== false,
        redactSecrets: config.get('redactSecrets') !== false,
        defaultIgnorePatterns: resolveIgnorePatterns(config),
    };
}

/**
 * Everything the picker shows: the scan, the git changes and the presets.
 * Used when the picker opens and again on every rescan.
 */
async function loadPickerData(rootPath, settings) {
    const allEntries = await scanWorkspace(
        rootPath,
        settings.maxFileSizeKB,
        settings.defaultIgnorePatterns,
        { respectGitignore: settings.respectGitignore }
    );

    // Git changes (local `git status`). Only plain, readable files that start
    // checked-able: default-ignored files (secret protection, .gitignore, ...),
    // binary/oversized files and files with a possible secret (⚠) are never offered. null → not a git repo /
    // git missing → no buttons.
    const selectableRels = new Set(
        allEntries.entries
            .filter((e) => !e.isDir && !e.ignoredByDefault && !e.skipped && !(e.secretCount > 0))
            .map((e) => e.rel)
    );
    const gitChanges = await getGitChanges(rootPath, (rel) => selectableRels.has(rel));

    // Presets (.tree/presets.json)
    const presets = loadPresets(rootPath);
    const knownFiles = new Set(
        allEntries.entries.filter((e) => !e.isDir).map((e) => e.rel)
    );

    return { allEntries, gitChanges, presets, knownFiles };
}

function showScanStatus(allEntries) {
    updateStatusBar(
        `$(file-directory) Tree Mapper — ${allEntries.ignored} ignored`,
        `Tree Mapper: ${allEntries.total} files found, ${allEntries.ignored} ignored by default`
    );
}

/**
 * savePreset / deletePreset requests from the picker. Writes
 * .tree/presets.json and replies with the full, updated list.
 * (Overwrite confirmation lives here: webviews can't show confirm().)
 */
async function handlePresetMessage(panel, rootPath, knownFiles, msg) {
    const reply = (payload) => {
        try {
            panel.webview.postMessage({ command: 'presets', ...payload });
        } catch {
            // picker was closed while we were busy
        }
    };

    try {
        const name = normalizeName(msg.name);
        if (!name) {
            reply({ presets: loadPresets(rootPath), status: 'Preset name is empty', error: true });
            return;
        }

        if (msg.command === 'deletePreset') {
            const list = deletePreset(rootPath, name);
            reply({ presets: list, select: '', status: `Deleted "${name}"` });
            return;
        }

        // savePreset: only real files from this scan are stored.
        const files = Array.isArray(msg.selected)
            ? msg.selected.filter((r) => typeof r === 'string' && knownFiles.has(r))
            : [];
        if (files.length === 0) {
            reply({ presets: loadPresets(rootPath), status: 'Select at least one file to save', error: true });
            return;
        }

        const current = loadPresets(rootPath);
        if (current.some((p) => p.name === name)) {
            const pick = await vscode.window.showWarningMessage(
                `Tree Mapper: overwrite preset "${name}"?`,
                { modal: true },
                'Overwrite'
            );
            if (pick !== 'Overwrite') {
                reply({ presets: current, select: name, status: 'Save cancelled' });
                return;
            }
        }

        const list = savePreset(rootPath, name, files);
        reply({ presets: list, select: name, status: `Saved "${name}" (${files.length} files)` });
    } catch (err) {
        reply({ presets: loadPresets(rootPath), status: `Preset error: ${err.message}`, error: true });
    }
}

/**
 * Copy the saved snapshot's content to the clipboard.
 * Only ever called from the "Copy File" button — nothing is copied automatically.
 */
async function copySnapshotToClipboard(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        await vscode.env.clipboard.writeText(content);
        vscode.window.showInformationMessage('Tree Mapper: Copied to clipboard');
    } catch (err) {
        vscode.window.showErrorMessage(`Tree Mapper: Could not copy file — ${err.message}`);
    }
}

/** Open the .tree folder in the OS file manager with the snapshot highlighted. */
async function revealSnapshotInOS(filePath) {
    try {
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
    } catch (err) {
        vscode.window.showErrorMessage(`Tree Mapper: Could not reveal file — ${err.message}`);
    }
}

function updateStatusBar(text, tooltip) {
    if (!statusBarItem) return;
    statusBarItem.text = text;
    statusBarItem.tooltip = tooltip;
}

function resetStatusBar() {
    updateStatusBar('$(file-directory) Tree Mapper', 'Tree Mapper: Click to generate a snapshot');
}

function syncGitignore(rootPath) {
    const gitDir = path.join(rootPath, '.git');
    if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return;

    const gitignorePath = path.join(rootPath, '.gitignore');
    const existing = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, 'utf8')
        : '';

    const lines = existing.split(/\r?\n/);
    const hasTree = lines.includes('.tree/');

    if (hasTree) return;

    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, existing + sep + '# Tree Mapper\n.tree/\n', 'utf8');
}

function pruneSnapshots(outDir, keepLast) {
    try {
        const pattern = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.md$/;
        const all = fs.readdirSync(outDir).filter((f) => pattern.test(f)).sort();
        for (const f of all.slice(0, Math.max(0, all.length - keepLast))) {
            fs.unlinkSync(path.join(outDir, f));
        }
    } catch {
        // non-fatal
    }
}

function getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-')
        + '-'
        + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');
}

// ── Last-selection memory ─────────────────────────────────────────────────────

function getSelectionFilePath(rootPath) {
    return path.join(rootPath, '.tree', 'last-selection.json');
}

function loadLastSelection(rootPath) {
    try {
        const filePath = getSelectionFilePath(rootPath);
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data;
        return null;
    } catch {
        return null;
    }
}

function saveLastSelection(rootPath, selected) {
    try {
        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(getSelectionFilePath(rootPath), JSON.stringify(selected, null, 2), 'utf8');
    } catch {
        // non-fatal
    }
}

function deactivate() {
    if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };