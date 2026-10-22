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
- Or, if you select no files, a lightweight **structure-only** snapshot containing just the project tree

Snapshots are saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` inside the `.tree` folder.

---

## Usage

**Snapshot a folder**
Right-click any folder in the Explorer → **Tree Mapper: Generate Snapshot**

**Snapshot the workspace root**
`Ctrl+Shift+P` → **Tree Mapper: Generate Snapshot**

**From the status bar**
Click the **Tree Mapper** item in the bottom-right status bar — it shows live scan state and acts as a shortcut to the command.

After triggering, the **interactive file picker** opens. Confirm your selection and a snapshot is generated. A notification appears with an **Open File** button.

In a **multi-root workspace**, running the command from the Command Palette or status bar asks which workspace folder to snapshot. Right-clicking a folder in the Explorer always uses that folder.

---

## Interactive file picker

Before generating, Tree Mapper opens a full-screen webview panel with every file and folder rendered as a checkbox tree. Files matching the [built-in ignore list](#default-ignore-patterns) (see [built-in ignore patterns](docs/IGNORE_PATTERNS.md)) — plus anything you've added via `treemapper.defaultIgnorePatterns` — start unchecked and are marked with an **excluded** badge. Everything else is checked by default. `node_modules/`, `.git/` and `.tree/` are skipped during the scan itself, so they never appear in the picker and large repos open quickly.

The picker is fully offline: it loads no fonts or other network resources, uses your VS Code fonts, and runs under a strict Content-Security-Policy.

**Toolbar actions:**

| Action | Description |
|---|---|
| **Select all** | Check every file in the workspace |
| **Deselect all** | Uncheck everything |
| **Reset defaults** | Restore the default checked/unchecked state |
| **Restore last** | Re-apply the selection from your previous run *(appears when a saved selection exists)* |
| **Select filtered** | Check only the files currently visible in the search filter |
| **Deselect filtered** | Uncheck only the files currently visible in the search filter |
| **Filter** | Type to narrow the tree by filename or path. Matching folders and files keep their checkbox; parent folders shown only to give a match context (not matched themselves) are still visible but their checkbox is hidden |

**Other picker features:**

- **Indentation connector lines** — vertical guide lines between nesting levels for clear hierarchy
- **Auto-collapsed excluded dirs** — folders whose entire contents are excluded by the ignore list start collapsed, reducing noise in large repos
- **Live file count** — the footer updates in real time as you check and uncheck files
- **Structure-only mode** — uncheck everything (or use **Deselect all**) and the button changes to **Generate Structure Only**
- **Fast on large workspaces** — checkbox lookups and bulk selection changes (Select all, Select/Deselect filtered, Reset defaults, Restore last) are O(1)/O(n), so the picker stays responsive even on workspaces with thousands of files

The picker remembers your last selection per workspace root in `.tree/last-selection.json` and restores it automatically on next open.

---

## Output format

> **Generated:** 2026 04 28 06:50:41 PM UTC+6  
> **Files included:** 12  
> **Files skipped:** 1  
> **Files excluded:** 345  
> **Repo size:** 75.57 KB  
> **Est. token count:** ~18,676 tokens 

Followed by the sections below, in this order: `Index`, `Workspace Tree`, `Snapshot Tree`, `Skipped Files` (when applicable), and `File Contents`.

### Index

Links to every section present in the snapshot (`Workspace Tree`, `Snapshot Tree`, `Skipped Files` when there are any, `File Contents`) so you can jump straight to the part you need.

### Workspace Tree

Reflects the full repository structure, excluding paths matched by the [built-in ignore list](docs/IGNORE_PATTERNS.md) and anything added via `treemapper.defaultIgnorePatterns`. This mirrors the Explorer sidebar regardless of what you chose to include in the snapshot.

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

If a file was selected in the picker but couldn't be read (binary content, or size exceeding `treemapper.maxFileSizeKB`), a `## Skipped Files` section appears in the snapshot with the filename and reason. The header separately reports `Files skipped` and `Files excluded` (user-unchecked).

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

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `treemapper.maxFileSizeKB` | `2048` | Files larger than this (in KB) are excluded from snapshot contents even if checked in the picker. They appear in the `Files skipped` count. |
| `treemapper.keepLastSnapshots` | `10` | Number of recent snapshots to retain in `.tree/`. Oldest are deleted automatically after each run. |
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

VS Code **1.85.0** or higher.

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