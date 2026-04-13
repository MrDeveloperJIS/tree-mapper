# Tree Mapper

Generate a complete Markdown snapshot of any folder in your VS Code workspace — including a full directory tree and every file's source code.

## Features

- 📁 **Full project tree** — CLI-style `├──` / `└──` hierarchy, directories first
- 📄 **All file contents** — Exact source code in language-aware fenced code blocks (60+ languages)
- 🖱️ **Right-click any folder** — Run directly from the Explorer context menu on any folder
- ⌨️ **Command Palette support** — Run from `Ctrl+Shift+P` to snapshot the workspace root
- 🚫 **Smart ignore** — `.treeignore` (gitignore-style) + always ignores `node_modules`, `.git`, `dist`, `build`, `*.log`
- ⚙️ **Auto-creates `.treeignore`** — Created in the target folder on first run if it doesn't exist
- 🔧 **Auto-updates `.gitignore`** — Adds `.tree/` and `.treeignore` to `.gitignore` automatically if a git repo is detected
- 🗂️ **Snapshot rotation** — Automatically keeps only the N most recent snapshots, deleting older ones
- 🔒 **Safe** — Skips binary files (null-byte detection) and oversized files automatically
- 🕐 **Local timestamps** — Snapshot header shows device local time with timezone (e.g. `UTC+6`)
- ⚡ **Fast** — Powered by `fast-glob`

## Usage

### From the Explorer (recommended)

Right-click any folder in the Explorer panel and select:
```
Tree Mapper: Generate Snapshot
```

The snapshot is scoped to that folder — only its contents are included.

### From the Command Palette

Press `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac) and run:
```
Tree Mapper: Generate Snapshot
```

This snapshots the entire workspace root.

### Output

Snapshots are saved to `.tree/yyyy-mm-dd-hh-mm-ss.md` inside the target folder. After generation, a notification appears with an **Open File** button to view it immediately.

## Output Format

Each snapshot contains:

1. **Metadata header** — timestamp (local time + timezone), file count, total repo size
2. **Project tree** — full CLI-style directory hierarchy
3. **File contents** — every included file with its source in a fenced code block

Example header:

```
> **Generated:** 2026 04 11 11:49:10 PM UTC+6
> **Files included:** 14
> **Repo size:** 48.30 KB
```

## Ignore Rules

Create a `.treeignore` file in your project root using standard gitignore syntax:

```
.env
secrets/
private/*
*.lock
```

These patterns are always ignored regardless of `.treeignore`:

| Pattern | Reason |
|---------|--------|
| `node_modules/**` | Dependencies |
| `.git/**` | Version control |
| `dist/**`, `build/**` | Build output |
| `**/*.log` | Log files |
| `.tree/**` | Snapshot output folder |
| `.treeignore` | Ignore rules file |

## Git Integration

If a `.git` folder is detected in the target root, Tree Mapper automatically updates `.gitignore` to include:

```
# Tree Mapper
.tree/
.treeignore
```

- **`.gitignore` doesn't exist?** — It will be created automatically
- **One entry already present?** — Only the missing one is added, no duplicates
- **Both already present?** — Nothing is touched

Entries are matched by exact line to avoid false positives from similar names like `.treeignore-backup`.

## Settings

Open VS Code Settings (`Ctrl+,`) and search for **Tree Mapper**:

| Setting | Default | Description |
|---------|---------|-------------|
| `treemapper.maxFileSizeKB` | `2048` | Skip files larger than this size in KB. Skipped files are not counted in repo size. |
| `treemapper.keepLastSnapshots` | `10` | Number of recent snapshots to keep in `.tree/`. Oldest are deleted automatically after each run. |
| `treemapper.defaultIgnorePatterns` | *(see below)* | Patterns written into `.treeignore` when it is first created. Has no effect once `.treeignore` already exists — edit that file directly instead. |

**Default ignore patterns** (written to `.treeignore` on first run):

```
.tree/
.treeignore
node_modules/
.git/
dist/
build/
**/*.log
```

## Installation

### From the Marketplace (recommended)

1. Open the **Extensions** panel in VS Code (`Ctrl+Shift+X`)
2. Search for **Tree Mapper**
3. Click **Install**

Or install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper).

You can also use the VS Code Quick Open (`Ctrl+P`) and paste:
```
ext install MrDeveloperJIS.tree-mapper
```

### From a VSIX file

1. Download `tree-mapper-x.x.x.vsix` from the [Releases page](https://github.com/MrDeveloperJIS/tree-mapper/releases)

**Via VS Code UI:**

2. Open the **Extensions** panel (`Ctrl+Shift+X`)
3. Click the `⋯` menu → **Install from VSIX…**
4. Select the downloaded file and reload VS Code

**Via terminal** (after downloading):

```bash
code --install-extension path/to/tree-mapper-x.x.x.vsix
```

## Requirements

- VS Code 1.85.0 or higher

## License

MIT