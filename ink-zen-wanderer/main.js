import * as THREE from 'three';
import { CameraController } from './core/CameraController.js';
import { SceneManager } from './core/SceneManager.js';

// [同学A] — Perlin噪声地形 & L-System分形树
import { TerrainGenerator } from './generation/TerrainGenerator.js';
import { FractalTree } from './generation/FractalTree.js';
import { SceneryBuilder } from './generation/SceneryBuilder.js';

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
const uiMusicFileInput = document.getElementById('music-file-input');
const uiMusicFileName = document.getElementById('music-file-name');
const uiMusicResetBtn = document.getElementById('music-reset-btn');

// ── Three.js bootstrap ──────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.5, 700
);
camera.position.set(0, 16, 32);
camera.lookAt(0, 10, -38);

// [同学B] 接管: SceneManager 会替换/增强 scene / renderer 配置
// 如果需要使用 SceneManager.create 可在此处启用，但本次以同学 A 的环境为基准
// const sceneManager = await SceneManager.create(scene, camera, renderer);

// ── Lighting (基础; 可由 SceneManager 替换) ────────────────
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

// ── Terrain (同学A) — replaces temp ground ──────────────────
const terrainGen = new TerrainGenerator({
  size: 400,
  resolution: 256,
  heightScale: 22,
  noiseScale: 0.012,
  octaves: 6,
  waterLevel: 2.0,
});
scene.add(terrainGen.mesh);
scene.add(terrainGen.water);

// ── Trees (同学A) — L-System 分形树 + GPU Instancing ──────────
const trees = new FractalTree({
  terrain: terrainGen,
  count: 350,
  spawnRadius: 185,
});
trees.init(scene);

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

// ── Scenery (同学A) — 六区域景观 ────────────────────────────
const scenery = new SceneryBuilder({
  terrain: terrainGen,
  triggers: narrativeTriggers,
});
scenery.init(scene);

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

  const vol = parseFloat(document.getElementById('music-volume-slider').value);
  if (audioManager) {
    audioManager.setVolume(vol);
  }
  document.getElementById('music-volume-value').textContent = vol.toFixed(2);
}

function handleMusicFileChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file || !audioManager) return;
  uiMusicFileName.textContent = file.name;
  audioManager.loadUserFile(file);
}

function clearCustomMusic() {
  uiMusicFileInput.value = '';
  uiMusicFileName.textContent = '未选择';
  if (!audioManager) return;
  audioManager.stopCustomTrack();
  audioManager.startGuqinPlayback();
}

// ── Audio Manager ──────────────────────────────────────────
class GuqinAudioManager {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.audioElement = null;
    this.mediaSource = null;
    this.customTrack = false;
    this.guqinLoopTimer = null;
    this.activeOscillators = [];
    this.tempo = 0.6;
    this.initAudio();
    this.startGuqinPlayback();
  }

  initAudio() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.audioContext = audioContext;
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(audioContext.destination);
  }

  resume() {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => { });
    }
    if (this.audioElement && this.customTrack) {
      this.audioElement.play().catch(() => { });
    }
  }

  setVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value)) * 0.3;
    }
  }

  stopGuqinPlayback() {
    if (this.guqinLoopTimer) {
      clearTimeout(this.guqinLoopTimer);
      this.guqinLoopTimer = null;
    }
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch (error) {
        // ignore already stopped oscillators
      }
    }
    this.activeOscillators.length = 0;
  }

  stopCustomTrack() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }
    this.customTrack = false;
  }

  loadUserFile(file) {
    if (!file) return;
    this.stopCustomTrack();
    this.stopGuqinPlayback();

    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audio.muted = false;

    const source = this.audioContext.createMediaElementSource(audio);
    source.connect(this.masterGain);

    this.audioElement = audio;
    this.mediaSource = source;
    this.customTrack = true;
    this.resume();
    audio.play().catch(() => { });
  }

  playNote(frequency, duration, startTime) {
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const envGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.8, startTime + duration * 0.7);

    envGain.gain.setValueAtTime(0.2, startTime);
    envGain.gain.linearRampToValueAtTime(0.18, startTime + duration * 0.15);
    envGain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.connect(envGain);
    envGain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);
    this.activeOscillators.push(osc);
    osc.addEventListener('ended', () => {
      const index = this.activeOscillators.indexOf(osc);
      if (index !== -1) this.activeOscillators.splice(index, 1);
    });
  }

  startGuqinPlayback() {
    if (this.customTrack || this.guqinLoopTimer) return;

    const melody = [
      { freq: 261.63, dur: 0.8 },
      { freq: 293.66, dur: 0.6 },
      { freq: 329.63, dur: 0.7 },
      { freq: 349.23, dur: 0.8 },
      { freq: 329.63, dur: 0.6 },
      { freq: 293.66, dur: 0.7 },
      { freq: 261.63, dur: 1.0 },
      { freq: 220.0, dur: 0.5 },
      { freq: 246.94, dur: 0.6 },
      { freq: 261.63, dur: 0.8 },
    ];

    const scheduleNotes = () => {
      if (this.customTrack) return;
      const now = this.audioContext.currentTime;
      let time = now;
      for (let i = 0; i < melody.length; i++) {
        const note = melody[i];
        this.playNote(note.freq, note.dur * this.tempo * 0.85, time);
        time += note.dur * this.tempo;
      }
      this.guqinLoopTimer = setTimeout(() => {
        this.guqinLoopTimer = null;
        scheduleNotes();
      }, (time - now) * 1000 + 200);
    };

    scheduleNotes();
  }
}

let audioManager = null;

controller.onLockChange = (locked) => {
  if (locked) {
    if (!gameStarted) gameStarted = true;
    hidePauseMenu();
    uiHint.classList.add('hidden');
    uiCrosshair.classList.remove('hidden');
    if (audioManager) audioManager.resume();
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
document.getElementById('music-volume-slider').addEventListener('input', applySettings);
uiMusicFileInput.addEventListener('change', handleMusicFileChange);
uiMusicResetBtn.addEventListener('click', clearCustomMusic);

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
  sceneManager.resize(w, h);
});

// ── Main loop ───────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);

  // Initialize audio on first frame
  if (!audioManager) {
    try {
      audioManager = new GuqinAudioManager();
    } catch (e) {
      console.warn('Audio initialization failed:', e);
    }
  }

  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  // Clamp delta to avoid spiral-of-death after tab switch
  if (dt > 0.2) dt = 0.016;
  if (dt <= 0) dt = 0.016;

  if (!paused) {
    controller.update(dt);
<<<<<<< HEAD
    terrainGen.updateWater(now * 0.001);
    trees.update(now, dt);
    scenery.update(now * 0.001, dt);
    checkNarrativeTriggers();
    // [同学B] sceneManager.update(dt);
=======
    sceneManager.update(dt);
    checkNarrativeTriggers();
    // [同学A] tree sway animation, etc.
>>>>>>> feat/ink-shader
  }

  // Always render so the scene is visible behind menus
  sceneManager.render();
}

// ── Boot ────────────────────────────────────────────────────
uiHint.classList.remove('hidden');
uiCrosshair.classList.add('hidden');
applySettings();
animate();
