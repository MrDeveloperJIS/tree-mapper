# Built-in ignore patterns

Tree Mapper starts every run with a **built-in list** of files and folders that are **unchecked by default** in the file picker and left out of the snapshot's Workspace Tree. It covers build/VCS noise and, more importantly, common **secret and credential files**, so they don't end up in a snapshot just because they exist in your workspace.

This list is part of the extension. It is not a setting, so it can't be edited or accidentally shortened. To add your own patterns, see [Adding your own patterns](#adding-your-own-patterns).

> **This is a convenience default, not a secrets scanner.** It matches by file name and extension only. A file you check manually in the picker, or a secret hardcoded inside an ordinary source file, is still included.

## What's covered

| Category | Patterns |
|---|---|
| **Build & VCS noise** | `.tree/`, `node_modules/`, `.git/`, `dist/`, `build/`, `**/*.log` |
| **Env files** | `.env`, `.env.*` |
| **Env files kept** (re-included) | `!.env.example`, `!.env.*.example`, `!.env.sample` |
| **Keys & certificates** | `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `*.der` |
| **SSH** | `id_rsa`, `id_rsa.pub`, `id_ed25519`, `id_ed25519.pub`, `id_dsa`, `id_ecdsa`, `.ssh/` |
| **Package-manager & tool credentials** | `.npmrc`, `.yarnrc`, `.netrc`, `.git-credentials`, `.pgpass` |
| **Cloud & container credentials** | `.aws/`, `gcloud/`, `.gcloud/`, `.kube/`, `kubeconfig`, `*.kubeconfig`, `.docker/config.json` |
| **Credential JSON** | `credentials.json`, `*credentials*.json`, `*serviceAccount*.json`, `*service-account*.json` |
| **Infrastructure state** | `*.tfstate`, `*.tfstate.backup`, `.terraform/` |
| **Generic secrets** | `secrets.yml`, `secrets.yaml`, `secrets.json`, `*.secrets.*`, `.secret` |
| **Local databases** | `*.sqlite`, `*.sqlite3`, `*.db` |
| **Shell history** | `.bash_history`, `.zsh_history`, `.psql_history`, `*_history` |
| **Signing material** | `*.keystore`, `*.jks`, `*.mobileprovision` |

A few notes on why some entries exist:

- **`.env.example`-style files stay checked.** They're meant to be shared and are useful context. The `!` prefix re-includes them after `.env.*` unchecks everything else.
- **Terraform state** often contains secrets in plaintext.
- **`*_history`** is broad on purpose, to catch history files from tools not listed by name.

## Adding your own patterns

Add extra patterns with the `treemapper.defaultIgnorePatterns` setting. They are always merged **on top of** the built-in list, never in place of it:

```json
"treemapper.defaultIgnorePatterns": ["*.local.json", ".private/"]
```

- Patterns use [`.gitignore` syntax](https://git-scm.com/docs/gitignore#_pattern_format). The last matching pattern wins, and a leading `!` re-includes something an earlier pattern ignored.
- Duplicates, blanks, and entries already in the built-in list are removed automatically. Tree Mapper tidies your saved setting (User and Workspace) the first time you run it in a VS Code session.
- You can't remove a built-in pattern from the setting. To include a specific ignored file in one snapshot, just check it in the picker.

## Why it's not an editable setting

Before v2.6.0 this list was the default value of `treemapper.defaultIgnorePatterns`. VS Code replaces array settings rather than merging them, so editing a single entry in the Settings UI could silently save a much shorter list and disable most of the protection. Keeping the list built in avoids that.

If Settings still shows an old long list from before v2.6.0, it's a saved copy in your `settings.json`. Tree Mapper removes it automatically on first run after updating, or you can use the gear icon → **Reset Setting**.

---

<sub>For contributors: the list is defined as `BUILTIN_IGNORE_PATTERNS` in `src/ignorePatterns.js`. A test (`npm test`) fails if this page and that array drift apart.</sub>