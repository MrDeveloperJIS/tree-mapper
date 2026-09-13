'use strict';

/**
 * The built-in "protect secrets by default" pattern list.
 *
 * This used to live only as the JSON `default` of the
 * `treemapper.defaultIgnorePatterns` setting. That meant VS Code's Settings
 * UI array editor — which shows/edits the *effective* value, not just your
 * override — had to render all ~65 items, and because array-type settings
 * are OVERRIDDEN (not merged) across scopes, any edit made through that UI
 * risked silently saving a truncated list to the user's settings.json and
 * disabling most of the secret-file protection without anyone noticing.
 *
 * Fix: keep the full list here, baked into the extension itself, so it is
 * never exposed as something a user can accidentally shrink. The
 * `treemapper.defaultIgnorePatterns` setting is repurposed to hold only the
 * user's own additional patterns (default: []), which resolveIgnorePatterns
 * below always concatenates with this list rather than replacing it.
 */
const BUILTIN_IGNORE_PATTERNS = Object.freeze([
  '.tree/',
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '**/*.log',
  '.env',
  '.env.*',
  '!.env.example',
  '!.env.*.example',
  '!.env.sample',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.crt',
  '*.cer',
  '*.der',
  'id_rsa',
  'id_rsa.pub',
  'id_ed25519',
  'id_ed25519.pub',
  'id_dsa',
  'id_ecdsa',
  '.ssh/',
  '.pgpass',
  '.npmrc',
  '.yarnrc',
  '.netrc',
  '.git-credentials',
  '.aws/',
  'credentials.json',
  '*credentials*.json',
  '*serviceAccount*.json',
  '*service-account*.json',
  'gcloud/',
  '.gcloud/',
  '.kube/',
  'kubeconfig',
  '*.kubeconfig',
  '.docker/config.json',
  '*.tfstate',
  '*.tfstate.backup',
  '.terraform/',
  'secrets.yml',
  'secrets.yaml',
  'secrets.json',
  '*.secrets.*',
  '.secret',
  '*.sqlite',
  '*.sqlite3',
  '*.db',
  '*_history',
  '.bash_history',
  '.zsh_history',
  '.psql_history',
  '*.keystore',
  '*.jks',
  '*.mobileprovision',
]);

/**
 * Resolves the actual ignore-pattern list to use for a run.
 *
 * `treemapper.defaultIgnorePatterns` now holds only the user's OWN extra
 * patterns (default: []). It is always merged on top of the built-in list —
 * never used to replace it — so nothing a user puts there can silently
 * disable the secrets/credentials protection.
 *
 * @param {import('vscode').WorkspaceConfiguration} config - result of
 *   vscode.workspace.getConfiguration('treemapper')
 * @returns {string[]}
 */
function resolveIgnorePatterns(config) {
  const userPatterns = config.get('defaultIgnorePatterns') || [];
  return [...BUILTIN_IGNORE_PATTERNS, ...userPatterns];
}

module.exports = { BUILTIN_IGNORE_PATTERNS, resolveIgnorePatterns };