## 🌲 Tree Mapper v2.9.0

Tree Mapper generates rich Markdown snapshots of your workspace directly from VS Code. Select exactly which files to include via an interactive file picker, and get a structured snapshot with a full project tree, language-aware code blocks, token count estimates, and more — saved to `.tree/` and ready to paste into any LLM context.

**Key features:**

* Interactive file picker with checkbox tree, filter search, select/deselect controls, and last-selection memory
* Select changed / Select staged — pick files straight from `git status`
* Presets — save and re-apply named selections
* `.gitignore` support — ignored files start unchecked and are listed in the Workspace Tree by name only
* Secret scan with `[REDACTED]` output — common keys, tokens, passwords and private keys are replaced in the snapshot (a safety net, not a guarantee)
* Show in Folder, Open File and Copy File buttons on the "Snapshot saved" notification
* Structure-only snapshots — generate with nothing selected to get just the project tree
* Dual tree sections — full workspace tree (ignored files and folders shown by name only) + snapshot-only tree
* Language-aware fenced code blocks for 60+ file types
* Token count estimate in every snapshot header
* Secret and credential files unchecked by default via a built-in ignore list
* Snapshot rotation — keeps only the N most recent snapshots
* Binary file detection and file size limits with a skipped files report
* Auto-updates `.gitignore` when a `.git` folder is detected
* Status bar item with live scan state
* Fully offline — no network calls, no new dependencies

---

### What's new in v2.9.0

### Changed

- **The Workspace Tree now lists ignored files and folders by name** — before, anything the picker leaves unchecked by default (`.env`, `*.pem`, `dist/`, `.gitignore` matches, …) disappeared from the tree, so you couldn't tell where a file lived. Now an ignored file is listed like any other file, and an ignored folder is listed as `name/` with nothing under it. Contents are still never included. This also covers `node_modules/` and `.git/` at any depth (the scan still never opens them). The tool's own `.tree/` folder is not listed.
- **Folders end with `/`** in both the Workspace Tree and the Snapshot Tree, and empty folders are now shown.

### Fixed

- **A file named `constructor`, `__proto__` or `toString`** could break tree rendering. The tree is now built with `Map`s.

See the [CHANGELOG](https://github.com/MrDeveloperJIS/tree-mapper/blob/HEAD/CHANGELOG.md) for the full list, including internal changes.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.9.0.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher