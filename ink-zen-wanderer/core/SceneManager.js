import * as THREE from 'three';

async function loadShader(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load shader: ${url}`);
  }
  return response.text();
}

function createInkMaterial(vertexShader, fragmentShader) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uLightDirection: { value: new THREE.Vector3(0.75, 1.0, 0.4).normalize() },
      uPaperColor: { value: new THREE.Color(0xf5f5dc) },
      uInkColor: { value: new THREE.Color(0.08, 0.08, 0.08) },
      uRimPower: { value: 2.8 },
      uEdgeThreshold: { value: 0.28 },
      uFogDensity: { value: 0.0128 },
      uFogColor: { value: new THREE.Color(0xd4d2cc) },
    },
  });
}

function buildPaperNoiseDataURL(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#F5F5DC';
  ctx.fillRect(0, 0, size, size);

  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const value = 220 + Math.round(Math.random() * 35);
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 18;
  }
  ctx.putImageData(image, 0, 0);

  return canvas.toDataURL('image/png');
}

function createRainTexture(size = 128, lineCount = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0)';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < lineCount; i++) {
    const x = size * 0.5 + (Math.random() - 0.5) * 4;
    const alpha = 0.28 + Math.random() * 0.12;
    const length = size * (0.78 + Math.random() * 0.12);
    const width = 1.2 + Math.random() * 0.8;

    const gradient = ctx.createLinearGradient(x, 0, x, length);
    gradient.addColorStop(0.0, 'rgba(238, 244, 250, 0.0)');
    gradient.addColorStop(0.08, `rgba(238, 244, 250, ${alpha * 0.5})`);
    gradient.addColorStop(0.35, `rgba(238, 244, 250, ${alpha * 1.0})`);
    gradient.addColorStop(0.7, `rgba(238, 244, 250, ${alpha * 0.35})`);
    gradient.addColorStop(1.0, 'rgba(238, 244, 250, 0.0)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 1.2, length);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = `rgba(238, 244, 250, ${alpha * 0.3})`;
    ctx.arc(x + (Math.random() - 0.5) * 0.7, length * 0.16, width * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.format = THREE.RGBAFormat;
  texture.premultiplyAlpha = true;
  return texture;
}

function createGroundTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#b8a57a');
  gradient.addColorStop(0.45, '#c4b091');
  gradient.addColorStop(0.8, '#9c856c');
  gradient.addColorStop(1, '#7c6a55');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 4 + 0.8;
    ctx.fillStyle = `rgba(80, 62, 46, ${0.03 + Math.random() * 0.06})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 8 + Math.random() * 24;
    const h = 1 + Math.random() * 2.5;
    ctx.fillStyle = `rgba(220, 210, 180, ${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(x, y, w, h);
  }

  for (let i = 0; i < 5; i++) {
    const radius = size * (0.25 + i * 0.05);
    const alpha = 0.06 - i * 0.01;
    ctx.strokeStyle = `rgba(120, 98, 78, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function terrainHeight(x, z) {
  const baseScale = 0.014;
  let y = Math.sin(x * baseScale * 1.1) * 2.8;
  y += Math.cos(z * baseScale * 1.2) * 2.4;
  y += Math.sin((x + z) * baseScale * 0.92) * 1.5;
  y += Math.cos((x * 0.4 - z * 0.7) * baseScale * 1.8) * 1.2;

  y += Math.exp(-Math.pow((x - 18) * 0.0048, 2) - Math.pow((z + 120) * 0.0054, 2)) * 10.0;
  y += Math.exp(-Math.pow((x + 24) * 0.005, 2) - Math.pow((z + 88) * 0.0053, 2)) * 7.0;

  const dist = Math.sqrt(x * x + z * z);
  const fade = Math.max(0.0, 1.0 - Math.max(0.0, (dist - 230) / 170));
  return y * fade * 0.88;
}

function createTerrainMesh() {
  const size = 620;
  const detail = 240;
  const geometry = new THREE.PlaneGeometry(size, size, detail, detail);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, terrainHeight(x, z));
  }
  geometry.computeVertexNormals();

  const texture = createGroundTexture(1024);
  texture.repeat.set(16, 16);
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xa08b72,
    roughness: 0.95,
    metalness: 0.02,
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  return terrain;
}

function createRainSystem(options) {
  const count = options.count;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * options.spread;
    positions[i * 3 + 1] = Math.random() * (options.maxHeight - options.minHeight) + options.minHeight;
    positions[i * 3 + 2] = (Math.random() - 0.5) * options.spread;
    velocities[i] = options.speedMin + Math.random() * (options.speedMax - options.speedMin);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: options.pointSize,
    map: createRainTexture(options.textureSize, options.lineCount),
    transparent: true,
    alphaTest: 0.03,
    opacity: options.opacity,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    color: options.color,
    blending: THREE.NormalBlending,
  });

  const rain = new THREE.Points(geometry, material);
  rain.frustumCulled = false;
  return { rain, geometry, velocities, options };
}

function createRainParticleSystem() {
  const nearRain = createRainSystem({
    count: 1200,
    spread: 110,
    minHeight: 10,
    maxHeight: 38,
    speedMin: 30,
    speedMax: 50,
    pointSize: 11,
    textureSize: 96,
    lineCount: 1,
    opacity: 0.34,
    color: 0xdfe7ef,
  });

  const farRain = createRainSystem({
    count: 1800,
    spread: 170,
    minHeight: 18,
    maxHeight: 46,
    speedMin: 24,
    speedMax: 38,
    pointSize: 7,
    textureSize: 72,
    lineCount: 1,
    opacity: 0.22,
    color: 0xbccad2,
  });

  return { nearRain, farRain };
}

const mistVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const mistFragmentShader = `
precision highp float;
uniform float uTime;
uniform float uDensity;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.2;
    amplitude *= 0.53;
  }
  return value;
}

void main() {
  vec2 p = vUv * vec2(3.0, 1.0) + vec2(-uTime * 0.045, uTime * 0.025);
  float cloud = fbm(p * 1.8) * 0.7 + fbm(p * 4.1) * 0.24;
  float baseFog = smoothstep(0.18, 0.68, cloud + (1.0 - vUv.y) * 0.28);
  float vertical = pow(1.0 - vUv.y, 1.4);
  float alpha = baseFog * vertical * uDensity * 0.95;
  alpha *= smoothstep(0.1, 0.9, vUv.y);
  gl_FragColor = vec4(0.70, 0.72, 0.75, alpha);
}
`;

function createFogPlane(width, height, density) {
  const material = new THREE.ShaderMaterial({
    vertexShader: mistVertexShader,
    fragmentShader: mistFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uDensity: { value: density },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 1, 1), material);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

export class SceneManager {
  constructor(scene, camera, renderer, inkVertexShader, inkFragmentShader) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.noiseOffset = 0;

    scene.background = new THREE.Color(0xb4bac0);
    scene.fog = new THREE.FogExp2(0xb7bfc5, 0.0172);

    this.inkMaterial = createInkMaterial(inkVertexShader, inkFragmentShader);
    this._createEnvironment();
    this._createRain();
    this._createPaperOverlay();
  }

  static async create(scene, camera, renderer) {
    const [inkVertexShader, inkFragmentShader] = await Promise.all([
      loadShader(new URL('../Shaders/ink.vert', import.meta.url)),
      loadShader(new URL('../Shaders/ink.frag', import.meta.url)),
    ]);
    return new SceneManager(scene, camera, renderer, inkVertexShader, inkFragmentShader);
  }

  _createEnvironment() {
    this._createSky();
    this._createLights();
    this._createTerrain();
    this._createFogLayers();
  }

  _createTerrain() {
    const terrain = createTerrainMesh();
    terrain.position.y = -0.7;
    this.scene.add(terrain);
  }

  _createLights() {
    this.ambientLight = new THREE.AmbientLight(0xd8d8d8, 0.78);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xd8d8d8, 1.25);
    this.sunLight.position.set(38, 72, 16);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 300;
    this.sunLight.shadow.camera.left = -80;
    this.sunLight.shadow.camera.right = 80;
    this.sunLight.shadow.camera.top = 80;
    this.sunLight.shadow.camera.bottom = -80;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
  }

  _createSky() {
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vPosition;
        uniform float uTime;

        float rand(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = rand(i);
          float b = rand(i + vec2(1.0, 0.0));
          float c = rand(i + vec2(0.0, 1.0));
          float d = rand(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
          vec3 dir = normalize(vPosition);
          float horizon = smoothstep(-0.2, 0.25, dir.y);
          vec3 skyTop = vec3(0.68, 0.70, 0.72);
          vec3 skyBottom = vec3(0.30, 0.34, 0.40);
          float blend = smoothstep(0.0, 0.92, dir.y);
          vec3 base = mix(skyBottom, skyTop, blend);

          float clouds = noise(dir.xz * 1.8 + uTime * 0.03) * 0.5;
          clouds += noise(dir.xz * 3.5 + uTime * 0.07) * 0.24;
          float cloudLayer = smoothstep(0.22, 0.68, clouds + dir.y * 0.24);
          vec3 cloudColor = mix(base, vec3(0.80, 0.82, 0.84), cloudLayer);

          float mist = pow(clamp(1.0 - dir.y, 0.0, 1.0), 3.2) * 0.62;
          vec3 finalSky = mix(cloudColor, vec3(0.76, 0.78, 0.80), mist);
          gl_FragColor = vec4(finalSky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMaterial);
    skyMesh.rotation.y = Math.PI * 0.15;
    this.skyMaterial = skyMaterial;
    this.scene.add(skyMesh);
  }

  _createFogLayers() {
    this.fogPlanes = [];

    const fogA = createFogPlane(180, 52, 0.32);
    fogA.position.set(0, 12, -16);
    fogA.rotation.x = -Math.PI / 2.55;
    this.fogPlanes.push(fogA);
    this.scene.add(fogA);

    const fogB = createFogPlane(220, 60, 0.26);
    fogB.position.set(-18, 10, -40);
    fogB.rotation.x = -Math.PI / 2.45;
    this.fogPlanes.push(fogB);
    this.scene.add(fogB);

    const fogC = createFogPlane(240, 82, 0.22);
    fogC.position.set(8, 8, -70);
    fogC.rotation.x = -Math.PI / 2.33;
    this.fogPlanes.push(fogC);
    this.scene.add(fogC);

    const fogD = createFogPlane(240, 92, 0.18);
    fogD.position.set(16, 6, -92);
    fogD.rotation.x = -Math.PI / 2.25;
    this.fogPlanes.push(fogD);
    this.scene.add(fogD);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
    this.renderOverlay();
  }

  renderOverlay() {
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.noiseScene, this.noiseCamera);
    this.renderer.autoClear = prevAutoClear;
  }

  resize() {
    // no extra resize work needed for the full-screen overlay.
  }

  _createRain() {
    const system = createRainParticleSystem();
    this.rainNear = system.nearRain;
    this.rainFar = system.farRain;
    this.scene.add(this.rainNear.rain);
    this.scene.add(this.rainFar.rain);
  }


  _createPaperOverlay() {
    this.noiseScene = new THREE.Scene();
    this.noiseCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const plane = new THREE.PlaneGeometry(2, 2);
    const texture = new THREE.TextureLoader().load(buildPaperNoiseDataURL(256));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6, 6);

    this.overlayMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      color: 0xffffff,
    });
    const overlay = new THREE.Mesh(plane, this.overlayMaterial);
    this.noiseScene.add(overlay);
  }

  update(deltaTime) {
    this.noiseOffset += deltaTime * 0.02;
    if (this.overlayMaterial && this.overlayMaterial.map) {
      this.overlayMaterial.map.offset.set(this.noiseOffset, this.noiseOffset * 0.5);
      this.overlayMaterial.map.needsUpdate = true;
    }

    if (this.skyMaterial) {
      this.skyMaterial.uniforms.uTime.value += deltaTime * 0.08;
    }

    const windX = Math.sin(this.noiseOffset * 0.65) * 1.4;
    const windZ = Math.cos(this.noiseOffset * 0.73) * 0.9;

    if (this.rainNear && this.rainNear.geometry && this.rainNear.velocities) {
      this.rainNear.rain.position.copy(this.camera.position);
      this.rainNear.rain.position.y = this.camera.position.y + 18;
      const positions = this.rainNear.geometry.attributes.position.array;
      for (let i = 0; i < this.rainNear.velocities.length; i++) {
        const idx = i * 3;
        positions[idx + 0] += windX * deltaTime * 0.22;
        positions[idx + 1] -= this.rainNear.velocities[i] * deltaTime;
        positions[idx + 2] += windZ * deltaTime * 0.16;

        const worldX = this.rainNear.rain.position.x + positions[idx + 0];
        const worldZ = this.rainNear.rain.position.z + positions[idx + 2];
        const worldY = this.rainNear.rain.position.y + positions[idx + 1];
        const groundY = terrainHeight(worldX, worldZ) - 0.7;

        if (worldY < groundY + 0.8) {
          positions[idx + 0] = (Math.random() - 0.5) * this.rainNear.options.spread;
          positions[idx + 1] = this.rainNear.options.maxHeight - 4 + Math.random() * 8;
          positions[idx + 2] = (Math.random() - 0.5) * this.rainNear.options.spread;
        }
      }
      this.rainNear.geometry.attributes.position.needsUpdate = true;
    }

    if (this.rainFar && this.rainFar.geometry && this.rainFar.velocities) {
      this.rainFar.rain.position.copy(this.camera.position);
      this.rainFar.rain.position.y = this.camera.position.y + 18;
      const positions = this.rainFar.geometry.attributes.position.array;
      for (let i = 0; i < this.rainFar.velocities.length; i++) {
        const idx = i * 3;
        positions[idx + 0] += windX * deltaTime * 0.12;
        positions[idx + 1] -= this.rainFar.velocities[i] * deltaTime * 0.8;
        positions[idx + 2] += windZ * deltaTime * 0.1;

        const worldX = this.rainFar.rain.position.x + positions[idx + 0];
        const worldZ = this.rainFar.rain.position.z + positions[idx + 2];
        const worldY = this.rainFar.rain.position.y + positions[idx + 1];
        const groundY = terrainHeight(worldX, worldZ) - 0.7;

        if (worldY < groundY + 0.8) {
          positions[idx + 0] = (Math.random() - 0.5) * this.rainFar.options.spread;
          positions[idx + 1] = this.rainFar.options.maxHeight - 6 + Math.random() * 10;
          positions[idx + 2] = (Math.random() - 0.5) * this.rainFar.options.spread;
        }
      }
      this.rainFar.geometry.attributes.position.needsUpdate = true;
    }

    if (this.fogPlanes) {
      for (let i = 0; i < this.fogPlanes.length; i++) {
        const plane = this.fogPlanes[i];
        plane.material.uniforms.uTime.value += deltaTime * (0.05 + i * 0.03);
        plane.position.x += Math.sin(plane.material.uniforms.uTime.value * 0.35) * deltaTime * 0.35;
      }
    }
  }
}
