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
            const IMAGE_SRC = 'Main_Tech.png'
            

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
