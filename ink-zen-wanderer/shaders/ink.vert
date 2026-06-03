/**
 * 水墨渲染 — 顶点着色器（同学 B 负责）
 *
 * 职责：
 *  1. 标准 MVP 变换
 *  2. 向片元着色器传递世界空间法线、位置、视图方向
 *  3. 传递 UV 供纹理采样（宣纸噪点叠加）
 *
 * 用法（Three.js ShaderMaterial）：
 *  const material = new THREE.ShaderMaterial({
 *    vertexShader: await fetch('shaders/ink.vert').then(r => r.text()),
 *    fragmentShader: await fetch('shaders/ink.frag').then(r => r.text()),
 *    uniforms: { ... }
 *  });
 */

varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);

  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos = worldPos.xyz;
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  vUv = uv;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
