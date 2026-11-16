import * as THREE from 'three'
import type { PedestrianSystem } from './pedestrians'

export type WeaponStatus = { name: 'PULSE'; ready: boolean; cooldown: number; hits: number }

type Pulse = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }

export class WeaponSystem {
  private readonly pulses: Pulse[] = []
  private cooldown = 0
  private hits = 0
  private readonly material = new THREE.MeshBasicMaterial({ color: '#72e9e1', transparent: true, opacity: 0.92 })

  constructor(private readonly scene: THREE.Scene, private readonly pedestrians: PedestrianSystem) {}

  status(): WeaponStatus { return { name: 'PULSE', ready: this.cooldown <= 0, cooldown: this.cooldown, hits: this.hits } }

  fire(origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    if (this.cooldown > 0) return false
    this.cooldown = 0.28
    const dir = direction.clone().normalize()
    const hit = this.pedestrians.hitRay(origin, dir)
    if (hit) this.hits += 1
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.055, 0.95, 8), this.material.clone())
    mesh.position.copy(origin).addScaledVector(dir, 0.7)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    mesh.castShadow = false
    this.scene.add(mesh)
    this.pulses.push({ mesh, velocity: dir.multiplyScalar(42), life: 0.24 })
    return true
  }

  step(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt)
    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.pulses[i]
      pulse.life -= dt
      pulse.mesh.position.addScaledVector(pulse.velocity, dt)
      ;(pulse.mesh.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(pulse.life / 0.24, 0, 1)
      if (pulse.life <= 0) {
        this.scene.remove(pulse.mesh)
        pulse.mesh.geometry.dispose()
        ;(pulse.mesh.material as THREE.Material).dispose()
        this.pulses.splice(i, 1)
      }
    }
  }
}
