import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';

// DOM helpers
const qs = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => Array.from(p.querySelectorAll(s));

// Audio setup
const audioEl = qs('#audio');
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioCtx();
const sourceNode = audioCtx.createMediaElementSource(audioEl);
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048; // high resolution for smoother bars
const frequencyData = new Uint8Array(analyser.frequencyBinCount);
const timeData = new Uint8Array(analyser.fftSize);
sourceNode.connect(analyser);
analyser.connect(audioCtx.destination);

// Playlist
const state = {
    tracks: [],
    currentIndex: -1,
    isPlaying: false,
};

// Load default audio files from app root using Vite glob
async function loadDefaultTracks() {
    try {
        // Prefer dev endpoint to list /public audio files
        const res = await fetch('/__playlist');
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.items)) {
                data.items.forEach((it) => state.tracks.push({ name: it.name, url: it.url }));
            }
        }
    } catch (_) { /* ignore in production build */ }
    try {
        // Also include any files colocated in src for completeness
        const assets = import.meta.glob(['./*.mp3', './*.wav', './*.flac', './*.m4a'], { as: 'url', eager: true });
        const entries = Object.entries(assets).sort((a, b) => a[0].localeCompare(b[0]));
        entries.forEach(([path, url]) => state.tracks.push({ name: path.replace(/^\.\//, ''), url }));
    } catch (_) { }
    // Deduplicate by url
    const seen = new Set();
    state.tracks = state.tracks.filter((t) => (seen.has(t.url) ? false : (seen.add(t.url), true)));
    renderPlaylist();
}

// Scene setup
const canvas = qs('#three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight - 56);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0d10, 0.035);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / (window.innerHeight - 56), 0.1, 1000);
camera.position.set(0, 8, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;
controls.enablePan = false;
controls.enableZoom = true;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.5;
controls.minDistance = 2;
controls.maxDistance = 80;
controls.minPolarAngle = 0.0; // allow looking straight up
controls.maxPolarAngle = Math.PI - 0.01;

let lastUserInputMs = 0;
controls.addEventListener('start', () => { lastUserInputMs = performance.now(); });
controls.addEventListener('change', () => { lastUserInputMs = performance.now(); });
controls.addEventListener('end', () => { lastUserInputMs = performance.now(); });

let zoomFreezeUntil = 0;
let lastDist = 18;
const GRAVITY = 0.06; // gravity constant for ember sprites

// Postprocessing: afterimage trails + bloom for fat glows
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const afterimagePass = new AfterimagePass(0.96); // higher = less persistence (reduced ~40%)
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3, // strength reduced
    0.2, // radius
    0.1  // threshold
);
composer.addPass(renderPass);
composer.addPass(afterimagePass);
composer.addPass(bloomPass);

// Lighting
const hemi = new THREE.HemisphereLight(0x7a5cff, 0x0b0d10, 0.6);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0x5af8ff, 0.8);
dir.position.set(5, 10, 7);
scene.add(dir);

// Reflective pool
const poolSize = 100;
const reflector = new Reflector(new THREE.PlaneGeometry(poolSize, poolSize), {
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x101318,
});
reflector.rotation.x = -Math.PI / 2;
scene.add(reflector);

// Subtle grid for horizon
const grid = new THREE.GridHelper(poolSize, 40, 0x3a3f55, 0x1a2030);
grid.material.opacity = 0.18;
grid.material.transparent = true;
scene.add(grid);

// VU bars (resin-like, larger, spaced in a semicircle)
const barsGroup = new THREE.Group();
scene.add(barsGroup);
const numBars = 48;
const barWidth = 0.6;
const barDepth = 0.6;
const arcStart = -Math.PI * 0.6;
const arcEnd = Math.PI * 0.6;
const arcRadius = 14;

const barMaterials = [];
for (let i = 0; i < numBars; i += 1) {
    const baseHue = 0.75 - (i / numBars) * 0.25; // purple→cyan
    const color = new THREE.Color().setHSL(baseHue, 0.9, 0.58);
    const mat = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.2,
        metalness: 0.02,
        transmission: 0.6,
        thickness: 1.4,
        ior: 1.3,
        attenuationColor: new THREE.Color().setHSL(baseHue, 0.95, 0.5),
        attenuationDistance: 1.6,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: 0.95,
        emissive: color.clone().multiplyScalar(0.3),
        emissiveIntensity: 1.0,
    });
    barMaterials.push(mat);
}

const barGeo = new THREE.BoxGeometry(barWidth, 1, barDepth);
for (let i = 0; i < numBars; i += 1) {
    const t = i / (numBars - 1);
    const angle = THREE.MathUtils.lerp(arcStart, arcEnd, t);
    const x = Math.cos(angle) * arcRadius;
    const z = Math.sin(angle) * arcRadius;
    const mesh = new THREE.Mesh(barGeo, barMaterials[i]);
    mesh.position.set(x, 0.5, z);
    // face the center slightly for aesthetics
    mesh.lookAt(0, 0.5, 0);
    barsGroup.add(mesh);
}

// Sky particles
const particlesCount = 1200;
const pos = new Float32Array(particlesCount * 3);
for (let i = 0; i < particlesCount; i += 1) {
    const r = THREE.MathUtils.randFloat(12, 60);
    const a = THREE.MathUtils.randFloat(0, Math.PI * 2);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = THREE.MathUtils.randFloat(4, 20);
    pos[i * 3 + 2] = Math.sin(a) * r;
}
const particlesGeo = new THREE.BufferGeometry();
particlesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const particlesMat = new THREE.PointsMaterial({ color: 0x8aa3ff, size: 0.06, transparent: true, opacity: 0.4, depthWrite: false });
const points = new THREE.Points(particlesGeo, particlesMat);
scene.add(points);

// Sky dome stars for vaporwave vibe
const starGeo = new THREE.SphereGeometry(140, 32, 32);
const starMat = new THREE.MeshBasicMaterial({
    color: 0x111318,
    side: THREE.BackSide,
    transparent: false,
});
const starDome = new THREE.Mesh(starGeo, starMat);
scene.add(starDome);

// Perlin-noise cloudy sky layer (shader on an inner dome) darkened
const cloudUniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color(0x1b2b6f) },
    uColorB: { value: new THREE.Color(0x06070a) },
    uIntensity: { value: 0.55 },
};
const cloudVertex = `
  varying vec3 vWorld;
  void main(){
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
// Classic Perlin noise (cnoise) by Stefan Gustavson, public domain
const cloudFragment = `
  varying vec3 vWorld;
  uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB; uniform float uIntensity;
  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  vec3 fade(vec3 t){ return t*t*t*(t*(t*6.0-15.0)+10.0); }
  float cnoise(vec3 P){
    vec3 Pi0 = floor(P); // Integer part for indexing
    vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P); // Fractional part for interpolation
    vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.y, Pi0.y, Pi1.y, Pi1.y);
    vec4 iz0 = vec4(Pi0.z);
    vec4 iz1 = vec4(Pi1.z);

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0; vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5; gx0 = fract(gx0); vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0)); gx0 -= sz0 * (step(0.0, gx0) - 0.5); gy0 -= sz0 * (step(0.0, gy0) - 0.5);
    vec4 gx1 = ixy1 / 7.0; vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5; gx1 = fract(gx1); vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0)); gx1 -= sz1 * (step(0.0, gx1) - 0.5); gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x); vec3 g100 = vec3(gx0.y,gy0.y,gz0.y); vec3 g010 = vec3(gx0.z,gy0.z,gz0.z); vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x); vec3 g101 = vec3(gx1.y,gy1.y,gz1.y); vec3 g011 = vec3(gx1.z,gy1.z,gz1.z); vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
    g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
    g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.y, Pf0.z));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.x, Pf1.y, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.x, Pf0.y, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.y, Pf1.z));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
  }
  void main(){
    vec3 p = vWorld * 0.01;
    float n = 0.0; float amp = 0.6; float f = 1.0;
    for(int i=0;i<5;i++){ n += amp * cnoise(vec3(p.xy*f, uTime*0.05 + p.z*f)); f *= 2.0; amp *= 0.5; }
    n = smoothstep(0.2, 0.8, 0.5 + 0.5*n);
    vec3 col = mix(uColorB, uColorA, n);
    float alpha = 0.08 + 0.24*n*uIntensity;
    gl_FragColor = vec4(col, alpha);
  }
`;
const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms,
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
});
const cloudDome = new THREE.Mesh(new THREE.SphereGeometry(170, 64, 64), cloudMat);
scene.add(cloudDome);

// Fireworks system (3dfx vibe): rockets + additive burst sparks + ember trails
const rockets = [];
const bursts = [];
const trailSprites = [];
const embers = [];
const smokes = [];

function createCircleTexture(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const circleTexture = createCircleTexture();

function launchRocket(x, hue = Math.random(), z = 0) {
    const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
    const geom = new THREE.SphereGeometry(0.12, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, 0.2, z);
    mesh.renderOrder = 10;
    scene.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    const speed = THREE.MathUtils.randFloat(0.2, 1.2);
    rockets.push({ mesh, vx: Math.cos(angle) * speed, vy: THREE.MathUtils.randFloat(6, 11), vz: Math.sin(angle) * speed, life: THREE.MathUtils.randFloat(0.9, 1.6), hue });
}

function explodeAt(position, hue) {
    const count = 400;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(THREE.MathUtils.randFloatSpread(1));
        const speed = THREE.MathUtils.randFloat(2.5, 7.0);
        velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities[i * 3 + 1] = Math.cos(phi) * speed;
        velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    const color = new THREE.Color().setHSL(hue, 0.85, 0.6);
    const mat = new THREE.PointsMaterial({
        color,
        size: 0.12,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
        map: circleTexture,
        alphaMap: circleTexture,
    });
    const points = new THREE.Points(geom, mat);
    points.renderOrder = 20;
    scene.add(points);
    bursts.push({ points, life: 1.8, drag: 0.985 });

    // Smoke plume illuminated by explosion; trail outward following a fraction of spark velocity
    spawnSmoke(position, color, velocities);
}

function spawnTrailDot(position, hue) { spawnEmber(position, hue); }

function spawnEmber(position, hue, vel) {
    const mat = new THREE.SpriteMaterial({
        map: circleTexture,
        color: new THREE.Color().setHSL(hue, 0.9, 0.85),
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    const s = THREE.MathUtils.randFloat(0.12, 0.26);
    sprite.scale.setScalar(s);
    sprite.renderOrder = 25;
    scene.add(sprite);
    const v = vel ? vel.clone().multiplyScalar(0.08) : new THREE.Vector3();
    v.x += THREE.MathUtils.randFloatSpread(0.06);
    v.y += THREE.MathUtils.randFloatSpread(0.02);
    v.z += THREE.MathUtils.randFloatSpread(0.06);
    embers.push({ sprite, life: 1.6, lifeMax: 1.6, vel: v, baseHue: hue });
}

function spawnSmoke(origin, explosionColor, baseVelocities) {
    const count = 120;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
        const a = Math.random() * Math.PI * 2;
        const r = THREE.MathUtils.randFloat(0, 1.2);
        positions[i * 3] = origin.x + Math.cos(a) * r;
        positions[i * 3 + 1] = origin.y + THREE.MathUtils.randFloat(-0.1, 0.4);
        positions[i * 3 + 2] = origin.z + Math.sin(a) * r;
        if (baseVelocities && i * 3 + 2 < baseVelocities.length) {
            velocities[i * 3] = baseVelocities[i * 3] * 0.5;
            velocities[i * 3 + 1] = baseVelocities[i * 3 + 1] * 0.08; // minimal rise
            velocities[i * 3 + 2] = baseVelocities[i * 3 + 2] * 0.5;
        } else {
            velocities[i * 3] = THREE.MathUtils.randFloatSpread(0.6);
            velocities[i * 3 + 1] = THREE.MathUtils.randFloat(0.02, 0.08);
            velocities[i * 3 + 2] = THREE.MathUtils.randFloatSpread(0.6);
        }
        ages[i] = Math.random() * 0.4;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute('age', new THREE.BufferAttribute(ages, 1));
    const smokeTex = circleTexture; // soft circle works well as puff
    // Base dark gray smoke; only appears colored when lit by explosions
    const c = new THREE.Color(0x222222);
    const mat = new THREE.PointsMaterial({
        map: smokeTex,
        alphaMap: smokeTex,
        color: c,
        size: 0.55,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
    });
    const cloud = new THREE.Points(geom, mat);
    cloud.renderOrder = 5;
    scene.add(cloud);
    // Precompute average velocity to approximate a center drift
    let vx = 0, vy = 0, vz = 0;
    for (let i = 0; i < count; i += 1) {
        vx += velocities[i * 3];
        vy += velocities[i * 3 + 1];
        vz += velocities[i * 3 + 2];
    }
    vx /= count; vy /= count; vz /= count;
    smokes.push({
        cloud,
        life: 5.0,
        light: explosionColor.clone(),
        baseColor: c,
        lightK: 1.4,
        center: origin.clone(),
        vAvg: new THREE.Vector3(vx, vy, vz),
    });
}

// Resize
function onResize() {
    const h = window.innerHeight - 56;
    renderer.setSize(window.innerWidth, h);
    camera.aspect = window.innerWidth / h;
    camera.updateProjectionMatrix();
    composer.setSize(window.innerWidth, h);
    bloomPass.setSize(window.innerWidth, h);
}
window.addEventListener('resize', onResize);

// Animation loop
let lastPeakTime = 0; // kept for reference, not used for triggering
let lastAutoFirework = 0; // legacy auto fire (disabled below)
// Beat detection via spectral flux
const prevSpectrum = new Uint8Array(analyser.frequencyBinCount);
let fluxAvg = 0;
let fluxVar = 0;
let lastFluxFire = 0;
const tmpTarget = new THREE.Vector3();
const tmpCamOffset = new THREE.Vector3();
const tmpSpherical = new THREE.Spherical();
let desiredRadius = 16;
let desiredAzim = 0.0; // target orbit angle
let desiredPolar = 0.9;
function animate(t) {
    requestAnimationFrame(animate);

    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeData);

    const len = barsGroup.children.length;
    let peak = 0;
    let maxIdx = 0;
    let avg = 0;
    for (let i = 0; i < len; i += 1) {
        const bar = barsGroup.children[i];
        const idx = Math.floor((i / len) * frequencyData.length);
        const v = frequencyData[idx] / 255; // 0..1
        const h = THREE.MathUtils.lerp(bar.scale.y, 1.2 + v * 18, 0.18);
        bar.scale.y = h;
        bar.position.y = h / 2;
        if (v > peak) { peak = v; maxIdx = i; }
        avg += v;
        const mat = bar.material;
        // Keep the bar color visible; modulate emissive softly
        mat.emissiveIntensity = 0.7 + v * 1.5;
        mat.opacity = 0.95;
    }
    avg /= len;

    // compute overall RMS from time domain for pulsing
    let sum = 0;
    for (let i = 0; i < timeData.length; i += 1) {
        const dv = (timeData[i] - 128) / 128;
        sum += dv * dv;
    }
    const rms = Math.sqrt(sum / timeData.length); // ~0..1

    // starfield pulse with volume and animate clouds
    particlesMat.opacity = THREE.MathUtils.clamp(0.25 + rms * 0.6, 0.2, 0.8);
    particlesMat.size = THREE.MathUtils.lerp(particlesMat.size, 0.06 + rms * 0.14, 0.2);
    cloudUniforms.uTime.value = t * 0.001;

    // Spectral flux (on-beat detection)
    let flux = 0;
    for (let i = 0; i < frequencyData.length; i += 1) {
        const d = frequencyData[i] - prevSpectrum[i];
        if (d > 0) flux += d;
        prevSpectrum[i] = frequencyData[i];
    }
    // normalize
    flux = flux / (255 * frequencyData.length);
    // exponential moving stats
    const alpha = 0.12;
    fluxAvg = THREE.MathUtils.lerp(fluxAvg, flux, alpha);
    const diff = flux - fluxAvg;
    fluxVar = THREE.MathUtils.lerp(fluxVar, diff * diff, alpha);
    const fluxStd = Math.sqrt(fluxVar + 1e-6);
    const beat = flux > fluxAvg + 2.2 * fluxStd; // sensitivity
    if (beat && t - lastFluxFire > 350) {
        const hue = Math.random();
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i += 1) {
            const a = Math.random() * Math.PI * 2;
            const r = THREE.MathUtils.randFloat(0, 6);
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            launchRocket(x, (hue + i * 0.08) % 1, z);
        }
        lastFluxFire = t;
    }

    // Dynamic camera: keep target near center, adjust distance softly; let OrbitControls handle rotation
    const centerY = 2 + avg * 2.5;
    tmpTarget.set(0, centerY, 0);
    // If user recently interacted, don't tug the camera/target strongly
    const sinceInput = performance.now() - lastUserInputMs;
    const lerpAmt = sinceInput < 1200 ? 0.01 : 0.05;
    controls.target.lerp(tmpTarget, lerpAmt);
    desiredAzim += 0.003;
    controls.autoRotate = sinceInput > 1200; // pause auto orbit briefly after input
    controls.autoRotateSpeed = 0.2 + avg * 0.6;
    const currentDist = camera.position.distanceTo(controls.target);
    // If user changed distance, capture it and freeze easing for a while
    if (Math.abs(currentDist - lastDist) > 0.05) {
        zoomFreezeUntil = performance.now() + 8000; // 8s freeze window
        lastDist = currentDist;
    }
    const targetDistRaw = arcRadius * 0.6 - rms * 1.5;
    const targetDist = THREE.MathUtils.clamp(targetDistRaw, arcRadius * 0.3, arcRadius * 1.2);
    const distLerp = performance.now() < zoomFreezeUntil ? 0.0 : (sinceInput < 1200 ? 0.01 : 0.03);
    const newDist = THREE.MathUtils.lerp(currentDist, targetDist, distLerp);
    tmpCamOffset.copy(camera.position).sub(controls.target).setLength(newDist);
    camera.position.copy(controls.target).add(tmpCamOffset);
    controls.update();

    // update rockets
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const r = rockets[i];
        r.vy -= 0.03; // gravity
        r.mesh.position.x += r.vx * 0.02;
        r.mesh.position.y += r.vy * 0.02;
        r.mesh.position.z += r.vz * 0.02;
        r.life -= 0.02;
        // ember trail along the rocket path
        spawnEmber(r.mesh.position, r.hue, new THREE.Vector3(r.vx, r.vy, r.vz));
        r.mesh.material.color.offsetHSL(0, 0, Math.sin(performance.now() * 0.01) * 0.02);
        if (r.life <= 0 || r.vy <= 0) {
            const pos = r.mesh.position.clone();
            explodeAt(pos, r.hue);
            scene.remove(r.mesh);
            r.mesh.geometry.dispose();
            r.mesh.material.dispose();
            rockets.splice(i, 1);
        }
    }

    // update burst sparks
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
        const b = bursts[i];
        b.life -= 0.02;
        const positions = b.points.geometry.getAttribute('position');
        const velocities = b.points.geometry.getAttribute('velocity');
        for (let j = 0; j < positions.count; j += 1) {
            // drag + gravity
            velocities.array[j * 3] *= b.drag;
            velocities.array[j * 3 + 1] = velocities.array[j * 3 + 1] * b.drag - GRAVITY * 0.33;
            velocities.array[j * 3 + 2] *= b.drag;
            positions.array[j * 3] += velocities.array[j * 3] * 0.02;
            positions.array[j * 3 + 1] += velocities.array[j * 3 + 1] * 0.02;
            positions.array[j * 3 + 2] += velocities.array[j * 3 + 2] * 0.02;
        }
        positions.needsUpdate = true;
        b.points.material.opacity = Math.max(0, b.life);
        // spawn embers from explosion particles occasionally
        if (Math.random() < 0.1) {
            const idx = Math.floor(Math.random() * positions.count);
            const p = new THREE.Vector3(
                positions.array[idx * 3],
                positions.array[idx * 3 + 1],
                positions.array[idx * 3 + 2]
            );
            const v = new THREE.Vector3(
                velocities.array[idx * 3],
                velocities.array[idx * 3 + 1],
                velocities.array[idx * 3 + 2]
            );
            spawnEmber(p, b.points.material.color.getHSL({}).h, v);
        }
        if (b.life <= 0) {
            scene.remove(b.points);
            b.points.geometry.dispose();
            b.points.material.dispose();
            bursts.splice(i, 1);
        }
    }

    // update smoke: drift outward, gentle rise, fast blur+fade; lit by explosions and bars (inverse-square)
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
        const s = smokes[i];
        s.life -= 0.015; // slower fade overall
        s.lightK *= 0.90; // keep lighting around a bit longer and stronger
        const positions = s.cloud.geometry.getAttribute('position');
        const velocities = s.cloud.geometry.getAttribute('velocity');
        const ages = s.cloud.geometry.getAttribute('age');
        // compute lighting from bars and recent explosions using inverse-square falloff
        let barLight = 0; let barColor = new THREE.Color(0x000000);
        const center = new THREE.Vector3();
        center.fromBufferAttribute(positions, 0);
        for (let b = 0; b < barsGroup.children.length; b += 1) {
            const bar = barsGroup.children[b];
            const d2 = Math.max(0.25, bar.position.distanceToSquared(center));
            const influence = (bar.material.emissiveIntensity || 1) / d2; // inverse-square approx
            barLight += influence;
            barColor.add(bar.material.color.clone().multiplyScalar(influence));
        }
        // also use most recent burst as light source approximation
        if (bursts.length) {
            const lastBurst = bursts[bursts.length - 1];
            const pb = lastBurst.points.geometry.getAttribute('position');
            if (pb.count) {
                const bx = pb.array[0], by = pb.array[1], bz = pb.array[2];
                const d2b = Math.max(0.25, center.distanceToSquared(new THREE.Vector3(bx, by, bz)));
                const infl = 2.0 / d2b; // stronger but localized
                barLight += infl;
                barColor.add(lastBurst.points.material.color.clone().multiplyScalar(infl));
            }
        }
        if (barLight > 0) barColor.multiplyScalar(1 / barLight);
        for (let j = 0; j < positions.count; j += 1) {
            // gentle drag and rise
            velocities.array[j * 3] = velocities.array[j * 3] * 0.996 + THREE.MathUtils.randFloatSpread(0.004);
            velocities.array[j * 3 + 1] = velocities.array[j * 3 + 1] * 0.996 + 0.0006; // very subtle lift
            velocities.array[j * 3 + 2] = velocities.array[j * 3 + 2] * 0.996 + THREE.MathUtils.randFloatSpread(0.004);
            positions.array[j * 3] += velocities.array[j * 3] * 0.02;
            positions.array[j * 3 + 1] += velocities.array[j * 3 + 1] * 0.02;
            positions.array[j * 3 + 2] += velocities.array[j * 3 + 2] * 0.02;
            ages.array[j] += 0.01;
        }
        positions.needsUpdate = true;
        ages.needsUpdate = true;
        const k = THREE.MathUtils.clamp(s.life / 5.0, 0, 1);
        // Stay transparent; make it easier to see overall
        const barBoost = THREE.MathUtils.clamp(barLight * 1.2, 0, 0.35);
        s.cloud.material.opacity = 0.18 * k + 0.12 * s.lightK + barBoost * 0.4;
        s.cloud.material.size = 0.55 + (1 - k) * 2.0;
        // Lighting tint: combine explosion color and average bar color
        const combinedLight = s.light.clone().lerp(barColor, 0.6);
        s.cloud.material.color.copy(s.baseColor).lerp(combinedLight, Math.min(1.0, s.lightK + barBoost));
        if (s.life <= 0) {
            scene.remove(s.cloud);
            s.cloud.geometry.dispose();
            s.cloud.material.dispose();
            smokes.splice(i, 1);
        }
    }

    // Auto fireworks removed; driven by spectral flux beats

    // fade out trail dots
    for (let i = embers.length - 1; i >= 0; i -= 1) {
        const e = embers[i];
        e.life -= 0.02;
        e.vel.y -= GRAVITY * 0.02;
        e.sprite.position.x += e.vel.x * 0.02;
        e.sprite.position.y += e.vel.y * 0.02;
        e.sprite.position.z += e.vel.z * 0.02;
        // color progression: rocket hue -> orange/red -> gray -> black
        const tNorm = 1 - Math.max(0, e.life / e.lifeMax);
        let col = new THREE.Color();
        if (tNorm < 0.35) {
            col.setHSL(e.baseHue, 0.9, 0.7);
        } else if (tNorm < 0.6) {
            const k = (tNorm - 0.35) / 0.25;
            // orange/red with flicker
            const flicker = Math.random() < 0.5 ? 0.0 : 0.4;
            col.setHSL(0.05 + 0.03 * k, 1.0, 0.5 - 0.12 * k + flicker * 0.05);
            e.sprite.material.opacity *= Math.random() < 0.5 ? 0.85 : 1.0;
        } else if (tNorm < 0.9) {
            const k = (tNorm - 0.6) / 0.3;
            col.setRGB(1 - k, 1 - k, 1 - k).multiplyScalar(0.5); // to gray
        } else {
            col.setRGB(0, 0, 0);
        }
        e.sprite.material.color.copy(col);
        // Make gray stage less transparent than orange stage
        const opacityCurve = tNorm < 0.6 ? (e.life / e.lifeMax) : Math.max(0.2, e.life / e.lifeMax);
        e.sprite.material.opacity = Math.max(0, opacityCurve);
        const sScale = Math.max(0, e.sprite.scale.x - 0.0015);
        e.sprite.scale.setScalar(sScale);
        if (e.life <= 0) {
            scene.remove(e.sprite);
            e.sprite.material.map?.dispose?.();
            e.sprite.material.dispose();
            embers.splice(i, 1);
        }
    }

    composer.render();
}
requestAnimationFrame(animate);

// Drag & drop (robust: prevent default on multiple targets)
const dropzone = qs('#dropzone');
function showDropzone(show) {
    dropzone.classList.toggle('hidden', !show);
    dropzone.classList.toggle('grid', show);
    dropzone.style.pointerEvents = show ? 'auto' : 'none';
}
const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
function onDragEnter(e) { preventDefaults(e); showDropzone(true); }
function onDragOver(e) { preventDefaults(e); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; showDropzone(true); }
function onDragLeave(e) { preventDefaults(e); showDropzone(false); }
function onDrop(e) { preventDefaults(e); const files = e.dataTransfer?.files; if (files && files.length) handleFiles(files); showDropzone(false); }

const dndTargets = [window, document, document.body, canvas];
dndTargets.forEach((t) => {
    if (!t) return;
    t.addEventListener('dragenter', onDragEnter);
    t.addEventListener('dragover', onDragOver);
    t.addEventListener('dragleave', onDragLeave);
    t.addEventListener('drop', onDrop);
});

function handleFiles(fileList) {
    const files = Array.from(fileList).filter((f) => /\.(flac|wav|mp3|m4a)$/i.test(f.name));
    if (!files.length) return;
    const startIndex = state.tracks.length;
    files.forEach((file) => {
        const url = URL.createObjectURL(file);
        state.tracks.push({ name: file.name, url });
    });
    renderPlaylist();
    if (state.currentIndex === -1) {
        playAtIndex(0);
    } else if (state.currentIndex >= 0 && startIndex === state.tracks.length - files.length) {
        // if this is an append and nothing playing, start first new
    }
}

// Controls
const nowPlaying = qs('#now-playing');
const playBtn = qs('#play-btn');
const prevBtn = qs('#prev-btn');
const nextBtn = qs('#next-btn');
const seek = qs('#seek');
const timeText = qs('#time');
const volume = qs('#volume');
const browseBtn = qs('#browse-btn');
const fileInput = qs('#file-input');
const toggleAfter = qs('#toggle-afterimage');
const toggleBloom = qs('#toggle-bloom');

playBtn.addEventListener('click', () => {
    if (state.currentIndex === -1 && state.tracks.length) playAtIndex(0);
    else togglePlay();
});
prevBtn.addEventListener('click', () => {
    if (state.tracks.length === 0) return;
    const idx = (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
    playAtIndex(idx);
});
nextBtn.addEventListener('click', () => {
    if (state.tracks.length === 0) return;
    const idx = (state.currentIndex + 1) % state.tracks.length;
    playAtIndex(idx);
});
volume.addEventListener('input', () => {
    audioEl.volume = Number(volume.value);
});
seek.addEventListener('input', () => {
    if (audioEl.duration) {
        audioEl.currentTime = (Number(seek.value) / 100) * audioEl.duration;
    }
});

audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    seek.value = String(pct);
    timeText.textContent = `${fmt(audioEl.currentTime)} / ${fmt(audioEl.duration)}`;
});
audioEl.addEventListener('ended', () => {
    nextBtn.click();
});

function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderPlaylist() {
    const ul = qs('#playlist');
    ul.innerHTML = '';
    state.tracks.forEach((t, i) => {
        const li = document.createElement('li');
        li.className = 'chip' + (i === state.currentIndex ? ' chip-active' : '');
        li.textContent = t.name.replace(/\.[^.]+$/, '');
        li.title = t.name;
        li.addEventListener('click', () => playAtIndex(i));
        ul.appendChild(li);
    });
}

async function playAtIndex(index) {
    state.currentIndex = index;
    const track = state.tracks[index];
    if (!track) return;
    nowPlaying.textContent = `Now Playing: ${track.name}`;
    audioEl.src = track.url;
    await audioEl.play();
    state.isPlaying = true;
    playBtn.textContent = '⏸';
    renderPlaylist();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
}

function togglePlay() {
    if (!state.tracks.length) return;
    if (audioEl.paused) {
        audioEl.play();
        playBtn.textContent = '⏸';
        state.isPlaying = true;
    } else {
        audioEl.pause();
        playBtn.textContent = '⏵';
        state.isPlaying = false;
    }
}

// Browse button wiring
if (browseBtn && fileInput) {
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length) handleFiles(files);
        // Reset to allow selecting the same files again
        fileInput.value = '';
    });
}

// Load defaults on startup
loadDefaultTracks();

// Afterimage toggle
if (toggleAfter) {
    toggleAfter.addEventListener('change', () => {
        const enabled = toggleAfter.checked;
        // Ensure clearing happens when trails are off
        afterimagePass.uniforms['damp'].value = enabled ? 0.96 : 1.0;
        afterimagePass.enabled = enabled;
        renderer.autoClear = !enabled;
        renderer.clear();
    });
}
if (toggleBloom) {
    toggleBloom.addEventListener('change', () => {
        bloomPass.enabled = toggleBloom.checked;
    });
}


