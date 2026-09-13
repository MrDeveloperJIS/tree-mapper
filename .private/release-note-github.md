## 🌲 Tree Mapper v2.6.0

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

### What's new in v2.6.0

### Fixed

- **`treemapper.defaultIgnorePatterns` could silently lose most of its secrets protection** — the ~60-pattern secrets/credentials ignore list added in v2.5.0 lived entirely in this one setting's default value. Because VS Code array settings are *replaced*, not merged, editing that setting through the graphical Settings UI (or missing that the list continued below the visible rows) could overwrite it with a much shorter list — quietly turning off protection for most sensitive file patterns with no warning.

### Changed

- **Built-in ignore list is now baked into the extension**, in a new `src/ignorePatterns.js` file (`BUILTIN_IGNORE_PATTERNS`), not stored as an editable setting default. `treemapper.defaultIgnorePatterns` now holds only your **own extra** patterns (default: `[]`) and is merged on top of the built-in list via `resolveIgnorePatterns(config)`, never replacing it. See the [README](https://github.com/MrDeveloperJIS/tree-mapper#default-ignore-patterns) for the full built-in list.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.6.0.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher