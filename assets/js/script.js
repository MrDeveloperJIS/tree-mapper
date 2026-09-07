/* ── Config ── */
const REPO = 'MrDeveloperJIS/tree-mapper';
const PKG_URL = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

/* ── Version loader ── */
async function loadVersion() {
    try {
        const res = await fetch(PKG_URL);
        if (!res.ok) throw new Error('fetch failed');
        const pkg = await res.json();
        applyVersion(pkg.version);
    } catch {
        applyReleaseFallback();
    }
}

function applyVersion(v) {
    const url = `https://github.com/${REPO}/releases/download/v${v}/tree-mapper-${v}.vsix`;
    document.querySelectorAll('[data-download-btn]').forEach(el => { el.href = url; });
    document.querySelectorAll('[data-version]').forEach(el => { el.textContent = `v${v}`; });
}

function applyReleaseFallback() {
    document.querySelectorAll('[data-download-btn]').forEach(el => { el.href = RELEASES_URL; });
}

loadVersion();

/* ── Nav scroll effect ── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 10);
}, { passive: true });

/* ── Nav hamburger ── */
const burger = document.getElementById('burger');
const navLinks = document.getElementById('navLinks');

burger.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open);
});

document.querySelectorAll('.nav-links a').forEach(a => {
    a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', false);
    });
});

document.addEventListener('click', e => {
    if (navLinks.classList.contains('open') &&
        !navLinks.contains(e.target) &&
        !burger.contains(e.target)) {
        navLinks.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', false);
    }
});

/* ── Scroll reveal (sections fade up once, on entry) ── */
const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            revealObs.unobserve(e.target);
        }
    });
}, { threshold: 0.12 });

document.querySelectorAll('[data-reveal]').forEach(el => {
    if (el.closest('.hero')) {
        setTimeout(() => el.classList.add('visible'), 60);
    } else {
        revealObs.observe(el);
    }
});

/* ── Terminal typewriter demo ── */
const terminalLines = [
    { type: 'cmd', text: '# right-clicked: my-project/src' },
    { type: 'out', text: '' },
    { type: 'out', text: 'scanning workspace…' },
    { type: 'out', text: 'building file picker…' },
    { type: 'out', text: '14 files selected' },
    { type: 'out', text: 'rendering markdown…' },
    { type: 'out', text: '' },
    { type: 'tree', text: 'src/' },
    { type: 'tree', text: '├── <span class="file-js">extension.js</span>' },
    { type: 'tree', text: '├── <span class="file-js">scanner.js</span>' },
    { type: 'tree', text: '├── <span class="file-js">treeBuilder.js</span>' },
    { type: 'tree', text: '└── <span class="file-js">languageMap.js</span>' },
    { type: 'out', text: '' },
    { type: 'success', text: 'snapshot saved →' },
    { type: 'success', text: '.tree/2026-09-06-14-35-22.md' },
    { type: 'out', text: '' },
    { type: 'prompt', text: '' },
];

const termBody = document.getElementById('terminalBody');
let lineIdx = 0;

function typeLine() {
    if (!termBody) return;
    if (lineIdx >= terminalLines.length) {
        setTimeout(() => {
            termBody.innerHTML = '';
            lineIdx = 0;
            setTimeout(typeLine, 600);
        }, 3200);
        return;
    }

    const line = terminalLines[lineIdx++];
    const div = document.createElement('div');
    div.className = 't-line';

    if (line.type === 'cmd') {
        div.innerHTML = `<span class="t-prompt">$</span><span class="t-cmd"> ${line.text}</span>`;
    } else if (line.type === 'tree') {
        div.innerHTML = `<span class="t-tree">${line.text}</span>`;
    } else if (line.type === 'success') {
        div.innerHTML = `<span class="t-success">${line.text}</span>`;
    } else if (line.type === 'prompt') {
        div.innerHTML = `<span class="t-prompt">$</span><span class="t-cursor"></span>`;
    } else {
        div.innerHTML = `<span class="t-out">${line.text}</span>`;
    }

    termBody.appendChild(div);
    termBody.scrollTop = termBody.scrollHeight;
    setTimeout(typeLine, line.type === 'out' && line.text === '' ? 70 : 130);
}

if (termBody) setTimeout(typeLine, 700);
