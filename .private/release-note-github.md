## 🌲 Tree Mapper v2.4.0

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

### What's new in v2.4.0

### Fixed

- **Picker hang on large workspaces** — "Select filtered" / "Deselect filtered" (and Select all / Reset defaults / Restore last) previously looked up each checkbox with a full-DOM `querySelector` scan, then re-walked every file's ancestor folders and rescanned their whole subtree to recompute checked/indeterminate state. On workspaces with thousands of files this was effectively O(n²)–O(n³) synchronous work on the webview thread and could freeze VS Code entirely. Checkboxes are now cached by path in a `Map` for O(1) lookup, and folder states are recomputed in a single O(n) bottom-up pass over the tree instead of per-file ancestor walks.

### Changed

- **Filtering now shows parent folders for context** — Typing a filter keyword previously hid any folder row whose own name didn't match, even if a file inside it matched — losing the path context for that match. Ancestor folders of a match are now always shown while filtering. Folders shown purely for this context have their checkbox hidden (they aren't a real selection target); folders that are themselves a direct match keep their checkbox as before.

### Internal

- **Split `extension.js`** — The webview's embedded HTML/CSS/JS (the file-picker UI: tree rendering, checkbox state, filtering, selection) has been moved out of `extension.js` and into a new `pickerHtml.js`, exporting `buildPickerHtml()`. `extension.js` now contains only the actual VS Code extension logic. No functional change.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.4.0.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher