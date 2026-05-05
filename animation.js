import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const canvasEl = document.getElementById('heroCanvas');

// This script is for the hero particle animation.
// It will only run if the canvas with id="heroCanvas" is present in the DOM.
if (canvasEl) {
    const isMobile = window.innerWidth <= 768 || window.matchMedia('(orientation:portrait)').matches;

    // Advanced Simplex 3D & Curl Noise Shader
    const snoiseGLSL = `
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
        float snoise(vec3 v){
            const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
            const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
            vec3 i  = floor(v + dot(v, C.yyy) );
            vec3 x0 = v - i + dot(i, C.xxx) ;
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min( g.xyz, l.zxy );
            vec3 i2 = max( g.xyz, l.zxy );
            vec3 x1 = x0 - i1 + 1.0 * C.xxx;
            vec3 x2 = x0 - i2 + 2.0 * C.xxx;
            vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
            i = mod(i, 289.0 );
            vec4 p = permute( permute( permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
            float n_ = 1.0/7.0;
            vec3  ns = n_ * D.wyz - D.xzx;
            vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_ );
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            vec4 b0 = vec4( x.xy, y.xy );
            vec4 b1 = vec4( x.zw, y.zw );
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
            vec3 p0 = vec3(a0.xy,h.x);
            vec3 p1 = vec3(a0.zw,h.y);
            vec3 p2 = vec3(a1.xy,h.z);
            vec3 p3 = vec3(a1.zw,h.w);
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
            p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
        }

        vec3 curlNoise(vec3 p) {
            const float e = .1;
            vec3 dx = vec3(e, 0.0, 0.0);
            vec3 dy = vec3(0.0, e, 0.0);
            vec3 dz = vec3(0.0, 0.0, e);
            vec3 p_x0 = vec3(snoise(p - dx), snoise(p - dx + 7.23), snoise(p - dx + 13.45));
            vec3 p_x1 = vec3(snoise(p + dx), snoise(p + dx + 7.23), snoise(p + dx + 13.45));
            vec3 p_y0 = vec3(snoise(p - dy), snoise(p - dy + 7.23), snoise(p - dy + 13.45));
            vec3 p_y1 = vec3(snoise(p + dy), snoise(p + dy + 7.23), snoise(p + dy + 13.45));
            vec3 p_z0 = vec3(snoise(p - dz), snoise(p - dz + 7.23), snoise(p - dz + 13.45));
            vec3 p_z1 = vec3(snoise(p + dz), snoise(p + dz + 7.23), snoise(p + dz + 13.45));
            float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
            float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
            float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;
            return normalize(vec3(x, y, z) / (2.0 * e));
        }
    `;

    const computeVelocityShader = `
        ${snoiseGLSL}
        uniform float uTime;
        uniform vec2 uMouse;
        uniform sampler2D tOrigins;

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec3 pos = texture2D(texturePosition, uv).xyz;
            vec3 vel = texture2D(textureVelocity, uv).xyz;
            vec3 org = texture2D(tOrigins, uv).xyz;

            // Elastic return force
            vec3 dir = org - pos;
            vel += dir * 0.04;

            // Fluid Swirl Interaction
            float dist = distance(pos.xy, uMouse);
            if(dist < 2.5) {
                float force = (2.5 - dist) * 0.5;
                vec3 curl = curlNoise(pos * 0.8 + uTime * 0.2);
                vel += curl * force * 0.08;
            }

            vel *= 0.86; // Friction
            gl_FragColor = vec4(vel, 1.0);
        }
    `;

    const computePositionShader = `
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec3 pos = texture2D(texturePosition, uv).xyz;
            vec3 vel = texture2D(textureVelocity, uv).xyz;
            pos += vel;
            gl_FragColor = vec4(pos, 1.0);
        }
    `;

    const particleVertexShader = `
        uniform sampler2D texturePosition;
        uniform sampler2D textureVelocity;
        uniform float uScale;
        attribute vec2 reference;
        varying float vVelocityMap;

        void main() {
            vec3 pos = texture2D(texturePosition, reference).xyz;
            vec3 vel = texture2D(textureVelocity, reference).xyz;

            vVelocityMap = length(vel);
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

            gl_PointSize = uScale * (2.0 + vVelocityMap * 5.0) * (10.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `;

    const particleFragmentShader = `
        uniform vec3 uBaseColor;
        uniform vec3 uFastColor;
        varying float vVelocityMap;
        void main() {
            vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
            if (dot(circCoord, circCoord) > 1.0) discard;

            vec3 finalColor = mix(uBaseColor, uFastColor, vVelocityMap * 2.0);

            float alpha = clamp(vVelocityMap * 10.0 + 0.7, 0.0, 1.0);
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;
        // Mobile uses 64×64 (4 096 particles) — desktop uses 128×128 (16 384)
        const WIDTH = isMobile ? 64 : 128;
        const PARTICLES = WIDTH * WIDTH;

        const scene = new THREE.Scene();
        // Transparent background so bgCanvas network shows through on mobile

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.z = 12;

        const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance", alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);

        // Bloom post-processing — desktop only (too heavy for mobile)
        let composer = null;
        if (!isMobile) {
            const renderScene = new RenderPass(scene, camera);
            const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
            bloomPass.threshold = 0.1;
            bloomPass.strength = 1.8;
            bloomPass.radius = 0.5;
            composer = new EffectComposer(renderer);
            composer.addPass(renderScene);
            composer.addPass(bloomPass);
        }

        // Generate text coordinates
        const textCanvas = document.createElement('canvas');
        textCanvas.width = 512;
        textCanvas.height = 512;
        const ctx = textCanvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#fff';
        ctx.font = '400 75px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('MOHAMED', 20, 200);
        ctx.fillText('YASIEF', 20, 280);

        const imgData = ctx.getImageData(0, 0, 512, 512).data;

        // GPGPU Initializer
        const gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
        const dtPosition = gpuCompute.createTexture();
        const dtVelocity = gpuCompute.createTexture();
        const dtOrigins = gpuCompute.createTexture();

        const posArray = dtPosition.image.data;
        const velArray = dtVelocity.image.data;
        const orgArray = dtOrigins.image.data;

        let pIdx = 0;

        // Collect all bright pixels first, then subsample uniformly so every
        // part of the text is represented even at the smaller mobile particle count
        const brightPixels = [];
        for (let i = 0; i < 512 * 512; i++) {
            if (imgData[i * 4] > 128) brightPixels.push(i);
        }
        const sampleStep = Math.max(1, Math.ceil(brightPixels.length / PARTICLES));

        for (let si = 0; si < brightPixels.length && pIdx < PARTICLES; si += sampleStep) {
            const i = brightPixels[si];
            const px = i % 512;
            const py = Math.floor(i / 512);
            const nx = px / 512;
            const ny = py / 512;

            const vw = window.innerWidth;
            const scale = vw / 58;
            const offsetX = -(scale * 0.48);
            const offsetY = isMobile ? 0.0 : 1.5;

            let x = nx * scale + offsetX + (Math.random() - 0.5) * 0.05;
            let y = -ny * scale + (scale / 2) + offsetY + (Math.random() - 0.5) * 0.05;

            posArray[pIdx * 4] = orgArray[pIdx * 4] = x;
            posArray[pIdx * 4 + 1] = orgArray[pIdx * 4 + 1] = y;
            posArray[pIdx * 4 + 2] = orgArray[pIdx * 4 + 2] = (Math.random() - 0.5) * 0.5;
            posArray[pIdx * 4 + 3] = orgArray[pIdx * 4 + 3] = 1.0;

            velArray[pIdx * 4] = velArray[pIdx * 4 + 1] = velArray[pIdx * 4 + 2] = 0;
            velArray[pIdx * 4 + 3] = 1.0;

            pIdx++;
        }

        // Park unused slots out of sight
        for (let i = pIdx; i < PARTICLES; i++) {
            posArray[i * 4] = orgArray[i * 4] = 9999;
        }

        const velocityVariable = gpuCompute.addVariable("textureVelocity", computeVelocityShader, dtVelocity);
        const positionVariable = gpuCompute.addVariable("texturePosition", computePositionShader, dtPosition);

        gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
        gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);

        velocityVariable.material.uniforms.uTime = { value: 0.0 };
        velocityVariable.material.uniforms.uMouse = { value: new THREE.Vector2(-100, -100) };
        velocityVariable.material.uniforms.tOrigins = { value: dtOrigins };

        gpuCompute.init();

        // Render mesh
        const geometry = new THREE.BufferGeometry();
        const references = new Float32Array(PARTICLES * 2);
        for (let i = 0; i < PARTICLES; i++) {
            references[i * 2] = (i % WIDTH) / WIDTH;
            references[i * 2 + 1] = Math.floor(i / WIDTH) / WIDTH;
        }
        geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));

        function cssToVec3(varName) {
            const hex = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            const c = new THREE.Color(hex);
            return new THREE.Vector3(c.r, c.g, c.b);
        }

        const material = new THREE.ShaderMaterial({
            uniforms: {
                texturePosition: { value: null },
                textureVelocity: { value: null },
                uScale: { value: 1.0 },
                uBaseColor: { value: cssToVec3('--c1') },
                uFastColor: { value: cssToVec3('--c2') },
            },
            vertexShader: particleVertexShader,
            fragmentShader: particleFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        function applyThemeBlend() {
            const isDay = document.body.dataset.theme === 'daylight';
            if (isDay) {
                // On a light background, 'darken' blend mode shows particle colours directly
                // (each channel is min(particle, background)), giving crisp visibility.
                // NormalBlending keeps the shader alpha intact; multiply/screen both produce
                // near-white results against #eef2fb and are unreliable here.
                material.uniforms.uBaseColor.value.copy(cssToVec3('--c2'));
                material.uniforms.uFastColor.value.copy(cssToVec3('--c1'));
                material.blending = THREE.NormalBlending;
                canvasEl.style.mixBlendMode = 'darken';
                canvasEl.style.opacity = '0.9';
            } else {
                material.uniforms.uBaseColor.value.copy(cssToVec3('--c1'));
                material.uniforms.uFastColor.value.copy(cssToVec3('--c2'));
                material.blending = THREE.AdditiveBlending;
                canvasEl.style.mixBlendMode = 'screen';
                canvasEl.style.opacity = '';
            }
            material.needsUpdate = true;
        }

        applyThemeBlend();
        const particleMesh = new THREE.Points(geometry, material);
        new MutationObserver(applyThemeBlend).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
        scene.add(particleMesh);

        const mouse = new THREE.Vector2(-100, -100);
        const targetMouse = new THREE.Vector2(-100, -100);
        const clock = new THREE.Clock();

        window.addEventListener('mousemove', (e) => {
            const aspect = window.innerWidth / window.innerHeight;
            const frustumHeight = 2.0 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
            const frustumWidth = frustumHeight * aspect;
            let worldX = (e.clientX / window.innerWidth) * 2 - 1;
            let worldY = -(e.clientY / window.innerHeight) * 2 + 1;
            worldX *= (frustumWidth / 2);
            worldY *= (frustumHeight / 2);
            targetMouse.x = (worldX - particleMesh.position.x) / particleMesh.scale.x;
            targetMouse.y = (worldY - particleMesh.position.y) / particleMesh.scale.y;
        });

        // Touch: swipe-responsive. Listen on window because heroCanvas has pointer-events:none.
        // Activates only after the finger moves >6px so vertical scroll-snaps still work cleanly.
        let _tStartX = 0, _tStartY = 0, _tSwiping = false;
        window.addEventListener('touchstart', (e) => {
            if (!e.touches.length) return;
            _tStartX = e.touches[0].clientX;
            _tStartY = e.touches[0].clientY;
            _tSwiping = false;
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (!e.touches.length) return;
            const t = e.touches[0];
            const dx = t.clientX - _tStartX, dy = t.clientY - _tStartY;
            if (!_tSwiping && dx * dx + dy * dy < 36) return;
            _tSwiping = true;
            const aspect = window.innerWidth / window.innerHeight;
            const frustumHeight = 2.0 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
            const frustumWidth = frustumHeight * aspect;
            let worldX = (t.clientX / window.innerWidth) * 2 - 1;
            let worldY = -(t.clientY / window.innerHeight) * 2 + 1;
            worldX *= (frustumWidth / 2);
            worldY *= (frustumHeight / 2);
            targetMouse.x = (worldX - particleMesh.position.x) / particleMesh.scale.x;
            targetMouse.y = (worldY - particleMesh.position.y) / particleMesh.scale.y;
        }, { passive: true });
        window.addEventListener('touchend', () => {
            targetMouse.set(-100, -100);
            _tSwiping = false;
        }, { passive: true });

        // Clip the canvas to the visible zone between the hero card and badges so
        // particles never overlap the UI cards above or below.
        function lockHeroCanvasZone() {
            if (!isMobile) { canvasEl.style.clipPath = ''; return; }
            const hcEl    = document.querySelector('#p0 .hc');
            const badsEl  = document.querySelector('#p0 .h-badges');
            const p0El    = document.getElementById('p0');
            if (!hcEl || !badsEl || !p0El) return;
            const ph  = p0El.offsetHeight;
            const top = hcEl.offsetTop + hcEl.offsetHeight;
            const bot = ph - badsEl.offsetTop;
            canvasEl.style.clipPath = `inset(${top}px 0 ${Math.max(0,bot)}px 0)`;
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            if (composer) composer.setSize(window.innerWidth, window.innerHeight);

            const fov = camera.fov * (Math.PI / 180);
            const frustumHeight = 2 * Math.tan(fov / 2) * camera.position.z;
            const frustumWidth = frustumHeight * camera.aspect;

            let minX = Infinity, maxX = -Infinity;
            const origins = dtOrigins.image.data;
            for (let i = 0; i < PARTICLES; i++) {
                if (origins[i * 4] < 9000) {
                    const x = origins[i * 4];
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                }
            }
            const textBaseWidth = maxX - minX;
            const desiredWidth = frustumWidth * (isMobile ? 0.92 : 0.5);
            const scale = desiredWidth / textBaseWidth;

            particleMesh.scale.set(scale, scale, scale);
            particleMesh.position.y = isMobile ? 1.2 : 1.0;
//  More negative = lower on screen.  More positive = higher (behind hero card).
//  Typical safe range:  0.0 (near center) → -3.0 (low, near badges)

            particleMesh.position.x = -((minX + maxX) / 2) * scale + 0; // change 0 to e.g. +0.5 (right) or -0.5 (left)
            material.uniforms.uScale.value = scale;

            lockHeroCanvasZone();
        }

        window.addEventListener('resize', onWindowResize);
        onWindowResize();
        // Re-lock after fonts/layout have settled
        setTimeout(lockHeroCanvasZone, 400);

        function animate() {
            requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();
            mouse.lerp(targetMouse, 0.1);
            velocityVariable.material.uniforms.uTime.value = elapsedTime;
            velocityVariable.material.uniforms.uMouse.value.copy(mouse);
            gpuCompute.compute();
            material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
            material.uniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
            const isDay = document.body.dataset.theme === 'daylight';
            if (composer && !isDay) composer.render(); else renderer.render(scene, camera);
        }

        animate();
}
