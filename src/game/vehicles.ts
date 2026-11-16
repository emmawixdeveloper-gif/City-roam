import * as THREE from 'three'
import { Physics, RAPIER } from '../engine/physics'
import type { Input } from '../engine/input'

export type VehicleStatus = {
  vehicle: 'vehicle.onFoot' | 'vehicle.driving'
  prompt: '' | 'vehicle.enter' | 'vehicle.exit'
  speed: number
}

type Lane = { axis: 'x' | 'z'; lane: number; direction: 1 | -1 }

type Vehicle = {
  id: string
  root: THREE.Group
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  yaw: number
  speed: number
  ai: boolean
  lane?: Lane
  color: string
  steering: number
}

const CITY_EDGE = 112
const BODY_Y = 0.64
const VEHICLE_LENGTH = 4.2
const VEHICLE_WIDTH = 1.8
const VEHICLE_HALF_HEIGHT = 0.45

export class VehicleSystem {
  private readonly vehicles: Vehicle[] = []
  private activeId: string | null = null
  private readonly ray = new RAPIER.Ray({ x: 0, y: BODY_Y + 0.08, z: 0 }, { x: 0, y: 0, z: -1 })

  constructor(private readonly physics: Physics, private readonly scene: THREE.Scene) {
    this.addDrivable('sedan-cyan', new THREE.Vector3(3.6, BODY_Y, 8), 0, '#3e9fb3')
    this.addDrivable('hatchback-amber', new THREE.Vector3(-7, BODY_Y, 8), 0, '#d6a05e')
    this.addTraffic('traffic-east', new THREE.Vector3(-108, BODY_Y, -32), 0, { axis: 'x', lane: -32, direction: 1 }, '#c96561')
    this.addTraffic('traffic-west', new THREE.Vector3(108, BODY_Y, 32), Math.PI, { axis: 'x', lane: 32, direction: -1 }, '#4c86a4')
    this.addTraffic('traffic-south', new THREE.Vector3(32, BODY_Y, -108), Math.PI / 2, { axis: 'z', lane: 32, direction: 1 }, '#d6a05e')
    this.addTraffic('traffic-north', new THREE.Vector3(-32, BODY_Y, 108), -Math.PI / 2, { axis: 'z', lane: -32, direction: -1 }, '#a77796')
  }

  get active(): boolean { return this.activeId !== null }
  get activeVehicle(): THREE.Object3D | null { return this.find(this.activeId)?.root ?? null }
  get activeSpeed(): number { return this.find(this.activeId)?.speed ?? 0 }
  get trafficCount(): number { return this.vehicles.filter(vehicle => vehicle.ai).length }

  reset(): void {
    this.activeId = null
    for (const vehicle of this.vehicles) if (!vehicle.ai) vehicle.speed = 0
  }

  status(playerPosition: THREE.Vector3): VehicleStatus {
    const active = this.find(this.activeId)
    if (active) return { vehicle: 'vehicle.driving', prompt: 'vehicle.exit', speed: Math.abs(active.speed) }
    return { vehicle: 'vehicle.onFoot', prompt: this.nearestDrivable(playerPosition, 4.1) ? 'vehicle.enter' : '', speed: 0 }
  }

  tryEnter(playerPosition: THREE.Vector3): boolean {
    if (this.activeId) return false
    const nearest = this.nearestDrivable(playerPosition, 4.1)
    if (!nearest) return false
    this.activeId = nearest.id
    nearest.speed = 0
    return true
  }

  exit(playerPosition: THREE.Vector3): THREE.Vector3 | null {
    const active = this.find(this.activeId)
    if (!active) return null
    const side = new THREE.Vector3(Math.cos(active.yaw), 0, -Math.sin(active.yaw))
    const exit = active.root.position.clone().addScaledVector(side, 2.6)
    exit.y = playerPosition.y
    this.activeId = null
    active.speed = 0
    return exit
  }

  step(dt: number, input: Input): void {
    for (const vehicle of this.vehicles) {
      if (vehicle.ai) this.stepTraffic(vehicle, dt)
    }
    const active = this.find(this.activeId)
    if (!active) return
    const throttle = THREE.MathUtils.clamp(input.move.y, -1, 1)
    const steering = THREE.MathUtils.clamp(input.move.x, -1, 1)
    const braking = input.held('jump')
    const boosting = input.held('sprint')
    const maxForward = boosting ? 24 : 18
    const maxReverse = 7
    const sameDirection = throttle === 0 || Math.sign(throttle) === Math.sign(active.speed) || Math.abs(active.speed) < 0.5
    if (braking) active.speed = THREE.MathUtils.damp(active.speed, 0, 15, dt)
    else if (Math.abs(throttle) > 0.05 && sameDirection) {
      const target = throttle > 0 ? maxForward : -maxReverse
      const response = throttle > 0 ? 5.8 : 4.8
      active.speed = THREE.MathUtils.damp(active.speed, target * Math.abs(throttle), response, dt)
    } else if (Math.abs(throttle) > 0.05) {
      // Opposite input first brakes the car; it only enters reverse after nearly stopping.
      active.speed = THREE.MathUtils.damp(active.speed, 0, 15, dt)
    } else active.speed = THREE.MathUtils.damp(active.speed, 0, 3.8, dt)
    if (Math.abs(active.speed) > 0.2) {
      const steeringTarget = steering * THREE.MathUtils.clamp(Math.abs(active.speed) / 5, 0, 1)
      active.steering = THREE.MathUtils.damp(active.steering, steeringTarget, 10, dt)
      const steeringRate = 0.85 * THREE.MathUtils.clamp(Math.abs(active.speed) / 7, 0.15, 1)
      active.yaw += active.steering * steeringRate * dt * (active.speed < 0 ? -1 : 1)
    } else active.steering = THREE.MathUtils.damp(active.steering, 0, 12, dt)
    if (Math.abs(active.speed) < 0.35 && Math.abs(throttle) < 0.05) active.speed = 0
    if (Math.abs(active.speed) < 0.35 && throttle < -0.05) active.speed = -0.4
    // Vehicle meshes are lengthwise on +X. yaw=0 therefore points the hood east.
    const forward = new THREE.Vector3(Math.cos(active.yaw), 0, Math.sin(active.yaw))
    this.ray.origin.x = active.root.position.x
    this.ray.origin.y = BODY_Y + 0.1
    this.ray.origin.z = active.root.position.z
    this.ray.dir.x = forward.x
    this.ray.dir.z = forward.z
    const obstacle = this.physics.world.castRay(this.ray, 2.4, true, undefined, undefined, active.collider)
    if (obstacle && obstacle.timeOfImpact < 1.85) active.speed = THREE.MathUtils.damp(active.speed, 0, 18, dt)
    const next = active.root.position.clone().addScaledVector(forward, active.speed * dt)
    next.x = THREE.MathUtils.clamp(next.x, -CITY_EDGE + 4, CITY_EDGE - 4)
    next.z = THREE.MathUtils.clamp(next.z, -CITY_EDGE + 4, CITY_EDGE - 4)
    active.body.setNextKinematicTranslation({ x: next.x, y: BODY_Y, z: next.z })
    active.body.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), active.yaw))
  }

  private stepTraffic(vehicle: Vehicle, dt: number): void {
    const lane = vehicle.lane!
    const next = vehicle.root.position.clone()
    let targetSpeed = 5.4 + Math.sin(performance.now() * 0.0004 + vehicle.id.length) * 0.55
    const ahead = this.vehicles.find(other => other !== vehicle && other.ai && other.lane?.axis === lane.axis && other.lane.lane === lane.lane && other.lane.direction === lane.direction && this.forwardGap(vehicle, other, lane) > 0 && this.forwardGap(vehicle, other, lane) < 13)
    if (ahead) targetSpeed = Math.min(targetSpeed, Math.max(1.2, ahead.speed * 0.72))
    vehicle.speed = THREE.MathUtils.damp(vehicle.speed, targetSpeed, 4.5, dt)
    if (lane.axis === 'x') {
      next.x += lane.direction * vehicle.speed * dt
      if (next.x > CITY_EDGE + 4) next.x = -CITY_EDGE - 4
      if (next.x < -CITY_EDGE - 4) next.x = CITY_EDGE + 4
      next.z = lane.lane
      vehicle.yaw = lane.direction > 0 ? 0 : Math.PI
    } else {
      next.z += lane.direction * vehicle.speed * dt
      if (next.z > CITY_EDGE + 4) next.z = -CITY_EDGE - 4
      if (next.z < -CITY_EDGE - 4) next.z = CITY_EDGE + 4
      next.x = lane.lane
      vehicle.yaw = lane.direction > 0 ? Math.PI / 2 : -Math.PI / 2
    }
    vehicle.body.setNextKinematicTranslation({ x: next.x, y: BODY_Y, z: next.z })
    vehicle.body.setNextKinematicRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.yaw))
  }

  private addDrivable(id: string, position: THREE.Vector3, yaw: number, color: string): void {
    this.addVehicle({ id, position, yaw, color, ai: false })
  }

  private addTraffic(id: string, position: THREE.Vector3, yaw: number, lane: Lane, color: string): void {
    this.addVehicle({ id, position, yaw, color, ai: true, lane })
  }

  private addVehicle(spec: { id: string; position: THREE.Vector3; yaw: number; color: string; ai: boolean; lane?: Lane }): void {
    const root = new THREE.Group()
    root.position.copy(spec.position)
    root.rotation.y = spec.yaw
    const bodyMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.4, metalness: 0.22 })
    const glass = new THREE.MeshStandardMaterial({ color: '#355060', roughness: 0.22, metalness: 0.12 })
    const tire = new THREE.MeshStandardMaterial({ color: '#1c2633', roughness: 0.74 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(VEHICLE_LENGTH, 0.72, VEHICLE_WIDTH), bodyMat)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.58, 1.46), glass)
    cabin.position.set(-0.18, 0.54, 0)
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.16, 1.72), bodyMat)
    hood.position.set(1.12, 0.44, 0)
    root.add(body, cabin, hood)
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.2, 12)
    for (const x of [-1.24, 1.24]) for (const z of [-0.88, 0.88]) {
      const wheel = new THREE.Mesh(wheelGeo, tire)
      wheel.rotation.x = Math.PI / 2
      wheel.position.set(x, -0.4, z)
      root.add(wheel)
    }
    root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true } })
    this.scene.add(root)
    const collider = RAPIER.ColliderDesc.cuboid(VEHICLE_LENGTH / 2, VEHICLE_HALF_HEIGHT, VEHICLE_WIDTH / 2).setFriction(0.76)
    const bodyHandle = this.physics.addKinematic(root, collider)
    const vehicle: Vehicle = { id: spec.id, root, body: bodyHandle, collider: bodyHandle.collider(0), yaw: spec.yaw, speed: spec.ai ? 5 : 0, ai: spec.ai, lane: spec.lane, color: spec.color, steering: 0 }
    this.vehicles.push(vehicle)
  }

  private nearestDrivable(position: THREE.Vector3, radius: number): Vehicle | undefined {
    let best: Vehicle | undefined
    let bestDistance = radius * radius
    for (const vehicle of this.vehicles) {
      if (vehicle.ai || vehicle.id === this.activeId) continue
      const distance = vehicle.root.position.distanceToSquared(position)
      if (distance < bestDistance) { bestDistance = distance; best = vehicle }
    }
    return best
  }

  private find(id: string | null): Vehicle | undefined { return id ? this.vehicles.find(vehicle => vehicle.id === id) : undefined }

  private forwardGap(from: Vehicle, to: Vehicle, lane: Lane): number {
    return lane.axis === 'x' ? (to.root.position.x - from.root.position.x) * lane.direction : (to.root.position.z - from.root.position.z) * lane.direction
  }
}
