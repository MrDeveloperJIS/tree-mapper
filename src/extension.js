'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { scanWorkspace } = require('./scanner');
const { buildTree } = require('./treeBuilder');
const { renderMarkdown } = require('./markdownRenderer');
const { buildPickerHtml } = require('./pickerHtml');

/** @type {vscode.StatusBarItem} */
let statusBarItem;

function activate(context) {
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
      rootPath = workspaceFolders[0].uri.fsPath;
    }

    const config = vscode.workspace.getConfiguration('treemapper');
    const maxFileSizeKB = config.get('maxFileSizeKB') || 2048;
    const keepLastSnapshots = config.get('keepLastSnapshots') || 10;
    const defaultIgnorePatterns = config.get('defaultIgnorePatterns') || [];

    // ── Step 1: Pre-scan everything (no ignore filtering) ──────────────────
    updateStatusBar('$(sync~spin) Scanning…', 'Tree Mapper: Scanning files…');

    let allEntries;
    try {
      allEntries = await scanWorkspace(rootPath, maxFileSizeKB, defaultIgnorePatterns);
    } catch (err) {
      vscode.window.showErrorMessage(`Tree Mapper scan error: ${err.message}`);
      resetStatusBar();
      return;
    }

    updateStatusBar(
      `$(file-directory) Tree Mapper — ${allEntries.ignored} ignored`,
      `Tree Mapper: ${allEntries.total} files found, ${allEntries.ignored} ignored by default`
    );

    // ── Load last selection for this root ────────────────────────────────────
    const lastSelection = loadLastSelection(rootPath);

    // ── Step 2: Show interactive file picker ─────────────────────────────────
    const panel = vscode.window.createWebviewPanel(
      'treemapperPicker',
      'Tree Mapper — Select Files',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    panel.webview.html = buildPickerHtml(allEntries.tree, path.basename(rootPath), lastSelection);

    // Wait for user to confirm or cancel
    const selected = await new Promise((resolve) => {
      panel.webview.onDidReceiveMessage((msg) => {
        if (msg.command === 'confirm') {
          resolve(msg.selected); // string[] of relative paths
        } else if (msg.command === 'cancel') {
          resolve(null);
        }
      });
      panel.onDidDispose(() => resolve(null));
    });

    panel.dispose();

    if (!selected) {
      resetStatusBar();
      return;
    }

    // ── Step 3: Generate snapshot from selected files ────────────────────────
    updateStatusBar('$(sync~spin) Generating…', 'Tree Mapper: Generating snapshot…');

    // O(1) lookups by relative path instead of Array#find() per file, which
    // was effectively O(n²) over the whole selection.
    const entryByRel = new Map(allEntries.entries.map((e) => [e.rel, e]));

    let totalSizeBytes = 0;
    let skippedCount = 0;
    /** @type {{ rel: string, reason: string }[]} */
    const skippedFiles = [];
    const validFiles = [];

    for (const rel of selected) {
      const entry = entryByRel.get(rel);
      if (!entry || entry.isDir) continue;

      if (entry.skipped && !entry.isBinary && entry.size <= (maxFileSizeKB * 1024)) {
        entry.skipped = false;
      }

      if (entry.skipped) {
        skippedCount++;
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

    const allFilePaths = allEntries.entries
      .filter((e) => !e.isDir)
      .map((e) => e.rel);

    const validSet = new Set(validFiles);
    const excludedSet = new Set(
      allFilePaths.filter((r) => !validSet.has(r))
    );

    const { workspaceTreeLines, snapshotTreeLines } = buildTree(
      validFiles,
      excludedSet,
      defaultIgnorePatterns,
      allEntries.entries,
    );

    // The actual slow part is reading every selected file's contents — wrap
    // that in a real progress notification instead of an artificial delay.
    let markdown;
    let outFile = null;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Tree Mapper', cancellable: false },
      async (progress) => {
        progress.report({ message: `Reading ${validFiles.length} file(s)…` });
        markdown = renderMarkdown(
          rootPath,
          workspaceTreeLines,
          snapshotTreeLines,
          validFiles,
          totalSizeBytes,
          skippedCount,
          excludedSet.size,
          skippedFiles,
        );
      }
    );

    const outDir = path.join(rootPath, '.tree');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    syncGitignore(rootPath);
    saveLastSelection(rootPath, selected);

    const snapshotTimestamp = getTimestamp();
    outFile = path.join(outDir, `${snapshotTimestamp}.md`);

    try {
      fs.writeFileSync(outFile, markdown, 'utf8');
    } catch (err) {
      vscode.window.showErrorMessage(`Tree Mapper write error: ${err.message}`);
      outFile = null;
    }

    pruneSnapshots(outDir, keepLastSnapshots);

    resetStatusBar();

    if (!outFile) return;

    // ── Auto-dismissing "Open File" notification (3 s) ──────────────────────
    const timestamp = path.basename(outFile, '.md');

    const choice = await vscode.window.showInformationMessage(
      `Tree Mapper: Snapshot saved → .tree/${timestamp}.md`,
      'Open File'
    );

    if (choice === 'Open File') {
      const doc = await vscode.workspace.openTextDocument(outFile);
      await vscode.window.showTextDocument(doc);
    }
  });

  context.subscriptions.push(disposable);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  let existing = fs.existsSync(gitignorePath)
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