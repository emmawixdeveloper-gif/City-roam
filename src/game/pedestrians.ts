import * as THREE from 'three'

export type PedestrianStatus = { count: number; alert: number }

type Civilian = {
  root: THREE.Group
  route: THREE.Vector3[]
  target: number
  speed: number
  phase: number
  panic: number
  mood: number
}

const ROUTES: THREE.Vector3[][] = [
  [new THREE.Vector3(-27, 0.02, -12), new THREE.Vector3(-27, 0.02, 12), new THREE.Vector3(-12, 0.02, 12), new THREE.Vector3(-12, 0.02, -12)],
  [new THREE.Vector3(27, 0.02, -12), new THREE.Vector3(27, 0.02, 12), new THREE.Vector3(12, 0.02, 12), new THREE.Vector3(12, 0.02, -12)],
  [new THREE.Vector3(-76, 0.02, -58), new THREE.Vector3(-52, 0.02, -58), new THREE.Vector3(-52, 0.02, -38), new THREE.Vector3(-76, 0.02, -38)],
  [new THREE.Vector3(52, 0.02, 38), new THREE.Vector3(76, 0.02, 38), new THREE.Vector3(76, 0.02, 58), new THREE.Vector3(52, 0.02, 58)],
  [new THREE.Vector3(-56, 0.02, 74), new THREE.Vector3(-32, 0.02, 74), new THREE.Vector3(-32, 0.02, 94), new THREE.Vector3(-56, 0.02, 94)],
]

const COLORS = ['#e8b07a', '#8fd2cb', '#e78473', '#a9b4e8', '#f1d48b', '#b9c3ca']

export class PedestrianSystem {
  private readonly civilians: Civilian[] = []
  private readonly temp = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private alertTimer = 0

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < 18; i += 1) {
      const route = ROUTES[i % ROUTES.length]
      const root = this.makeCivilian(i)
      const start = route[i % route.length].clone()
      root.position.copy(start)
      root.position.x += ((i * 13) % 7) * 0.32 - 0.9
      root.position.z += ((i * 17) % 5) * 0.28 - 0.55
      this.scene.add(root)
      this.civilians.push({ root, route, target: (i + 1) % route.length, speed: 0.85 + (i % 4) * 0.16, phase: i * 0.73, panic: 0, mood: i % 3 })
    }
  }

  get count(): number { return this.civilians.length }
  get activeAlert(): number { return this.alertTimer }

  status(): PedestrianStatus { return { count: this.civilians.length, alert: this.alertTimer } }

  step(dt: number, focus: THREE.Vector3): void {
    this.alertTimer = Math.max(0, this.alertTimer - dt)
    for (const civilian of this.civilians) {
      if (civilian.root.position.distanceToSquared(focus) > 155 * 155) continue
      const target = civilian.route[civilian.target]
      this.direction.subVectors(target, civilian.root.position)
      const distance = this.direction.length()
      if (distance < 1.1) civilian.target = (civilian.target + 1) % civilian.route.length
      else {
        this.direction.multiplyScalar(1 / Math.max(distance, 0.001))
        const speed = civilian.panic > 0 ? civilian.speed * 2.5 : civilian.speed
        civilian.root.position.addScaledVector(this.direction, speed * dt)
        civilian.root.rotation.y = THREE.MathUtils.damp(civilian.root.rotation.y, Math.atan2(this.direction.x, this.direction.z), 10, dt)
      }
      civilian.panic = Math.max(0, civilian.panic - dt)
      const stride = Math.sin(performance.now() * 0.008 * (civilian.panic > 0 ? 1.7 : 1) + civilian.phase) * (civilian.panic > 0 ? 0.22 : 0.1)
      const legs = civilian.root.userData.legs as THREE.Object3D[]
      legs[0].rotation.x = stride
      legs[1].rotation.x = -stride
      const bob = Math.abs(Math.sin(performance.now() * 0.004 + civilian.phase)) * 0.025
      civilian.root.position.y = 0.02 + bob
    }
  }

  /** React to a pulse ray without graphic damage; civilians flee briefly. */
  hitRay(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance = 32): boolean {
    let best: Civilian | undefined
    let bestAlong = maxDistance
    const flat = direction.clone().setY(0).normalize()
    for (const civilian of this.civilians) {
      this.temp.subVectors(civilian.root.position, origin)
      const along = this.temp.dot(flat)
      if (along < 0 || along > maxDistance || along >= bestAlong) continue
      const lateral = this.temp.clone().addScaledVector(flat, -along).length()
      if (lateral < 1.1) { best = civilian; bestAlong = along }
    }
    if (!best) return false
    best.panic = 3.2
    best.target = (best.target + 2) % best.route.length
    this.alertTimer = 2.5
    return true
  }

  private makeCivilian(index: number): THREE.Group {
    const root = new THREE.Group()
    const skin = new THREE.MeshStandardMaterial({ color: COLORS[index % COLORS.length], roughness: 0.72 })
    const shirt = new THREE.MeshStandardMaterial({ color: COLORS[(index + 2) % COLORS.length], roughness: 0.82 })
    const dark = new THREE.MeshStandardMaterial({ color: '#203044', roughness: 0.82 })
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.34, 4, 8), shirt)
    torso.position.y = 0.68
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skin)
    head.position.y = 1.12
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.28, 3, 6)
    const left = new THREE.Mesh(legGeo, dark); const right = new THREE.Mesh(legGeo, dark)
    left.position.set(-0.08, 0.32, 0); right.position.set(0.08, 0.32, 0)
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.1), dark)
    bag.position.set(0, 0.68, 0.2)
    root.add(torso, head, left, right, bag)
    root.userData.legs = [left, right]
    root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true } })
    return root
  }
}
