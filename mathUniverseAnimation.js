// mathUniverseAnimation.js — theme-aware math drift with capped tap bursts
const canvas = document.getElementById('mathUniverseCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const FORMULAS = [
    'E = mc²', 'π ≈ 3.14159', 'e^(iπ) + 1 = 0', 'a² + b² = c²',
    '∫f(x)dx', '∂f/∂x', '∑(n=1 to ∞)', '√(x² + y²)', 'lim(x→0)',
    'f(x) = mx + b', 'sin(θ)', 'cos(θ)', 'tan(θ)', 'log(x)', 'ln(x)',
    'n!', 'x²', 'x³', 'e^x', '2πr', 'πr²', 'F = ma', 'PV = nRT',
    'Δx = vΔt', 'λ = h/p', '∇·E = ρ/ε₀', 'ψ(x,t)',
    'Σ', 'Π', 'Δ', 'Ω', '∞', '≤ ≥', '± ∓', '∈ ∉', '∀ ∃', '∪ ∩',
    'i² = -1', 'z = x + iy', 'φ = (1+√5)/2',
    'e^(iθ) = cosθ + isinθ', 'd/dx[e^x] = e^x', 'sin²θ + cos²θ = 1'
];

const AMBIENT_COUNT = 30;
const MAX_BURSTS = 60;        // hard cap on tap-burst particles
const BURST_PER_TAP = 9;      // particles spawned per tap
const BASE_FADE = 0.005;      // ~3.3 s lifespan
const FAST_FADE = 0.04;       // applied to oldest when over cap (~25 frames)

let width = 0, height = 0;
let ambient = [];
let bursts = [];
let started = false;
let palette = ['#00d2ff', '#7b2fff', '#ff6b35'];

function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const c1 = cs.getPropertyValue('--c1').trim();
    const c2 = cs.getPropertyValue('--c2').trim();
    const c3 = cs.getPropertyValue('--c3').trim();
    palette = [c1 || '#00d2ff', c2 || '#7b2fff', c3 || '#ff6b35'];
}

function pickColor() {
    return palette[Math.floor(Math.random() * palette.length)];
}

function resize() {
    if (!canvas) return;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}

function makeAmbient() {
    return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        text: FORMULAS[Math.floor(Math.random() * FORMULAS.length)],
        size: 12 + Math.random() * 12,
        rot: (Math.random() - 0.5) * 0.4,
        rotV: (Math.random() - 0.5) * 0.0025,
        opacity: 0,
        opacityTarget: 0.22 + Math.random() * 0.22,
        color: pickColor(),
    };
}

function makeBurst(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.4 + Math.random() * 2.6;
    return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        text: FORMULAS[Math.floor(Math.random() * FORMULAS.length)],
        size: 14 + Math.random() * 10,
        rot: (Math.random() - 0.5) * 0.5,
        rotV: (Math.random() - 0.5) * 0.06,
        life: 1.0,
        fadeRate: BASE_FADE,
        color: pickColor(),
        born: performance.now(),
    };
}

function spawnBurst(x, y) {
    for (let i = 0; i < BURST_PER_TAP; i++) bursts.push(makeBurst(x, y));

    // Cap enforcement: when over MAX_BURSTS, accelerate fade on the oldest so
    // the screen never gets crowded and old particles gracefully bow out.
    if (bursts.length > MAX_BURSTS) {
        const overflow = bursts.length - MAX_BURSTS;
        const sorted = bursts.slice().sort((a, b) => a.born - b.born);
        for (let i = 0; i < overflow; i++) sorted[i].fadeRate = FAST_FADE;
    }

    // Nudge ambient particles outward from the tap — subtle, not a shockwave
    for (const a of ambient) {
        const dx = a.x - x, dy = a.y - y;
        const d = Math.max(60, Math.hypot(dx, dy));
        const f = 80 / d;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
    }
}

function updateAmbient(a) {
    a.x += a.vx;
    a.y += a.vy;
    a.vx *= 0.97;
    a.vy *= 0.97;
    a.rot += a.rotV;
    if (a.opacity < a.opacityTarget) a.opacity += 0.005;
    // Wrap edges so the field stays full
    if (a.x < -60) a.x = width + 60;
    else if (a.x > width + 60) a.x = -60;
    if (a.y < -60) a.y = height + 60;
    else if (a.y > height + 60) a.y = -60;
}

function updateBurst(b) {
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= 0.965;
    b.vy *= 0.965;
    b.rot += b.rotV;
    b.rotV *= 0.97;
    b.life -= b.fadeRate;
}

function drawItem(item, alpha) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rot);
    ctx.font = `${item.size}px "JetBrains Mono", "Courier New", monospace`;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = item.color;
    ctx.shadowColor = item.color;
    ctx.shadowBlur = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.text, 0, 0);
    ctx.restore();
}

function loop() {
    ctx.clearRect(0, 0, width, height); // no trail — panel's var(--bg) shows through

    for (const a of ambient) updateAmbient(a);
    for (const a of ambient) drawItem(a, a.opacity);

    for (const b of bursts) updateBurst(b);
    bursts = bursts.filter(b => b.life > 0);
    for (const b of bursts) drawItem(b, b.life);

    requestAnimationFrame(loop);
}

function initMathUniverse() {
    if (started || !canvas || !ctx) return;
    started = true;
    resize();
    readPalette();
    while (ambient.length < AMBIENT_COUNT) ambient.push(makeAmbient());

    // Re-read palette and recolor existing particles when the theme changes
    new MutationObserver(() => {
        readPalette();
        for (const a of ambient) a.color = pickColor();
        for (const b of bursts) b.color = pickColor();
    }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

    loop();
}

window.addEventListener('resize', resize);

// Pointer events on the entire panel — works for mouse, pen, and touch on both
// desktop and mobile. Listening on the panel (not the canvas) so the contact
// card and any element above the canvas also fire bursts. Real interactive
// controls (links/buttons) are skipped so they keep working normally.
const panel = document.getElementById('p7');
if (panel) {
    panel.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a, button, input, textarea, [role="button"]')) return;
        spawnBurst(e.clientX, e.clientY);
    });
}

window.initMathUniverse = initMathUniverse;
