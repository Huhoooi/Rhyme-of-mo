// --- 为了兼容 VS Code 插件不报错而手动声明的 Three.js 内置变量 ---
attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
// -----------------------------------------------------------

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    // 计算世界空间/相机空间下的法线
  vNormal = normalize(normalMatrix * normal);

    // 计算顶点在相机空间下的位置
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}