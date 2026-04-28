# Tree Mapper

> Snapshot any folder into a single Markdown file — full directory tree, every file's source, and an LLM-ready token count. One click.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/MrDeveloperJIS.tree-mapper?label=Marketplace&color=5b7cf6)](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/MrDeveloperJIS.tree-mapper?color=3dd68c)](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)
[![License: MIT](https://img.shields.io/badge/license-MIT-f59e0b)](LICENSE)

---

## What it does

Right-click any folder in VS Code's Explorer → **Tree Mapper: Generate Snapshot** → get a single `.md` file with everything inside:

- A **Workspace Tree** — full `├──` / `└──` view of the repository, matching what you see in the Explorer sidebar
- A **Snapshot Tree** — the same tree format, scoped to only the files you chose to include
- Every included file's source code in **language-aware fenced blocks** (60+ languages)
- A **snapshot header** with timestamp, file counts, total repo size, and estimated token count

Snapshots are saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` inside the `.tree` folder.

---

## Installation

**From the Marketplace** *(recommended)*

Open Extensions (`Ctrl+Shift+X`), search **Tree Mapper**, and click Install — or visit the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper) directly.

```
ext install MrDeveloperJIS.tree-mapper
```

**From a VSIX file**

Download from the [Releases page](https://github.com/MrDeveloperJIS/tree-mapper/releases), then:

- Extensions panel → `⋯` menu → **Install from VSIX…**
- Or via terminal: `code --install-extension path/to/tree-mapper-x.x.x.vsix`

---

## Usage

**Snapshot a folder**
Right-click any folder in the Explorer → **Tree Mapper: Generate Snapshot**

**Snapshot the workspace root**
`Ctrl+Shift+P` → **Tree Mapper: Generate Snapshot**

**From the status bar**
Click the **Tree Mapper** item in the bottom-right status bar — it shows live scan state and acts as a shortcut to the command.

After triggering, the **interactive file picker** opens. Confirm your selection and a snapshot is generated. A notification appears with an **Open File** button that auto-dismisses after 3 seconds.

---

## Interactive file picker

Before generating, Tree Mapper opens a full-screen webview panel with every file and folder rendered as a checkbox tree. Files matching `treemapper.defaultIgnorePatterns` start unchecked and are marked with an **excluded** badge — everything else is checked by default.

**Toolbar actions:**

| Action | Description |
|---|---|
| **Select all** | Check every file in the workspace |
| **Deselect all** | Uncheck everything |
| **Reset defaults** | Restore the default checked/unchecked state |
| **Restore last** | Re-apply the selection from your previous run *(appears when a saved selection exists)* |
| **Select filtered** | Check only the files currently visible in the search filter |
| **Filter** | Type to narrow the tree by filename or path |

**Other picker features:**

- **File-type colour icons** — each file shows a colour-coded icon based on its extension (JS, TS, CSS, JSON, Markdown, Python, Rust, Go, and more)
- **Indentation connector lines** — vertical guide lines between nesting levels for clear hierarchy
- **Auto-collapsed excluded dirs** — folders whose entire contents are excluded by default patterns start collapsed, reducing noise in large repos
- **Live file count** — the footer updates in real time as you check and uncheck files

The picker remembers your last selection per workspace root in `.tree/last-selection.json` and restores it automatically on next open.

---

## Output format

```
> **Generated:** 2026 04 28 06:50:41 PM UTC+6
> **Files included:** 12
> **Files skipped:** 1
> **Files excluded:** 345
> **Repo size:** 75.57 KB
> **Est. token count:** ~18,676 tokens
```

Followed by two tree sections and all included file contents in syntax-highlighted code blocks.

### Workspace Tree

Reflects the full repository structure, excluding paths matched by `treemapper.defaultIgnorePatterns`. This mirrors the Explorer sidebar regardless of what you chose to include in the snapshot.

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
| `treemapper.defaultIgnorePatterns` | `.tree/`, `node_modules/`, `.git/`, `dist/`, `build/`, `**/*.log` | Glob patterns unchecked by default in the file picker. Users can still check these individually. `.tree/` is always excluded and cannot be overridden. |

---

## Requirements

VS Code **1.85.0** or higher.

---

## License

MIT © MD. Jahidul Islam Sujan