'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { scanWorkspace } = require('./scanner');
const { buildTree } = require('./treeBuilder');
const { renderMarkdown } = require('./markdownRenderer');

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

    let outFile = null;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Tree Mapper',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `Building tree for ${selected.length} files…` });

        // Include any entry the user checked, regardless of ignoredByDefault flag.
        const selectedPaths = selected.filter((rel) => {
          const entry = allEntries.entries.find((e) => e.rel === rel && !e.isDir);
          return !!entry;
        });

        let totalSizeBytes = 0;
        let skippedCount = 0;
        /** @type {{ rel: string, reason: string }[]} */
        const skippedFiles = [];
        const validFiles = [];

        for (const rel of selectedPaths) {
          const entry = allEntries.entries.find((e) => e.rel === rel);
          if (!entry) continue;

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

        // Compute excluded files (user-unchecked)
        const allFilePaths = allEntries.entries
          .filter((e) => !e.isDir)
          .map((e) => e.rel);

        const validSet = new Set(validFiles);
        const excludedSet = new Set(
          allFilePaths.filter((r) => !validSet.has(r))
        );

        // Build both trees
        const { workspaceTreeLines, snapshotTreeLines } = buildTree(
          validFiles,
          excludedSet,
          defaultIgnorePatterns,
          allEntries.entries,
        );

        progress.report({ message: 'Rendering Markdown snapshot…' });

        const markdown = renderMarkdown(
          rootPath,
          workspaceTreeLines,
          snapshotTreeLines,
          validFiles,
          totalSizeBytes,
          skippedCount,
          excludedSet.size,
          skippedFiles,
        );

        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        syncGitignore(rootPath);

        // ── Save last selection ──────────────────────────────────────────────
        saveLastSelection(rootPath, selected);

        const timestamp = getTimestamp();
        outFile = path.join(outDir, `${timestamp}.md`);

        try {
          fs.writeFileSync(outFile, markdown, 'utf8');
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper write error: ${err.message}`);
          outFile = null;
          return;
        }

        pruneSnapshots(outDir, keepLastSnapshots);
      }
    );

    resetStatusBar();

    if (!outFile) return;

    // ── Auto-dismissing "Open File" notification (3 s) ──────────────────────
    const timestamp = path.basename(outFile, '.md');

    let openFile = false;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Tree Mapper: Snapshot saved → .tree/${timestamp}.md`,
        cancellable: false,
      },
      (_progress) =>
        new Promise((resolve) => {
          const timer = setTimeout(resolve, 3000);

          vscode.window
            .showInformationMessage(
              `Tree Mapper: Snapshot saved → .tree/${timestamp}.md`,
              'Open File'
            )
            .then((value) => {
              clearTimeout(timer);
              openFile = value === 'Open File';
              resolve();
            });
        })
    );

    if (openFile) {
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

// ── Webview HTML ──────────────────────────────────────────────────────────────

function buildPickerHtml(treeNodes, projectName, lastSelection) {
  const treeJson = JSON.stringify(treeNodes);
  const lastSelectionJson = JSON.stringify(lastSelection || null);
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tree Mapper</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:           var(--vscode-editor-background,      #0d0d0f);
    --bg-panel:     var(--vscode-sideBar-background,     #111114);
    --bg-input:     var(--vscode-input-background,       #18181c);
    --bg-hover:     var(--vscode-list-hoverBackground,   #16161a);
    --bg-glass:     #ffffff08;
    --border:       var(--vscode-panel-border,           #222228);
    --border-soft:  #ffffff0f;
    --fg:           var(--vscode-editor-foreground,      #e8e8f0);
    --fg-dim:       var(--vscode-descriptionForeground,  #5a5a72);
    --fg-muted:     #333340;
    --accent:       var(--vscode-button-background,      #5b7cf6);
    --accent-fg:    var(--vscode-button-foreground,      #fff);
    --accent-dim:   #5b7cf61f;
    --accent-glow:  #5b7cf633;
    --accent-line:  #5b7cf659;
    --success:      #3dd68c;
    --success-dim:  #3dd68c1a;
    --danger:       #f16b6b;
    --danger-dim:   #f16b6b14;
    --danger-line:  #f16b6b33;
    --amber:        #f59e0b;
    --mono:         'Geist Mono', 'JetBrains Mono', 'Consolas', monospace;
    --sans:         'Geist', var(--vscode-font-family, system-ui, sans-serif);
    --radius:       6px;
    --radius-lg:    10px;
    --ease:         cubic-bezier(0.16, 1, 0.3, 1);
    --t:            0.18s;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ─── Animated background grain ─────────────────────────────────────── */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 0;
    opacity: 0.4;
  }

  /* ─── Header ─────────────────────────────────────────────────────────── */
  .header {
    position: relative;
    z-index: 1;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    padding: 14px 20px 13px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideDown 0.4s var(--ease) both;
  }

  .header::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--accent-line) 30%, var(--accent-line) 70%, transparent);
    opacity: 0.5;
  }

  .header-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--accent-dim), rgba(91,124,246,0.06));
    border: 1px solid var(--accent-line);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 0 12px var(--accent-glow);
  }
  .header-icon svg { width: 14px; height: 14px; fill: var(--accent); }

  .header-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
    letter-spacing: -0.01em;
    line-height: 1;
    margin-bottom: 4px;
  }
  .header-sub {
    font-size: 11px;
    color: var(--fg-dim);
    font-family: var(--mono);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .project-chip {
    background: var(--accent-dim);
    border: 1px solid var(--accent-line);
    border-radius: 4px;
    padding: 1px 7px;
    font-size: 10.5px;
    color: var(--accent);
    letter-spacing: 0.01em;
    font-weight: 500;
  }
  .header-hint {
    color: var(--fg-dim);
    font-size: 10.5px;
  }

  /* ─── Toolbar ────────────────────────────────────────────────────────── */
  .toolbar {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    animation: slideDown 0.4s 0.05s var(--ease) both;
  }

  .btn-ghost {
    background: transparent;
    color: var(--fg-dim);
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 4px 10px;
    font-size: 11px;
    font-family: var(--sans);
    font-weight: 500;
    cursor: pointer;
    letter-spacing: 0.01em;
    transition: color var(--t), border-color var(--t), background var(--t), box-shadow var(--t);
    white-space: nowrap;
    line-height: 1.6;
  }
  .btn-ghost:hover {
    color: var(--fg);
    border-color: var(--border-soft);
    background: var(--bg-glass);
  }
  .btn-ghost:active { transform: scale(0.97); }

  .btn-ghost.memory {
    color: var(--accent);
    border-color: var(--accent-line);
    background: var(--accent-dim);
  }
  .btn-ghost.memory:hover {
    background: rgba(91,124,246,0.2);
    box-shadow: 0 0 8px var(--accent-glow);
  }

  .btn-ghost.select-filtered {
    color: var(--success);
    border-color: #3dd68c40;
    background: var(--success-dim);
  }
  .btn-ghost.select-filtered:hover {
    background: #3dd68c2e;
    box-shadow: 0 0 8px #3dd68c26;
  }

  .sep {
    width: 1px;
    height: 14px;
    background: var(--border);
    flex-shrink: 0;
    margin: 0 2px;
  }

  .search-wrap {
    flex: 1;
    min-width: 120px;
    position: relative;
  }
  .search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    stroke: var(--fg-muted);
    pointer-events: none;
    transition: stroke var(--t);
  }
  .search-wrap:focus-within .search-icon { stroke: var(--accent); }

  .search-input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 5px 10px 5px 28px;
    outline: none;
    transition: border-color var(--t), box-shadow var(--t);
    letter-spacing: -0.01em;
  }
  .search-input::placeholder { color: var(--fg-muted); }
  .search-input:focus {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .stats-pill {
    margin-left: auto;
    font-size: 10.5px;
    font-family: var(--mono);
    color: var(--fg-dim);
    white-space: nowrap;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 3px 10px;
    letter-spacing: 0.01em;
    transition: border-color var(--t);
  }
  .stats-pill .count { color: var(--fg); font-weight: 500; }
  .stats-pill.has-selection { border-color: var(--accent-line); }
  .stats-pill .count.selected { color: var(--accent); }

  /* ─── Legend ─────────────────────────────────────────────────────────── */
  .legend {
    position: relative;
    z-index: 1;
    display: flex;
    gap: 0;
    padding: 0 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    animation: slideDown 0.4s 0.08s var(--ease) both;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--fg-dim);
    letter-spacing: 0.03em;
    padding: 5px 14px 5px 0;
    font-family: var(--mono);
    text-transform: uppercase;
  }
  .legend-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend-dot.included {
    background: var(--success);
    box-shadow: 0 0 5px rgba(61,214,140,0.5);
  }
  .legend-dot.excluded {
    background: var(--danger);
    box-shadow: 0 0 5px rgba(241,107,107,0.4);
  }

  /* ─── Tree ───────────────────────────────────────────────────────────── */
  .tree-scroll {
    position: relative;
    z-index: 1;
    overflow-y: auto;
    padding: 6px 0 16px;
    animation: fadeIn 0.5s 0.12s var(--ease) both;
  }

  .tree-row {
    display: flex;
    align-items: center;
    padding: 0 16px 0 0;
    height: 26px;
    cursor: default;
    user-select: none;
    transition: background var(--t);
    position: relative;
  }
  .tree-row:hover { background: var(--bg-hover); }
  .tree-row:hover::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    opacity: 0.5;
    border-radius: 0 2px 2px 0;
  }
  .tree-row.hidden { display: none; }

  /* Indentation connector lines */
  .indent-block {
    display: inline-flex;
    align-items: center;
    width: 20px;
    height: 26px;
    flex-shrink: 0;
    position: relative;
  }
  .indent-block.has-line::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--border);
    opacity: 0.6;
  }

  .toggle-zone {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 4px;
    color: var(--fg-muted);
    transition: color var(--t), background var(--t);
  }
  .toggle-zone:hover { color: var(--fg); background: var(--bg-input); }
  .toggle-zone.leaf { cursor: default; }
  .toggle-zone.leaf:hover { background: transparent; }
  .toggle-zone svg {
    width: 10px;
    height: 10px;
    stroke: currentColor;
    fill: none;
    transition: transform 0.2s var(--ease);
  }
  .toggle-zone.collapsed svg { transform: rotate(-90deg); }

  .node-cb {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    margin: 0 7px 0 5px;
    cursor: pointer;
    accent-color: var(--accent);
    border-radius: 3px;
  }

  .file-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    margin-right: 5px;
    opacity: 0.5;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .file-icon svg { width: 12px; height: 12px; }

  .node-label {
    font-family: var(--mono);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    color: var(--fg);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .node-label.dir-label {
    color: var(--vscode-symbolIcon-folderForeground, #c9a96a);
    font-weight: 500;
  }
  .node-label.dim { opacity: 0.3; }

  .excl-chip {
    font-size: 9px;
    font-family: var(--sans);
    font-weight: 600;
    letter-spacing: 0.06em;
    background: var(--danger-dim);
    color: var(--danger);
    border: 1px solid var(--danger-line);
    border-radius: 3px;
    padding: 1px 5px;
    margin-left: 8px;
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .size-tag {
    font-size: 9.5px;
    font-family: var(--mono);
    color: var(--fg-muted);
    margin-left: 8px;
    margin-right: 2px;
    flex-shrink: 0;
    letter-spacing: -0.01em;
  }

  /* ─── Footer ─────────────────────────────────────────────────────────── */
  .footer {
    position: relative;
    z-index: 1;
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    background: var(--bg-panel);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideUp 0.4s var(--ease) both;
  }

  .footer::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-soft) 30%, var(--border-soft) 70%, transparent);
  }

  .footer-info {
    flex: 1;
    font-size: 11px;
    color: var(--fg-dim);
    font-family: var(--mono);
    letter-spacing: -0.01em;
  }
  .footer-info .hi { color: var(--accent); font-weight: 600; }
  .footer-info .total { color: var(--fg); }

  .btn-cancel {
    background: transparent;
    color: var(--fg-dim);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 6px 14px;
    font-size: 11.5px;
    font-family: var(--sans);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t);
    letter-spacing: 0.01em;
  }
  .btn-cancel:hover {
    color: var(--fg);
    border-color: var(--border-soft);
    background: var(--bg-glass);
  }
  .btn-cancel:active { transform: scale(0.97); }

  .btn-generate {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    border-radius: var(--radius);
    padding: 6px 18px;
    font-size: 11.5px;
    font-family: var(--sans);
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: opacity var(--t), box-shadow var(--t), transform var(--t);
    box-shadow: 0 1px 8px var(--accent-glow);
    position: relative;
    overflow: hidden;
  }
  .btn-generate::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 60%);
    pointer-events: none;
  }
  .btn-generate:hover:not(:disabled) {
    opacity: 0.92;
    box-shadow: 0 2px 16px var(--accent-glow), 0 0 0 3px var(--accent-dim);
    transform: translateY(-1px);
  }
  .btn-generate:active:not(:disabled) { transform: translateY(0); }
  .btn-generate:disabled {
    opacity: 0.25;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* ─── Scrollbar ──────────────────────────────────────────────────────── */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #2a2a35; }

  /* ─── Animations ─────────────────────────────────────────────────────── */
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-icon">
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h4l1.5 2H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9z"/>
    </svg>
  </div>
  <div class="header-text">
    <div class="header-title">Select Files for Snapshot</div>
    <div class="header-sub">
      <span class="project-chip">${projectName}</span>
      <span class="header-hint">Excluded files are unchecked — enable them individually</span>
    </div>
  </div>
</div>

<!-- Toolbar -->
<div class="toolbar">
  <button class="btn-ghost" onclick="selectAll()">Select all</button>
  <button class="btn-ghost" onclick="selectNone()">Deselect all</button>
  <button class="btn-ghost" onclick="resetDefaults()">Reset defaults</button>
  <button class="btn-ghost memory" id="restoreLastBtn" style="display:none" onclick="restoreLastSelection()">↺ Restore last</button>
  <div class="sep"></div>
  <div class="search-wrap">
    <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.6">
      <circle cx="6.5" cy="6.5" r="4"/>
      <path d="M11 11l3 3" stroke-linecap="round"/>
    </svg>
    <input class="search-input" id="searchInput" type="text" placeholder="Filter files…" oninput="filterTree(this.value)">
  </div>
  <button class="btn-ghost select-filtered" id="selectFilteredBtn" style="display:none" onclick="selectFiltered()">Select filtered</button>
  <div class="stats-pill" id="statsLabel"><span class="count selected">—</span> / <span class="count">—</span></div>
</div>

<!-- Legend -->
<div class="legend">
  <div class="legend-item"><div class="legend-dot included"></div>Included</div>
  <div class="legend-item" style="margin-left:14px"><div class="legend-dot excluded"></div>Excluded by default</div>
</div>

<!-- Tree -->
<div class="tree-scroll" id="treeContainer"></div>

<!-- Footer -->
<div class="footer">
  <div class="footer-info" id="footerInfo">Loading…</div>
  <button class="btn-cancel" onclick="cancel()">Cancel</button>
  <button class="btn-generate" id="generateBtn" onclick="generate()" disabled>Generate Snapshot</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const TREE = ${treeJson};
const LAST_SELECTION = ${lastSelectionJson};

let nodeMap = {};
let allFileNodes = [];

// ── File icon helper ────────────────────────────────────────────────────────
function getFileIconSvg(name, isDir) {
  if (isDir) {
    return '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 3.5A1.5 1.5 0 0 1 3 2h4l1.5 2H13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5v-9z" fill="#c9a96a" opacity="0.7"/></svg>';
  }
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const colorMap = {
    js: '#f0db4f', ts: '#3178c6', jsx: '#61dafb', tsx: '#61dafb',
    css: '#264de4', scss: '#cd6799', html: '#e34c26',
    json: '#cbcb41', md: '#083fa1', py: '#3572a5',
    rs: '#dea584', go: '#00add8', rb: '#cc342d',
    sh: '#89e051', yaml: '#cb171e', yml: '#cb171e',
    vue: '#41b883', svelte: '#ff3e00', php: '#4f5d95',
  };
  const color = colorMap[ext] || '#5a5a72';
  return \`<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 2h6l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="\${color}" opacity="0.55"/><path d="M10 2l4 4h-4V2z" fill="\${color}" opacity="0.9"/></svg>\`;
}

// ── Build UI ────────────────────────────────────────────────────────────────
function buildUI() {
  const container = document.getElementById('treeContainer');
  container.innerHTML = '';
  nodeMap = {};
  allFileNodes = [];
  renderLevel(TREE, container, 0, []);
  updateStats();

  if (LAST_SELECTION && LAST_SELECTION.length > 0) {
    document.getElementById('restoreLastBtn').style.display = '';
  }
}

function allDescendantsExcluded(node) {
  if (!node.isDir || !node.children || node.children.length === 0) return false;
  function check(children) {
    for (const c of children) {
      if (!c.isDir) {
        if (!c.ignoredByDefault) return false;
      } else {
        if (!check(c.children || [])) return false;
      }
    }
    return true;
  }
  return check(node.children);
}

function renderLevel(nodes, container, depth, ancestorIsLast) {
  nodes.forEach((node, idx) => {
    nodeMap[node.rel] = node;
    if (!node.isDir) allFileNodes.push(node);

    const isLast = idx === nodes.length - 1;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.rel = node.rel;
    row.dataset.isDir = node.isDir ? '1' : '0';

    // indent blocks
    for (let i = 0; i < depth; i++) {
      const block = document.createElement('span');
      block.className = 'indent-block' + (ancestorIsLast[i] ? '' : ' has-line');
      row.appendChild(block);
    }

    // toggle chevron
    const tog = document.createElement('span');
    tog.className = 'toggle-zone' + (node.isDir && node.children && node.children.length ? '' : ' leaf');
    tog.innerHTML = node.isDir && node.children && node.children.length
      ? '<svg viewBox="0 0 10 10" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3 5,7 8,3"/></svg>'
      : '';

    const startCollapsed = node.isDir && node.children && node.children.length > 0
      && allDescendantsExcluded(node);

    if (node.isDir && node.children && node.children.length) {
      if (startCollapsed) tog.classList.add('collapsed');
      tog.addEventListener('click', (e) => {
        e.stopPropagation();
        const childWrap = document.querySelector('[data-parent-rel="' + CSS.escape(node.rel) + '"]');
        if (!childWrap) return;
        const collapsed = childWrap.style.display === 'none';
        childWrap.style.display = collapsed ? '' : 'none';
        tog.classList.toggle('collapsed', !collapsed);
      });
    }
    row.appendChild(tog);

    // checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'node-cb';
    cb.dataset.rel = node.rel;
    cb.checked = !node.ignoredByDefault;
    cb.addEventListener('change', () => {
      if (node.isDir) {
        setDescendantsChecked(node.rel, cb.checked);
      }
      updateAncestors(node.rel);
      updateStats();
    });
    row.appendChild(cb);

    // file icon
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.innerHTML = getFileIconSvg(node.name, node.isDir);
    row.appendChild(icon);

    // label
    const label = document.createElement('span');
    label.className = 'node-label'
      + (node.isDir ? ' dir-label' : '')
      + (node.ignoredByDefault ? ' dim' : '');
    label.textContent = node.name;
    row.appendChild(label);

    // excluded chip
    if (node.ignoredByDefault) {
      const chip = document.createElement('span');
      chip.className = 'excl-chip';
      chip.textContent = 'excl';
      row.appendChild(chip);
    }

    // size
    if (!node.isDir && node.size) {
      const sz = document.createElement('span');
      sz.className = 'size-tag';
      sz.textContent = fmtSize(node.size);
      row.appendChild(sz);
    }

    container.appendChild(row);

    // children
    if (node.isDir && node.children && node.children.length) {
      const childWrap = document.createElement('div');
      childWrap.dataset.parentRel = node.rel;
      if (startCollapsed) childWrap.style.display = 'none';
      renderLevel(node.children, childWrap, depth + 1, [...ancestorIsLast, isLast]);
      container.appendChild(childWrap);
    }
  });
}

// ── Checkbox helpers ────────────────────────────────────────────────────────
function setDescendantsChecked(dirRel, checked) {
  const node = nodeMap[dirRel];
  if (!node) return;
  const dirCb = getCb(dirRel);
  if (dirCb) { dirCb.checked = checked; dirCb.indeterminate = false; }
  function recurse(children) {
    if (!children) return;
    for (const c of children) {
      const cb = getCb(c.rel);
      if (cb) { cb.checked = checked; cb.indeterminate = false; }
      if (c.isDir) recurse(c.children);
    }
  }
  recurse(node.children);
}

function updateAncestors(rel) {
  const parts = rel.split('/');
  for (let i = parts.length - 1; i >= 1; i--) {
    const parentRel = parts.slice(0, i).join('/');
    const parentCb = getCb(parentRel);
    if (!parentCb) continue;
    const childFileCbs = getDescFileCbs(parentRel);
    const checkedN = childFileCbs.filter(c => c.checked).length;
    if (checkedN === 0) { parentCb.checked = false; parentCb.indeterminate = false; }
    else if (checkedN === childFileCbs.length) { parentCb.checked = true; parentCb.indeterminate = false; }
    else { parentCb.checked = false; parentCb.indeterminate = true; }
  }
}

function getDescFileCbs(dirRel) {
  const node = nodeMap[dirRel];
  const result = [];
  function recurse(children) {
    if (!children) return;
    for (const c of children) {
      if (!c.isDir) { const cb = getCb(c.rel); if (cb) result.push(cb); }
      else recurse(c.children);
    }
  }
  if (node) recurse(node.children);
  return result;
}

function getCb(rel) {
  return document.querySelector('input.node-cb[data-rel="' + CSS.escape(rel) + '"]');
}

// ── Toolbar actions ─────────────────────────────────────────────────────────
function selectAll() {
  document.querySelectorAll('input.node-cb').forEach(cb => { cb.checked = true; cb.indeterminate = false; });
  updateStats();
}
function selectNone() {
  document.querySelectorAll('input.node-cb').forEach(cb => { cb.checked = false; cb.indeterminate = false; });
  updateStats();
}
function resetDefaults() {
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    cb.checked = !node.ignoredByDefault;
    cb.indeterminate = false;
  });
  allFileNodes.forEach(n => updateAncestors(n.rel));
  updateStats();
}

function restoreLastSelection() {
  if (!LAST_SELECTION || !LAST_SELECTION.length) return;
  const lastSet = new Set(LAST_SELECTION);
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    cb.checked = lastSet.has(cb.dataset.rel);
    cb.indeterminate = false;
  });
  allFileNodes.forEach(n => updateAncestors(n.rel));
  updateStats();
}

// ── Filter ──────────────────────────────────────────────────────────────────
function filterTree(q) {
  q = q.toLowerCase().trim();
  const filterBtn = document.getElementById('selectFilteredBtn');

  if (!q) {
    document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('hidden'));
    document.querySelectorAll('[data-parent-rel]').forEach(w => {
      const parentRel = w.dataset.parentRel;
      const node = nodeMap[parentRel];
      if (node && allDescendantsExcluded(node)) {
        const tog = document.querySelector('.tree-row[data-rel="' + CSS.escape(parentRel) + '"] .toggle-zone');
        if (tog && tog.classList.contains('collapsed')) {
          w.style.display = 'none';
        } else {
          w.style.display = '';
        }
      } else {
        w.style.display = '';
      }
    });
    filterBtn.style.display = 'none';
    return;
  }

  document.querySelectorAll('[data-parent-rel]').forEach(w => w.style.display = '');
  document.querySelectorAll('.tree-row').forEach(row => {
    const rel = row.dataset.rel || '';
    row.classList.toggle('hidden', !rel.toLowerCase().includes(q));
  });
  filterBtn.style.display = '';
}

function selectFiltered() {
  document.querySelectorAll('.tree-row:not(.hidden)').forEach(row => {
    if (row.dataset.isDir === '1') return;
    const rel = row.dataset.rel;
    const cb = getCb(rel);
    if (cb) { cb.checked = true; cb.indeterminate = false; }
  });
  allFileNodes.forEach(n => updateAncestors(n.rel));
  updateStats();
}

// ── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  let total = 0, selected = 0;
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    total++;
    if (cb.checked) selected++;
  });

  const label = document.getElementById('statsLabel');
  label.innerHTML = '<span class="count selected">' + selected + '</span> / <span class="count">' + total + '</span>';
  label.classList.toggle('has-selection', selected > 0);

  document.getElementById('footerInfo').innerHTML =
    '<span class="hi">' + selected + '</span> <span class="total">/ ' + total + ' files</span> selected for snapshot';
  document.getElementById('generateBtn').disabled = selected === 0;
}

// ── Generate / Cancel ────────────────────────────────────────────────────────
function generate() {
  const selected = [];
  document.querySelectorAll('input.node-cb').forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    if (cb.checked) selected.push(cb.dataset.rel);
  });
  vscode.postMessage({ command: 'confirm', selected });
}
function cancel() {
  vscode.postMessage({ command: 'cancel' });
}

// ── Utilities ────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

buildUI();
</script>
</body>
</html>`;
}

function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };