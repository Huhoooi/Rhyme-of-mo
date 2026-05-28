import * as THREE from 'three';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _direction = new THREE.Vector3();

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {HTMLElement} domElement - canvas or container for pointer lock
   * @param {object} [options]
   * @param {number} [options.moveSpeed=8]
   * @param {number} [options.sprintMultiplier=2.0]
   * @param {number} [options.mouseSensitivity=0.002]
   */
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;

    this.moveSpeed = options.moveSpeed ?? 8;
    this.sprintMultiplier = options.sprintMultiplier ?? 2.0;
    this.mouseSensitivity = options.mouseSensitivity ?? 0.002;

    this.isLocked = false;
    this._enabled = true;

    this._keys = Object.create(null);
    this._mouseDelta = { x: 0, y: 0 };

    this.minPitch = -Math.PI / 2.2;
    this.maxPitch = Math.PI / 2.2;

    // Fired when pointer-lock state changes
    this.onLockChange = null;

    this._onKeyDown = (e) => { this._keys[e.code] = true; };
    this._onKeyUp = (e) => { this._keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (!this.isLocked) return;
      this._mouseDelta.x += e.movementX;
      this._mouseDelta.y += e.movementY;
    };
    this._onPointerLockChange = () => {
      const wasLocked = this.isLocked;
      this.isLocked = document.pointerLockElement === this.domElement;
      if (this.onLockChange && wasLocked !== this.isLocked) {
        this.onLockChange(this.isLocked);
      }
    };
    this._onClick = () => {
      if (!this.isLocked && this._enabled) {
        this.domElement.requestPointerLock();
      }
    };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.addEventListener('click', this._onClick);

    _euler.setFromQuaternion(camera.quaternion);
  }

  /** Call every frame with seconds since last frame. */
  update(deltaTime) {
    if (!this.isLocked || !this._enabled) return;

    const dt = Math.min(deltaTime, 0.1);

    // --- Mouse look ---
    _euler.setFromQuaternion(this.camera.quaternion);
    _euler.y -= this._mouseDelta.x * this.mouseSensitivity;
    _euler.x -= this._mouseDelta.y * this.mouseSensitivity;
    _euler.x = Math.max(this.minPitch, Math.min(this.maxPitch, _euler.x));
    this.camera.quaternion.setFromEuler(_euler);
    this._mouseDelta.x = 0;
    this._mouseDelta.y = 0;

    // --- Movement speed ---
    const sprinting = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    const speed = this.moveSpeed * (sprinting ? this.sprintMultiplier : 1);

    // --- Horizontal movement ---
    _direction.set(0, 0, 0);
    if (this._keys['KeyW']) _direction.z -= 1;
    if (this._keys['KeyS']) _direction.z += 1;
    if (this._keys['KeyA']) _direction.x -= 1;
    if (this._keys['KeyD']) _direction.x += 1;

    if (_direction.lengthSq() > 0) {
      _direction.normalize();
      _direction.applyQuaternion(this.camera.quaternion);
      _direction.y = 0;
      _direction.normalize();
      this.camera.position.addScaledVector(_direction, speed * dt);
    }

    // --- Vertical movement ---
    if (this._keys['Space']) this.camera.position.y += speed * dt;
    if (this._keys['ControlLeft'] || this._keys['ControlRight']) {
      this.camera.position.y -= speed * dt;
    }
  }

  /** Temporarily enable/disable input processing. */
  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) {
      this._keys = Object.create(null);
      this._mouseDelta.x = 0;
      this._mouseDelta.y = 0;
    }
  }

  /** Remove all listeners. Call when tearing down. */
  dispose() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    this.domElement.removeEventListener('click', this._onClick);
    if (this.isLocked) document.exitPointerLock();
  }
}
