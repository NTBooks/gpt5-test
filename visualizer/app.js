// Popper: single bright flare that falls, emits smoke, and globally brightens clouds briefly
function explodePopper(position, hue) {
    // Single flare sprite
    const flareMat = new THREE.SpriteMaterial({ map: circleTexture, color: new THREE.Color(0xffffff), transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const flare = new THREE.Sprite(flareMat);
    flare.position.copy(position);
    flare.scale.set(1.6, 1.6, 1.6);
    scene.add(flare);
    const vel = new THREE.Vector3(THREE.MathUtils.randFloatSpread(0.12), -THREE.MathUtils.randFloat(1.0, 1.6), THREE.MathUtils.randFloatSpread(0.12));
    flares.push({ sprite: flare, vel, life: 1.8, maxLife: 1.8 });

    // Global cloud brightening effect
    globalCloudFlashUntil = performance.now() + 1500; // 1.5s
}
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
        const assets = import.meta.glob(['./*.mp3', './*.wav', './*.flac', './*.m4a'], { query: '?url', import: 'default', eager: true });
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
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / (window.innerHeight - 56), 0.1, 3000);
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
const GRAVITY = 0.12; // stronger gravity accel per frame for visible fall (units/s^2 approx)
// Wind system
let wind = new THREE.Vector3(0, 0, 0);
let windTarget = new THREE.Vector3(0, 0, 0);
let windLastChange = 0;
let windNextChangeMs = 0;

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

// Reflective pool (larger so it feels infinite)
const poolSize = 1000;
const reflector = new Reflector(new THREE.PlaneGeometry(poolSize, poolSize), {
    textureWidth: 1536,
    textureHeight: 1536,
    color: 0x20242b, // dimmer tint to reduce harsh horizon seam
    clipBias: 0.003,
});
reflector.rotation.x = -Math.PI / 2;
scene.add(reflector);

// Clearcoat sheen layer just above the reflector to smooth the horizon and add a wet look
// Clearcoat sheen layer removed due to flicker

// Floor grid removed
const grid = new THREE.GridHelper(poolSize, 200, 0x3a3f55, 0x1a2030);
grid.visible = false;

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

// Distant jagged mountains ring (background mesh)
function createMountainRing(radius = 1500, segments = 640) {
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const groundY = -20;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const ang = t * Math.PI * 2;
        const r = radius + THREE.MathUtils.randFloat(-200, 200);
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        // height profile: jagged with multiple octaves (taller, more pronounced)
        const n = Math.sin(i * 0.19) * 120 + Math.sin(i * 0.53) * 80 + Math.sin(i * 0.91) * 50;
        const y = groundY + 240 + n;
        // top vertex
        vertices.push(x, y, z);
        // base vertex (toward ground)
        vertices.push(x, groundY, z);
        if (i > 0) {
            const a = (i - 1) * 2;
            const b = (i - 1) * 2 + 1;
            const c = i * 2;
            const d = i * 2 + 1;
            // two triangles per segment (a,b,c) and (b,d,c)
            indices.push(a, b, c, b, d, c);
        }
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    const shade = 0.22;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade * 1.02, shade * 1.05), roughness: 1.0, metalness: 0.0, flatShading: true });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    return mesh;
}
const mountains = createMountainRing();
mountains.name = 'background-mountains';
scene.add(mountains);

// Fireworks system (3dfx vibe): rockets + additive burst sparks + ember trails
const rockets = [];
const bursts = [];
const flashes = [];
const flares = [];
const trailSprites = [];
const embers = [];
const smokes = [];

// Global caps for performance
const LIMITS = {
    maxBurstParticles: 8000,
    maxSmokeParticles: 2500,
    maxEmbers: 700,
    maxRockets: 6,
};

// Options state (persisted)
const OPTIONS = {
    windEnabled: true,
    smokeLifeScale: 1.0,
    enabledExplosions: { classic: true, ballLarge: true, ring: true, sparkle: true, bicolor: true, popper: true },
};

function totalBurstParticles() {
    let n = 0;
    for (let i = 0; i < bursts.length; i += 1) {
        n += bursts[i].points.geometry.getAttribute('position').count;
    }
    return n;
}

function totalSmokeParticles() {
    let n = 0;
    for (let i = 0; i < smokes.length; i += 1) {
        n += smokes[i].cloud.geometry.getAttribute('position').count;
    }
    return n;
}

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
    if (rockets.length >= LIMITS.maxRockets) return;
    if (totalBurstParticles() > LIMITS.maxBurstParticles) return;
    const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
    const geom = new THREE.SphereGeometry(0.12, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, 0.2, z);
    mesh.renderOrder = 10;
    scene.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    const speed = THREE.MathUtils.randFloat(0.2, 1.2);
    rockets.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: THREE.MathUtils.randFloat(6, 11),
        vz: Math.sin(angle) * speed,
        life: THREE.MathUtils.randFloat(0.9, 1.6),
        hue,
        turn: THREE.MathUtils.randFloat(-0.02, 0.02), // horizontal curvature
        curvePull: THREE.MathUtils.randFloat(0.0005, 0.003), // gentle inward pull to center
        launchMs: performance.now(),
        nextSmokeAt: 0,
        smokeEmitted: 0,
        maxSmoke: 28,
    });
}

function explodeAt(position, hue, type) {
    const kind = type || pickExplosionType();
    if (kind === 'classic') return explodeClassic(position, hue);
    if (kind === 'ballLarge') return explodeBallLarge(position, hue);
    if (kind === 'ring') return explodeRingRandomPlane(position, hue);
    if (kind === 'sparkle') return explodeSparkleFlash(position, hue);
    if (kind === 'bicolor') return explodeBiColorBall(position, hue);
    if (kind === 'popper') return explodePopper(position, hue);
    return explodeClassic(position, hue);
}

function pickExplosionType() {
    // Adjusted weights: classic/ball most common, ring medium, bicolor more common, sparkle low, popper rare
    const all = [
        ['classic', 0.33],
        ['ballLarge', 0.29],
        ['ring', 0.16],
        ['bicolor', 0.18],
        ['sparkle', 0.03],
        ['popper', 0.01],
    ];
    let filtered = all.filter(([name]) => OPTIONS.enabledExplosions[name]);
    // Never spawn more than one popper at a time
    if (flares.length > 0) filtered = filtered.filter(([name]) => name !== 'popper');
    const totalW = filtered.reduce((s, [, w]) => s + w, 0) || 1;
    const r = Math.random() * totalW;
    let acc = 0;
    for (let i = 0; i < filtered.length; i += 1) {
        acc += filtered[i][1];
        if (r <= acc) return filtered[i][0];
    }
    return filtered[0]?.[0] || 'classic';
}

// Original/classic simple spherical explosion
function explodeClassic(position, hue) {
    let count = 180;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const allowed = Math.max(0, LIMITS.maxBurstParticles - totalBurstParticles());
    if (allowed < count) count = Math.max(100, Math.floor(allowed));
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
        size: 0.22,
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
    bursts.push({ points, life: 1.8, drag: 0.985, pos: position.clone(), col: color.clone() });
    blastTopEmbers(position, 4.0, 1.6);
    spawnSmoke(position, color, velocities);
}

// Large single-color ball that expands and hangs before fading
function explodeBallLarge(position, hue) {
    const count = 220;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1; // cos(phi)
        const phi = Math.acos(u);
        const speed = THREE.MathUtils.randFloat(6.0, 12.0);
        const sx = Math.sin(phi) * Math.cos(theta) * speed;
        const sy = Math.cos(phi) * speed;
        const sz = Math.sin(phi) * Math.sin(theta) * speed;
        velocities[i * 3] = sx;
        velocities[i * 3 + 1] = sy;
        velocities[i * 3 + 2] = sz;
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
        size: 0.24,
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
    bursts.push({ points, life: 2.2, lifeMax: 2.2, drag: 0.94, gravity: 0.18, pos: position.clone(), col: color.clone(), sizeStart: 0.22, sizeEnd: 0.12, type: 'ballLarge' });
    blastTopEmbers(position, 5.0, 2.2);
    spawnSmoke(position, color, velocities, { count: 220, size: 0.65, opacity: 0.16, life: 6.0 });
}

// Ring in a random plane with two colors (colored + white components)
function explodeRingRandomPlane(position, hue) {
    let count = 64; // fewer pearls
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const normal = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
    // orthonormal basis (u, v, normal)
    const u = new THREE.Vector3(0, 1, 0).cross(normal);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0).cross(normal);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    const radius = THREE.MathUtils.randFloat(3.2, 4.0);
    const colorA = new THREE.Color().setHSL(hue, 0.9, 0.6);
    const colorB = new THREE.Color(0xffffff);
    // Respect burst particle budget
    const allowed = Math.max(0, LIMITS.maxBurstParticles - totalBurstParticles());
    if (allowed < count) count = Math.max(24, Math.floor(allowed));
    for (let i = 0; i < count; i += 1) {
        const t = (i / count) * Math.PI * 2;
        const dir = new THREE.Vector3().copy(u).multiplyScalar(Math.cos(t)).add(new THREE.Vector3().copy(v).multiplyScalar(Math.sin(t)));
        const p = new THREE.Vector3().copy(position).addScaledVector(dir, radius);
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        const speed = THREE.MathUtils.randFloat(2.2, 3.5);
        velocities[i * 3] = dir.x * speed;
        velocities[i * 3 + 1] = dir.y * speed;
        velocities[i * 3 + 2] = dir.z * speed;
        // alternate white and color for a clear string-of-pearls look
        const useWhite = (i % 2 === 0);
        const c = useWhite ? colorB : colorA;
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.24, // larger brighter pearls
        sizeAttenuation: true,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
        vertexColors: true,
        map: circleTexture,
        alphaMap: circleTexture,
    });
    const points = new THREE.Points(geom, mat);
    points.renderOrder = 22;
    scene.add(points);
    bursts.push({ points, life: 1.6, lifeMax: 1.6, drag: 0.986, gravity: 0.18, pos: position.clone(), col: colorA.clone(), sizeStart: 0.26, sizeEnd: 0.20, type: 'ring' });
    blastTopEmbers(position, 4.0, 1.6);
    // lighter smoke for rings to avoid perf spikes
    spawnSmoke(position, colorA, velocities, { count: 60, size: 0.5, opacity: 0.12, life: 2.6 });
}

// Flash with tiny sparkles that fall down after exploding
function explodeSparkleFlash(position, hue) {
    // bright flash sprite
    const flashMat = new THREE.SpriteMaterial({ map: circleTexture, color: new THREE.Color(0xffffff), transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const flash = new THREE.Sprite(flashMat);
    flash.position.copy(position);
    flash.scale.set(2.5, 2.5, 2.5);
    scene.add(flash);
    flashes.push({ sprite: flash, life: 0.16 });

    // tiny sparkles that fall
    const count = 600;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    // Force pure white sparkles for maximum brightness
    const color = new THREE.Color(0xffffff);
    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(THREE.MathUtils.randFloatSpread(1));
        const speed = THREE.MathUtils.randFloat(1.0, 3.0);
        velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
        velocities[i * 3 + 1] = Math.cos(phi) * speed * 0.7; // less upward
        velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
        positions[i * 3] = position.x;
        positions[i * 3 + 1] = position.y;
        positions[i * 3 + 2] = position.z;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    const mat = new THREE.PointsMaterial({
        color,
        size: 0.10,
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
    points.renderOrder = 23;
    scene.add(points);
    bursts.push({ points, life: 1.4, lifeMax: 1.4, drag: 0.98, gravity: 0.6, pos: position.clone(), col: color.clone(), sizeStart: 0.07, sizeEnd: 0.04, type: 'sparkle', twinkle: true });
    blastTopEmbers(position, 3.5, 1.4);
    spawnSmoke(position, color, velocities, { count: 80, size: 0.5, opacity: 0.12, life: 3.5 });
}

// Bi-color ball: two hemispheres with different colors
function explodeBiColorBall(position, hue) {
    const count = 260;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize();
    const colorA = new THREE.Color().setHSL(hue, 0.9, 0.6);
    const hue2 = (hue + 0.15) % 1.0;
    const colorB = new THREE.Color().setHSL(hue2, 0.9, 0.6);
    for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const phi = Math.acos(u);
        const dir = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
        );
        const speed = THREE.MathUtils.randFloat(3.5, 8.0);
        velocities[i * 3] = dir.x * speed; velocities[i * 3 + 1] = dir.y * speed; velocities[i * 3 + 2] = dir.z * speed;
        positions[i * 3] = position.x; positions[i * 3 + 1] = position.y; positions[i * 3 + 2] = position.z;
        const c = dir.dot(axis) >= 0 ? colorA : colorB;
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
        size: 0.24,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
        vertexColors: true,
        map: circleTexture,
        alphaMap: circleTexture,
    });
    const points = new THREE.Points(geom, mat);
    points.renderOrder = 21;
    scene.add(points);
    bursts.push({ points, life: 1.9, lifeMax: 1.9, drag: 0.972, gravity: 0.24, pos: position.clone(), col: colorA.clone(), sizeStart: 0.20, sizeEnd: 0.12, type: 'bicolor' });
    blastTopEmbers(position, 5.0, 1.8);
    spawnSmoke(position, colorA, velocities, { count: 180, size: 0.62, opacity: 0.15, life: 5.5 });
}

function spawnTrailDot(position, hue) { spawnEmber(position, hue); }

function spawnEmber(position, hue, vel, lifeOverride) {
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
    const v = vel ? vel.clone().multiplyScalar(0.05) : new THREE.Vector3();
    // reduce forward carry and bias slightly downward
    v.y = Math.min(v.y, 0.4) - 0.15;
    v.x += THREE.MathUtils.randFloatSpread(0.03);
    v.z += THREE.MathUtils.randFloatSpread(0.03);
    const lifeMax = lifeOverride ?? 1.6;
    embers.push({ sprite, life: lifeMax, lifeMax, vel: v, baseHue: hue, nextSmokeAt: performance.now() + THREE.MathUtils.randInt(80, 180) });
}

// Apply an outward/upward impulse to nearby embers that are at the top of trails near the explosion
function blastTopEmbers(origin, radius = 4.0, strength = 1.6) {
    for (let i = 0; i < embers.length; i += 1) {
        const e = embers[i];
        const p = e.sprite.position;
        // Only affect embers near the explosion height and with relatively fresh life (top of trail)
        if (p.y < origin.y - 0.8) continue;
        if (e.life < e.lifeMax * 0.4) continue;
        const d = p.distanceTo(origin);
        if (d > radius) continue;
        const dir = p.clone().sub(origin);
        // Bias upward a little so they lift off the trail tip
        dir.y = Math.abs(dir.y) + 0.5;
        if (dir.lengthSq() === 0) dir.set(0, 1, 0);
        dir.normalize();
        const falloff = 1 - (d / radius);
        const impulse = strength * falloff;
        e.vel.addScaledVector(dir, impulse);
    }
}

function spawnSmoke(origin, explosionColor, baseVelocities, opts = {}) {
    const count = Math.floor(opts.count ?? 120);
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
        size: opts.size ?? 0.55,
        transparent: true,
        opacity: opts.opacity ?? 0.14,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
    });
    const cloud = new THREE.Points(geom, mat);
    cloud.renderOrder = 5;
    // Respect global smoke cap; if above, skip adding this smoke
    if (totalSmokeParticles() + count <= LIMITS.maxSmokeParticles) {
        scene.add(cloud);
    } else {
        // dispose immediately
        geom.dispose();
        mat.dispose();
        return;
    }
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
        life: Math.min((opts.life ?? 5.0) * (OPTIONS.smokeLifeScale || 1.0), 6.0),
        totalLife: (opts.life ?? 5.0) * (OPTIONS.smokeLifeScale || 1.0),
        light: explosionColor.clone(),
        baseColor: c,
        lightK: 1.4,
        center: origin.clone(),
        vAvg: new THREE.Vector3(vx, vy, vz),
        sizeStart: opts.size ?? 0.55,
        sizeEnd: opts.sizeEnd ?? ((opts.size ?? 0.55) + 2.0),
    });
}

// Narrow smoke puff for rocket trails (single small cloud)
// Lightweight rocket puff: single tiny smoke cloud with minimal particles
function spawnRocketPuff(origin, hue, initialVel) {
    const count = 1; // single smoke particle
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
        // minimal lateral spread; slight upward drift
        velocities[i * 3] = (initialVel?.x || 0) * 0.006 + THREE.MathUtils.randFloatSpread(0.002);
        velocities[i * 3 + 1] = (initialVel?.y || 0) * 0.003 + THREE.MathUtils.randFloat(0.0005, 0.002);
        velocities[i * 3 + 2] = (initialVel?.z || 0) * 0.006 + THREE.MathUtils.randFloatSpread(0.002);
    }
    const color = new THREE.Color(0x222222);
    // smaller, to read as a thin line
    spawnSmoke(origin, color, velocities, { count, size: 0.09, opacity: 0.08, life: 2.2 });
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
let cameraMode = 'orbit';
let followTarget = null; // rocket to follow
let followCooldown = 0; // ms timestamp until we can pick a new rocket
let followReleaseAt = 0; // time when current follow rocket ended
const followCamPos = new THREE.Vector3(-7.8, -1.9, 1.9); // fixed follow vantage relative to world origin
let lastBeatAt = 0; // ms timestamp of last beat
let trailsPulseUntil = 0; // ms timestamp until which trails are pulsed
const organicSeed = Math.random() * 1000;
let followZoom = 0; // cumulative zoom-in amount toward the rocket while tracking
const followZoomMax = 5.0; // max units to slide toward target along view vector
// FPS stats
let lastFpsUpdate = 0;
let frames = 0;
let fps = 0;
let globalCloudFlashUntil = 0;
function animate(t) {
    requestAnimationFrame(animate);

    // FPS accumulation
    frames += 1;
    if (t - lastFpsUpdate > 500) { fps = Math.round((frames * 1000) / (t - lastFpsUpdate)); frames = 0; lastFpsUpdate = t; }

    analyser.getByteFrequencyData(frequencyData);
    analyser.getByteTimeDomainData(timeData);

    // Wind update: change target every few seconds and lerp toward it
    if (OPTIONS.windEnabled && t > windNextChangeMs) {
        windLastChange = t;
        windNextChangeMs = t + THREE.MathUtils.randInt(3000, 7000);
        const angle = THREE.MathUtils.randFloat(0, Math.PI * 2);
        const speed = THREE.MathUtils.randFloat(0.0, 0.8); // magnitude
        windTarget.set(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }
    if (OPTIONS.windEnabled) wind.lerp(windTarget, 0.02); else wind.setScalar(0);

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
        const baseEmissive = 0.7 + v * 1.5; // minimum stays as-is
        const heightBoost = Math.max(0, h - 1.2) * 0.08; // brighter as the bar rises
        mat.emissiveIntensity = baseEmissive + heightBoost;
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
    // brief global flash when popper active
    if (performance.now() < globalCloudFlashUntil) {
        const k = (globalCloudFlashUntil - performance.now()) / 1500;
        cloudUniforms.uIntensity.value = 0.55 + 1.6 * Math.max(0, k);
    } else {
        cloudUniforms.uIntensity.value = 0.55;
    }

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
        lastBeatAt = t;
        trailsPulseUntil = t + 600; // pulse trails for 0.6s on beat
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

    // Camera modes
    const sinceInput = performance.now() - lastUserInputMs;
    if (cameraMode === 'user') {
        // User-controlled camera: do not move/auto-rotate
        controls.autoRotate = false;
        controls.enableRotate = true;
        // Intentionally do not modify controls.target or camera.position
        controls.update();
    } else if (cameraMode === 'center') {
        // fixed at center looking straight up
        controls.autoRotate = false;
        controls.enableRotate = false;
        controls.target.set(0, 4, 0);
        // Move camera further below ground for a dramatic bottom-up view
        camera.position.lerp(new THREE.Vector3(0, -6, 0), 0.08);
        camera.lookAt(new THREE.Vector3(0, 8, 0));
    } else if (cameraMode === 'follow') {
        // follow latest rocket; keep lock until it finishes (life <=0)
        if (!followTarget || followTarget.life <= 0) {
            if (followTarget && followTarget.life <= 0) {
                followReleaseAt = performance.now();
                followTarget = null;
            }
            if (performance.now() > followCooldown && performance.now() > followReleaseAt + 1000) {
                // pick the newest rocket near the ground
                const candidates = rockets.filter(r => r.life > 0 && r.mesh.position.y < 1.5);
                if (candidates.length) {
                    candidates.sort((a, b) => b.launchMs - a.launchMs);
                    followTarget = candidates[0];
                    followCooldown = performance.now() + 1000; // enforce 1s before next retarget
                }
            }
        }
        if (followTarget && followTarget.life > 0) {
            const targetPos = followTarget.mesh.position;
            // organic handheld: small noise-based jitter
            const jt = (performance.now() + organicSeed * 1000) * 0.0015;
            const jitter = new THREE.Vector3(
                Math.sin(jt * 0.9) * 0.08 + Math.sin(jt * 1.7) * 0.04,
                Math.sin(jt * 1.3) * 0.05,
                Math.cos(jt * 1.1) * 0.06
            );
            // Ease-out cumulative zoom toward the rocket along view vector
            const toTarget = new THREE.Vector3().subVectors(targetPos, followCamPos).normalize();
            const beatAmt = Math.max(0, 1 - (performance.now() - lastBeatAt) / 600);
            followZoom = Math.min(followZoomMax, followZoom + 0.08 + beatAmt * 0.12);
            const desiredPos = followCamPos.clone().add(jitter).add(toTarget.multiplyScalar(followZoom));
            camera.position.lerp(desiredPos, 0.15); // ease-out-ish (small lerp)
            // look roughly toward center with bias to rocket
            const gaze = new THREE.Vector3().copy(targetPos).multiplyScalar(0.7).add(new THREE.Vector3(0, 0, 0).multiplyScalar(0.3));
            controls.target.lerp(gaze, 0.15);
            camera.lookAt(controls.target);
            controls.autoRotate = false;
            controls.enableRotate = false;
        } else {
            // remain in follow mode: hold current camera pose until a new rocket appears
            controls.autoRotate = false;
            controls.enableRotate = false;
            followZoom = 0; // reset for next rocket
        }
    } else {
        // orbit mode around the arena high up looking down
        controls.enableRotate = true;
        const centerY = 2 + avg * 2.5;
        tmpTarget.set(0, centerY, 0);
        const lerpAmt = sinceInput < 1200 ? 0.01 : 0.05;
        controls.target.lerp(tmpTarget, lerpAmt);
        desiredAzim += 0.0025;
        controls.autoRotate = true; // always orbit in this mode
        controls.autoRotateSpeed = 0.35 + avg * 0.4; // faster orbit
        const currentDist = camera.position.distanceTo(controls.target);
        if (Math.abs(currentDist - lastDist) > 0.05) {
            zoomFreezeUntil = performance.now() + 8000;
            lastDist = currentDist;
        }
        const targetDistRaw = arcRadius * 1.1 - rms * 1.2; // higher/wider
        const targetDist = THREE.MathUtils.clamp(targetDistRaw, arcRadius * 0.8, arcRadius * 1.6);
        const distLerp = performance.now() < zoomFreezeUntil ? 0.0 : (sinceInput < 1200 ? 0.01 : 0.03);
        const newDist = THREE.MathUtils.lerp(currentDist, targetDist, distLerp);
        tmpCamOffset.copy(camera.position).sub(controls.target).setLength(newDist);
        camera.position.copy(controls.target).add(tmpCamOffset);
        controls.update();
    }

    // update rockets
    for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const r = rockets[i];
        // curved ascent: apply slight horizontal turn and inward pull
        const dirH = new THREE.Vector2(r.vx, r.vz);
        const angleH = Math.atan2(dirH.y, dirH.x) + r.turn;
        const speedH = dirH.length();
        r.vx = Math.cos(angleH) * speedH;
        r.vz = Math.sin(angleH) * speedH;
        // pull toward center
        r.vx += (-r.mesh.position.x) * r.curvePull;
        r.vz += (-r.mesh.position.z) * r.curvePull;
        r.vy -= 0.03; // gravity
        // wind influence on rocket trail path
        r.vx += wind.x * 0.005;
        r.vz += wind.z * 0.005;
        r.mesh.position.x += r.vx * 0.02;
        r.mesh.position.y += r.vy * 0.02;
        r.mesh.position.z += r.vz * 0.02;
        r.life -= 0.02;
        // ember trail along the rocket path (denser and with strong fall)
        if (Math.random() < 0.8) {
            spawnEmber(r.mesh.position, r.hue, new THREE.Vector3(r.vx, r.vy, r.vz));
        }
        // Up to N small rocket puffs per rocket, then stop (performance-safe)
        if (r.vy > 0.6 && r.life > 0.25 && r.smokeEmitted < r.maxSmoke) {
            if (performance.now() > (r.nextSmokeAt || 0)) {
                r.nextSmokeAt = performance.now() + THREE.MathUtils.randInt(8, 14);
                r.smokeEmitted += 1;
                // place puff slightly behind the rocket along its path, with minimal lateral jitter
                const vel = new THREE.Vector3(r.vx, r.vy, r.vz);
                const back = vel.lengthSq() > 0 ? vel.clone().normalize().multiplyScalar(-0.02) : new THREE.Vector3(0, -0.02, 0);
                const p = r.mesh.position.clone().add(back);
                spawnRocketPuff(p, r.hue, vel);
            }
        }
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
            // drag + gravity (per type)
            velocities.array[j * 3] *= b.drag;
            const gy = b.gravity != null ? b.gravity : 0.33;
            velocities.array[j * 3 + 1] = velocities.array[j * 3 + 1] * b.drag - GRAVITY * gy;
            velocities.array[j * 3 + 2] *= b.drag;
            positions.array[j * 3] += velocities.array[j * 3] * 0.02;
            positions.array[j * 3 + 1] += velocities.array[j * 3 + 1] * 0.02;
            positions.array[j * 3 + 2] += velocities.array[j * 3 + 2] * 0.02;
        }
        positions.needsUpdate = true;
        // size/opacity evolution by type
        const k = THREE.MathUtils.clamp(b.life / (b.lifeMax || 1.8), 0, 1);
        if (b.points.material.size !== undefined && b.sizeStart && b.sizeEnd) {
            b.points.material.size = THREE.MathUtils.lerp(b.sizeEnd, b.sizeStart, k);
        }
        if (b.twinkle) {
            b.points.material.opacity = Math.max(0, b.life) * (Math.random() < 0.5 ? 0.8 : 1.0);
        } else {
            b.points.material.opacity = Math.max(0.0, b.life);
        }
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

    // update flashes
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
        const f = flashes[i];
        f.life -= 0.04;
        f.sprite.material.opacity = Math.max(0, f.life * 6);
        f.sprite.scale.multiplyScalar(0.98);
        if (f.life <= 0) {
            scene.remove(f.sprite);
            f.sprite.material.map?.dispose?.();
            f.sprite.material.dispose();
            flashes.splice(i, 1);
        }
    }

    // update smoke: drift outward, gentle rise, fast blur+fade; lit by explosions and bars (inverse-square)
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
        const s = smokes[i];
        // Dissipate faster in stronger wind
        const windMag = wind.length();
        s.life -= 0.015 + windMag * 0.01; // base + wind-based dissipation
        s.lightK *= 0.90; // keep lighting around a bit longer and stronger
        const positions = s.cloud.geometry.getAttribute('position');
        const velocities = s.cloud.geometry.getAttribute('velocity');
        const ages = s.cloud.geometry.getAttribute('age');
        // compute lighting from bars and recent explosions using inverse-square falloff with distance+size attenuation
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
        // also use a few recent bursts as light sources
        for (let bi = Math.max(0, bursts.length - 3); bi < bursts.length; bi += 1) {
            const burst = bursts[bi];
            const d2b = Math.max(0.25, center.distanceToSquared(burst.pos));
            const infl = 2.0 / d2b; // stronger but localized
            barLight += infl;
            barColor.add(burst.col.clone().multiplyScalar(infl));
        }
        // Popper global brightening makes smoke glow white
        if (performance.now() < globalCloudFlashUntil) {
            barLight += 3.0;
            barColor.add(new THREE.Color(0xffffff).multiplyScalar(3.0));
        }
        if (barLight > 0) barColor.multiplyScalar(1 / barLight);
        for (let j = 0; j < positions.count; j += 1) {
            // gentle drag and rise; wind advection
            velocities.array[j * 3] = velocities.array[j * 3] * 0.996 + wind.x * 0.02 + THREE.MathUtils.randFloatSpread(0.004);
            velocities.array[j * 3 + 1] = velocities.array[j * 3 + 1] * 0.996 + 0.0006; // very subtle lift
            velocities.array[j * 3 + 2] = velocities.array[j * 3 + 2] * 0.996 + wind.z * 0.02 + THREE.MathUtils.randFloatSpread(0.004);
            positions.array[j * 3] += velocities.array[j * 3] * 0.02;
            positions.array[j * 3 + 1] += velocities.array[j * 3 + 1] * 0.02;
            positions.array[j * 3 + 2] += velocities.array[j * 3 + 2] * 0.02;
            ages.array[j] += 0.01;
        }
        positions.needsUpdate = true;
        ages.needsUpdate = true;
        const fullLife = s.totalLife || 5.0;
        const k = THREE.MathUtils.clamp(s.life / fullLife, 0, 1);
        // Stay transparent; make it easier to see overall. Farther smoke gets less lighting (distance) and bigger size reduces responsiveness
        const distanceAtten = 1.0 / (1.0 + center.length() * 0.12);
        const sizeAtten = 1.0 / (1.0 + (s.cloud.material.size || 1) * 0.6);
        const barBoost = THREE.MathUtils.clamp(barLight * 1.2 * distanceAtten * sizeAtten, 0, 0.35);
        s.cloud.material.opacity = 0.10 * k + 0.12 * s.lightK + barBoost * 0.35;
        const startSize = s.sizeStart || 0.55;
        const endSize = s.sizeEnd || (startSize + 2.0);
        s.cloud.material.size = THREE.MathUtils.lerp(endSize, startSize, k);
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
        // exaggerated gravity for embers so they fall swiftly
        e.vel.x += wind.x * 0.03;
        e.vel.z += wind.z * 0.03;
        e.vel.y -= GRAVITY * 0.15;
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
        const sScale = Math.max(0, e.sprite.scale.x - 0.002);
        e.sprite.scale.setScalar(sScale);
        // occasional fork: spawn a child ember with reduced life and diverging velocity
        if (e.life > 0.6 && Math.random() < 0.06) {
            const childV = e.vel.clone();
            childV.x += THREE.MathUtils.randFloatSpread(0.08);
            childV.y += THREE.MathUtils.randFloatSpread(0.04) - 0.02;
            childV.z += THREE.MathUtils.randFloatSpread(0.08);
            spawnEmber(e.sprite.position, e.baseHue, childV, e.life * 0.5);
        }
        // occasional fork: spawn a child ember with reduced life and diverging velocity
        if (e.life > 0.6 && Math.random() < 0.06) {
            const childV = e.vel.clone();
            childV.x += THREE.MathUtils.randFloatSpread(0.08);
            childV.y += THREE.MathUtils.randFloatSpread(0.04) - 0.02;
            childV.z += THREE.MathUtils.randFloatSpread(0.08);
            spawnEmber(e.sprite.position, e.baseHue, childV, e.life * 0.5);
        }
        // Ember smoke disabled to keep puff count bounded (rocket puffs handle the trail)
        if (e.life <= 0) {
            scene.remove(e.sprite);
            e.sprite.material.map?.dispose?.();
            e.sprite.material.dispose();
            embers.splice(i, 1);
        }
    }

    // update flares (popper)
    for (let i = flares.length - 1; i >= 0; i -= 1) {
        const f = flares[i];
        f.life -= 0.02;
        // gravity + slight drag
        f.vel.y -= GRAVITY * 0.12;
        f.vel.multiplyScalar(0.995);
        f.sprite.position.addScaledVector(f.vel, 0.02);
        f.sprite.material.opacity = Math.max(0, f.life);
        // emit a small white smoke particle that floats upward while burning
        if (Math.random() < 0.5) {
            const upVel = new Float32Array(3);
            upVel[0] = 0; upVel[1] = THREE.MathUtils.randFloat(0.02, 0.06); upVel[2] = 0;
            spawnSmoke(f.sprite.position.clone(), new THREE.Color(0xffffff), upVel, { count: 1, size: 0.18, opacity: 0.1, life: 2.0 });
        }
        if (f.life <= 0) {
            scene.remove(f.sprite);
            f.sprite.material.map?.dispose?.();
            f.sprite.material.dispose();
            flares.splice(i, 1);
        }
    }

    composer.render();

    // Update stats HUD
    if (statsHud) {
        const burstsCount = totalBurstParticles();
        const smokeCount = totalSmokeParticles();
        statsHud.textContent = `FPS: ${fps} | Bursts: ${burstsCount} | Smoke: ${smokeCount} | Embers: ${embers.length} | Rockets: ${rockets.length}`;
    }
}
requestAnimationFrame(animate);

// Drag & drop (robust: prevent default on multiple targets)
// Drawer + playlist UI
const playlistToggle = qs('#playlist-toggle');
const playlistOverlay = qs('#playlist-overlay');
const playlistDrawer = qs('#playlist-drawer');
const playlistClose = qs('#playlist-close');
const drawerDropzone = qs('#playlist-dropzone');
const drawerDropHint = qs('#drawer-drop-hint');
const optionsToggle = qs('#options-toggle');
const optionsOverlay = qs('#options-overlay');
const optionsDrawer = qs('#options-drawer');
const optionsClose = qs('#options-close');
const cameraToggle = qs('#camera-toggle');
const cameraToast = qs('#camera-toast');
const cameraToastText = qs('#camera-toast-text');
const cameraHud = qs('#camera-hud');
const statsHud = qs('#stats-hud');
const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };

function openDrawer() {
    playlistOverlay.classList.remove('hidden');
    playlistDrawer.classList.remove('translate-x-full');
}
function closeDrawer() {
    playlistOverlay.classList.add('hidden');
    playlistDrawer.classList.add('translate-x-full');
}
playlistToggle?.addEventListener('click', openDrawer);
playlistOverlay?.addEventListener('click', closeDrawer);
playlistClose?.addEventListener('click', closeDrawer);

function openOptions() {
    optionsOverlay.classList.remove('hidden');
    optionsDrawer.classList.remove('-translate-x-full');
    cameraHud?.classList.remove('hidden');
    statsHud?.classList.remove('hidden');
}
function closeOptions() {
    optionsOverlay.classList.add('hidden');
    optionsDrawer.classList.add('-translate-x-full');
    cameraHud?.classList.add('hidden');
    statsHud?.classList.add('hidden');
}
optionsToggle?.addEventListener('click', openOptions);
optionsOverlay?.addEventListener('click', closeOptions);
optionsClose?.addEventListener('click', closeOptions);

// Camera cycle button
const cameraModes = ['user', 'orbit', 'follow', 'center'];
cameraToggle?.addEventListener('click', () => {
    const idx = cameraModes.indexOf(cameraMode);
    const next = cameraModes[(idx + 1) % cameraModes.length];
    cameraMode = next;
    if (cameraModeSelect) cameraModeSelect.value = next;
    // show toast
    if (cameraToast && cameraToastText) {
        cameraToastText.textContent = {
            user: 'Camera: User', orbit: 'Camera: Orbit', follow: 'Camera: Follow', center: 'Camera: Center Up'
        }[next];
        cameraToast.classList.remove('opacity-0');
        cameraToast.classList.add('opacity-100');
        setTimeout(() => {
            cameraToast.classList.remove('opacity-100');
            cameraToast.classList.add('opacity-0');
        }, 900);
    }
    persistOptions();
    persistOptions();
});

// Local storage persistence
function persistOptions() {
    try {
        localStorage.setItem('vv_bloom', String(bloomPass.enabled));
        localStorage.setItem('vv_trails', String(afterimagePass.enabled));
        localStorage.setItem('vv_camera_mode', cameraMode);
        const pose = { pos: camera.position.toArray(), tgt: controls.target.toArray() };
        localStorage.setItem('vv_camera_pose', JSON.stringify(pose));
        localStorage.setItem('vv_wind', String(OPTIONS.windEnabled));
        localStorage.setItem('vv_smoke_life_scale', String(OPTIONS.smokeLifeScale));
        localStorage.setItem('vv_limits', JSON.stringify(LIMITS));
        localStorage.setItem('vv_explosions', JSON.stringify(OPTIONS.enabledExplosions));
    } catch (_) { }
}

function restoreOptions() {
    try {
        const bloom = localStorage.getItem('vv_bloom');
        if (bloom !== null && toggleBloom) { const b = bloom === 'true'; bloomPass.enabled = b; toggleBloom.checked = b; }
        const trails = localStorage.getItem('vv_trails');
        if (trails !== null && toggleAfter) {
            const t = trails === 'true'; afterimagePass.enabled = t; afterimagePass.uniforms['damp'].value = t ? 0.96 : 1.0; toggleAfter.checked = t; renderer.autoClear = !t;
        }
        const mode = localStorage.getItem('vv_camera_mode');
        if (mode && cameraModeSelect) { cameraMode = mode; cameraModeSelect.value = mode; }
        const poseStr = localStorage.getItem('vv_camera_pose');
        if (poseStr) {
            const p = JSON.parse(poseStr);
            if (Array.isArray(p.pos) && Array.isArray(p.tgt)) {
                camera.position.fromArray(p.pos);
                controls.target.fromArray(p.tgt);
                controls.update();
            }
        } else {
            // Default starting camera pose
            const pos = new THREE.Vector3(0.59, 2.59, 20.78);
            const yawDeg = -178.4;
            const pitchDeg = 3.9;
            const yaw = THREE.MathUtils.degToRad(yawDeg);
            const pitch = THREE.MathUtils.degToRad(pitchDeg);
            const dir = new THREE.Vector3(
                Math.sin(yaw) * Math.cos(pitch),
                Math.sin(pitch),
                Math.cos(yaw) * Math.cos(pitch)
            );
            camera.position.copy(pos);
            controls.target.copy(pos.clone().add(dir.multiplyScalar(10)));
            controls.update();
        }
        const wind = localStorage.getItem('vv_wind');
        if (wind !== null && optWind) { OPTIONS.windEnabled = wind === 'true'; optWind.checked = OPTIONS.windEnabled; }
        const lifeScale = localStorage.getItem('vv_smoke_life_scale');
        if (lifeScale !== null && optSmokeLife) { OPTIONS.smokeLifeScale = Number(lifeScale) || 1.0; optSmokeLife.value = String(OPTIONS.smokeLifeScale); }
        const limits = localStorage.getItem('vv_limits');
        if (limits) {
            try { const parsed = JSON.parse(limits); Object.assign(LIMITS, parsed || {}); } catch { }
        }
        const exps = localStorage.getItem('vv_explosions');
        if (exps) {
            try { const parsed = JSON.parse(exps); Object.assign(OPTIONS.enabledExplosions, parsed || {}); } catch { }
        }
    } catch (_) { }
}

restoreOptions();

// Camera HUD update and clipboard copy
function updateCameraHud() {
    const hud = document.getElementById('camera-hud');
    if (!hud) return;
    const pos = camera.position;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI;
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)) * 180 / Math.PI;
    hud.textContent = `Pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)} | Yaw: ${yaw.toFixed(1)}° | Pitch: ${pitch.toFixed(1)}°`;
}
setInterval(updateCameraHud, 120);
document.getElementById('camera-hud')?.addEventListener('click', async () => {
    const hud = document.getElementById('camera-hud');
    if (!hud) return;
    try { await navigator.clipboard.writeText(hud.textContent || ''); } catch (_) { }
});

// Drag/drop only over drawer region
drawerDropzone?.addEventListener('dragenter', (e) => { preventDefaults(e); drawerDropHint.classList.remove('hidden'); drawerDropHint.classList.add('grid'); });
drawerDropzone?.addEventListener('dragover', (e) => { preventDefaults(e); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
drawerDropzone?.addEventListener('dragleave', (e) => { preventDefaults(e); drawerDropHint.classList.add('hidden'); drawerDropHint.classList.remove('grid'); });
drawerDropzone?.addEventListener('drop', (e) => { preventDefaults(e); const files = e.dataTransfer?.files; if (files && files.length) handleFiles(files); drawerDropHint.classList.add('hidden'); drawerDropHint.classList.remove('grid'); });

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
const cameraModeSelect = qs('#camera-mode');
// Options controls
const optWind = qs('#opt-wind');
const optSmokeLife = qs('#opt-smoke-life');
const optSmokeLifeVal = qs('#opt-smoke-life-val');
const optMaxBurst = qs('#opt-max-burst');
const optMaxBurstVal = qs('#opt-max-burst-val');
const optMaxSmoke = qs('#opt-max-smoke');
const optMaxSmokeVal = qs('#opt-max-smoke-val');
const optMaxEmbers = qs('#opt-max-embers');
const optMaxEmbersVal = qs('#opt-max-embers-val');
const optMaxRockets = qs('#opt-max-rockets');
const optMaxRocketsVal = qs('#opt-max-rockets-val');
const optExpClassic = qs('#opt-exp-classic');
const optExpBallLarge = qs('#opt-exp-ballLarge');
const optExpRing = qs('#opt-exp-ring');
const optExpSparkle = qs('#opt-exp-sparkle');
const optExpBicolor = qs('#opt-exp-bicolor');
const optExpPopper = qs('#opt-exp-popper');
const optPresetDefault = qs('#opt-preset-default');
const optPresetMin = qs('#opt-preset-min');
const optPresetMed = qs('#opt-preset-med');
const optPresetMax = qs('#opt-preset-max');

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
        li.className = 'flex items-center justify-between gap-2 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10 ' + (i === state.currentIndex ? ' bg-white/20' : '');
        li.title = t.name;
        const name = document.createElement('span');
        name.className = 'truncate pr-1';
        name.textContent = t.name.replace(/\.[^.]+$/, '');
        name.addEventListener('click', () => playAtIndex(i));
        const btn = document.createElement('button');
        btn.className = 'shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-white/20';
        btn.textContent = '✕';
        btn.title = 'Remove';
        btn.addEventListener('click', (e) => { e.stopPropagation(); removeTrackAt(i); });
        li.appendChild(name);
        li.appendChild(btn);
        ul.appendChild(li);
    });
}

function removeTrackAt(index) {
    if (index < 0 || index >= state.tracks.length) return;
    const removedCurrent = index === state.currentIndex;
    state.tracks.splice(index, 1);
    if (state.tracks.length === 0) {
        // nothing left
        audioEl.pause();
        audioEl.removeAttribute('src');
        state.currentIndex = -1;
        state.isPlaying = false;
        const nowPlaying = qs('#now-playing');
        if (nowPlaying) nowPlaying.textContent = 'No track loaded';
        renderPlaylist();
        return;
    }
    if (removedCurrent) {
        const next = Math.min(index, state.tracks.length - 1);
        playAtIndex(next);
    } else {
        if (index < state.currentIndex) state.currentIndex -= 1;
        renderPlaylist();
    }
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

// Afterimage toggle (default disabled)
if (toggleAfter) {
    afterimagePass.uniforms['damp'].value = 1.0;
    afterimagePass.enabled = false;
    renderer.autoClear = true;
    toggleAfter.checked = false;
    toggleAfter.addEventListener('change', () => {
        const enabled = toggleAfter.checked;
        afterimagePass.uniforms['damp'].value = enabled ? 0.96 : 1.0;
        afterimagePass.enabled = enabled;
        renderer.autoClear = !enabled;
        renderer.clear();
    });
}
if (toggleBloom) {
    bloomPass.enabled = true;
    toggleBloom.checked = true;
    toggleBloom.addEventListener('change', () => {
        bloomPass.enabled = toggleBloom.checked;
    });
}

if (cameraModeSelect) {
    cameraModeSelect.addEventListener('change', () => {
        cameraMode = cameraModeSelect.value;
        followTarget = null;
        followCooldown = 0;
        controls.enableRotate = true;
        controls.autoRotate = cameraMode === 'orbit';
        if (cameraMode === 'user') {
            // Don't auto-move; leave camera where the user set it
            controls.autoRotate = false;
            controls.enableRotate = true;
        }
        persistOptions();
    });
}

// Wire options controls
function labelRange(el, labelEl, fmt = (v) => v) { if (labelEl && el) labelEl.textContent = fmt(el.value); }
if (optWind) { optWind.addEventListener('change', () => { OPTIONS.windEnabled = optWind.checked; persistOptions(); }); }
if (optSmokeLife) {
    labelRange(optSmokeLife, optSmokeLifeVal, (v) => `${Number(v).toFixed(2)}x`);
    optSmokeLife.addEventListener('input', () => { OPTIONS.smokeLifeScale = Number(optSmokeLife.value) || 1.0; labelRange(optSmokeLife, optSmokeLifeVal, (v) => `${Number(v).toFixed(2)}x`); persistOptions(); });
}
function wireCapSlider(input, label, key) {
    if (!input) return;
    const update = () => { LIMITS[key] = Number(input.value); if (label) label.textContent = String(LIMITS[key]); persistOptions(); };
    update();
    input.addEventListener('input', update);
}
wireCapSlider(optMaxBurst, optMaxBurstVal, 'maxBurstParticles');
wireCapSlider(optMaxSmoke, optMaxSmokeVal, 'maxSmokeParticles');
wireCapSlider(optMaxEmbers, optMaxEmbersVal, 'maxEmbers');
wireCapSlider(optMaxRockets, optMaxRocketsVal, 'maxRockets');

function wireExpToggle(input, name) {
    if (!input) return;
    input.checked = !!OPTIONS.enabledExplosions[name];
    input.addEventListener('change', () => { OPTIONS.enabledExplosions[name] = input.checked; persistOptions(); });
}
wireExpToggle(optExpClassic, 'classic');
wireExpToggle(optExpBallLarge, 'ballLarge');
wireExpToggle(optExpRing, 'ring');
wireExpToggle(optExpSparkle, 'sparkle');
wireExpToggle(optExpBicolor, 'bicolor');
wireExpToggle(optExpPopper, 'popper');

// Presets
function applyPreset(name) {
    if (name === 'default') {
        LIMITS.maxBurstParticles = 8000; LIMITS.maxSmokeParticles = 2500; LIMITS.maxEmbers = 700; LIMITS.maxRockets = 6;
        OPTIONS.windEnabled = true; OPTIONS.smokeLifeScale = 1.0;
        OPTIONS.enabledExplosions = { classic: true, ballLarge: true, ring: true, sparkle: true, bicolor: true };
    } else if (name === 'min') {
        LIMITS.maxBurstParticles = 3000; LIMITS.maxSmokeParticles = 800; LIMITS.maxEmbers = 300; LIMITS.maxRockets = 3;
        OPTIONS.windEnabled = false; OPTIONS.smokeLifeScale = 0.6;
        OPTIONS.enabledExplosions = { classic: true, ballLarge: false, ring: false, sparkle: false, bicolor: false };
    } else if (name === 'med') {
        LIMITS.maxBurstParticles = 6000; LIMITS.maxSmokeParticles = 1600; LIMITS.maxEmbers = 500; LIMITS.maxRockets = 5;
        OPTIONS.windEnabled = true; OPTIONS.smokeLifeScale = 0.9;
        OPTIONS.enabledExplosions = { classic: true, ballLarge: true, ring: true, sparkle: false, bicolor: true };
    } else if (name === 'max') {
        LIMITS.maxBurstParticles = 15000; LIMITS.maxSmokeParticles = 6000; LIMITS.maxEmbers = 1500; LIMITS.maxRockets = 8;
        OPTIONS.windEnabled = true; OPTIONS.smokeLifeScale = 1.2;
        OPTIONS.enabledExplosions = { classic: true, ballLarge: true, ring: true, sparkle: true, bicolor: true };
    }
    // Update UI to reflect
    if (optWind) optWind.checked = OPTIONS.windEnabled;
    if (optSmokeLife) { optSmokeLife.value = String(OPTIONS.smokeLifeScale); optSmokeLife.dispatchEvent(new Event('input')); }
    if (optMaxBurst) { optMaxBurst.value = String(LIMITS.maxBurstParticles); optMaxBurst.dispatchEvent(new Event('input')); }
    if (optMaxSmoke) { optMaxSmoke.value = String(LIMITS.maxSmokeParticles); optMaxSmoke.dispatchEvent(new Event('input')); }
    if (optMaxEmbers) { optMaxEmbers.value = String(LIMITS.maxEmbers); optMaxEmbers.dispatchEvent(new Event('input')); }
    if (optMaxRockets) { optMaxRockets.value = String(LIMITS.maxRockets); optMaxRockets.dispatchEvent(new Event('input')); }
    if (optExpClassic) optExpClassic.checked = OPTIONS.enabledExplosions.classic;
    if (optExpBallLarge) optExpBallLarge.checked = OPTIONS.enabledExplosions.ballLarge;
    if (optExpRing) optExpRing.checked = OPTIONS.enabledExplosions.ring;
    if (optExpSparkle) optExpSparkle.checked = OPTIONS.enabledExplosions.sparkle;
    if (optExpBicolor) optExpBicolor.checked = OPTIONS.enabledExplosions.bicolor;
    persistOptions();
}

optPresetDefault?.addEventListener('click', () => applyPreset('default'));
optPresetMin?.addEventListener('click', () => applyPreset('min'));
optPresetMed?.addEventListener('click', () => applyPreset('med'));
optPresetMax?.addEventListener('click', () => applyPreset('max'));


