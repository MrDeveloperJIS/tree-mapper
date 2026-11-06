# Tree Mapper — Release Guide

How to build and publish a new version to GitHub Releases.

---

## Every Release — 4 Steps

### Step 1 — Bump the version

In `package.json`, update the version number:

```json
"version": "x.x.x"
```

| Change type | When to use |
|-------------|-------------|
| `patch` — `1.0.0 → 1.0.1` | Bug fixes |
| `minor` — `1.0.0 → 1.1.0` | New features |
| `major` — `1.0.0 → 2.0.0` | Breaking changes |

Also update these files to match the new version:

- `CHANGELOG.md` — add a new entry at the top
- `README.md` — if settings or behaviour changed
- `.private/release-note-github.md` — rewrite "What's new" for this release and update the version in the title and `.vsix` name

---

### Step 2 — Test the extension and build the `.vsix`

```bash
npm install
```
```bash
npm test
```
```bash
npm run lint
```
```bash
vsce package
```

This creates `tree-mapper-x.x.x.vsix` in the project root.

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
4. Write release notes (copy the structure of `.private/release-note-github.md`)
5. Attach `tree-mapper-x.x.x.vsix`
6. Click **Publish release**

---