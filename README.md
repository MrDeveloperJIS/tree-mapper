# Tree Mapper

> Snapshot any folder into a single Markdown file — full directory tree, every file's source, and an LLM-ready token count. One click.

---

## What it does

Right-click any folder in VS Code's Explorer → **Tree Mapper: Generate Snapshot** → get a single `.md` file with everything inside:

- An **Index** linking to every section, plus a clickable **file jump-list** so you can find a specific file instantly even in large snapshots
- A **Workspace Tree** — full `├──` / `└──` view of the repository, matching what you see in the Explorer sidebar
- A **Snapshot Tree** — the same tree format, scoped to only the files you chose to include
- Every included file's source code in **language-aware fenced blocks** (60+ languages), each followed by a **Back to top** link
- A **snapshot header** with timestamp, file counts, total repo size, and estimated token count
- **Secrets redacted** — API keys, tokens and private keys found in the files you include are replaced with `[REDACTED]`
- Or, if you select no files, a lightweight **structure-only** snapshot containing just the project tree

Snapshots are saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` (inside the `.tree` folder). Everything runs locally — no network calls.

---

## Usage

**Snapshot a folder**
Right-click any folder in the Explorer → **Tree Mapper: Generate Snapshot**

**Snapshot the workspace root**
`Ctrl+Shift+P` → **Tree Mapper: Generate Snapshot**

**From the status bar**
Click the **Tree Mapper** item in the bottom-right status bar — it shows live scan state and acts as a shortcut to the command.

After triggering, the **interactive file picker** opens. Confirm your selection and a snapshot is generated. A notification appears with **Show in Folder**, **Open File** and **Copy File** buttons.

In a **multi-root workspace**, running the command from the Command Palette or status bar asks which workspace folder to snapshot. Right-clicking a folder in the Explorer always uses that folder.

### Notification buttons

When a snapshot is saved, the notification offers three buttons:

| Button | What it does |
|---|---|
| **Show in Folder** | Opens the `.tree` folder in your OS file manager with the snapshot highlighted |
| **Open File** | Opens the snapshot in the editor |
| **Copy File** | Copies the snapshot's content to the clipboard (a short "Copied to clipboard" message confirms it) |

Nothing is copied automatically — the clipboard is only touched when you click **Copy File**. The buttons work for structure-only snapshots too, and are not shown if the file could not be written.

---

## Interactive file picker

Before generating, Tree Mapper opens a full-screen webview panel with every file and folder rendered as a checkbox tree. These start unchecked:

- files matching your [`.gitignore`](#gitignore-support) files,
- files matching the [built-in ignore list](#default-ignore-patterns) (see [built-in ignore patterns](docs/IGNORE_PATTERNS.md)) — plus anything you've added via `treemapper.defaultIgnorePatterns` — marked with an **excluded** badge,
- files where a [possible secret](#secret-scan-and-redaction) was found, marked with a **⚠** badge.

Everything else is checked by default. `node_modules/`, `.git/` and `.tree/` are skipped during the scan itself, so they never appear in the picker and large repos open quickly.

The picker is fully offline: it loads no fonts or other network resources, uses your VS Code fonts, and runs under a restrictive Content-Security-Policy that blocks all network access.

**Toolbar actions:**

| Action | Description |
|---|---|
| **Select all** | Check every file in the workspace |
| **Deselect all** | Uncheck everything |
| **Reset defaults** | Restore the default checked/unchecked state |
| **Restore last** | Re-apply the selection from your previous run *(appears when a saved selection exists)* |
| **Select changed** | Replace the selection with the files `git status` reports as modified, added, renamed or untracked *(shown only when there are changed files; shows the file count)* |
| **Select staged** | Replace the selection with the files staged in git *(shown only when there are staged files; shows the file count)* |
| **Select filtered** | Check only the files currently visible in the search filter |
| **Deselect filtered** | Uncheck only the files currently visible in the search filter |
| **Reload icon** *(top right of the picker)* | Rescan the project without closing the picker: picks up new and deleted files, `.gitignore` edits, `git status` changes and presets. Your current selection is kept; new files get their default state |
| **Filter** | Type to narrow the tree by filename or path. Matching folders and files keep their checkbox; parent folders shown only to give a match context (not matched themselves) are still visible but their checkbox is hidden |

**Presets (toolbar):**

| Action | Description |
|---|---|
| **Presets ▾** | Dropdown listing your saved presets (with file counts). Clicking one checks exactly its files. The last item, **Manage Presets**, opens a second row |
| **Manage Presets row** | Shows every preset with a ✕ to delete it (asks **Yes / No** first), plus **+ New preset** and **Done** |
| **+ New preset** | Reveals a name box with **Save** and **Cancel**. The box is hidden and cleared again after saving (confirms before overwriting) |

**Other picker features:**

- **Indentation connector lines** — vertical guide lines between nesting levels for clear hierarchy
- **Auto-collapsed excluded dirs** — folders whose entire contents are excluded by the ignore list start collapsed, reducing noise in large repos
- **Live file count** — the footer updates in real time as you check and uncheck files
- **Structure-only mode** — uncheck everything (or use **Deselect all**) and the button changes to **Generate Structure Only**
- **Fast on large workspaces** — checkbox lookups and bulk selection changes (Select all, Select/Deselect filtered, Reset defaults, Restore last, Select changed/staged, choose a preset) are O(1)/O(n), so the picker stays responsive even on workspaces with thousands of files

The picker remembers your last selection per workspace root in `.tree/last-selection.json` and restores it automatically on next open.

### Git changes selection

In a git repository, **Select changed** and **Select staged** pick files straight from `git status`, so you can snapshot "what I'm working on" in one click.

- **Changed** = modified + added + renamed (new path) + untracked. **Staged** = files staged in the index.
- Paths are converted to the folder you're snapshotting; deleted files and files outside that folder are left out.
- Default-ignored files (including `.gitignore` matches and secret-protected files), binary/oversized files and files with a possible secret (⚠) are never selected this way.
- It uses only local `git` with a 5-second timeout. If the folder isn't a git repo, or `git` isn't installed, the buttons are simply hidden — no error popup. A button is also hidden while it has nothing to select (no changed files, or no staged files), and it comes back after a rescan if that changes.

### Presets

Save a selection you use often (for example "frontend" or "auth flow") and bring it back later.

- Presets live in `.tree/presets.json`: `{ "version": 1, "presets": { "frontend": ["src/a.js"] } }`.
- Open **Presets ▾** and choose **Manage Presets**, then **+ New preset**, type a name and click **Save** to store the currently checked files. Names are trimmed and limited to 60 characters; saving over an existing name asks for confirmation. The name box only appears while you create a preset and is cleared after saving.
- Choosing a preset in the **Presets ▾** dropdown checks exactly its files. Files that no longer exist are dropped and shown once as `N missing`.
- In the **Manage Presets** row, click ✕ on a preset and confirm with **Yes** to delete it.
- Saves are atomic (temp file → rename). A corrupt `presets.json` is treated as empty.

---

## `.gitignore` support

Tree Mapper reads your `.gitignore` files so the picker and the Workspace Tree match what git ignores:

- It collects the `.gitignore` of the scanned folder, its parent folders up to the repo root (the folder with `.git`), and nested ones inside.
- Each `.gitignore` applies only to paths under its own folder, matched relative to that folder. `!` negation works as in git.
- Ignored files start **unchecked** in the picker (same as built-in ignores) and are hidden from the Workspace Tree.
- Rules are applied in this order, last match wins: `.gitignore` → built-in list → your `treemapper.defaultIgnorePatterns`. So a `!` line in a `.gitignore` can never re-include a protected secret file.
- An unreadable `.gitignore` is skipped silently.

Turn it off with `treemapper.respectGitignore` (default `true`).

---

## Secret scan and redaction

Text files (within the size limit, and not already default-ignored) are scanned locally with regex rules for:

- private key blocks,
- AWS access keys (`AKIA…`), GitHub tokens (`ghp_…`, `github_pat_…`), Slack tokens (`xox…`), Stripe live keys (`sk_live_…`), Google API keys (`AIza…`),
- JWT-like tokens (`eyJ….….…`) and `Bearer <token>` values,
- URL credentials (`postgres://user:PASSWORD@host`) and AWS secret access keys,
- `password` / `secret` / `token` / `api_key` assignments with a real-looking value, quoted (`api_key = "…"`) or unquoted on a line of its own (`DB_PASSWORD=…` in `.env` / YAML files; unquoted values must contain a digit). Placeholders such as `your_key_here`, `xxx`, `changeme` and `process.env.X` are ignored.

What happens next:

- A file with findings shows a ⚠ badge (the tooltip lists the rule names) and starts **unchecked**.
- If you tick it anyway and `treemapper.redactSecrets` is `true` (the default), each match is replaced with `[REDACTED]` in the snapshot and the header adds `Secrets redacted: N`.
- The token estimate and code fences are computed on the redacted text.
- Only the number of findings and the rule names are kept in memory — the secret value is never stored and never sent to the picker.

This is a safety net, not a guarantee: regex rules can miss secrets in unusual formats, so review a snapshot before sharing it.

---

## Output format

> **Generated:** 2026 04 28 06:50:41 PM UTC+6  
> **Files included:** 12  
> **Files skipped:** 1  
> **Files excluded:** 345  
> **Secrets redacted:** 2  
> **Repo size:** 75.57 KB  
> **Est. token count:** ~18,676 tokens 

`Files skipped`, `Files excluded` and `Secrets redacted` only appear when they are above zero. Followed by the sections below, in this order: `Index`, `Workspace Tree`, `Snapshot Tree`, `Skipped Files` (when applicable), and `File Contents`.

### Index

Links to every section present in the snapshot (`Workspace Tree`, `Snapshot Tree`, `Skipped Files` when there are any, `File Contents`) so you can jump straight to the part you need.

### Workspace Tree

Reflects the full repository structure, excluding paths matched by your `.gitignore` files, the [built-in ignore list](docs/IGNORE_PATTERNS.md) and anything added via `treemapper.defaultIgnorePatterns`. It hides exactly the files the picker leaves unchecked by default, regardless of what you chose to include in the snapshot.

```
my-project/
├── src/
│   ├── index.ts
│   └── utils.ts
├── package.json
└── README.md
```

### Snapshot Tree

Shows only the files actually included in this snapshot run — the subset you confirmed in the picker.

### Skipped files

If a file was selected in the picker but couldn't be read (binary content, or size exceeding `treemapper.maxFileSizeKB`), a `## Skipped Files` section appears in the snapshot with the filename and reason. The header separately reports `Files skipped` and `Files excluded` (user-unchecked); a skipped file is counted only under `Files skipped`.

### File Contents

Right after the `## File Contents` heading, a clickable list of every included file links to that file's section further down — useful for jumping straight to a specific file in a snapshot with many of them, without scrolling through the tree. Each file's code block is followed by a **Back to top** link that returns you to this list.

All links are plain markdown heading anchors (no HTML), generated and de-duplicated the same way GitHub and VS Code's Markdown preview do — including non-English file names, whose letters are kept — so they work in any standard Markdown viewer.

### Structure-only snapshot

If you generate with **no files selected**, the snapshot contains only a `# Project Structure` title and the project tree (the same tree as the Workspace Tree, excluding default-ignored paths) — no header stats, index, or file contents. An empty selection is not saved as your "last selection", so **Restore last** still brings back your previous real selection.

### Code fences

Each file's source is wrapped in a fenced code block. If a file itself contains fences (every README, for example), the snapshot uses a longer fence — one backtick more than the longest run of backticks in that file — so the contents can never close the block early.

### Token estimate

The `Est. token count` field uses a ~4 chars/token approximation — useful for gauging how much context window space a snapshot will consume before pasting it into an LLM.

---

## Git integration

When a `.git` folder is detected, Tree Mapper automatically adds `.tree/` to your `.gitignore` under a `# Tree Mapper` comment block. Only missing entries are added — no duplicates, no false positives.

Because `.tree/` is ignored, your snapshots, `last-selection.json` and `presets.json` stay out of commits. See also [Git changes selection](#git-changes-selection) and [`.gitignore` support](#gitignore-support).

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `treemapper.maxFileSizeKB` | `2048` | Files larger than this (in KB) are excluded from snapshot contents even if checked in the picker. They appear in the `Files skipped` count. |
| `treemapper.keepLastSnapshots` | `10` | Number of recent snapshots to retain in `.tree/`. Oldest are deleted automatically after each run. |
| `treemapper.respectGitignore` | `true` | Uncheck files matched by `.gitignore` (the scanned folder, its parents up to the repo root, and nested `.gitignore` files) in the picker and hide them from the Workspace Tree. Built-in secret protection always stays on. |
| `treemapper.redactSecrets` | `true` | Replace detected secrets with `[REDACTED]` in the snapshot, even if you tick the file. Files with findings start unchecked and show a ⚠ badge. |
| `treemapper.defaultIgnorePatterns` | `[]` | Your **own extra** glob patterns to uncheck by default in the file picker, on top of the built-in secrets/credentials list in [built-in list](docs/IGNORE_PATTERNS.md). `.tree/` and the built-in list are always excluded and can't be turned off from here. Duplicates and entries already in the built-in list are removed automatically. |

### Default ignore patterns

Tree Mapper always unchecks a built-in list of build/VCS noise and common secret and credential files (`.env`, private keys, cloud credentials, Terraform state and more). See the [full list of built-in ignore patterns](docs/IGNORE_PATTERNS.md).

To add your own, use `treemapper.defaultIgnorePatterns`. Your patterns are always merged on top of the built-in list, never in place of it:

```json
"treemapper.defaultIgnorePatterns": ["*.local.json", ".private/"]
```

---

## Installation

**From the Marketplace** *(recommended)*

Open Extensions (`Ctrl+Shift+X`), search **Tree Mapper**, and click Install — or visit the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper) directly.

```
ext install MrDeveloperJIS.tree-mapper
```

**From a VSIX file**

Download from the [Releases page](https://github.com/MrDeveloperJIS/tree-mapper/releases/latest), then:

- Extensions panel → `⋯` menu → **Install from VSIX…**
- Or via terminal: `code --install-extension path/to/tree-mapper-x.x.x.vsix`

---

## Requirements

VS Code **1.85.0** or higher. Git is optional — it is only needed for the **Select changed** / **Select staged** buttons.

---

## Development

```
npm install
npm test        # unit tests (node:test)
npm run lint    # ESLint
```

Press **F5** in VS Code to launch an Extension Development Host.

---

## License

MIT © MD. Jahidul Islam Sujan