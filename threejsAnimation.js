// @ts-nocheck
import * as THREE from 'three';

let threeJSInitialized = false;

export function initThreeJSAnimation() {
    if (threeJSInitialized) return;
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) return;
    threeJSInitialized = true;

    const IMAGE_SRC = 'Main_Tech.png';

    const CONFIG = {
        sampling:   { step: 1, threshold: 45 },
        particles:  { sizeMin: 0.8, sizeMax: 1.5 },
        spring:     { stiffness: 0.22, damping: 0.72, magnetRadius: 0.35, magnetStrength: 0.55 },
        animation:  { hoverTransition: 0.08 },
    };

    // ── Image → particle data ─────────────────────────────────────────────────
    function extractParticlesFromImage(image) {
        const offscreen = document.createElement('canvas');
        const ctx = offscreen.getContext('2d', { willReadFrequently: true });
        const imgW = image.naturalWidth, imgH = image.naturalHeight;
        offscreen.width = imgW; offscreen.height = imgH;
        ctx.drawImage(image, 0, 0);
        const { data: px } = ctx.getImageData(0, 0, imgW, imgH);
        const imgAspect = imgW / imgH;
        const { step, threshold } = CONFIG.sampling;
        const origX = [], origY = [], colors = [], sizes = [], seeds = [], uvs = [];
        for (let y = 0; y < imgH; y += step) {
            for (let x = 0; x < imgW; x += step) {
                const i = (y * imgW + x) * 4;
                const r = px[i], g = px[i+1], b = px[i+2];
                const luma = Math.sqrt(0.2126*r*r + 0.7152*g*g + 0.0722*b*b);
                if (luma < threshold) continue;
                const xN = x / imgW, yN = y / imgH;
                origX.push((xN - 0.5) * 2.0 * imgAspect);
                origY.push((0.5 - yN) * 2.0);
                colors.push(r/255, g/255, b/255);
                sizes.push(CONFIG.particles.sizeMin + Math.random() * (CONFIG.particles.sizeMax - CONFIG.particles.sizeMin));
                seeds.push(Math.random());
                uvs.push(xN, yN);
            }
        }
        const n = origX.length;
        return {
            imgAspect, count: n,
            origX: new Float32Array(origX),
            origY: new Float32Array(origY),
            colors: new Float32Array(colors),
            sizes:  new Float32Array(sizes),
            seeds:  new Float32Array(seeds),
            uvs:    new Float32Array(uvs),
        };
    }

    // ── Scene / renderer ──────────────────────────────────────────────────────
    let scene, camera, renderer, clock;
    let particleMesh, uniforms;

    function initScene() {
        scene = new THREE.Scene();
        const w = canvas.clientWidth  || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        const aspect = w / h;
        camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
        camera.position.z = 5;
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: true });
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        clock = new THREE.Clock();
    }

    // ── Spring physics state (CPU) ────────────────────────────────────────────
    let n = 0;
    let origX, origY;           // original image positions
    let velX, velY;             // per-particle velocity
    let dispX, dispY;           // current displacement from origin
    // The GPU position buffer is origPos + disp, uploaded every frame
    let gpuPositions;           // Float32Array length n*3

    function initSpringState(particleData) {
        n = particleData.count;
        origX = particleData.origX;
        origY = particleData.origY;
        velX  = new Float32Array(n);
        velY  = new Float32Array(n);
        dispX = new Float32Array(n);
        dispY = new Float32Array(n);
        gpuPositions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            gpuPositions[i*3]   = origX[i];
            gpuPositions[i*3+1] = origY[i];
            gpuPositions[i*3+2] = 0;
        }
    }

    let mouseX = -999, mouseY = -999;
    let isHovering = false;
    let hoverProgress = 0;

    function stepSprings(dt) {
        const { stiffness, damping, magnetRadius, magnetStrength } = CONFIG.spring;
        const r2 = magnetRadius * magnetRadius;
        const posAttr = particleMesh.geometry.attributes.position;

        for (let i = 0; i < n; i++) {
            // current world position
            const cx = origX[i] + dispX[i];
            const cy = origY[i] + dispY[i];

            // magnet force toward cursor
            let fx = 0, fy = 0;
            if (hoverProgress > 0.01) {
                const dx = mouseX - cx, dy = mouseY - cy;
                const d2 = dx*dx + dy*dy;
                if (d2 < r2 && d2 > 0.000001) {
                    const falloff = 1 - d2 / r2;
                    const strength = falloff * falloff * magnetStrength * hoverProgress;
                    const inv = 1 / Math.sqrt(d2);
                    fx = dx * inv * strength;
                    fy = dy * inv * strength;
                }
            }

            // spring back to origin
            fx -= stiffness * dispX[i];
            fy -= stiffness * dispY[i];

            // integrate
            velX[i] = (velX[i] + fx * dt) * damping;
            velY[i] = (velY[i] + fy * dt) * damping;
            dispX[i] += velX[i];
            dispY[i] += velY[i];

            gpuPositions[i*3]   = origX[i] + dispX[i];
            gpuPositions[i*3+1] = origY[i] + dispY[i];
        }

        posAttr.array = gpuPositions;
        posAttr.needsUpdate = true;
    }

    // ── Particle mesh ─────────────────────────────────────────────────────────
    function createParticleSystem(particleData) {
        const geometry = new THREE.BufferGeometry();

        // positions start at original image locations
        geometry.setAttribute('position',    new THREE.BufferAttribute(gpuPositions.slice(), 3));
        geometry.setAttribute('aOriginalPos',new THREE.BufferAttribute(
            (() => { const a = new Float32Array(n*3); for(let i=0;i<n;i++){a[i*3]=origX[i];a[i*3+1]=origY[i];} return a; })(), 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(particleData.colors, 3));
        geometry.setAttribute('aSize',  new THREE.BufferAttribute(particleData.sizes,  1));
        geometry.setAttribute('aSeed',  new THREE.BufferAttribute(particleData.seeds,  1));
        geometry.setAttribute('aUV',    new THREE.BufferAttribute(particleData.uvs,    2));

        uniforms = {
            uTime:         { value: 0 },
            uHoverProgress:{ value: 0 },
            uPixelRatio:   { value: Math.min(window.devicePixelRatio, 2) },
            // Day-mode duotone: overrides per-pixel aColor with the same blue → pink →
            // violet gradient the rest of the site's day theme uses (CTA fills, achievement
            // numbers, progress bar). Three theme tokens read live in syncTheme().
            uDayMode:      { value: 0.0 },
            uDayA:         { value: new THREE.Color('#000000') }, // --c1 blue
            uDayB:         { value: new THREE.Color('#000000') }, // --c2 violet
            uDayC:         { value: new THREE.Color('#000000') }, // --c5 pink (mid bridge)
        };

        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: `
                uniform float uTime;
                uniform float uHoverProgress;
                uniform float uPixelRatio;
                uniform float uDayMode;
                uniform vec3  uDayA;
                uniform vec3  uDayB;
                uniform vec3  uDayC;
                attribute vec3  aOriginalPos;
                attribute vec3  aColor;
                attribute float aSize;
                attribute float aSeed;
                attribute vec2  aUV;
                varying vec3  vColor;
                varying float vOpacity;
                varying float vPull;
                void main() {
                    // idle breath / wave (uses original position as reference)
                    float breath = sin(uTime * 0.8 + aSeed * 6.283) * 0.015;
                    float wave   = sin(aOriginalPos.x * 3.0 + uTime * 1.2) * 0.008
                                 + cos(aOriginalPos.y * 2.5 + uTime * 0.9) * 0.006;
                    vec3 pos = position + vec3(wave, breath, 0.0);

                    // how far from origin (spring displacement magnitude)
                    vec2 disp = position.xy - aOriginalPos.xy;
                    float dispLen = length(disp);
                    float pull = clamp(dispLen * 4.0, 0.0, 1.0) * uHoverProgress;

                    // colour: image colour → warm gold-white as pulled
                    vec3 colorTop = vec3(1.0, 0.15, 0.25);
                    vec3 colorMid = vec3(0.6, 0.9,  0.1);
                    vec3 colorBot = vec3(0.0, 0.6,  1.0);
                    float gm = aUV.y * 0.7 + aUV.x * 0.3;
                    vec3 gradCol = gm < 0.5
                        ? mix(colorTop, colorMid, gm * 2.0)
                        : mix(colorMid, colorBot, (gm - 0.5) * 2.0);

                    // Day-mode: build a 3-stop duotone gradient driven by the UV diagonal
                    // (top-right warm violet → mid teal → bottom-left orange) and a small
                    // luma-driven mask so darker source pixels stay slightly darker.
                    float t = clamp(aUV.y * 0.65 + aUV.x * 0.35, 0.0, 1.0);
                    vec3 dayCol = t < 0.5
                        ? mix(uDayA, uDayC, t * 2.0)
                        : mix(uDayC, uDayB, (t - 0.5) * 2.0);
                    float lumaSrc = clamp(dot(aColor, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
                    dayCol *= mix(0.55, 1.0, lumaSrc);          // shade by source luma
                    vec3 baseCol = mix(aColor, dayCol, uDayMode);

                    vec3 col = mix(baseCol, gradCol, pull * 0.85);
                    col += vec3(1.0, 0.95, 0.6) * pull * 0.35;

                    float opacity = 0.65 + sin(uTime * 1.5 + aSeed * 6.283) * 0.3;
                    opacity = mix(opacity, 1.0, pull * 0.9);
                    // In day mode, push opacity higher so the duotone reads punchily
                    // through the multiply blend.
                    opacity = mix(opacity, min(1.0, opacity + 0.35), uDayMode);
                    float sz = aSize * (1.0 + pull * 1.1);
                    sz *= mix(1.0, 1.25, uDayMode); // slightly larger dots in day mode

                    gl_Position  = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = sz * uPixelRatio;
                    vColor   = col;
                    vOpacity = opacity;
                    vPull    = pull;
                }
            `,
            fragmentShader: `
                precision highp float;
                varying vec3  vColor;
                varying float vOpacity;
                varying float vPull;
                void main() {
                    vec2 uv   = gl_PointCoord - 0.5;
                    float d   = length(uv);
                    if (d > 0.5) discard;
                    float alpha = (1.0 - smoothstep(0.35, 0.5, d)) * vOpacity;
                    float core  = 1.0 - smoothstep(0.0, 0.3, d);
                    vec3  col   = vColor + vColor * core * vPull * 0.5;
                    gl_FragColor = vec4(col, alpha);
                }
            `,
            transparent: true,
            depthTest:   false,
            depthWrite:  false,
            blending:    THREE.AdditiveBlending,
        });

        particleMesh = new THREE.Points(geometry, material);
        scene.add(particleMesh);
    }

    // ── Lightning trail ───────────────────────────────────────────────────────
    const TRAIL_SEGMENTS = 32;
    let trailMesh, trailUniforms, trailPositions, trailAlphas;
    const trailHistory = [];

    function createLightningTrail() {
        const geo = new THREE.BufferGeometry();
        trailPositions = new Float32Array(TRAIL_SEGMENTS * 3);
        trailAlphas    = new Float32Array(TRAIL_SEGMENTS);
        for (let i = 0; i < TRAIL_SEGMENTS; i++) {
            trailPositions[i*3] = -999; trailPositions[i*3+1] = -999;
            trailAlphas[i] = 0;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        geo.setAttribute('aAlpha',   new THREE.BufferAttribute(trailAlphas,    1));
        trailUniforms = { uHoverProgress: { value: 0 } };
        const mat = new THREE.ShaderMaterial({
            uniforms: trailUniforms,
            vertexShader: `
                attribute float aAlpha;
                varying float vAlpha;
                void main() {
                    vAlpha = aAlpha;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform float uHoverProgress;
                varying float vAlpha;
                void main() {
                    vec3 col = mix(vec3(0.7, 0.9, 1.0), vec3(1.0), vAlpha);
                    gl_FragColor = vec4(col, vAlpha * uHoverProgress);
                }
            `,
            transparent: true, depthTest: false, depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        trailMesh = new THREE.Line(geo, mat);
        scene.add(trailMesh);
    }

    function updateLightningTrail() {
        if (!trailMesh) return;
        if (isHovering) {
            trailHistory.unshift({ x: mouseX, y: mouseY });
            if (trailHistory.length > TRAIL_SEGMENTS) trailHistory.length = TRAIL_SEGMENTS;
        } else if (trailHistory.length > 0) {
            trailHistory.pop();
        }
        const t = clock.getElapsedTime();
        for (let i = 0; i < TRAIL_SEGMENTS; i++) {
            const s = trailHistory[i];
            if (s) {
                const amp = 0.022 * (1 - i / TRAIL_SEGMENTS);
                const jx = (Math.sin(t*30 + i*1.7) + Math.sin(t*47 + i*0.9)) * 0.5 * amp;
                const jy = (Math.cos(t*33 + i*2.1) + Math.cos(t*41 + i*1.3)) * 0.5 * amp;
                trailPositions[i*3]   = s.x + jx;
                trailPositions[i*3+1] = s.y + jy;
                trailPositions[i*3+2] = 0;
                trailAlphas[i] = Math.pow(1 - i / TRAIL_SEGMENTS, 1.5);
            } else {
                trailPositions[i*3] = -999; trailPositions[i*3+1] = -999;
                trailAlphas[i] = 0;
            }
        }
        trailMesh.geometry.attributes.position.needsUpdate = true;
        trailMesh.geometry.attributes.aAlpha.needsUpdate   = true;
        trailUniforms.uHoverProgress.value = hoverProgress;
    }

    // ── Animate loop ──────────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05); // cap at 50 ms
        const elapsed = clock.getElapsedTime();
        uniforms.uTime.value = elapsed;

        hoverProgress += (( isHovering ? 1 : 0 ) - hoverProgress) * CONFIG.animation.hoverTransition;
        uniforms.uHoverProgress.value = hoverProgress;

        stepSprings(dt);
        updateLightningTrail();
        renderer.render(scene, camera);
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    function worldCoords(clientX, clientY) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width)  *  2 - 1;
        const y = -((clientY - rect.top)  / rect.height) *  2 + 1;
        return [x * camera.right, y];
    }

    function onMouseMove(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top  && e.clientY <= rect.bottom;
        isHovering = over;
        if (over) { [mouseX, mouseY] = worldCoords(e.clientX, e.clientY); }
    }

    let _swipeStartX = 0, _swipeStartY = 0, _isSwiping = false;

    function onTouchStart(e) {
        if (e.touches.length > 0) {
            _swipeStartX = e.touches[0].clientX;
            _swipeStartY = e.touches[0].clientY;
            _isSwiping = false;
        }
    }

    function onTouchMove(e) {
        if (e.touches.length === 0) return;
        const t = e.touches[0];
        const dx = t.clientX - _swipeStartX, dy = t.clientY - _swipeStartY;
        if (!_isSwiping && dx*dx + dy*dy < 36) return;
        _isSwiping = true;
        isHovering = true;
        [mouseX, mouseY] = worldCoords(t.clientX, t.clientY);
    }

    function onTouchEnd() { isHovering = false; _isSwiping = false; }

    function onResize() {
        const w = canvas.clientWidth  || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        const aspect = w / h;
        camera.left = -aspect; camera.right = aspect;
        camera.top  = 1;       camera.bottom = -1;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        const pr = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(pr);
        if (uniforms) uniforms.uPixelRatio.value = pr;
    }

    // ── Theme ─────────────────────────────────────────────────────────────────
    function readCssColor(varName, fallback) {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        try { return new THREE.Color(raw || fallback); } catch (e) { return new THREE.Color(fallback); }
    }
    function syncTheme() {
        if (!particleMesh) return;
        const theme = document.body.dataset.theme || 'night';
        const isDay = theme === 'daylight';
        particleMesh.material.blending = isDay ? THREE.NormalBlending : THREE.AdditiveBlending;
        if (uniforms) {
            uniforms.uDayMode.value = isDay ? 1.0 : 0.0;
            // Pull live theme tokens so the portrait gradient matches the rest of the site
            // (CTA fill, progress bar, achievement numbers all use --c1 → --c2 cool gradient).
         const black = new THREE.Color('#005658e0');
            uniforms.uDayA.value.copy(black);
            uniforms.uDayB.value.copy(black);
            uniforms.uDayC.value.copy(black);
        }
        particleMesh.material.needsUpdate = true;
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
        initScene();
        const image = new Image();
        image.src = IMAGE_SRC;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Image load failed'));
        });
        const particleData = extractParticlesFromImage(image);
        initSpringState(particleData);
        createParticleSystem(particleData);
        createLightningTrail();
        syncTheme();
        new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
        window.addEventListener('mousemove',  onMouseMove,  { passive: true });
        renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
        renderer.domElement.addEventListener('touchmove',  onTouchMove,  { passive: true });
        renderer.domElement.addEventListener('touchend',   onTouchEnd,   { passive: true });
        window.addEventListener('resize', onResize, { passive: true });
        animate();
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.add('hidden');
            setTimeout(() => loader.style.display = 'none', 900);
        }
    }

    init().catch(err => console.error('[ThreeJS] Init failed:', err));
}

window.initThreeJSAnimation = initThreeJSAnimation;
