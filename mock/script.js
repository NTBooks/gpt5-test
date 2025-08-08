// Data model (static mock)
const mockProfile = {
    name: "Jordan Lee",
    blurb:
        "Lifelong learner passionate about data visualization, credential transparency, and equitable access to education. Building bridges between skills and opportunity.",
    avatarUrl:
        "https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?q=80&w=800&auto=format&fit=crop",
    coverUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop",
    credentials: [
        {
            id: "c1",
            name: "Full-Stack Web Development Nanodegree",
            issuer: "Udacity",
            image:
                "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1200&auto=format&fit=crop",
            visible: true,
            highlighted: true,
            verification: {
                hash: "0x7b9a5f7d2c9aafcf5b4e29f0c34b7fa0c8d1a2e4c5b6d7e8f9a0b1c2d3e4f5a6",
                chain: "Ethereum Mainnet",
                txUrl: "https://etherscan.io/tx/0x1234567890abcdef",
                issued: "2024-06-12",
            },
        },
        {
            id: "c2",
            name: "Data Visualization with D3.js",
            issuer: "Coursera",
            image:
                "https://images.unsplash.com/photo-1551281044-8d8d0d8b6d75?q=80&w=1200&auto=format&fit=crop",
            visible: true,
            highlighted: true,
            verification: {
                hash: "0x9c1e5a7b2d3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f",
                chain: "Polygon",
                txUrl: "https://polygonscan.com/tx/0xabcdef0123456789",
                issued: "2025-02-03",
            },
        },
        {
            id: "c3",
            name: "Blockchain Fundamentals",
            issuer: "edX",
            image:
                "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1100&auto=format&fit=crop",
            visible: true,
            highlighted: false,
            verification: {
                hash: "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
                chain: "Ethereum Mainnet",
                txUrl: "https://etherscan.io/tx/0xa1b2c3d4e5f6",
                issued: "2023-10-21",
            },
        },
        {
            id: "c4",
            name: "AI Product Management",
            issuer: "Udacity",
            image:
                "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=80&w=1200&auto=format&fit=crop",
            visible: true,
            highlighted: false,
            verification: {
                hash: "0xabc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd",
                chain: "Base",
                txUrl: "https://basescan.org/tx/0xfeedbead0123",
                issued: "2022-07-02",
            },
        },
        {
            id: "c5",
            name: "Graphic Design Essentials",
            issuer: "Skillshare",
            image:
                "https://images.unsplash.com/photo-1581362075264-2509753de9d9?q=80&w=1000&auto=format&fit=crop",
            visible: false,
            highlighted: false,
            verification: {
                hash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                chain: "Polygon",
                txUrl: "https://polygonscan.com/tx/0xdeadbeef",
                issued: "2021-11-15",
            },
        },
        {
            id: "c6",
            name: "Inclusive Leadership",
            issuer: "Harvardx",
            image:
                "https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?q=80&w=1200&auto=format&fit=crop",
            visible: true,
            highlighted: false,
            verification: {
                hash: "0xbeadfeedbeadfeedbeadfeedbeadfeedbeadfeedbeadfeedbeadfeedbeadfeed",
                chain: "Ethereum Mainnet",
                txUrl: "https://etherscan.io/tx/0xbeadfeed",
                issued: "2023-01-28",
            },
        },
    ],
};

// Utilities
const qs = (sel, p = document) => p.querySelector(sel);
const qsa = (sel, p = document) => Array.from(p.querySelectorAll(sel));

const formatDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
});

// Render profile
function renderProfile(profile) {
    qs('#student-name').textContent = profile.name;
    qs('#student-blurb').textContent = profile.blurb;
    qs('#profile-avatar').src = profile.avatarUrl;
    qs('#cover-image').src = profile.coverUrl;

    const visibleCreds = profile.credentials.filter((c) => c.visible);
    const highlighted = visibleCreds.filter((c) => c.highlighted);
    const others = visibleCreds.filter((c) => !c.highlighted);

    qs('#visible-count').textContent = `${visibleCreds.length} credential${visibleCreds.length !== 1 ? 's' : ''}`;

    // Highlighted carousel
    const highlightedList = qs('#highlighted-list');
    highlightedList.innerHTML = '';
    highlighted.forEach((cred) => highlightedList.appendChild(createCredentialCard(cred, true)));
    qs('#highlighted-section').style.display = highlighted.length ? '' : 'none';

    // Grid
    const grid = qs('#credential-grid');
    grid.innerHTML = '';
    others.forEach((cred) => grid.appendChild(createCredentialCard(cred, false)));
}

// Card factory
function createCredentialCard(credential, isHighlighted) {
    const card = document.createElement('article');
    card.className = [
        'group relative overflow-hidden rounded-2xl ring-1 ring-white/10',
        'bg-white/5 backdrop-blur-xl shadow-glass',
        'snap-start'
    ].join(' ');
    if (isHighlighted) card.setAttribute('data-highlighted', '');

    const media = document.createElement('div');
    media.className = 'relative aspect-[4/3] w-full bg-black/30 grid place-items-center overflow-hidden';
    const img = document.createElement('img');
    img.alt = `${credential.name} image`;
    img.loading = 'lazy';
    img.src = credential.image;
    img.className = 'h-full w-full object-contain bg-[linear-gradient(135deg,rgba(124,92,255,.08),rgba(77,208,225,.08))]';
    media.appendChild(img);

    const ratioTip = document.createElement('div');
    ratioTip.className = 'absolute right-2 bottom-2 rounded-full border border-white/10 bg-black/50 px-2 py-0.5 text-xs text-white/70 backdrop-blur';
    ratioTip.textContent = 'Auto-fit';
    media.appendChild(ratioTip);

    const body = document.createElement('div');
    body.className = 'p-3 grid gap-2';
    const title = document.createElement('h3');
    title.className = 'm-0 text-base font-semibold text-white';
    title.textContent = credential.name;
    const issuer = document.createElement('div');
    issuer.className = 'text-sm text-white/70';
    issuer.textContent = credential.issuer;

    const actions = document.createElement('div');
    actions.className = 'flex gap-2';

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white hover:bg-white/10';
    zoomBtn.textContent = 'Zoom';
    zoomBtn.addEventListener('click', () => openLightbox(credential.image));

    const verifyBtn = document.createElement('button');
    verifyBtn.className = 'rounded-lg border border-aqua-400/40 bg-white/5 px-3 py-2 text-white shadow-[inset_0_0_0_1px_rgba(77,208,225,.35)] hover:bg-white/10';
    verifyBtn.textContent = 'Verify';
    verifyBtn.addEventListener('click', () => openVerify(credential));

    actions.append(zoomBtn, verifyBtn);
    body.append(title, issuer, actions);
    card.append(media, body);
    return card;
}

// Lightbox controls
let currentScale = 1;
function openLightbox(src) {
    const lb = qs('#lightbox');
    const img = qs('#lightbox-image');
    img.src = src;
    currentScale = 1;
    img.style.transform = `scale(${currentScale})`;
    lb.classList.remove('hidden');
    lb.setAttribute('aria-hidden', 'false');
}
function closeLightbox() {
    const lb = qs('#lightbox');
    lb.classList.add('hidden');
    lb.setAttribute('aria-hidden', 'true');
}
function setupLightbox() {
    qs('#lightbox-close').addEventListener('click', closeLightbox);
    qs('.lightbox-backdrop').addEventListener('click', closeLightbox);
    qs('#zoom-in').addEventListener('click', () => {
        currentScale = Math.min(4, currentScale + 0.2);
        qs('#lightbox-image').style.transform = `scale(${currentScale})`;
    });
    qs('#zoom-out').addEventListener('click', () => {
        currentScale = Math.max(0.5, currentScale - 0.2);
        qs('#lightbox-image').style.transform = `scale(${currentScale})`;
    });
    qs('#zoom-reset').addEventListener('click', () => {
        currentScale = 1;
        qs('#lightbox-image').style.transform = `scale(${currentScale})`;
    });
}

// Verification modal
let lastVerificationData = null;
function openVerify(credential) {
    lastVerificationData = credential;
    qs('#verify-credential-name').textContent = credential.name;
    qs('#verify-issuer').textContent = credential.issuer;
    qs('#verify-hash').textContent = credential.verification.hash;
    qs('#verify-chain').textContent = credential.verification.chain;
    const tx = qs('#verify-tx');
    tx.href = credential.verification.txUrl;
    qs('#verify-issued').textContent = formatDate(credential.verification.issued);
    const modal = qs('#verify-modal');
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}
function closeVerify() {
    const modal = qs('#verify-modal');
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}
function setupVerify() {
    qs('#verify-close').addEventListener('click', closeVerify);
    qs('#verify-done').addEventListener('click', closeVerify);
    qs('.modal-backdrop').addEventListener('click', closeVerify);
    qs('#verify-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(lastVerificationData?.verification.hash || '');
            const btn = qs('#verify-copy');
            const old = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => (btn.textContent = old), 1200);
        } catch (_) {
            // noop
        }
    });
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    setupLightbox();
    setupVerify();
    renderProfile(mockProfile);
});


