'use strict';

/**
 * Offline secret detection + redaction (regex rules only, no network).
 *
 *   scanText(text)   → [{ rule, line }]       (never contains the secret value)
 *   redactText(text) → { text, count }        (matches replaced with [REDACTED])
 *
 * Both use the same resolved matches, so the number of findings reported by
 * scanText always equals the count redactText replaces.
 *
 * Every regex here is bounded (no open-ended runs next to a keyword, and the
 * private-key search is linear), so a huge or hostile file can't make a scan
 * crawl.
 */

const REDACTED = '[REDACTED]';

// Values that are obviously not real secrets.
//  - PLACEHOLDER_PREFIX: the value STARTS with a placeholder word
//    (your_key, ExampleKey, changeme-please ...).
//  - PLACEHOLDER_TOKEN: a placeholder word standing alone between separators
//    (my_example_value, TOKEN_TODO, sk-here). A word hidden inside a longer
//    word (MyExamplePassw0rd, todoapp_prod_9f8a) is NOT a placeholder.
const PLACEHOLDER_PREFIX = /^(?:your|example|sample|dummy|placeholder|changeme|change_me|replace|insert|redacted)/i;
const PLACEHOLDER_TOKEN = /(?:^|[^a-z0-9])(?:your|example|placeholder|changeme|change_me|replace|dummy|sample|redacted|insert|todo|fixme|here)(?:[^a-z0-9]|$)/i;
// Obvious sample passwords used in connection-string examples.
const SAMPLE_PASSWORDS = new Set(['password', 'passwd', 'pass', 'pwd', 'secret', 'user', 'username', 'admin', 'root', 'test']);

function isPlaceholder(value) {
    const v = value.trim();
    if (!v) return true;
    if (/^[x*.\-_#•]+$/i.test(v)) return true; // xxx, ****, ----
    if (/^<[^>]*>$/.test(v)) return true; // <token>
    if (/^\$\{[^}]*\}$/.test(v)) return true; // ${TOKEN}
    if (/^\{\{[^}]*\}\}$/.test(v)) return true; // {{ token }}
    if (/^%[^%]*%$/.test(v)) return true; // %TOKEN%
    if (/^(process\.env|import\.meta\.env|os\.environ|os\.getenv|env[.([])/i.test(v)) return true;
    if (/^(null|none|undefined|true|false|string)$/i.test(v)) return true;
    return PLACEHOLDER_PREFIX.test(v) || PLACEHOLDER_TOKEN.test(v);
}

/**
 * Private key blocks. Linear-time: remembers where the next END marker is
 * instead of searching for one from every BEGIN marker (a file with thousands
 * of BEGIN lines and no END used to take seconds).
 *
 * @param {string} text
 * @returns {Array<[number, number]>} [start, end) offsets
 */
function findPrivateKeys(text) {
    const MAX_BODY = 20000;
    const beginRe = /-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g;
    const endRe = /-----END [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----/g;
    const out = [];
    let end = null; // cached next END match: { index, length }

    let m;
    while ((m = beginRe.exec(text)) !== null) {
        const bodyStart = m.index + m[0].length;
        if (!end || end.index < bodyStart) {
            endRe.lastIndex = bodyStart;
            const e = endRe.exec(text);
            if (!e) break; // no END anywhere after this point → nothing more to find
            end = { index: e.index, length: e[0].length };
        }
        if (end.index - bodyStart > MAX_BODY) continue; // too far: not one block
        out.push([m.index, end.index + end.length]);
        beginRe.lastIndex = end.index + end.length;
    }
    return out;
}

const KEYWORDS = 'password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key';

/**
 * Order matters: specific rules come before the generic assignment rules, so
 * when two matches cover the same text the specific rule name wins.
 *
 * A rule has either `re` (+ optional `check` / `span`) or `find(text)`.
 * `span(m)` narrows what gets redacted — e.g. only the value in
 * `password = "..."`, keeping the key readable. `check(m)` rejects a match.
 */
const RULES = [
    { name: 'private-key', find: findPrivateKeys },
    { name: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
    {
        // aws_secret_access_key = <40 chars>, quoted or not
        name: 'aws-secret-key',
        re: /aws[_-]?secret[_-]?access[_-]?key["']?[ \t]*[:=][ \t]*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
        span: (m) => [m.index + m[0].length - m[1].length, m.index + m[0].length],
    },
    {
        name: 'github-token',
        re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/g,
    },
    { name: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,72}(?![A-Za-z0-9-])/g },
    { name: 'stripe-live-key', re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g },
    { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/g },
    {
        name: 'jwt',
        re: /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
    },
    {
        name: 'bearer-token',
        re: /\b[Bb]earer\s+([A-Za-z0-9._~+/-]{20,}={0,2})/g,
        check: (m) => !isPlaceholder(m[1]),
        span: (m) => [m.index + m[0].length - m[1].length, m.index + m[0].length],
    },
    {
        // scheme://user:PASSWORD@host  (postgres, mysql, mongodb, redis, amqp, https ...)
        name: 'url-credentials',
        re: /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^\s:@/'"`]{1,100}:([^\s@/'"`]{3,200})@/gi,
        check: (m) => !isPlaceholder(m[1]) && !SAMPLE_PASSWORDS.has(m[1].toLowerCase()),
        span: (m) => [m.index + m[0].length - 1 - m[1].length, m.index + m[0].length - 1],
    },
    {
        // password / secret / token / api_key = "<value>"  (also key: "value")
        name: 'secret-assignment',
        re: new RegExp(
            '(?:' + KEYWORDS + ')[A-Za-z0-9_]{0,40}["\']?\\s*[:=]\\s*(["`\'])([^\\s"\'`]{8,})\\1',
            'gi'
        ),
        check: (m) => !isPlaceholder(m[2]),
        // The value sits right before the closing quote at the end of the match.
        span: (m) => {
            const end = m.index + m[0].length - 1;
            return [end - m[2].length, end];
        },
    },
    {
        // .env / YAML / ini style, no quotes:  DB_PASSWORD=hunter2hunter2
        // Whole line only (so `password: this.password,` in code is left alone)
        // and the value must contain a digit (so `password = newPassword` is too).
        name: 'secret-assignment',
        re: new RegExp(
            '^([ \\t]*(?:export[ \\t]+)?[A-Za-z0-9_.-]{0,40}(?:' + KEYWORDS + ')[A-Za-z0-9_]{0,40}[ \\t]*[:=][ \\t]*)' +
            '([^\\s"\'`,;(){}\\[\\]<>]{8,200})(?:[ \\t]+#.*)?[ \\t]*$',
            'gim'
        ),
        check: (m) => /\d/.test(m[2]) && !isPlaceholder(m[2]),
        span: (m) => [m.index + m[1].length, m.index + m[1].length + m[2].length],
    },
];

/**
 * All non-overlapping findings, in text order: [{ rule, start, end }].
 * Internal — offsets must never leave this module's callers' hands as values.
 */
function findSecrets(text) {
    const raw = [];
    RULES.forEach((rule, order) => {
        if (rule.find) {
            for (const [start, end] of rule.find(text)) {
                raw.push({ rule: rule.name, start, end, order });
            }
            return;
        }
        for (const m of text.matchAll(rule.re)) {
            if (rule.check && !rule.check(m)) continue;
            const [start, end] = rule.span
                ? rule.span(m)
                : [m.index, m.index + m[0].length];
            raw.push({ rule: rule.name, start, end, order });
        }
    });

    // Earliest first; for ties the longer match, then the more specific rule.
    raw.sort((a, b) => a.start - b.start || b.end - a.end || a.order - b.order);

    const out = [];
    let lastEnd = -1;
    for (const s of raw) {
        if (s.start < lastEnd) continue; // overlaps an earlier finding
        out.push(s);
        lastEnd = s.end;
    }
    return out;
}

/**
 * @param {string} text
 * @returns {{ rule: string, line: number }[]}  rule name + 1-based line only
 */
function scanText(text) {
    const found = findSecrets(text);
    const out = [];
    let line = 1;
    let nl = text.indexOf('\n');
    for (const s of found) {
        while (nl !== -1 && nl < s.start) {
            line++;
            nl = text.indexOf('\n', nl + 1);
        }
        out.push({ rule: s.rule, line });
    }
    return out;
}

/**
 * @param {string} text
 * @returns {{ text: string, count: number }}
 */
function redactText(text) {
    const found = findSecrets(text);
    if (found.length === 0) return { text, count: 0 };

    let out = '';
    let last = 0;
    for (const s of found) {
        out += text.slice(last, s.start) + REDACTED;
        last = s.end;
    }
    out += text.slice(last);
    return { text: out, count: found.length };
}

module.exports = { scanText, redactText, REDACTED };