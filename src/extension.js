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
      if (stat.isDirectory()) {
        rootPath = uri.fsPath;
      } else {
        // uri is a file — use its parent
        rootPath = path.dirname(uri.fsPath);
      }
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Tree Mapper: No workspace folder is open.');
        return;
      }
      rootPath = workspaceFolders[0].uri.fsPath;
    }

    const config = vscode.workspace.getConfiguration('treemapper');
    const extraIgnore = config.get('additionalIgnorePatterns') || [];
    const maxFileSizeKB = config.get('maxFileSizeKB') || 2048;

    let outFile = null;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Tree Mapper',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Scanning workspace files…' });

        let files;
        let totalSizeBytes;
        try {
          ({ files, totalSizeBytes } = await scanWorkspace(rootPath, extraIgnore, maxFileSizeKB));
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper scan error: ${err.message}`);
          return;
        }

        progress.report({ message: `Building tree for ${files.length} files…` });
        const treeLines = buildTree(files);

        progress.report({ message: 'Rendering Markdown snapshot…' });
        const markdown = renderMarkdown(rootPath, treeLines, files, totalSizeBytes);

        const outDir = path.join(rootPath, '.tree');
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        const treeignorePath = path.join(rootPath, '.treeignore');
        if (!fs.existsSync(treeignorePath)) {
          fs.writeFileSync(treeignorePath, '', 'utf8');
        }

        const gitDir = path.join(rootPath, '.git');
        if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
          const gitignorePath = path.join(rootPath, '.gitignore');

          let existing = '';
          if (fs.existsSync(gitignorePath)) {
            existing = fs.readFileSync(gitignorePath, 'utf8');
          }

          const existingLines = existing.split(/\r?\n/);
          const hasTree = existingLines.includes('.tree/');
          const hasTreeignore = existingLines.includes('.treeignore');

          if (!hasTree && !hasTreeignore) {
            const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
            fs.writeFileSync(gitignorePath, existing + separator + '# Tree Mapper Snapshots\n.tree/\n.treeignore\n', 'utf8');
          } else if (!hasTree) {
            const updated = existing.replace(/^\.treeignore$/m, '.tree/\n.treeignore');
            fs.writeFileSync(gitignorePath, updated, 'utf8');
          } else if (!hasTreeignore) {
            const updated = existing.replace(/^\.tree\/$/m, '.tree/\n.treeignore');
            fs.writeFileSync(gitignorePath, updated, 'utf8');
          }
        }

        const timestamp = getTimestamp();
        outFile = path.join(outDir, `${timestamp}.md`);

        try {
          fs.writeFileSync(outFile, markdown, 'utf8');
        } catch (err) {
          vscode.window.showErrorMessage(`Tree Mapper write error: ${err.message}`);
          outFile = null;
          return;
        }
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

function deactivate() { }

// yyyy-mm-dd-hh-mm-ss using device local time (24-hour, filesystem-safe)
function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('-');
}

module.exports = { activate, deactivate };