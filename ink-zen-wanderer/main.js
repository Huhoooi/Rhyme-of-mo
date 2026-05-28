import * as THREE from 'three';
import { CameraController } from './core/CameraController.js';

// [同学B] — 场景管理、雾效、光照、后处理管线
// import { SceneManager } from './core/SceneManager.js';

// [同学A] — Perlin噪声地形 & L-System分形树
import { TerrainGenerator } from './generation/TerrainGenerator.js';
import { FractalTree } from './generation/FractalTree.js';

// ── DOM refs ────────────────────────────────────────────────
const app = document.getElementById('app');
const uiHint = document.getElementById('hint');
const uiCrosshair = document.getElementById('crosshair');
const uiNarrative = document.getElementById('narrative');
const uiNarrativeTitle = document.getElementById('narrative-title');
const uiNarrativeText = document.getElementById('narrative-text');
const uiPauseMenu = document.getElementById('pause-menu');
const uiSettingsPanel = document.getElementById('settings-panel');
const uiSensitivitySlider = document.getElementById('sensitivity-slider');
const uiSensitivityVal = document.getElementById('sensitivity-value');

// ── Three.js bootstrap ──────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f0e8);
scene.fog = new THREE.Fog(0xf5f0e8, 80, 300);

const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.5, 500
);
camera.position.set(0, 12, 20);
camera.lookAt(0, 5, -10);

// [同学B] 接管: SceneManager 会替换/增强 scene / renderer 配置
// const sceneManager = new SceneManager(scene, renderer);

// ── Lighting (基础; [同学B] 会替换) ────────────────────────
const ambientLight = new THREE.AmbientLight(0xeeddcc, 1.2);
scene.add(ambientLight);
const sunLight = new THREE.DirectionalLight(0xffeedd, 2.5);
sunLight.position.set(50, 80, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 300;
sunLight.shadow.camera.left = -80;
sunLight.shadow.camera.right = 80;
sunLight.shadow.camera.top = 80;
sunLight.shadow.camera.bottom = -80;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// ── [同学A] 地形 & 分形树 ────────────────────────────────────
const terrain = new TerrainGenerator(220, 256, 32, 42);
const terrainMesh = terrain.createTerrainMesh();
scene.add(terrainMesh);

const { mesh: waterMesh, update: updateWater } = terrain.createWaterMesh();
scene.add(waterMesh);

const forest = new FractalTree({
  treeCount: 350,
  iterations: 4,
  maxHeight: 9,
  spreadRadius: 90,
  seed: 137,
});
const forestMesh = forest.generate(terrain);
scene.add(forestMesh);

// ── Camera controller ───────────────────────────────────────
const controller = new CameraController(camera, renderer.domElement, {
  moveSpeed: 10,
  mouseSensitivity: 0.002,
});

// ── Game state ──────────────────────────────────────────────
let gameStarted = false;
let paused = false;
let lastTime = performance.now();
let narrativeTimeout = null;

// ── Narrative system ────────────────────────────────────────
const firedTriggers = new Set();

const narrativeTriggers = [
  {
    id: 'mountain_path',
    position: new THREE.Vector3(5, 0, -30),
    radius: 12,
    title: '山径',
    text: '石径蜿蜒，通向云雾深处。每一步都踏在宣纸之上。',
  },
  {
    id: 'ancient_pine',
    position: new THREE.Vector3(45, 0, 25),
    radius: 14,
    title: '古松',
    text: '苍松挺立，虬枝如墨痕，在风中低语着千年的故事。',
  },
  {
    id: 'cloud_terrace',
    position: new THREE.Vector3(-40, 0, 50),
    radius: 15,
    title: '云台',
    text: '云雾散开，远山如黛，天地间只剩黑白二色。',
  },
  {
    id: 'secluded_stream',
    position: new THREE.Vector3(20, 0, -60),
    radius: 12,
    title: '幽涧',
    text: '溪水无声，墨色晕染，仿佛能听见画笔在纸上游走。',
  },
  {
    id: 'bamboo_grove',
    position: new THREE.Vector3(-30, 0, -40),
    radius: 13,
    title: '竹林',
    text: '风过竹林，疏影横斜。墨分五色，此处尽显。',
  },
  {
    id: 'return_point',
    position: new THREE.Vector3(0, 0, -80),
    radius: 14,
    title: '归处',
    text: '暮色渐起，山影朦胧。这场墨境漫游，终须一别。',
  },
];

function checkNarrativeTriggers() {
  const pos = camera.position;
  for (const trigger of narrativeTriggers) {
    if (firedTriggers.has(trigger.id)) continue;
    const dist = new THREE.Vector3(
      pos.x - trigger.position.x,
      0,
      pos.z - trigger.position.z
    ).length();
    if (dist < trigger.radius) {
      fireNarrative(trigger);
    }
  }
}

function fireNarrative(trigger) {
  firedTriggers.add(trigger.id);
  showNarrative(trigger.title, trigger.text);
}

function showNarrative(title, text) {
  clearTimeout(narrativeTimeout);
  uiNarrativeTitle.textContent = title;
  uiNarrativeText.textContent = text;
  uiNarrative.classList.remove('hidden');
  uiNarrative.classList.add('visible');

  narrativeTimeout = setTimeout(() => {
    uiNarrative.classList.remove('visible');
    uiNarrative.classList.add('hidden');
  }, 5000);
}

// ── UI helpers ──────────────────────────────────────────────
function showPauseMenu() {
  paused = true;
  controller.setEnabled(false);
  uiPauseMenu.classList.remove('hidden');
  uiCrosshair.classList.add('hidden');
  uiHint.classList.add('hidden');
}

function hidePauseMenu() {
  paused = false;
  controller.setEnabled(true);
  uiPauseMenu.classList.add('hidden');
  uiSettingsPanel.classList.add('hidden');
  uiCrosshair.classList.remove('hidden');
}

function showSettings() {
  uiPauseMenu.classList.add('hidden');
  uiSettingsPanel.classList.remove('hidden');
}

function hideSettings() {
  uiSettingsPanel.classList.add('hidden');
  uiPauseMenu.classList.remove('hidden');
}

function applySettings() {
  const sens = parseFloat(uiSensitivitySlider.value);
  controller.mouseSensitivity = sens;
  uiSensitivityVal.textContent = sens.toFixed(3);
}

// ── Controller lock-change callback ─────────────────────────
controller.onLockChange = (locked) => {
  if (locked) {
    if (!gameStarted) gameStarted = true;
    hidePauseMenu();
    uiHint.classList.add('hidden');
    uiCrosshair.classList.remove('hidden');
  } else if (gameStarted) {
    showPauseMenu();
  }
};

// ── UI button bindings ──────────────────────────────────────
document.getElementById('btn-resume').addEventListener('click', () => {
  renderer.domElement.requestPointerLock();
});

document.getElementById('btn-settings').addEventListener('click', showSettings);
document.getElementById('btn-back').addEventListener('click', hideSettings);
document.getElementById('btn-exit').addEventListener('click', () => {
  document.exitPointerLock();
  location.reload();
});

uiSensitivitySlider.addEventListener('input', applySettings);

// Keyboard shortcut: Esc handled by pointer-lock (browser default).
// Additional: 'P' also toggles pause.
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && gameStarted && !paused) {
    document.exitPointerLock();
  }
});

// ── Window resize ───────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  // [同学B] sceneManager.resize(w, h);
});

// ── Main loop ───────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // Clamp delta to avoid spiral-of-death after tab switch
  if (dt > 0.2) dt = 0.016;
  if (dt <= 0) dt = 0.016;

  if (!paused) {
    controller.update(dt);
    checkNarrativeTriggers();
    // [同学B] sceneManager.update(dt);
    updateWater(now * 0.001);
    forest.update(dt);
  }

  // Always render so the scene is visible behind menus
  renderer.render(scene, camera);
}

// ── Boot ────────────────────────────────────────────────────
uiHint.classList.remove('hidden');
uiCrosshair.classList.add('hidden');
applySettings();
animate();
