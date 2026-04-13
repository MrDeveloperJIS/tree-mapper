'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { scanWorkspace } = require('./scanner');
const { buildTree } = require('./treeBuilder');
const { renderMarkdown } = require('./markdownRenderer');

function activate(context) {
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

    const treeignorePath = path.join(rootPath, '.treeignore');
    if (!fs.existsSync(treeignorePath)) {
      const content = [
        '# Tree Mapper ignore rules — gitignore syntax',
        '',
        ...defaultIgnorePatterns,
        '',
      ].join('\n');
      fs.writeFileSync(treeignorePath, content, 'utf8');
    }

    let outFile = null;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Tree Mapper',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Scanning workspace files…' });

        let files, totalSizeBytes, skippedCount = 0;
        try {
          ({ files, totalSizeBytes, skippedCount } = await scanWorkspace(rootPath, maxFileSizeKB));
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper scan error: ${err.message}`);
          return;
        }

        progress.report({ message: `Building tree for ${files.length} files…` });
        const treeLines = buildTree(files);

        progress.report({ message: 'Rendering Markdown snapshot…' });
        const markdown = renderMarkdown(rootPath, treeLines, files, totalSizeBytes, skippedCount);

        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        syncGitignore(rootPath);

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

    if (!outFile) return;

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

function syncGitignore(rootPath) {
  const gitDir = path.join(rootPath, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) return;

  const gitignorePath = path.join(rootPath, '.gitignore');
  let existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : '';

  const lines = existing.split(/\r?\n/);
  const hasTree = lines.includes('.tree/');
  const hasTreeignore = lines.includes('.treeignore');

  if (hasTree && hasTreeignore) return;

  if (!hasTree && !hasTreeignore) {
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(gitignorePath, existing + sep + '# Tree Mapper\n.tree/\n.treeignore\n', 'utf8');
  } else if (!hasTree) {
    fs.writeFileSync(gitignorePath, existing.replace(/^\.treeignore$/m, '.tree/\n.treeignore'), 'utf8');
  } else {
    fs.writeFileSync(gitignorePath, existing.replace(/^\.tree\/$/m, '.tree/\n.treeignore'), 'utf8');
  }
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

function deactivate() { }

module.exports = { activate, deactivate };