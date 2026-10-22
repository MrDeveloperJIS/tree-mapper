## 🌲 Tree Mapper v2.7.0

Tree Mapper generates rich Markdown snapshots of your workspace directly from VS Code. Select exactly which files to include via an interactive file picker, and get a structured snapshot with a full project tree, language-aware code blocks, token count estimates, and more — saved to `.tree/` and ready to paste into any LLM context.

**Key features:**

* Interactive file picker with checkbox tree, filter search, select/deselect controls, and last-selection memory
* Structure-only snapshots — generate with nothing selected to get just the project tree
* Dual tree sections — full workspace tree + snapshot-only tree
* Language-aware fenced code blocks for 60+ file types
* Token count estimate in every snapshot header
* Secret and credential files unchecked by default via a built-in ignore list
* Snapshot rotation — keeps only the N most recent snapshots
* Binary file detection and file size limits with a skipped files report
* Auto-updates `.gitignore` when a `.git` folder is detected
* Status bar item with live scan state

---

### What's new in v2.7.0

### Added

- **Structure-only snapshot** — generate with no files selected to get just the project tree (no index, contents or stats). The picker button changes to **Generate Structure Only**, and an empty selection no longer overwrites your saved last selection.
- **Workspace folder picker** — in multi-root workspaces, running the command from the Command Palette or status bar now asks which folder to snapshot.

### Fixed

- **Files containing code fences broke the snapshot** — each file is now wrapped in a fence one backtick longer than the longest run of three or more backticks inside it (minimum three), so READMEs and other Markdown files no longer close the block early.
- **Picker script injection** — file names containing `</script>` can no longer break out of the embedded JSON. The picker also now has a Content-Security-Policy.
- **Non-ASCII file names** — anchor links now follow GitHub's Unicode-aware slug rules.

### Changed

- **Ignore patterns are documented in their own page** — the README and the `treemapper.defaultIgnorePatterns` setting now link to a new [built-in ignore patterns](https://github.com/MrDeveloperJIS/tree-mapper/blob/HEAD/docs/IGNORE_PATTERNS.md) page that groups every pattern by category and explains how to add your own.
- **Faster scanning** — `node_modules/`, `.git/` and `.tree/` are pruned during the glob and no longer appear in the picker.
- **No network access from the picker** — Google Fonts removed. The picker uses your VS Code fonts.

See the [CHANGELOG](https://github.com/MrDeveloperJIS/tree-mapper/blob/HEAD/CHANGELOG.md) for the full list, including internal changes.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.7.0.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher