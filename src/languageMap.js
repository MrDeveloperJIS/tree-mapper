'use strict';

const path = require('path');

/**
 * Maps file extensions to Markdown fenced code block language identifiers.
 */
const EXT_TO_LANG = {
  // Web
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'jsx',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.vue': 'vue',
  '.svelte': 'svelte',

  // Data / Config
  '.json': 'json',
  '.json5': 'json5',
  '.jsonc': 'jsonc',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.csv': 'csv',
  '.env': 'bash',

  // Shell / Scripts
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.fish': 'fish',
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.bat': 'batch',
  '.cmd': 'batch',

  // Systems / Backend
  '.py': 'python',
  '.rb': 'ruby',
  '.php': 'php',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'groovy',
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.swift': 'swift',
  '.m': 'objectivec',
  '.mm': 'objectivec',
  '.dart': 'dart',

  // Docs / Markup
  '.md': 'markdown',
  '.mdx': 'mdx',
  '.rst': 'rst',
  '.tex': 'latex',
  '.txt': 'text',
  '.adoc': 'asciidoc',

  // DevOps / Infra
  '.dockerfile': 'dockerfile',
  '.tf': 'hcl',
  '.hcl': 'hcl',
  '.nix': 'nix',
  '.lua': 'lua',
  '.vim': 'vim',
  '.r': 'r',
  '.R': 'r',
  '.sql': 'sql',

  // Misc
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.proto': 'protobuf',
  '.prisma': 'prisma',
  '.pug': 'pug',
  '.ejs': 'ejs',
  '.njk': 'jinja2',
  '.liquid': 'liquid',
};

// Files with no extension but a known name
const NAME_TO_LANG = {
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'Jenkinsfile': 'groovy',
  'Brewfile': 'ruby',
  '.gitignore': 'gitignore',
  '.treeignore': 'gitignore',
  '.dockerignore': 'gitignore',
  '.editorconfig': 'ini',
  '.htaccess': 'apache',
};

/**
 * Infers a Markdown code fence language from a file path.
 *
 * @param {string} filePath - Relative or absolute file path
 * @returns {string}        - Language identifier (empty string if unknown)
 */
function getLanguage(filePath) {
  const base = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (NAME_TO_LANG[base]) return NAME_TO_LANG[base];
  if (ext && EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];
  return '';
}

module.exports = { getLanguage };