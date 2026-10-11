# Tree Mapper — Release Guide

How to build and publish a new version to GitHub Releases.

---

## Every Release — 4 Steps

### Step 1 — Bump the version

In `package.json`, update the version number:

```json
"version": "2.6.1"
```

| Change type | When to use |
|-------------|-------------|
| `patch` — `2.2.0 → 2.2.1` | Bug fixes |
| `minor` — `2.2.0 → 2.3.0` | New features |
| `major` — `2.2.0 → 3.0.0` | Breaking changes |

Also update these files to match the new version:

- `CHANGELOG.md` — add a new entry at the top
- `README.md` — if settings or behaviour changed
- `.private/release-note-github.md` — rewrite "What's new" for this release and update the version in the title and `.vsix` name

---

### Step 2 — Build the `.vsix`

```bash
npm install
```
```bash
vsce package
```

This creates `tree-mapper-x.x.x.vsix` in the project root.

**Test it before releasing:**

```bash
code --install-extension tree-mapper-x.x.x.vsix
```

Right-click a folder in the Explorer and confirm the snapshot generates correctly. Then uninstall:

```bash
code --uninstall-extension MrDeveloperJIS.tree-mapper
```

---

### Step 3 — Commit, tag, and push

```bash
git add .
git commit -m "release: vx.x.x"
git tag vx.x.x
git push origin main --tags
```

> Do not commit the `.vsix` file — it is in `.gitignore` and gets uploaded as a release asset instead.

---

### Step 4 — Publish on GitHub

1. Go to [github.com/MrDeveloperJIS/tree-mapper/releases](https://github.com/MrDeveloperJIS/tree-mapper/releases) → **Draft a new release**
2. Select tag `vx.x.x`
3. Set title: `Tree Mapper vx.x.x`
4. Write release notes (see template below)
5. Attach `tree-mapper-x.x.x.vsix`
6. Click **Publish release**

---