## 🌲 Tree Mapper v2.8.0

Tree Mapper generates rich Markdown snapshots of your workspace directly from VS Code. Select exactly which files to include via an interactive file picker, and get a structured snapshot with a full project tree, language-aware code blocks, token count estimates, and more — saved to `.tree/` and ready to paste into any LLM context.

**Key features:**

* Interactive file picker with checkbox tree, filter search, select/deselect controls, and last-selection memory
* Select changed / Select staged — pick files straight from `git status`
* Presets — save and re-apply named selections
* `.gitignore` support — ignored files start unchecked and are hidden from the Workspace Tree
* Secret scan with `[REDACTED]` output — common keys, tokens, passwords and private keys are replaced in the snapshot (a safety net, not a guarantee)
* Show in Folder, Open File and Copy File buttons on the "Snapshot saved" notification
* Structure-only snapshots — generate with nothing selected to get just the project tree
* Dual tree sections — full workspace tree + snapshot-only tree
* Language-aware fenced code blocks for 60+ file types
* Token count estimate in every snapshot header
* Secret and credential files unchecked by default via a built-in ignore list
* Snapshot rotation — keeps only the N most recent snapshots
* Binary file detection and file size limits with a skipped files report
* Auto-updates `.gitignore` when a `.git` folder is detected
* Status bar item with live scan state
* Fully offline — no network calls, no new dependencies

---

### What's new in v2.8.0

### Added

- **Show in Folder and Copy File buttons** — The "Snapshot saved" notification now has **Show in Folder**, **Open File** and **Copy File**. **Copy File** copies the snapshot to the clipboard (only when you click it — nothing is copied automatically). **Show in Folder** opens the `.tree` folder in your OS file manager with the snapshot highlighted.
- **`.gitignore` support** — files matched by `.gitignore` (the scanned folder, its parents up to the repo root, and nested ones) start unchecked and are hidden from the Workspace Tree. Built-in secret protection can never be overridden by a `!` rule. New setting `treemapper.respectGitignore` (default `true`).
- **Secret scan and redaction** — files containing private keys, AWS / GitHub / Slack / Stripe / Google keys, JWTs, Bearer tokens or `password` / `token` / `api_key` assignments show a ⚠ badge and start unchecked. If you tick one anyway, matches are replaced with `[REDACTED]` and the header adds `Secrets redacted: N`. The secret value is never stored or sent to the picker. New setting `treemapper.redactSecrets` (default `true`).
- **Select changed / Select staged** — in a git repository, two new picker buttons replace the selection with the files from `git status` (modified, added, renamed and untracked / staged). Hidden when the folder isn't a git repo or `git` is missing.
- **Presets** — save the current selection under a name, then apply or delete it later from the picker. Stored in `.tree/presets.json`; overwriting asks for confirmation, and missing files are dropped and shown as `N missing`.

### Changed

- **The Workspace Tree hides exactly what the picker leaves unchecked by default**, including `.gitignore` matches.
- **The picker toolbar has a second row** for presets.

### Fixed

- **"Files excluded" counted skipped files twice** — binary and oversized files are now counted only under `Files skipped`.

See the [CHANGELOG](https://github.com/MrDeveloperJIS/tree-mapper/blob/HEAD/CHANGELOG.md) for the full list, including internal changes.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.8.0.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher