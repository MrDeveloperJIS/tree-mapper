'use strict';

const { resolvePreset } = require('./presets');

/**
 * JSON that is safe to embed inside an inline <script>. Plain JSON.stringify
 * does not escape "</script>" (a file could be named that), nor the U+2028 /
 * U+2029 line separators.
 */
function safeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/** Escapes text for use inside HTML element content or a quoted attribute. */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * @param {object[]} treeNodes
 * @param {string}   projectName
 * @param {string[]|null} lastSelection
 * @param {{ changed: string[], staged: string[] }|null} [gitChanges]
 *        Scanned-folder-relative paths. null → not a git repo (buttons hidden).
 * @param {{ name: string, files: string[] }[]} [presets]  saved selections
 */
function buildPickerHtml(treeNodes, projectName, lastSelection, gitChanges, presets) {
    const treeJson = safeJson(treeNodes);
    const lastSelectionJson = safeJson(lastSelection || null);
    const gitChangesJson = safeJson(gitChanges || null);
    const presetsJson = safeJson(Array.isArray(presets) ? presets : []);
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Tree Mapper</title>
<style>
  :root {
    --bg:           #080810;
    --bg-panel:     #0c0c18;
    --bg-input:     #111120;
    --bg-hover:     #13132a;
    --bg-glass:     rgba(255,255,255,0.04);
    --border:       rgba(255,255,255,0.07);
    --border-soft:  rgba(255,255,255,0.05);

    --fg:           #eeeef8;
    --fg-dim:       #6464a0;
    --fg-muted:     #2e2e50;

    /* Vivid violet-to-cyan gradient accent */
    --accent:       #7c5cfc;
    --accent-end:   #22d3ee;
    --accent-fg:    #fff;
    --accent-dim:   rgba(124,92,252,0.12);
    --accent-glow:  rgba(124,92,252,0.35);
    --accent-line:  rgba(124,92,252,0.4);

    --success:      #00e5a0;
    --success-dim:  rgba(0,229,160,0.1);
    --success-glow: rgba(0,229,160,0.3);

    --danger:       #ff5f87;
    --danger-dim:   rgba(255,95,135,0.1);
    --danger-line:  rgba(255,95,135,0.3);

    --amber:        #fbbf24;

    --mono:         var(--vscode-editor-font-family, 'SF Mono', 'Cascadia Code', Consolas, monospace);
    --sans:         var(--vscode-font-family, system-ui, -apple-system, 'Segoe UI', sans-serif);
    --radius:       8px;
    --radius-lg:    12px;
    --radius-pill:  99px;
    --ease:         cubic-bezier(0.16, 1, 0.3, 1);
    --t:            0.18s;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--sans);
    font-size: 13px;
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ─── Ambient mesh background ────────────────────────────────────────── */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 40% at 20% 0%, rgba(124,92,252,0.12) 0%, transparent 70%),
      radial-gradient(ellipse 50% 30% at 80% 100%, rgba(34,211,238,0.07) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  /* ─── Header ─────────────────────────────────────────────────────────── */
  .header {
    position: relative;
    z-index: 1;
    background: rgba(12,12,24,0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 13px 20px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideDown 0.4s var(--ease) both;
  }

  .header::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(124,92,252,0.6) 40%, rgba(34,211,238,0.4) 60%, transparent);
  }

  .header-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  box-shadow: 0 0 18px rgba(82,232,154,0.3), 0 2px 8px rgba(0,0,0,0.4);
}
  .header-icon svg { width: 32px; height: 32px; }

  .header-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
    letter-spacing: -0.02em;
    line-height: 1;
    margin-bottom: 4px;
  }
  .header-sub {
    font-size: 11px;
    color: var(--fg-dim);
    font-family: var(--mono);
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .project-chip {
    background: linear-gradient(90deg, rgba(124,92,252,0.18), rgba(34,211,238,0.12));
    border: 1px solid rgba(124,92,252,0.45);
    border-radius: var(--radius-pill);
    padding: 1px 9px;
    font-size: 10.5px;
    color: #a78bfa;
    letter-spacing: 0.01em;
    font-weight: 500;
  }
  .header-hint { color: var(--fg-dim); font-size: 10.5px; }
  .header-text { min-width: 0; }

  /* Reload (rescan) button on the right side of the header */
  .icon-btn {
    margin-left: auto;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--bg-glass);
    color: var(--fg-dim);
    border: 1px solid var(--border);
    border-radius: 50%;
    cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t), transform var(--t);
  }
  .icon-btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; }
  .icon-btn:hover:not(:disabled), .icon-btn:focus-visible {
    color: var(--fg);
    border-color: rgba(124,92,252,0.5);
    background: rgba(255,255,255,0.07);
    outline: none;
  }
  .icon-btn:disabled { cursor: default; opacity: 0.7; }
  .icon-btn.spinning svg { animation: spin 0.8s linear infinite; }

  /* ─── Toolbar ────────────────────────────────────────────────────────── */
  .toolbar {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    background: rgba(11,11,22,0.7);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    animation: slideDown 0.4s 0.05s var(--ease) both;
  }

  .btn-ghost {
    background: var(--bg-glass);
    color: var(--fg-dim);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 4px 12px;
    font-size: 11px;
    font-family: var(--sans);
    font-weight: 500;
    cursor: pointer;
    letter-spacing: 0.01em;
    transition: color var(--t), border-color var(--t), background var(--t), box-shadow var(--t), transform var(--t);
    white-space: nowrap;
    line-height: 1.7;
  }
  .btn-ghost:hover {
    color: var(--fg);
    border-color: rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.07);
    transform: translateY(-1px);
  }
  .btn-ghost:active { transform: scale(0.96) translateY(0); }
  .btn-ghost:disabled { opacity: 0.4; cursor: default; pointer-events: none; }

  /* ─── Presets: dropdown in the first row + "Manage presets" second row ── */
  .menu-wrap { position: relative; display: inline-flex; }
  .btn-ghost .caret { font-size: 9px; margin-left: 3px; opacity: 0.7; }
  .btn-ghost .count-badge {
    margin-left: 5px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--accent-dim);
    color: #a78bfa;
    font-family: var(--mono);
    font-size: 10px;
  }

  .preset-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 40;
    min-width: 220px;
    max-width: min(340px, calc(100vw - 28px));
    max-height: 280px;
    overflow-y: auto;
    padding: 4px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.55);
  }
  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 6px 10px;
    text-align: left;
    cursor: pointer;
    transition: background var(--t);
  }
  .preset-item:hover, .preset-item:focus-visible { background: var(--bg-hover); outline: none; }
  .preset-item .p-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preset-item .p-count { color: var(--fg-dim); font-size: 10.5px; flex-shrink: 0; }
  .preset-item.manage { color: #a78bfa; }
  .preset-menu-empty {
    padding: 6px 10px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg-dim);
  }
  .preset-menu-divider { height: 1px; background: var(--border); margin: 4px 2px; }

  .preset-manage {
    flex-basis: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 6px;
    margin-top: 2px;
    border-top: 1px solid var(--border-soft);
  }
  .preset-label {
    font-size: 10.5px;
    color: var(--fg-dim);
    font-family: var(--mono);
    margin-right: 2px;
    flex-shrink: 0;
  }
  .preset-chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .preset-empty { font-size: 11px; font-family: var(--mono); color: var(--fg-dim); }
  .preset-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 260px;
    padding: 2px 4px 2px 10px;
    background: var(--bg-glass);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg);
  }
  .preset-chip .c-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preset-chip .c-count { color: var(--fg-dim); font-size: 10.5px; }
  .preset-chip.confirm { border-color: var(--danger-line); background: var(--danger-dim); }
  .chip-btn {
    background: transparent;
    border: none;
    color: var(--fg-dim);
    font-family: var(--mono);
    font-size: 10.5px;
    border-radius: var(--radius-pill);
    padding: 1px 7px;
    cursor: pointer;
    transition: color var(--t), background var(--t);
  }
  .chip-btn:hover, .chip-btn:focus-visible { color: var(--fg); background: rgba(255,255,255,0.08); outline: none; }
  .chip-btn.danger:hover, .chip-btn.danger:focus-visible { color: var(--danger); }

  .preset-new { display: inline-flex; align-items: center; gap: 5px; }
  .preset-name {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 4px 12px;
    width: 180px;
    outline: none;
    color-scheme: dark;
    transition: border-color var(--t), box-shadow var(--t);
  }
  .preset-name::placeholder { color: var(--fg-muted); }
  .preset-name:focus {
    border-color: rgba(124,92,252,0.5);
    box-shadow: 0 0 0 3px rgba(124,92,252,0.12);
  }
  .preset-status {
    font-size: 10.5px;
    font-family: var(--mono);
    color: var(--fg-dim);
    margin-left: 4px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preset-status.error { color: var(--danger); }
  .preset-done { margin-left: auto; }

  /* Short message after applying a preset (the manage row may be closed). */
  .toast {
    position: fixed;
    left: 50%;
    bottom: 64px;
    transform: translateX(-50%) translateY(6px);
    z-index: 50;
    max-width: calc(100vw - 28px);
    padding: 6px 14px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-family: var(--mono);
    font-size: 11px;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .toast.warn { border-color: rgba(251,191,36,0.5); color: var(--amber); }

  .sep {
    width: 1px;
    height: 14px;
    background: var(--border);
    flex-shrink: 0;
    margin: 0 3px;
  }

  .search-wrap {
    flex: 1;
    min-width: 120px;
    position: relative;
  }
  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    stroke: var(--fg-muted);
    pointer-events: none;
    transition: stroke var(--t);
  }
  .search-wrap:focus-within .search-icon { stroke: var(--accent); }

  .search-input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 11.5px;
    padding: 5px 26px 5px 30px;
    outline: none;
    transition: border-color var(--t), box-shadow var(--t);
    letter-spacing: -0.01em;
  }
  .search-input::placeholder { color: var(--fg-muted); }
  .search-input:focus {
    border-color: rgba(124,92,252,0.5);
    box-shadow: 0 0 0 3px rgba(124,92,252,0.12);
  }
  .search-clear {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    display: none;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    padding: 0;
    border-radius: 50%;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background var(--t), color var(--t);
  }
  .search-clear svg {
    width: 9px;
    height: 9px;
    stroke: currentColor;
  }
  .search-clear:hover {
    background: rgba(255,255,255,0.08);
    color: var(--fg);
  }

  /* ─── Tree ───────────────────────────────────────────────────────────── */
  .tree-scroll {
    position: relative;
    z-index: 1;
    overflow-y: auto;
    padding: 6px 0 16px;
    animation: fadeIn 0.5s 0.12s var(--ease) both;
  }

  .tree-row {
    display: flex;
    align-items: center;
    padding: 0 16px 0 0;
    height: 27px;
    cursor: default;
    user-select: none;
    transition: background var(--t);
    position: relative;
    border-radius: 0;
  }
  .tree-row:hover { background: var(--bg-hover); }
  .tree-row:hover::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(180deg, #7c5cfc, #22d3ee);
    border-radius: 0 2px 2px 0;
  }
  .tree-row.hidden { display: none; }

  /* Indentation connector lines */
  .indent-block {
    display: inline-flex;
    align-items: center;
    width: 20px;
    height: 27px;
    flex-shrink: 0;
    position: relative;
  }
  .indent-block.has-line::before {
    content: '';
    position: absolute;
    left: 9px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(180deg, rgba(124,92,252,0.25), rgba(34,211,238,0.1));
    opacity: 0.7;
  }

  .toggle-zone {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 5px;
    color: var(--fg-muted);
    transition: color var(--t), background var(--t);
  }
  .toggle-zone:hover { color: #a78bfa; background: rgba(124,92,252,0.12); }
  .toggle-zone.leaf { cursor: default; }
  .toggle-zone.leaf:hover { background: transparent; color: var(--fg-muted); }
  .toggle-zone svg {
    width: 10px;
    height: 10px;
    stroke: currentColor;
    fill: none;
    transition: transform 0.2s var(--ease);
  }
  .toggle-zone.collapsed svg { transform: rotate(-90deg); }

  .node-cb {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    margin: 0 7px 0 5px;
    cursor: pointer;
    accent-color: var(--accent);
    border-radius: 3px;
  }

  .node-label {
    font-family: var(--mono);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    color: var(--fg);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .node-label.dir-label {
    color: #e2b96a;
    font-weight: 500;
  }
  .node-label.dim { opacity: 0.28; }

  .excl-chip {
    font-size: 9px;
    font-family: var(--sans);
    font-weight: 600;
    letter-spacing: 0.07em;
    background: rgba(255,95,135,0.1);
    color: var(--danger);
    border: 1px solid rgba(255,95,135,0.28);
    border-radius: var(--radius-pill);
    padding: 1px 6px;
    margin-left: 8px;
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .secret-chip {
    font-size: 11px;
    line-height: 1;
    color: var(--amber);
    background: rgba(251,191,36,0.1);
    border: 1px solid rgba(251,191,36,0.35);
    border-radius: var(--radius-pill);
    padding: 1px 6px;
    margin-left: 8px;
    flex-shrink: 0;
    cursor: help;
  }

  .size-tag {
    font-size: 9.5px;
    font-family: var(--mono);
    color: var(--fg-muted);
    margin-left: 8px;
    margin-right: 2px;
    flex-shrink: 0;
    letter-spacing: -0.01em;
  }

  /* ─── Footer ─────────────────────────────────────────────────────────── */
  .footer {
    position: relative;
    z-index: 1;
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    background: rgba(11,11,22,0.9);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideUp 0.4s var(--ease) both;
  }

  .footer::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(124,92,252,0.4) 40%, rgba(34,211,238,0.3) 60%, transparent);
  }

  .footer-info {
    flex: 1;
    font-size: 11px;
    color: var(--fg-dim);
    font-family: var(--mono);
    letter-spacing: -0.01em;
  }
  .footer-info .hi { color: #a78bfa; font-weight: 600; }
  .footer-info .total { color: var(--fg); }

  .btn-cancel {
    background: transparent;
    color: var(--fg-dim);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 6px 16px;
    font-size: 11.5px;
    font-family: var(--sans);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t), transform var(--t);
    letter-spacing: 0.01em;
  }
  .btn-cancel:hover {
    color: var(--fg);
    border-color: rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    transform: translateY(-1px);
  }
  .btn-cancel:active { transform: scale(0.96); }

  .btn-generate {
    background: linear-gradient(135deg, #7c5cfc 0%, #22d3ee 100%);
    color: #fff;
    border: none;
    border-radius: var(--radius-pill);
    padding: 7px 20px;
    font-size: 11.5px;
    font-family: var(--sans);
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: opacity var(--t), box-shadow var(--t), transform var(--t);
    box-shadow: 0 2px 16px rgba(124,92,252,0.45), 0 1px 4px rgba(0,0,0,0.3);
    position: relative;
    overflow: hidden;
  }
  .btn-generate::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 55%);
    pointer-events: none;
  }
  .btn-generate:hover:not(:disabled) {
    opacity: 0.9;
    box-shadow: 0 4px 24px rgba(124,92,252,0.55), 0 0 0 3px rgba(124,92,252,0.18);
    transform: translateY(-1px);
  }
  .btn-generate:active:not(:disabled) { transform: translateY(0) scale(0.98); }
  .btn-generate:disabled {
    opacity: 0.2;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* ─── Scrollbar ──────────────────────────────────────────────────────── */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(124,92,252,0.4), rgba(34,211,238,0.2));
    border-radius: 4px;
  }
  ::-webkit-scrollbar-thumb:hover { background: rgba(124,92,252,0.6); }

  /* ─── Animations ─────────────────────────────────────────────────────── */
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="header-icon">
    <svg width="100%" viewBox="0 0 680 690" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#0d1f35"/>
        </linearGradient>
        <linearGradient id="t1" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stop-color="#52e89a"/><stop offset="100%" stop-color="#1a9955"/>
        </linearGradient>
        <linearGradient id="t2" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stop-color="#3dd480"/><stop offset="100%" stop-color="#157a42"/>
        </linearGradient>
        <linearGradient id="t3" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stop-color="#2abe6a"/><stop offset="100%" stop-color="#0f5e30"/>
        </linearGradient>
        <linearGradient id="trk" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#8b5e2e"/><stop offset="100%" stop-color="#c4894a"/>
        </linearGradient>
      </defs>
      <rect width="680" height="680" rx="130" fill="url(#bg)"/>
      <circle cx="340" cy="290" r="230" fill="none" stroke="#52e89a" stroke-width="1" opacity="0.08"/>
      <circle cx="340" cy="290" r="190" fill="none" stroke="#52e89a" stroke-width="1" opacity="0.06"/>
      <rect x="316" y="510" width="48" height="88" rx="10" fill="url(#trk)"/>
      <rect x="340" y="510" width="24" height="88" rx="10" fill="#5a3610" opacity="0.35"/>
      <rect x="248" y="590" width="184" height="22" rx="11" fill="#1a9955" opacity="0.35"/>
      <polygon points="340,330 148,530 532,530" fill="url(#t3)"/>
      <polygon points="340,330 532,530 436,530" fill="#0a3d1e" opacity="0.22"/>
      <polygon points="340,210 178,430 502,430" fill="url(#t2)"/>
      <polygon points="340,210 502,430 421,430" fill="#0a3d1e" opacity="0.2"/>
      <polygon points="340,108 208,320 472,320" fill="url(#t1)"/>
      <polygon points="340,108 472,320 406,320" fill="#0a3d1e" opacity="0.18"/>
      <polygon points="340,108 208,320 274,320" fill="#ffffff" opacity="0.06"/>
      <polygon points="340,210 178,430 250,430" fill="#ffffff" opacity="0.05"/>
      <polygon points="340,330 148,530 230,530" fill="#ffffff" opacity="0.04"/>
      <circle cx="340" cy="108" r="14" fill="#a8f5cc" opacity="0.9"/>
      <circle cx="340" cy="108" r="7" fill="#ffffff" opacity="0.95"/>
    </svg>
  </div>
  <div class="header-text">
    <div class="header-title">Select Files for Snapshot</div>
    <div class="header-sub">
      <span class="project-chip">${escapeHtml(projectName)}</span>
      <span class="header-hint">Excluded files are unchecked — enable them individually</span>
    </div>
  </div>
  <button class="icon-btn" id="rescanBtn" type="button" onclick="rescanClicked()" title="Rescan project" aria-label="Rescan project">
    <svg viewBox="0 0 16 16" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/>
      <path d="M13.5 2.5v3h-3"/>
    </svg>
  </button>
</div>

<!-- Toolbar -->
<div class="toolbar">
<button class="btn-ghost" id="selectAllBtn" onclick="selectAll()">Select all</button>
<button class="btn-ghost" id="deselectAllBtn" onclick="selectNone()">Deselect all</button>
  <button class="btn-ghost" onclick="resetDefaults()">Reset defaults</button>
  <button class="btn-ghost memory" id="restoreLastBtn" style="display:none" onclick="restoreLastSelection()">Restore last</button>
  <button class="btn-ghost git" id="selectChangedBtn" style="display:none" onclick="selectGit('changed')" title="Check only files that are modified, added, renamed or untracked">Select changed</button>
  <button class="btn-ghost git" id="selectStagedBtn" style="display:none" onclick="selectGit('staged')" title="Check only files staged in git">Select staged</button>
  <div class="menu-wrap" id="presetMenuWrap">
    <button class="btn-ghost" id="presetMenuBtn" type="button" aria-haspopup="menu" aria-expanded="false" onclick="togglePresetMenu(event)">Presets<span class="count-badge" id="presetCount" style="display:none"></span><span class="caret">▾</span></button>
    <div class="preset-menu" id="presetMenu" role="menu" aria-label="Saved presets" style="display:none"></div>
  </div>
  <div class="sep"></div>
  <div class="search-wrap">
    <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.6">
      <circle cx="6.5" cy="6.5" r="4"/>
      <path d="M11 11l3 3" stroke-linecap="round"/>
    </svg>
    <input class="search-input" id="searchInput" type="text" placeholder="Filter files…" oninput="filterTree(this.value)">
    <button class="search-clear" id="searchClearBtn" style="display:none" onclick="clearSearch()" aria-label="Clear search" type="button">
      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke-width="1.8">
        <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/>
      </svg>
    </button>
  </div>
  <button class="btn-ghost select-filtered" id="selectFilteredBtn" style="display:none" onclick="selectFiltered()">Select filtered</button>
  <button class="btn-ghost deselect-filtered" id="deselectFilteredBtn" style="display:none" onclick="deselectFiltered()">Deselect filtered</button>

  <!-- Manage presets (second row, hidden until "Manage Presets" is chosen) -->
  <div class="preset-manage" id="presetManage" style="display:none">
    <span class="preset-label">Manage presets</span>
    <div class="preset-chips" id="presetChips"></div>
    <button class="btn-ghost" id="presetNewBtn" type="button" onclick="showNewPreset()">+ New preset</button>
    <span class="preset-new" id="presetNewWrap" style="display:none">
      <input class="preset-name" id="presetName" type="text" maxlength="60" placeholder="Preset name…" aria-label="New preset name" onkeydown="onPresetNameKey(event)">
      <button class="btn-ghost" id="presetSaveBtn" type="button" onclick="savePresetClicked()">Save</button>
      <button class="btn-ghost" type="button" onclick="hideNewPreset()">Cancel</button>
    </span>
    <span class="preset-status" id="presetStatus" role="status"></span>
    <button class="btn-ghost preset-done" type="button" onclick="closeManage()">Done</button>
  </div>
</div>

<!-- Tree -->
<div class="tree-scroll" id="treeContainer"></div>

<!-- Footer -->
<div class="footer">
  <div class="footer-info" id="footerInfo">Loading…</div>
  <button class="btn-cancel" onclick="cancel()">Cancel</button>
  <button class="btn-generate" id="generateBtn" onclick="generate()">Generate Snapshot</button>
</div>

<div class="toast" id="presetToast" role="status" aria-live="polite"></div>

<script>
const vscode = acquireVsCodeApi();
let TREE = ${treeJson};
const LAST_SELECTION = ${lastSelectionJson};
// { changed: string[], staged: string[] } from the extension, or null (no git).
// TREE / GIT_CHANGES / PRESETS are replaced when the reload button rescans.
let GIT_CHANGES = ${gitChangesJson};
// [{ name, files }] saved presets. An array on purpose: never keyed by name.
let PRESETS = ${presetsJson};

// Same function the unit tests run (see src/presets.js).
${resolvePreset.toString()}

let nodeMap = {};
let allFileNodes = [];
// O(1) checkbox lookup by rel path, instead of document.querySelector() scans.
// With thousands of files, repeated querySelector calls (and the old
// "recompute ancestors for every file" pattern below) turned selection
// changes into O(n^2)/O(n^3) DOM work, which is what was hanging the webview.
let cbByRel = new Map();

// ── Build UI ────────────────────────────────────────────────────────────────
function buildUI() {
  const container = document.getElementById('treeContainer');
  container.innerHTML = '';
  nodeMap = {};
  allFileNodes = [];
  cbByRel = new Map();
  renderLevel(TREE, container, 0, []);
  updateStats();

  if (LAST_SELECTION && LAST_SELECTION.length > 0) {
    document.getElementById('restoreLastBtn').style.display = '';
  }
  updateGitButtons();
  renderPresets();
}

// Rule names only (set by the scanner) — the secret itself never reaches here.
function hasSecrets(node) {
  return !node.isDir && Array.isArray(node.secretRules) && node.secretRules.length > 0;
}

// Default checked state: not ignored by default AND no secret findings.
function startsChecked(node) {
  return !node.ignoredByDefault && !hasSecrets(node);
}

function allDescendantsExcluded(node) {
  if (!node.isDir || !node.children || node.children.length === 0) return false;
  function check(children) {
    for (const c of children) {
      if (!c.isDir) {
        if (!c.ignoredByDefault) return false;
      } else {
        if (!check(c.children || [])) return false;
      }
    }
    return true;
  }
  return check(node.children);
}

function renderLevel(nodes, container, depth, ancestorIsLast) {
  nodes.forEach((node, idx) => {
    nodeMap[node.rel] = node;
    if (!node.isDir) allFileNodes.push(node);

    const isLast = idx === nodes.length - 1;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.rel = node.rel;
    row.dataset.isDir = node.isDir ? '1' : '0';

    // indent blocks
    for (let i = 0; i < depth; i++) {
      const block = document.createElement('span');
      block.className = 'indent-block' + (ancestorIsLast[i] ? '' : ' has-line');
      row.appendChild(block);
    }

    // toggle chevron
    const tog = document.createElement('span');
    tog.className = 'toggle-zone' + (node.isDir && node.children && node.children.length ? '' : ' leaf');
    tog.innerHTML = node.isDir && node.children && node.children.length
      ? '<svg viewBox="0 0 10 10" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3 5,7 8,3"/></svg>'
      : '';

    const startCollapsed = node.isDir && node.children && node.children.length > 0
      && allDescendantsExcluded(node);

    if (node.isDir && node.children && node.children.length) {
      if (startCollapsed) tog.classList.add('collapsed');
      tog.addEventListener('click', (e) => {
        e.stopPropagation();
        const childWrap = document.querySelector('[data-parent-rel="' + CSS.escape(node.rel) + '"]');
        if (!childWrap) return;
        const collapsed = childWrap.style.display === 'none';
        childWrap.style.display = collapsed ? '' : 'none';
        tog.classList.toggle('collapsed', !collapsed);
      });
    }
    row.appendChild(tog);

    // checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'node-cb';
    cb.dataset.rel = node.rel;
    cb.checked = startsChecked(node);
    cbByRel.set(node.rel, cb);
    cb.addEventListener('change', () => {
      if (node.isDir) {
        setDescendantsChecked(node.rel, cb.checked);
      }
      updateAncestors(node.rel);
      updateStats();
    });
    row.appendChild(cb);

    // label
    const label = document.createElement('span');
    label.className = 'node-label'
      + (node.isDir ? ' dir-label' : '')
      + (node.ignoredByDefault ? ' dim' : '');
    label.textContent = node.name;
    row.appendChild(label);

    // excluded chip
    if (node.ignoredByDefault) {
      const chip = document.createElement('span');
      chip.className = 'excl-chip';
      chip.textContent = 'x';
      row.appendChild(chip);
    }

    // secret warning badge — tooltip lists the rule names
    if (hasSecrets(node)) {
      const warn = document.createElement('span');
      warn.className = 'secret-chip';
      warn.textContent = '⚠';
      warn.title = 'Possible secret detected: ' + node.secretRules.join(', ');
      row.appendChild(warn);
    }

    // size
    if (!node.isDir && node.size) {
      const sz = document.createElement('span');
      sz.className = 'size-tag';
      sz.textContent = fmtSize(node.size);
      row.appendChild(sz);
    }

    container.appendChild(row);

    // children
    if (node.isDir && node.children && node.children.length) {
      const childWrap = document.createElement('div');
      childWrap.dataset.parentRel = node.rel;
      if (startCollapsed) childWrap.style.display = 'none';
      renderLevel(node.children, childWrap, depth + 1, [...ancestorIsLast, isLast]);
      container.appendChild(childWrap);
    }
  });
}

// ── Checkbox helpers ────────────────────────────────────────────────────────
function setDescendantsChecked(dirRel, checked) {
  const node = nodeMap[dirRel];
  if (!node) return;
  const dirCb = getCb(dirRel);
  if (dirCb) { dirCb.checked = checked; dirCb.indeterminate = false; }
  function recurse(children) {
    if (!children) return;
    for (const c of children) {
      const cb = getCb(c.rel);
      if (cb) { cb.checked = checked; cb.indeterminate = false; }
      if (c.isDir) recurse(c.children);
    }
  }
  recurse(node.children);
}

function updateAncestors(rel) {
  const parts = rel.split('/');
  for (let i = parts.length - 1; i >= 1; i--) {
    const parentRel = parts.slice(0, i).join('/');
    const parentCb = getCb(parentRel);
    if (!parentCb) continue;
    const childFileCbs = getDescFileCbs(parentRel);
    const checkedN = childFileCbs.filter(c => c.checked).length;
    if (checkedN === 0) { parentCb.checked = false; parentCb.indeterminate = false; }
    else if (checkedN === childFileCbs.length) { parentCb.checked = true; parentCb.indeterminate = false; }
    else { parentCb.checked = false; parentCb.indeterminate = true; }
  }
}

function getDescFileCbs(dirRel) {
  const node = nodeMap[dirRel];
  const result = [];
  function recurse(children) {
    if (!children) return;
    for (const c of children) {
      if (!c.isDir) { const cb = getCb(c.rel); if (cb) result.push(cb); }
      else recurse(c.children);
    }
  }
  if (node) recurse(node.children);
  return result;
}

function getCb(rel) {
  return cbByRel.get(rel) || null;
}

// Single bottom-up pass over the whole tree that recomputes every folder's
// checked/indeterminate state directly from its children. This replaces the
// old "for every file, walk up and rescan the whole ancestor subtree"
// approach used after bulk operations (select/deselect filtered, reset,
// restore last) — that was O(n^2)/O(n^3) on large trees. This is O(n) total.
function recomputeAllDirStates() {
  function recurse(nodes) {
    let checked = 0, total = 0;
    for (const node of (nodes || [])) {
      if (node.isDir) {
        const stats = recurse(node.children);
        const cb = cbByRel.get(node.rel);
        if (cb && stats.total > 0) {
          if (stats.checked === 0) { cb.checked = false; cb.indeterminate = false; }
          else if (stats.checked === stats.total) { cb.checked = true; cb.indeterminate = false; }
          else { cb.checked = false; cb.indeterminate = true; }
        }
        checked += stats.checked;
        total += stats.total;
      } else {
        total += 1;
        const cb = cbByRel.get(node.rel);
        if (cb && cb.checked) checked += 1;
      }
    }
    return { checked, total };
  }
  recurse(TREE);
}

// ── Toolbar actions ─────────────────────────────────────────────────────────
function selectAll() {
  cbByRel.forEach(cb => { cb.checked = true; cb.indeterminate = false; });
  updateStats();
}
function selectNone() {
  cbByRel.forEach(cb => { cb.checked = false; cb.indeterminate = false; });
  updateStats();
}
function resetDefaults() {
  cbByRel.forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    cb.checked = startsChecked(node);
    cb.indeterminate = false;
  });
  recomputeAllDirStates();
  updateStats();
}

// Replaces the whole selection: exactly the files in relSet end up checked.
function applySelection(relSet) {
  cbByRel.forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    cb.checked = relSet.has(cb.dataset.rel);
    cb.indeterminate = false;
  });
  recomputeAllDirStates();
  updateStats();
}

function restoreLastSelection() {
  if (!LAST_SELECTION || !LAST_SELECTION.length) return;
  applySelection(new Set(LAST_SELECTION));
}

// ── Git selection ───────────────────────────────────────────────────────────
// A button is shown only when it has something to select: not a git repo
// (GIT_CHANGES === null), or nothing changed / nothing staged → hidden.
function updateGitButtons() {
  [['selectChangedBtn', 'changed', 'Select changed'], ['selectStagedBtn', 'staged', 'Select staged']]
    .forEach(([id, key, label]) => {
      const btn = document.getElementById(id);
      const n = GIT_CHANGES ? (GIT_CHANGES[key] || []).length : 0;
      btn.textContent = label + ' (' + n + ')';
      btn.style.display = n > 0 ? '' : 'none';
    });
}

function selectGit(kind) {
  const list = GIT_CHANGES && GIT_CHANGES[kind];
  if (!list || !list.length) return;
  applySelection(new Set(list));
}

// ── Presets ─────────────────────────────────────────────────────────────────
// Names are only ever written with textContent / .value — never innerHTML.
// The "Presets" dropdown (first row) applies a preset on click. Its last item,
// "Manage Presets", opens a second row to delete presets and create new ones.
let pendingDelete = null;   // preset name waiting for "Yes / No"
let pendingSave = null;     // name sent to the extension, waiting for its reply
let toastTimer = null;

function byId(id) { return document.getElementById(id); }

function setPresetStatus(text, kind) {
  const el = byId('presetStatus');
  el.textContent = text || '';
  el.className = 'preset-status' + (kind ? ' ' + kind : '');
}

function showToast(text, kind) {
  const el = byId('presetToast');
  el.textContent = text;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

function mk(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderPresets() {
  // Count badge on the dropdown button.
  const badge = byId('presetCount');
  badge.textContent = String(PRESETS.length);
  badge.style.display = PRESETS.length ? '' : 'none';

  // Dropdown: presets, a divider, then "Manage Presets".
  const menu = byId('presetMenu');
  menu.innerHTML = '';
  if (!PRESETS.length) menu.appendChild(mk('div', 'preset-menu-empty', 'No presets yet'));
  PRESETS.forEach(p => {
    const item = mk('button', 'preset-item');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.title = p.name;
    item.appendChild(mk('span', 'p-name', p.name));
    item.appendChild(mk('span', 'p-count', String(p.files.length)));
    item.addEventListener('click', () => applyPreset(p.name));
    menu.appendChild(item);
  });
  menu.appendChild(mk('div', 'preset-menu-divider'));
  const manage = mk('button', 'preset-item manage', 'Manage Presets');
  manage.type = 'button';
  manage.setAttribute('role', 'menuitem');
  manage.addEventListener('click', openManage);
  menu.appendChild(manage);

  // Manage row: one chip per preset with a delete button.
  const chips = byId('presetChips');
  chips.innerHTML = '';
  if (!PRESETS.length) chips.appendChild(mk('span', 'preset-empty', 'No presets yet'));
  PRESETS.forEach(p => {
    const chip = mk('span', 'preset-chip');
    if (pendingDelete === p.name) {
      chip.classList.add('confirm');
      chip.appendChild(mk('span', 'c-name', 'Delete "' + p.name + '"?'));
      const yes = mk('button', 'chip-btn danger', 'Yes');
      yes.type = 'button';
      yes.addEventListener('click', () => confirmDelete(p.name));
      const no = mk('button', 'chip-btn', 'No');
      no.type = 'button';
      no.addEventListener('click', () => { pendingDelete = null; renderPresets(); });
      chip.appendChild(yes);
      chip.appendChild(no);
    } else {
      chip.appendChild(mk('span', 'c-name', p.name));
      chip.appendChild(mk('span', 'c-count', String(p.files.length)));
      const del = mk('button', 'chip-btn danger', '✕');
      del.type = 'button';
      del.title = 'Delete this preset';
      del.setAttribute('aria-label', 'Delete preset ' + p.name);
      del.addEventListener('click', () => { pendingDelete = p.name; renderPresets(); });
      chip.appendChild(del);
    }
    chips.appendChild(chip);
  });
}

// ── dropdown ──
function isPresetMenuOpen() { return byId('presetMenu').style.display !== 'none'; }

function closePresetMenu() {
  byId('presetMenu').style.display = 'none';
  byId('presetMenuBtn').setAttribute('aria-expanded', 'false');
}

function togglePresetMenu(event) {
  event.stopPropagation();
  const open = !isPresetMenuOpen();
  byId('presetMenu').style.display = open ? '' : 'none';
  byId('presetMenuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
}

document.addEventListener('click', (e) => {
  if (isPresetMenuOpen() && !byId('presetMenuWrap').contains(e.target)) closePresetMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isPresetMenuOpen()) {
    closePresetMenu();
    byId('presetMenuBtn').focus();
  }
});

// ── manage row ──
function openManage() {
  closePresetMenu();
  pendingDelete = null;
  setPresetStatus('');
  byId('presetManage').style.display = '';
  renderPresets();
}

function closeManage() {
  hideNewPreset();
  pendingDelete = null;
  byId('presetManage').style.display = 'none';
  renderPresets();
}

function showNewPreset() {
  setPresetStatus('');
  byId('presetNewBtn').style.display = 'none';
  byId('presetNewWrap').style.display = '';
  const input = byId('presetName');
  input.value = '';
  input.focus();
}

// Hides the name field and resets it (used by Save, Cancel and Done).
function hideNewPreset() {
  pendingSave = null;
  byId('presetName').value = '';
  byId('presetNewWrap').style.display = 'none';
  byId('presetNewBtn').style.display = '';
  setPresetStatus('');
}

function onPresetNameKey(event) {
  if (event.key === 'Enter') { event.preventDefault(); savePresetClicked(); }
  else if (event.key === 'Escape') { event.stopPropagation(); hideNewPreset(); }
}

function getSelectedRels() {
  const selected = [];
  cbByRel.forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    if (cb.checked) selected.push(cb.dataset.rel);
  });
  return selected;
}

function savePresetClicked() {
  const name = byId('presetName').value.replace(/[\\r\\n\\t]+/g, ' ').trim().slice(0, 60).trim();
  if (!name) { setPresetStatus('Type a preset name first', 'error'); return; }
  const selected = getSelectedRels();
  if (selected.length === 0) { setPresetStatus('Select at least one file to save', 'error'); return; }
  pendingSave = name;
  // The extension asks before overwriting, writes .tree/presets.json and replies.
  vscode.postMessage({ command: 'savePreset', name, selected });
}

function confirmDelete(name) {
  pendingDelete = null;
  vscode.postMessage({ command: 'deletePreset', name });
}

function findPreset(name) {
  return PRESETS.find(p => p.name === name) || null;
}

function applyPreset(name) {
  closePresetMenu();
  const preset = findPreset(name);
  if (!preset) return;
  const known = new Set(allFileNodes.map(n => n.rel));
  const res = resolvePreset(preset.files, known);
  applySelection(new Set(res.present));
  // Missing paths are dropped and reported once.
  if (res.missing > 0) showToast('Applied "' + name + '" · ' + res.missing + ' missing', 'warn');
  else showToast('Applied "' + name + '" · ' + res.present.length + ' file(s)');
}

// Reply from the extension after a save / delete: the full, updated list.
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.command !== 'presets') return;
  PRESETS = Array.isArray(msg.presets) ? msg.presets : [];
  const status = typeof msg.status === 'string' ? msg.status : '';
  // A real save starts with "Saved" (see extension.js). "Save cancelled" keeps
  // the name field open so the user can pick another name.
  const saved = pendingSave !== null && !msg.error && status.indexOf('Saved') === 0;
  if (saved) hideNewPreset();
  renderPresets();
  setPresetStatus(status, msg.error ? 'error' : '');
});

// ── Rescan ──────────────────────────────────────────────────────────────────
// The reload button asks the extension to scan the project again (new/removed
// files, .gitignore edits, git status, presets). The current selection is kept.
let rescanning = false;

function rescanClicked() {
  if (rescanning) return;
  rescanning = true;
  const btn = byId('rescanBtn');
  btn.disabled = true;
  btn.classList.add('spinning');
  vscode.postMessage({ command: 'rescan' });
}

function onRescanResult(msg) {
  rescanning = false;
  const btn = byId('rescanBtn');
  btn.disabled = false;
  btn.classList.remove('spinning');
  if (msg.error) { showToast('Rescan failed: ' + msg.error, 'warn'); return; }

  // Per file: is it checked now, and was that its default state?
  const prev = new Map();
  allFileNodes.forEach(n => {
    const cb = cbByRel.get(n.rel);
    prev.set(n.rel, { checked: !!(cb && cb.checked), def: startsChecked(n) });
  });

  TREE = Array.isArray(msg.tree) ? msg.tree : [];
  GIT_CHANGES = msg.gitChanges || null;
  PRESETS = Array.isArray(msg.presets) ? msg.presets : [];
  buildUI();

  // Keep the user's choice for files that were already here. A file whose
  // default changed (for example it is now in .gitignore) takes the new default.
  let added = 0;
  allFileNodes.forEach(n => {
    const p = prev.get(n.rel);
    if (!p) { added++; return; }
    if (p.def === startsChecked(n)) {
      const cb = cbByRel.get(n.rel);
      if (cb) cb.checked = p.checked;
    }
  });
  const removed = prev.size - (allFileNodes.length - added);
  recomputeAllDirStates();
  updateStats();

  const q = byId('searchInput').value;
  if (q) filterTree(q);

  let text = 'Rescanned · ' + allFileNodes.length + ' files';
  if (added) text += ' · +' + added + ' new';
  if (removed) text += ' · -' + removed + ' removed';
  showToast(text);
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg && msg.command === 'rescanResult') onRescanResult(msg);
});

// ── Filter ──────────────────────────────────────────────────────────────────
function filterTree(q) {
  q = q.toLowerCase().trim();
  const filterBtn = document.getElementById('selectFilteredBtn');
  const deselectBtn = document.getElementById('deselectFilteredBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const clearBtn = document.getElementById('searchClearBtn');

  clearBtn.style.display = q ? 'flex' : 'none';

  if (!q) {
    document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('hidden'));
    cbByRel.forEach(cb => { cb.style.visibility = ''; });
    document.querySelectorAll('[data-parent-rel]').forEach(w => {
      const parentRel = w.dataset.parentRel;
      const node = nodeMap[parentRel];
      if (node && allDescendantsExcluded(node)) {
        const tog = document.querySelector('.tree-row[data-rel="' + CSS.escape(parentRel) + '"] .toggle-zone');
        if (tog && tog.classList.contains('collapsed')) {
          w.style.display = 'none';
        } else {
          w.style.display = '';
        }
      } else {
        w.style.display = '';
      }
    });
    filterBtn.style.display = 'none';
    deselectBtn.style.display = 'none';
    selectAllBtn.style.display = '';
    deselectAllBtn.style.display = '';
    return;
  }

  // Direct matches: rows whose own path matches the query.
  const directMatchRels = new Set();
  document.querySelectorAll('.tree-row').forEach(row => {
    const rel = row.dataset.rel || '';
    if (rel.toLowerCase().includes(q)) directMatchRels.add(rel);
  });

  // A direct match's parent folders need to stay visible for context, even
  // though they didn't match themselves.
  const neededRels = new Set(directMatchRels);
  directMatchRels.forEach(rel => {
    const parts = rel.split('/');
    for (let i = parts.length - 1; i >= 1; i--) {
      neededRels.add(parts.slice(0, i).join('/'));
    }
  });

  document.querySelectorAll('[data-parent-rel]').forEach(w => w.style.display = '');
  document.querySelectorAll('.tree-row').forEach(row => {
    const rel = row.dataset.rel || '';
    const visible = neededRels.has(rel);
    row.classList.toggle('hidden', !visible);
    if (!visible) return;

    // Context-only folders (shown just to give the match a path, not
    // matched themselves) don't get a checkbox — they aren't a real
    // selection target here. Folders that genuinely matched keep theirs.
    if (row.dataset.isDir === '1') {
      const cb = getCb(rel);
      if (cb) cb.style.visibility = directMatchRels.has(rel) ? '' : 'hidden';
    }
  });

  filterBtn.style.display = '';
  deselectBtn.style.display = '';
  selectAllBtn.style.display = 'none';
  deselectAllBtn.style.display = 'none';
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  filterTree('');
  input.focus();
}

function selectFiltered() {
  document.querySelectorAll('.tree-row:not(.hidden)').forEach(row => {
    if (row.dataset.isDir === '1') return;
    const cb = getCb(row.dataset.rel);
    if (cb) { cb.checked = true; cb.indeterminate = false; }
  });
  recomputeAllDirStates();
  updateStats();
}

function deselectFiltered() {
  document.querySelectorAll('.tree-row:not(.hidden)').forEach(row => {
    if (row.dataset.isDir === '1') return;
    const cb = getCb(row.dataset.rel);
    if (cb) { cb.checked = false; cb.indeterminate = false; }
  });
  recomputeAllDirStates();
  updateStats();
}



// ── Stats ───────────────────────────────────────────────────────────────────
function updateStats() {
  let total = 0, selected = 0;
  cbByRel.forEach(cb => {
    const node = nodeMap[cb.dataset.rel];
    if (!node || node.isDir) return;
    total++;
    if (cb.checked) selected++;
  });

  const footer = document.getElementById('footerInfo');
  const btn = document.getElementById('generateBtn');
  if (selected === 0) {
    footer.innerHTML =
      '<span class="total">No files selected — only the project structure will be generated</span>';
    btn.textContent = 'Generate Structure Only';
  } else {
    footer.innerHTML =
      '<span class="hi">' + selected + '</span> <span class="total">/ ' + total + ' files</span> selected for snapshot';
    btn.textContent = 'Generate Snapshot';
  }
}

// ── Generate / Cancel ────────────────────────────────────────────────────────
function generate() {
  vscode.postMessage({ command: 'confirm', selected: getSelectedRels() });
}
function cancel() {
  vscode.postMessage({ command: 'cancel' });
}

// ── Utilities ────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

buildUI();
</script>
</body>
</html>`;
}

module.exports = { buildPickerHtml };