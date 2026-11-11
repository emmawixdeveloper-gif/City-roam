import * as THREE from 'three'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'

export type CameraMode = 'fps' | 'tps' | 'close' | 'wide'
const C = CONFIG.camera
const UP = new THREE.Vector3(0, 1, 0)

/** Smooth, collision-aware camera supporting first-person and three third-person distances. */
export class FollowCamera {
  readonly camera = new THREE.PerspectiveCamera(C.fov, 1, 0.1, 500)
  mode: CameraMode = 'tps'
  yaw = 0
  pitch = 0.42
  private distance = C.distance
  private distancePreference = C.distance
  private lastConfigDistance = C.distance
  private readonly focus = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly wantedPosition = new THREE.Vector3()
  private readonly wantedLook = new THREE.Vector3()
  private readonly desiredCamera = new THREE.PerspectiveCamera()
  private shake = 0

  constructor(private readonly physics: Physics, private readonly exclude: RAPIER.Collider) {}

  addShake(amount: number): void { this.shake = Math.min(1, this.shake + amount) }

  setMode(mode: CameraMode): void { this.mode = mode }
  setDistance(distance: number): void { this.distancePreference = THREE.MathUtils.clamp(distance, 2.5, 12); this.lastConfigDistance = C.distance; if (this.mode === 'tps') this.distance = this.distancePreference }
  cycle(): CameraMode {
    const modes: CameraMode[] = ['tps', 'close', 'wide', 'fps']
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length]
    return this.mode
  }
  get distanceSetting(): number { return this.distancePreference }

  /** Snap without smoothing (spawn, respawn). */
  reset(target: THREE.Vector3, yaw = this.yaw): void {
    this.yaw = yaw
    this.focus.copy(target)
    this.distance = this.effectiveDistance()
    this.update(target, { x: 0, y: 0 }, 1, true)
  }

  update(target: THREE.Vector3, look: { x: number; y: number }, frameSeconds: number, snap = false, reducedMotion = false): void {
    if (this.camera.fov !== C.fov) {
      this.camera.fov = C.fov
      this.camera.updateProjectionMatrix()
    }
    this.yaw -= look.x
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.y, C.minPitch, C.maxPitch)
    const k = 1 - Math.exp(-C.follow * frameSeconds)
    if (snap) this.focus.copy(target)
    else {
      this.focus.x += (target.x - this.focus.x) * k
      this.focus.y += (target.y - this.focus.y) * k
      this.focus.z += (target.z - this.focus.z) * k
    }

    const cosPitch = Math.cos(this.pitch)
    this.direction.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
    if (this.mode === 'fps') this.updateFirstPerson(frameSeconds, snap, reducedMotion)
    else this.updateThirdPerson(frameSeconds, snap, reducedMotion)
  }

  private updateFirstPerson(frameSeconds: number, snap: boolean, reducedMotion: boolean): void {
    this.wantedPosition.copy(this.focus)
    this.wantedLook.copy(this.focus).add(this.direction)
    // Keep the camera from being pushed through a wall when the head/cabin is against geometry.
    const hit = this.physics.world.castRay(new RAPIER.Ray(this.focus, this.direction), 0.38, true, undefined, undefined, this.exclude)
    if (hit) this.wantedPosition.addScaledVector(this.direction, Math.max(-0.28, hit.timeOfImpact - 0.05))
    this.desiredCamera.position.copy(this.wantedPosition)
    this.desiredCamera.lookAt(this.wantedLook)
    const k = snap ? 1 : 1 - Math.exp(-18 * frameSeconds)
    this.camera.position.lerp(this.desiredCamera.position, k)
    this.camera.quaternion.slerp(this.desiredCamera.quaternion, k)
    this.applyShake(frameSeconds, reducedMotion)
  }

  private updateThirdPerson(frameSeconds: number, snap: boolean, reducedMotion: boolean): void {
    const aim = this.focus.clone().add(new THREE.Vector3(0, C.height * 0.45, 0))
    const wantedDistance = this.effectiveDistance()
    const hit = this.physics.world.castRay(new RAPIER.Ray(aim, this.direction.clone().multiplyScalar(-1)), wantedDistance, true, undefined, undefined, this.exclude)
    let wanted = wantedDistance
    if (hit) wanted = Math.max(1.2, hit.timeOfImpact - 0.35)
    this.distance = wanted < this.distance || snap ? wanted : THREE.MathUtils.damp(this.distance, wanted, 4, frameSeconds)
    this.wantedPosition.copy(aim).addScaledVector(this.direction, -this.distance)
    this.wantedLook.copy(aim)
    this.desiredCamera.position.copy(this.wantedPosition)
    this.desiredCamera.lookAt(this.wantedLook)
    const k = snap ? 1 : 1 - Math.exp(-12 * frameSeconds)
    this.camera.position.lerp(this.desiredCamera.position, k)
    this.camera.quaternion.slerp(this.desiredCamera.quaternion, k)
    applyLookAt(this.camera, this.wantedLook)
    this.applyShake(frameSeconds, reducedMotion)
  }

  private effectiveDistance(): number {
    if (this.distancePreference === this.lastConfigDistance && C.distance !== this.lastConfigDistance) {
      this.distancePreference = C.distance
      this.lastConfigDistance = C.distance
    }
    if (this.mode === 'close') return Math.min(this.distancePreference, 3.4)
    if (this.mode === 'wide') return Math.max(this.distancePreference, 10)
    if (this.mode === 'fps') return 0
    return this.distancePreference
  }

  private applyShake(frameSeconds: number, reducedMotion: boolean): void {
    if (this.shake > 0 && !reducedMotion) {
      const s = this.shake * this.shake * 0.35
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s))
    }
    this.shake = Math.max(0, this.shake - frameSeconds * 2.5)
  }
}

function applyLookAt(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
  const forward = target.clone().sub(camera.position).normalize()
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()
  camera.matrix.makeBasis(right, up, forward.negate())
  camera.quaternion.setFromRotationMatrix(camera.matrix)
}
