## 🌲 Tree Mapper v2.5.0

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

### What's new in v2.5.0

### Added

- **Secret and credential files excluded by default** — `treemapper.defaultIgnorePatterns` now unchecks common sensitive files out of the box, not just build/VCS noise. Covers env files (`.env`, `.env.*`, with `.env.example`-style files re-included), keys and certs (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.crt`, `*.cer`, `*.der`, SSH keys), cloud/tool credentials (`.aws/`, `.npmrc`, `.netrc`, `.git-credentials`, `.pgpass`, `.docker/config.json`, `.kube/`, `gcloud/`, generic `*credentials*.json` / `*serviceAccount*.json`), Terraform state (`*.tfstate`, `.terraform/`), generic `secrets.*` files, local databases (`*.sqlite`, `*.db`), shell history files, and signing material (`*.keystore`, `*.jks`, `*.mobileprovision`). Existing custom values for this setting are unaffected — this only changes the shipped default. See the README for the full list and rationale.

---

### 📦 Installation

**Via VSIX (this page):**
1. Download `tree-mapper-2.5.0.vsix` below
2. Extensions panel (`Ctrl+Shift+X`) → **⋯ menu** → **Install from VSIX…**
3. Select the file and reload VS Code

**Prefer the Marketplace instead?** [Install Tree Mapper](https://marketplace.visualstudio.com/items?itemName=MrDeveloperJIS.tree-mapper)

---

**Requirements:** VS Code 1.85.0 or higher