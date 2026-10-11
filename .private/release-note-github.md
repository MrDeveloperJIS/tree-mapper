## 🌲 Tree Mapper v2.6.1

Tree Mapper generates rich Markdown snapshots of your workspace directly from VS Code. Select exactly which files to include via an interactive file picker, and get a structured snapshot with a full project tree, language-aware code blocks, token count estimates, and more — saved to `.tree/` and ready to paste into any LLM context.

**Key features:**

* Interactive file picker with checkbox tree, filter search, select/deselect controls, and last-selection memory
* Dual tree sections — full workspace tree + snapshot-only tree
* Language-aware fenced code blocks for 60+ file types
* Token count estimate in every snapshot header
* Snapshot rotation — keeps only the N most recent snapshots
* Binary file detection and file size limits with a skipped files report
* Auto-updates `.gitignore` when a `.git` folder is detected
* Status bar item with live scan state

---

### What's new in v2.6.1

### Fixed

- **Old ignore list kept showing in Settings after upgrading** — before v2.6.0, the full ignore list was the default of `treemapper.defaultIgnorePatterns`, so editing it in the Settings UI (or clicking **Add Item**) saved a copy into your `settings.json`. That saved copy overrides the new `[]` default and survives uninstalling the extension. Tree Mapper now cleans it up automatically the first time it runs after updating.

### Added

- **Automatic cleanup of saved patterns** — when the extension activates (first command run in a session), entries in `treemapper.defaultIgnorePatterns` (User and Workspace) that duplicate the built-in list or each other are removed. The setting is rewritten only if something changed, and your own extra patterns are kept.

### Changed

- **Duplicate patterns are removed at runtime** — the merged built-in + user list is de-duplicated before scanning (last copy kept, so `.gitignore` last-match-wins behaviour is unchanged).

If you still see an old list after updating, run **Tree Mapper: Generate Snapshot** once, or use the gear icon → **Reset Setting**. See the [README](https://github.com/MrDeveloperJIS/tree-mapper#default-ignore-patterns) for details.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.6.1.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher