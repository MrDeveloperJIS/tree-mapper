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

---

## Interactive file picker

Before generating, Tree Mapper opens a full-screen webview panel with every file and folder rendered as a checkbox tree. Files matching the [built-in ignore list](#default-ignore-patterns) (defined in [`Ignore Patterns`](src/ignorePatterns.js), not a setting) — plus anything you've added via `treemapper.defaultIgnorePatterns` — start unchecked and are marked with an **excluded** badge. Everything else is checked by default.

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
- **Fast on large workspaces** — checkbox lookups and bulk selection changes (Select all, Select/Deselect filtered, Reset defaults, Restore last) are O(1)/O(n), so the picker stays responsive even on workspaces with thousands of files

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

Followed by five sections, in this order: `Index`, `Workspace Tree`, `Snapshot Tree`, `Skipped Files` (when applicable), and `File Contents`.

### Index

Links to every section present in the snapshot (`Workspace Tree`, `Snapshot Tree`, `Skipped Files` when there are any, `File Contents`) so you can jump straight to the part you need.

### Workspace Tree

Reflects the full repository structure, excluding paths matched by the [built-in ignore list](#default-ignore-patterns) in `src/ignorePatterns.js` and anything added via `treemapper.defaultIgnorePatterns`. This mirrors the Explorer sidebar regardless of what you chose to include in the snapshot.

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

All links are plain markdown heading anchors (no HTML), generated and de-duplicated the same way GitHub and VS Code's Markdown preview do, so they work in any standard Markdown viewer.

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
| `treemapper.defaultIgnorePatterns` | `[]` | Your **own extra** glob patterns to unchecked by default in the file picker, on top of the built-in secrets/credentials list in [`ignore patterns file`](src/ignorePatterns.js) (see below). `.tree/` and the built-in list are always excluded and can't be turned off from here. |

### Default ignore patterns

Beyond the usual build/VCS noise (`.tree/`, `node_modules/`, `.git/`, `dist/`, `build/`, `**/*.log`), Tree Mapper always unchecks a **built-in** list of common secret and credential files, defined in [`ignore patterns file`](src/ignorePatterns.js) as `BUILTIN_IGNORE_PATTERNS`, so they aren't accidentally included in a snapshot just because they exist in the workspace:

- **Env files** — `.env`, `.env.*` (`.env.example` / `.env.*.example` / `.env.sample` stay checked, since these are meant to be shared)
- **Keys & certs** — `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `*.der`, SSH keys (`id_rsa`, `id_ed25519`, `id_dsa`, `id_ecdsa` and `.pub` variants), `.ssh/`
- **Cloud & tool credentials** — `.aws/`, `.npmrc`, `.yarnrc`, `.netrc`, `.git-credentials`, `.pgpass`, `.docker/config.json`, `.kube/`, `kubeconfig`, `gcloud/`, `*credentials*.json`, `*serviceAccount*.json`
- **Infra state** — `*.tfstate`, `*.tfstate.backup`, `.terraform/` (Terraform state often contains plaintext secrets)
- **Generic secrets** — `secrets.yml`, `secrets.yaml`, `secrets.json`, `*.secrets.*`, `.secret`
- **Databases & shell history** — `*.sqlite`, `*.sqlite3`, `*.db`, `.bash_history`, `.zsh_history`, `.psql_history`, `*_history`
- **Signing material** — `*.keystore`, `*.jks`, `*.mobileprovision`

This is a convenience default, not a secrets scanner — it only unchecks files by name/extension, so anything checked manually in the picker (or a secret hardcoded inside an ordinary source file) is still included.

This list lives in **`src/ignorePatterns.js`**, baked into the extension's code — not a setting you can edit or shrink. As of v2.6.0 it's no longer stored as an overridable array in `treemapper.defaultIgnorePatterns`, since a plain array-of-strings setting like that is always *replaced* rather than merged by VS Code, and the list had grown long enough that partially editing it in the Settings UI could silently drop most of the protection without anyone noticing.

`extension.js` merges the two via `resolveIgnorePatterns(config)`, exported from `src/ignorePatterns.js` — your setting is always concatenated on top of `BUILTIN_IGNORE_PATTERNS`, never replacing it.

If you want to unchecked additional files of your own — on top of, never instead of, the list in `src/ignorePatterns.js` — add them to `treemapper.defaultIgnorePatterns`:

```json
"treemapper.defaultIgnorePatterns": ["*.local.json", "scratch/"]
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

## License

MIT © MD. Jahidul Islam Sujan