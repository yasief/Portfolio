import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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
    varying float vVelocityMap;
    void main() {
        vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
        if (dot(circCoord, circCoord) > 1.0) discard;

        // Sync with Yasief's UI Colors: --c1 (Cyan) and --c2 (Purple)
        vec3 baseColor = vec3(0.0, 0.82, 1.0);
        vec3 fastColor = vec3(0.48, 0.18, 1.0);
        vec3 finalColor = mix(baseColor, fastColor, vVelocityMap * 2.0);

        float alpha = clamp(vVelocityMap * 10.0 + 0.7, 0.0, 1.0);
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// Engine Setup
const WIDTH = 128; // 16,384 particles
const PARTICLES = WIDTH * WIDTH;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#04080f'); // Matches var(--bg)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 12;

const canvasEl = document.getElementById('heroCanvas');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// Bloom Post-Processing
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.1;
bloomPass.strength = 1.8;
bloomPass.radius = 0.5;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// Generate Text Coordinates
const textCanvas = document.createElement('canvas');
textCanvas.width = 512;
textCanvas.height = 512;
const ctx = textCanvas.getContext('2d', { willReadFrequently: true });
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, 512, 512);
ctx.fillStyle = '#fff';
ctx.font = '400 75px Outfit, sans-serif'; // Made font slightly thicker/larger internally
ctx.textAlign = 'left';
ctx.textBaseline = 'middle';

// Shifted closer to the left edge of the hidden canvas
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
const isMobile = window.innerWidth < 768;

for(let i = 0; i < 512 * 512; i++) {
    if(imgData[i * 4] > 128 && pIdx < PARTICLES) {
        let px = i % 512;
        let py = Math.floor(i / 512);

        let nx = px / 512;
        let ny = py / 512;

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let scale = vw / (isMobile ? 38 : 58);
        let offsetX = -(scale * 0.48);
        let offsetY = isMobile ? (vh / 300) : 1.5;

        let x = nx * scale + offsetX;
        let y = -ny * scale + (scale / 2) + offsetY;

        x += (Math.random() - 0.5) * 0.05;
        y += (Math.random() - 0.5) * 0.05;

        posArray[pIdx * 4] = orgArray[pIdx * 4] = x;
        posArray[pIdx * 4 + 1] = orgArray[pIdx * 4 + 1] = y;
        posArray[pIdx * 4 + 2] = orgArray[pIdx * 4 + 2] = (Math.random() - 0.5) * 0.5;
        posArray[pIdx * 4 + 3] = orgArray[pIdx * 4 + 3] = 1.0;

        velArray[pIdx * 4] = velArray[pIdx * 4 + 1] = velArray[pIdx * 4 + 2] = 0;
        velArray[pIdx * 4 + 3] = 1.0;

        pIdx++;
    }
}

// Hide extra particles out of sight
for(let i = pIdx; i < PARTICLES; i++) {
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

// Render Mesh
const geometry = new THREE.BufferGeometry();
const references = new Float32Array(PARTICLES * 2);

for (let i = 0; i < PARTICLES; i++) {
    references[i * 2] = (i % WIDTH) / WIDTH;
    references[i * 2 + 1] = Math.floor(i / WIDTH) / WIDTH;
}

geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));
geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));

const material = new THREE.ShaderMaterial({
    uniforms: {
        texturePosition: { value: null },
        textureVelocity: { value: null },
        uScale: { value: 1.0 }
    },
    vertexShader: particleVertexShader,
    fragmentShader: particleFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
});

const particleMesh = new THREE.Points(geometry, material);
scene.add(particleMesh);

// Interaction & Resizing
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

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);

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

    const desiredWidth = frustumWidth * (window.innerWidth < 768 ? 0.9 : 0.5);
    const scale = desiredWidth / textBaseWidth;

    particleMesh.scale.set(scale, scale, scale);
    particleMesh.position.y = 1.0;

    const textCenterX = (minX + maxX) / 2;
    particleMesh.position.x = -textCenterX * scale;

    material.uniforms.uScale.value = scale;
}

window.addEventListener('resize', onWindowResize);
onWindowResize();

// Main Render Loop
function animate() {
    requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();
    mouse.lerp(targetMouse, 0.1);

    velocityVariable.material.uniforms.uTime.value = elapsedTime;
    velocityVariable.material.uniforms.uMouse.value.copy(mouse);

    gpuCompute.compute();

    material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

    composer.render();
}

animate();
/* HERO NETWORK BACKGROUND CANVAS */
(function(){
  // Pointing to the new background canvas
  const c = document.getElementById('bgCanvas');
  if(!c) return;
  const ctx = c.getContext('2d');
  let W,H;
  function resize(){W=c.width=window.innerWidth;H=c.height=window.innerHeight;}
  resize();window.addEventListener('resize',resize);

  const nodes=[];
  for(let i=0;i<90;i++) nodes.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.5+.5,pulse:Math.random()*Math.PI*2,bright:Math.random()>.88});
  const parts=[];
  for(let i=0;i<40;i++) parts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.8,vy:(Math.random()-.5)*.8,a:Math.random()*.4+.1,r:Math.random()*1.5+.5,col:Math.random()>.7?'0,255,157':Math.random()>.5?'123,47,255':'0,210,255'});

  let mouseX=W/2,mouseY=H/2;
  document.addEventListener('mousemove',e=>{mouseX=e.clientX;mouseY=e.clientY;});

  function draw(){
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle='rgba(0,210,255,0.025)';ctx.lineWidth=1;
    for(let x=0;x<W;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

    for(let a=0;a<nodes.length;a++){
      const n=nodes[a];
      for(let b=a+1;b<nodes.length;b++){
        const m=nodes[b],dx=n.x-m.x,dy=n.y-m.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<140){ctx.strokeStyle=`rgba(0,210,255,${(1-dist/140)*.13})`;ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(m.x,m.y);ctx.stroke();}
      }
    }
    nodes.forEach(n=>{
      const dx=n.x-mouseX,dy=n.y-mouseY,dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<200){ctx.strokeStyle=`rgba(0,210,255,${(1-dist/200)*.28})`;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(n.x,n.y);ctx.lineTo(mouseX,mouseY);ctx.stroke();}
    });
    nodes.forEach(n=>{
      n.pulse+=.03;
      const gl=n.bright?(Math.sin(n.pulse)*.5+.5):.3;
      ctx.fillStyle=n.bright?`rgba(0,255,157,${gl})`:`rgba(0,210,255,${gl*.5+.2})`;
      if(n.bright){ctx.shadowBlur=8;ctx.shadowColor='rgba(0,255,157,0.5)';}
      ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
      n.x+=n.vx;n.y+=n.vy;
      if(n.x<0||n.x>W)n.vx*=-1;if(n.y<0||n.y>H)n.vy*=-1;
    });
    parts.forEach(p=>{
      ctx.fillStyle=`rgba(${p.col},${p.a})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      p.x+=p.vx;p.y+=p.vy;
      if(p.x<0)p.x=W;if(p.x>W)p.x=0;if(p.y<0)p.y=H;if(p.y>H)p.y=0;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

let threeJSInitialized = false;

function initThreeJSAnimation() {
    if (threeJSInitialized) return;
    threeJSInitialized = true;

    import('three').then(THREE => {
            const IMAGE_SRC = 'data:image/webp;base64,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';


        const VERTEX_SHADER = /* glsl */`
            precision highp float;
            uniform float uTime;
            uniform float uHoverProgress;
            uniform vec2  uMouse3D;
            uniform float uPixelRatio;
            attribute vec3  aOriginalPos;
            attribute vec3  aColor;
            attribute float aSize;
            attribute float aSeed;
            attribute vec2  aUV;
            varying vec3  vColor;
            varying float vOpacity;
            varying float vHover;
            float hash(float n) { return fract(sin(n) * 43758.5453123); }
            void main() {
                vec3 pos = aOriginalPos;
                vec3 colorTop = vec3(1.0, 0.15, 0.25);
                vec3 colorMid = vec3(0.6, 0.9, 0.1);
                vec3 colorBot = vec3(0.0, 0.6, 1.0);
                float gradMix = aUV.y * 0.7 + aUV.x * 0.3;
                vec3 hoverGradientColor;
                if (gradMix < 0.5) {
                    hoverGradientColor = mix(colorTop, colorMid, gradMix * 2.0);
                } else {
                    hoverGradientColor = mix(colorMid, colorBot, (gradMix - 0.5) * 2.0);
                }
                float idleBreath = sin(uTime * 0.8 + aSeed * 6.283) * 0.015;
                float idleWave   = sin(pos.x * 3.0 + uTime * 1.2) * 0.008 + cos(pos.y * 2.5 + uTime * 0.9) * 0.006;
                vec3 idlePos = pos + vec3(idleWave, idleBreath, sin(uTime * 0.6 + aSeed * 3.14159) * 0.01);
                float idleOpacity = 0.5 + sin(uTime * 1.5 + aSeed * 6.283) * 0.3;
                float idleSize = aSize;
                vec3 idleColor = vec3(1.0);
                vec2 toMouse = idlePos.xy - uMouse3D;
                float mouseDist = length(toMouse);
                float hoverRadius = 0.2;
                float highlightZone = smoothstep(hoverRadius, hoverRadius * 0.6, mouseDist) * uHoverProgress;
                float scatterZone = smoothstep(hoverRadius * 0.3, 0.0, mouseDist) * uHoverProgress;
                vec3 activePos = idlePos;
                float activeSize = idleSize;
                float activeOpacity = idleOpacity;
                vec3 activeColor = idleColor;
                if (highlightZone > 0.0) {
                    activeOpacity = 1.0;
                    activeSize = aSize * (1.0 + highlightZone * 1.2);
                    activeColor = mix(idleColor, hoverGradientColor, highlightZone);
                    activeColor += (activeColor * highlightZone * 0.2);
                }
                if (scatterZone > 0.0) {
                    vec2 direction = normalize(toMouse);
                    float scatterStrength = 0.5;
                    float spinAngle = hash(aSeed) * 6.283;
                    vec2 spin = vec2(cos(spinAngle), sin(spinAngle)) * 0.15;
                    activePos.xy += (direction + spin) * scatterZone * scatterStrength;
                    activeSize *= (1.0 - scatterZone * 0.5);
                    activeOpacity *= (1.0 - scatterZone * 0.3);
                }
                vec4 mvPosition = modelViewMatrix * vec4(activePos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = activeSize * uPixelRatio;
                vColor = activeColor;
                vOpacity = activeOpacity;
                vHover = highlightZone;
            }
        `;

        const FRAGMENT_SHADER = /* glsl */`
            precision highp float;
            varying vec3  vColor;
            varying float vOpacity;
            varying float vHover;
            void main() {
                vec2 uv = gl_PointCoord - vec2(0.5);
                float dist = length(uv);
                if (dist > 0.5) discard;
                float alpha = 1.0 - smoothstep(0.35, 0.5, dist);
                alpha *= vOpacity;
                float core = 1.0 - smoothstep(0.0, 0.3, dist);
                vec3 coreGlow = vColor * core * vHover * 0.4;
                vec3 color = vColor + coreGlow;
                gl_FragColor = vec4(color, alpha);
            }
        `;

        const CONFIG = {
            sampling: { step: 1, threshold: 55 },
            particles: { sizeMin: 1.8, sizeMax: 2.5 },
            animation: { hoverTransition: 0.8, explosionRadius: 25.2 },
        };

        function extractParticlesFromImage(image) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const imgW = image.naturalWidth;
            const imgH = image.naturalHeight;
            canvas.width = imgW;
            canvas.height = imgH;
            ctx.drawImage(image, 0, 0);
            const { data: px } = ctx.getImageData(0, 0, imgW, imgH);
            const imgAspect = imgW / imgH;
            const step = CONFIG.sampling.step;
            const threshold = CONFIG.sampling.threshold;
            const positions = [], originalPositions = [], colors = [], sizes = [], seeds = [], uvs = [];
            for (let y = 0; y < imgH; y += step) {
                for (let x = 0; x < imgW; x += step) {
                    const idx = (y * imgW + x) * 4;
                    const r = px[idx], g = px[idx + 1], b = px[idx + 2];
                    const luma = Math.sqrt(0.2126 * r * r + 0.7152 * g * g + 0.0722 * b * b);
                    if (luma < threshold) continue;
                    const xNorm = x / imgW, yNorm = y / imgH;
                    const worldX = (xNorm - 0.5) * 2.0 * imgAspect;
                    const worldY = (0.5 - yNorm) * 2.0;
                    positions.push(worldX, worldY, 0.0);
                    originalPositions.push(worldX, worldY, 0.0);
                    colors.push(r / 255.0, g / 255.0, b / 255.0);
                    sizes.push(CONFIG.particles.sizeMin + Math.random() * (CONFIG.particles.sizeMax - CONFIG.particles.sizeMin));
                    seeds.push(Math.random());
                    uvs.push(xNorm, yNorm);
                }
            }
            return {
                imgAspect,
                count: positions.length / 3,
                positions: new Float32Array(positions),
                originalPositions: new Float32Array(originalPositions),
                colors: new Float32Array(colors),
                sizes: new Float32Array(sizes),
                seeds: new Float32Array(seeds),
                uvs: new Float32Array(uvs),
            };
        }

        let scene, camera, renderer, clock, particleMesh, uniforms;
        let hoverProgress = 0.0, targetHoverProgress = 0.0, isHovering = false;

        function initScene() {
            scene = new THREE.Scene();
            const aspect = window.innerWidth / window.innerHeight;
            camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
            camera.position.z = 5;
            const canvas = document.getElementById('webgl-canvas');
            renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setClearColor(0x04080f, 1);
            clock = new THREE.Clock();
        }

        function createParticleSystem(particleData) {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(particleData.positions, 3));
            geometry.setAttribute('aOriginalPos', new THREE.BufferAttribute(particleData.originalPositions, 3));
            geometry.setAttribute('aColor', new THREE.BufferAttribute(particleData.colors, 3));
            geometry.setAttribute('aSize', new THREE.BufferAttribute(particleData.sizes, 1));
            geometry.setAttribute('aSeed', new THREE.BufferAttribute(particleData.seeds, 1));
            geometry.setAttribute('aUV', new THREE.BufferAttribute(particleData.uvs, 2));
            uniforms = {
                uTime: { value: 0.0 },
                uHoverProgress: { value: 0.0 },
                uMouse3D: { value: new THREE.Vector2(-999, -999) },
                uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
                uExplosionRadius: { value: CONFIG.animation.explosionRadius },
            };
            const material = new THREE.ShaderMaterial({
                uniforms,
                vertexShader: VERTEX_SHADER,
                fragmentShader: FRAGMENT_SHADER,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            particleMesh = new THREE.Points(geometry, material);
            scene.add(particleMesh);
        }

        let frameCount = 0, lastFPSTime = performance.now();
        function animate() {
            requestAnimationFrame(animate);
            const elapsed = clock.getElapsedTime();
            uniforms.uTime.value = elapsed;
            hoverProgress += (targetHoverProgress - hoverProgress) * CONFIG.animation.hoverTransition;
            uniforms.uHoverProgress.value = hoverProgress;
            renderer.render(scene, camera);
        }

        function onMouseMove(event) {
            const rect = renderer.domElement.getBoundingClientRect();
            const isOver = (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
            if (isOver !== isHovering) {
                isHovering = isOver;
                targetHoverProgress = isOver ? 1.0 : 0.0;
            }
            if (isOver) {
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                const aspect = camera.right;
                uniforms.uMouse3D.value.set(x * aspect, y);
            }
        }

        function onResize() {
            const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
            camera.left = -aspect;
            camera.right = aspect;
            camera.top = 1;
            camera.bottom = -1;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            const pr = Math.min(window.devicePixelRatio, 2);
            renderer.setPixelRatio(pr);
            if (uniforms) uniforms.uPixelRatio.value = pr;
        }

        async function init() {
            initScene();
            const image = new Image();
            image.src = IMAGE_SRC;
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = () => reject(new Error('Image load failed'));
            });
            const particleData = extractParticlesFromImage(image);
            createParticleSystem(particleData);
            window.addEventListener('mousemove', onMouseMove, { passive: true });
            window.addEventListener('resize', onResize, { passive: true });
            animate();
            const loader = document.getElementById('loader');
            loader.classList.add('hidden');
            setTimeout(() => loader.style.display = 'none', 900);
        }

        init().catch(err => console.error('[ThreeJS Hover] Init failed:', err));
    });
}

window.initThreeJSAnimation = initThreeJSAnimation;

// Trigger the new animation when its panel is active
if (document.querySelector('.panel.active')?.id === 'p-threejs') {
    initThreeJSAnimation();
}
