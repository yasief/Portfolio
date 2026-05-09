// @ts-nocheck
import * as THREE from 'three';

let threeJSInitialized = false;

export function initThreeJSAnimation() {
    if (threeJSInitialized) return;
    const canvas = document.getElementById('webgl-canvas');
    if (!canvas) return;
    threeJSInitialized = true;

    const IMAGE_SRC = 'Main_Tech.png';

    const isMobileView = window.innerWidth <= 768 || window.matchMedia('(orientation:portrait)').matches;

    const CONFIG = {
        sampling:   { step: 1, threshold: 45 },
        particles:  {
            sizeMin: isMobileView ? 0.1 : 0.8,
            sizeMax: isMobileView ? 0.2 : 1.5,
        },
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
                // Normalize to [-1, 1] in both axes — camera aspect handles display shape.
                // This ensures the full image is always visible on any screen size.
                origX.push((xN - 0.5) * 2.0);
                origY.push((0.5 - yN) * 2.0);
                colors.push(r/255, g/255, b/255);
                sizes.push(CONFIG.particles.sizeMin + Math.random() * (CONFIG.particles.sizeMax - CONFIG.particles.sizeMin));
                seeds.push(Math.random());
                uvs.push(xN, yN);
            }
        }
        const n = origX.length;

        // Measure actual content bounding box (in normalised [-1,1] space)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < n; i++) {
            if (origX[i] < minX) minX = origX[i];
            if (origX[i] > maxX) maxX = origX[i];
            if (origY[i] < minY) minY = origY[i];
            if (origY[i] > maxY) maxY = origY[i];
        }

        return {
            imgAspect, count: n,
            origX: new Float32Array(origX),
            origY: new Float32Array(origY),
            colors: new Float32Array(colors),
            sizes:  new Float32Array(sizes),
            seeds:  new Float32Array(seeds),
            uvs:    new Float32Array(uvs),
            minX, maxX, minY, maxY,
            cx: (minX + maxX) / 2,
            cy: (minY + maxY) / 2,
        };
    }

    // ── Scene / renderer ──────────────────────────────────────────────────────
    let scene, camera, renderer, clock;
    let particleMesh, uniforms;
    let imgAspectGlobal = 1; // set after image loads, used by resize

    function getCanvasSize() {
        const parent = canvas.parentElement;
        const w = (parent ? parent.clientWidth  : 0) || canvas.clientWidth  || window.innerWidth;
        const h = (parent ? parent.clientHeight : 0) || canvas.clientHeight || window.innerHeight;
        return { w: Math.max(w, 1), h: Math.max(h, 1) };
    }

    // Bounding box of particle content (set after extraction)
    let contentMinX = -1, contentMaxX = 1, contentMinY = -1, contentMaxY = 1;
    let contentCX = 0, contentCY = 0; // centre of content

    // Particles are stored in [-1,1] x [-1,1] (image-normalized).
    // We measure the actual content bounding box, centre it, then scale to fit.
    function applyFitScale() {
        if (!particleMesh) return;
        const { w, h } = getCanvasSize();
        const canvasAspect = w / h;
        const imgAspect    = imgAspectGlobal;

        // Restore image proportions: X was normalised by dividing by imgW,
        // so multiply X by imgAspect to get correct shape back.
        const scaleX = imgAspect;
        const scaleY = 1.0;

        // Content bounds in scaled (screen-proportion) space
        const scaledW = (contentMaxX - contentMinX) * scaleX;
        const scaledH = (contentMaxY - contentMinY) * scaleY;

        // Camera frustum: X in [-canvasAspect, canvasAspect], Y in [-1, 1]
        const frustumW = canvasAspect * 2;
        const frustumH = 2;

        // Uniform scale so content fits inside frustum with 4% padding
        const fitScale = Math.min(
            (frustumW / scaledW) * 0.96,
            (frustumH / scaledH) * 0.96
        );

        particleMesh.scale.set(scaleX * fitScale, scaleY * fitScale, 1);

        // Centre the mesh so text is centred in the canvas
        particleMesh.position.x = -contentCX * scaleX * fitScale;
        particleMesh.position.y = -contentCY * scaleY * fitScale;
    }

    function initScene() {
        scene = new THREE.Scene();
        const { w, h } = getCanvasSize();
        const aspect = w / h;
        camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
        camera.position.z = 5;
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: true });
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobileView ? 1.0 : 2));
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
            uPixelRatio:   { value: Math.min(window.devicePixelRatio, isMobileView ? 1.0 : 2) },
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

                    // Night-mode idle gradient — site palette: cyan → violet → pink
                    // matches --c1 #00d2ff, --c2 #7b2fff, --c5 #ff3e8a
                    vec3 colorTop = vec3(1.0,  0.243, 0.541); // #ff3e8a pink  (top)
                    vec3 colorMid = vec3(0.482,0.188, 1.0);   // #7b2fff violet (mid)
                    vec3 colorBot = vec3(0.0,  0.824, 1.0);   // #00d2ff cyan  (bot)
                    float gm = aUV.y * 0.7 + aUV.x * 0.3;
                    vec3 gradCol = gm < 0.5
                        ? mix(colorTop, colorMid, gm * 2.0)
                        : mix(colorMid, colorBot, (gm - 0.5) * 2.0);

                    // Desaturate raw image colour so it's subtle in the idle state
                    float luma = dot(aColor, vec3(0.299, 0.587, 0.114));
                    vec3 desatColor = mix(vec3(luma), aColor, 0.35); // 35% saturation

                    // Day-mode: 3-stop duotone using live theme tokens
                    float t = clamp(aUV.y * 0.65 + aUV.x * 0.35, 0.0, 1.0);
                    vec3 dayCol = t < 0.5
                        ? mix(uDayA, uDayC, t * 2.0)
                        : mix(uDayC, uDayB, (t - 0.5) * 2.0);
                    float lumaSrc = clamp(dot(aColor, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
                    dayCol *= mix(0.55, 1.0, lumaSrc);
                    vec3 baseCol = mix(desatColor, dayCol, uDayMode);

                    // On hover: blend toward the site-palette gradient
                    vec3 col = mix(baseCol, gradCol, pull * 0.9);
                    col += vec3(0.0, 0.82, 1.0) * pull * 0.25; // cyan highlight on pull

                    float opacity = 0.55 + sin(uTime * 1.5 + aSeed * 6.283) * 0.2;
                    opacity = mix(opacity, 1.0, pull * 0.9);
                    opacity = mix(opacity, min(1.0, opacity + 0.35), uDayMode);
                    float sz = aSize * (1.0 + pull * 1.1);
                    sz *= mix(1.0, 1.25, uDayMode);

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
        applyFitScale();
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
        const ndcX = ((clientX - rect.left) / rect.width)  *  2 - 1;
        const ndcY = -((clientY - rect.top)  / rect.height) *  2 + 1;
        const wx = ndcX * camera.right;
        const wy = ndcY;
        // Convert to particle-local space (undo mesh scale + position offset)
        const sx = particleMesh ? particleMesh.scale.x : 1;
        const sy = particleMesh ? particleMesh.scale.y : 1;
        const px = particleMesh ? particleMesh.position.x : 0;
        const py = particleMesh ? particleMesh.position.y : 0;
        return [(wx - px) / sx, (wy - py) / sy];
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
        const { w, h } = getCanvasSize();
        const aspect = w / h;
        camera.left = -aspect; camera.right = aspect;
        camera.top  = 1;       camera.bottom = -1;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        const pr = Math.min(window.devicePixelRatio, isMobileView ? 1.0 : 2);
        renderer.setPixelRatio(pr);
        if (uniforms) uniforms.uPixelRatio.value = pr;
        applyFitScale();
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
            uniforms.uDayA.value.copy(readCssColor('--c1', '#2563eb')); // fallback to daylight blue
            uniforms.uDayB.value.copy(readCssColor('--c2', '#7c3aed')); // fallback to daylight violet
            uniforms.uDayC.value.copy(readCssColor('--c5', '#db2777')); // fallback to daylight pink
        }
        particleMesh.material.needsUpdate = true;
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    async function init() {
        // On mobile the canvas container is laid out by flex after panel switch,
        // so wait one rAF to ensure CSS dimensions are settled before reading size.
        await new Promise(r => requestAnimationFrame(r));

        initScene();
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = IMAGE_SRC;
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error('Image load failed'));
        });
        const particleData = extractParticlesFromImage(image);
        imgAspectGlobal = particleData.imgAspect;
        contentMinX = particleData.minX; contentMaxX = particleData.maxX;
        contentMinY = particleData.minY; contentMaxY = particleData.maxY;
        contentCX   = particleData.cx;  contentCY   = particleData.cy;
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
        // Fire a resize once more after a short delay to catch late layout shifts on mobile
        setTimeout(onResize, 300);
        animate();
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.add('hidden');
            setTimeout(() => loader.style.display = 'none', 900);
        }
    }

    init().catch(() => { /* silent — animation is decorative, don't break the page */ });
}

window.initThreeJSAnimation = initThreeJSAnimation;
