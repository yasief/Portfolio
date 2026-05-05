// @ts-nocheck
// Ripple background for #p-threejs — sits behind the webgl-canvas (z-index 0)

(function () {
    const panel  = document.getElementById('p-threejs');
    const canvas = document.getElementById('ripple-canvas');
    if (!panel || !canvas) return;

    const ctx = canvas.getContext('2d');
    const ripples = [];

    function resize() {
        canvas.width  = panel.clientWidth;
        canvas.height = panel.clientHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    function spawnRipple(x, y) {
        ripples.push({ x, y, r: 0, alpha: 0.55, maxR: Math.min(canvas.width, canvas.height) * 0.35 });
    }

    // Mouse
    panel.addEventListener('mousemove', (e) => {
        const rect = panel.getBoundingClientRect();
        if (Math.random() < 0.08) spawnRipple(e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: true });

    panel.addEventListener('mouseenter', (e) => {
        const rect = panel.getBoundingClientRect();
        spawnRipple(e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: true });

    // Touch
    panel.addEventListener('touchmove', (e) => {
        const rect = panel.getBoundingClientRect();
        const t = e.touches[0];
        if (Math.random() < 0.15) spawnRipple(t.clientX - rect.left, t.clientY - rect.top);
    }, { passive: true });

    panel.addEventListener('touchstart', (e) => {
        const rect = panel.getBoundingClientRect();
        const t = e.touches[0];
        spawnRipple(t.clientX - rect.left, t.clientY - rect.top);
    }, { passive: true });

    const SPEED = 2.2;
    const DECAY = 0.012;
    const LINE  = 1.2;

    function draw() {
        requestAnimationFrame(draw);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = ripples.length - 1; i >= 0; i--) {
            const rp = ripples[i];
            rp.r     += SPEED + rp.r * 0.018;
            rp.alpha -= DECAY;
            if (rp.alpha <= 0) { ripples.splice(i, 1); continue; }

            const prog = rp.r / rp.maxR;
            const fade = rp.alpha * (1 - prog * prog);

            // outer ring
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0,238,255,${fade * 0.7})`;
            ctx.lineWidth   = LINE;
            ctx.stroke();

            // inner echo ring (half size, follows behind)
            if (rp.r > 18) {
                ctx.beginPath();
                ctx.arc(rp.x, rp.y, rp.r * 0.55, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0,238,255,${fade * 0.3})`;
                ctx.lineWidth   = LINE * 0.6;
                ctx.stroke();
            }
        }
    }

    draw();
})();
