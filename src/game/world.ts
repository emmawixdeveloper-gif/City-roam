import * as THREE from 'three'
import type { Physics } from '../engine/physics'
import { RAPIER } from '../engine/physics'

export type Island = { x: number; z: number; top: number; r: number; cores: number; decor?: boolean }
export const ISLANDS: Island[] = [
  { x: 0, z: 0, top: 0, r: 7, cores: 2 },
  { x: 15, z: 3, top: 1.5, r: 4, cores: 2 },
  { x: 24, z: -8, top: 3.2, r: 3.5, cores: 2 },
  { x: 14, z: -19, top: 4.8, r: 4.5, cores: 2 },
]

export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function planStones(a: Island, b: Island): { x: number; z: number; top: number }[] {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const d = Math.hypot(dx, dz)
  const gap = d - a.r - b.r
  const dy = b.top - a.top
  let n = 0
  while ((gap - n * 1.8) / (n + 1) > 2.3 || Math.abs(dy) / (n + 1) > 1.05) n += 1
  const g = (gap - n * 1.8) / (n + 1)
  return Array.from({ length: n }, (_, i) => {
    const along = a.r + g * (i + 1) + 1.8 * (i + 0.5)
    return { x: a.x + (dx / d) * along, z: a.z + (dz / d) * along, top: a.top + (dy * (i + 1)) / (n + 1) }
  })
}

export type MovingPlatform = {
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  from: THREE.Vector3
  to: THREE.Vector3
  period: number
  phase: number
  delta: THREE.Vector3
  half: THREE.Vector3
}

export type DroneRoute = { center: THREE.Vector3; radius: number; phase: number; dir: 1 | -1 }

export type Destination = { name: string; kind: 'shop' | 'supermarket' | 'restaurant' | 'mall' | 'petrol' | 'park'; position: THREE.Vector3; radius: number }
export type CityStatus = { time: string; district: string; daylight: number; destination?: string; vehicle?: 'vehicle.onFoot' | 'vehicle.driving'; camera?: 'camera.fps' | 'camera.tps' | 'camera.close' | 'camera.wide' }

type Lamp = { light: THREE.PointLight; glow: THREE.Mesh }

const CITY = 256
const ROAD_STEP = 32
const ROAD_WIDTH = 13
const palette = {
  asphalt: '#182840',
  asphaltEdge: '#223752',
  lane: '#c7a86a',
  sidewalk: '#9aa9ad',
  curb: '#d4d7d1',
  grass: '#456d62',
  grassDark: '#2e514c',
  buildingA: '#667a89',
  buildingB: '#8d8179',
  buildingC: '#4f647c',
  buildingD: '#a7977e',
  roof: '#2d3c4f',
  window: '#bfe7e7',
  windowWarm: '#f5bf72',
  tree: '#4d8e6c',
  treeDark: '#2d5f55',
  trunk: '#5c4639',
  car: '#d9685f',
  carBlue: '#4c86a4',
  carGold: '#d6a05e',
  river: '#2f7d89',
}

const materials = new Map<string, THREE.MeshStandardMaterial>()
function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.roughness ?? ''}`
  let cached = materials.get(key)
  if (!cached) {
    cached = new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.04, ...opts })
    materials.set(key, cached)
  }
  return cached
}

export class World {
  readonly scene = new THREE.Scene()
  readonly sun: THREE.DirectionalLight
  readonly spawn = new THREE.Vector3(0, 1.2, 8)
  readonly coreSpots: THREE.Vector3[] = []
  readonly droneRoutes: { center: THREE.Vector3; radius: number; phase: number; dir: 1 | -1 }[] = []
  readonly movers: MovingPlatform[] = []
  readonly landmarks = [
    { name: 'Harbor Loop', position: new THREE.Vector3(-80, 0, -70) },
    { name: 'Juniper Quarter', position: new THREE.Vector3(80, 0, 52) },
    { name: 'Civic Center', position: new THREE.Vector3(16, 0, -16) },
    { name: 'South Market', position: new THREE.Vector3(-48, 0, 80) },
  ]
  readonly destinations: Destination[] = []
  private readonly sky: THREE.Mesh
  private readonly skyUniforms: { top: { value: THREE.Color }; horizon: { value: THREE.Color }; sun: { value: THREE.Vector3 } }
  private readonly windowMats: THREE.MeshStandardMaterial[] = []
  private readonly lamps: Lamp[] = []
  private timeOfDay = 8

  constructor(private readonly physics: Physics, shadowMapSize: number) {
    this.skyUniforms = {
      top: { value: new THREE.Color('#203c69') },
      horizon: { value: new THREE.Color('#f4ad79') },
      sun: { value: new THREE.Vector3(0, 1, 0) },
    }
    this.scene.background = this.skyUniforms.horizon.value.clone()
    this.scene.fog = new THREE.Fog('#6f7890', 56, 310)
    this.sky = this.makeSky()
    this.scene.add(this.sky)
    this.scene.add(new THREE.HemisphereLight('#b9d5e4', '#1b2637', 0.86))
    this.sun = new THREE.DirectionalLight('#ffe6c2', 1.8)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    this.sun.shadow.camera.left = -120
    this.sun.shadow.camera.right = 120
    this.sun.shadow.camera.top = 120
    this.sun.shadow.camera.bottom = -120
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 260
    this.sun.shadow.bias = -0.00035
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun, this.sun.target)

    this.addGround()
    this.addRoadNetwork()
    this.addCityBlocks()
    this.addRiverfront()
    this.addLandmarks()
    this.addCityLife()
  }

  get status(): CityStatus {
    const hour = Math.floor(this.timeOfDay)
    const minute = Math.floor((this.timeOfDay - hour) * 60)
    return { time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, district: 'Civic Center', daylight: this.daylight() }
  }

  setTimeOfDay(hour: number): void { this.timeOfDay = ((hour % 24) + 24) % 24 }
  get currentTimeOfDay(): number { return this.timeOfDay }

  districtAt(position: THREE.Vector3): string {
    let closest = this.landmarks[0]
    let best = Infinity
    for (const landmark of this.landmarks) {
      const d = landmark.position.distanceToSquared(position)
      if (d < best) { best = d; closest = landmark }
    }
    return closest.name
  }

  destinationAt(position: THREE.Vector3): string | undefined {
    const found = this.destinations.find(destination => destination.position.distanceToSquared(position) < destination.radius * destination.radius)
    return found?.name
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.timeOfDay = (this.timeOfDay + dt * 0.045) % 24
    const hour = this.timeOfDay
    const daylight = this.daylight()
    const angle = ((hour - 6) / 24) * Math.PI * 2
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle) * 0.85 + 0.2, Math.sin(angle)).normalize()
    this.sun.position.copy(focus).addScaledVector(sunDir, 120)
    this.sun.target.position.copy(focus)
    this.sun.intensity = 0.3 + daylight * 2.15
    this.sun.color.set(daylight > 0.35 ? '#ffe4c1' : '#8ea5d2')
    this.skyUniforms.sun.value.copy(sunDir)
    this.skyUniforms.top.value.lerpColors(new THREE.Color('#101d3c'), new THREE.Color('#4c8ec0'), daylight)
    this.skyUniforms.horizon.value.lerpColors(new THREE.Color('#263451'), new THREE.Color('#f0b07e'), daylight)
    this.scene.background = this.skyUniforms.horizon.value
    ;(this.scene.fog as THREE.Fog).color.copy(this.skyUniforms.horizon.value).multiplyScalar(0.62)
    for (const window of this.windowMats) window.emissiveIntensity = 0.16 + (1 - daylight) * 1.9
    for (const lamp of this.lamps) {
      const glow = 0.16 + (1 - daylight) * 1.7
      lamp.light.intensity = glow
      ;(lamp.glow.material as THREE.MeshStandardMaterial).emissiveIntensity = glow * 1.4
    }
  }

  stepMovers(): void { /* City Roam has no moving platforms in this prototype. */ }

  private daylight(): number {
    const sun = Math.sin(((this.timeOfDay - 6) / 12) * Math.PI)
    return THREE.MathUtils.clamp(sun, 0, 1)
  }

  private makeSky(): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir; void main(){float h=clamp(vDir.y,-1.0,1.0); vec3 c=mix(horizon,top,pow(max(h,0.0),0.52)); float s=max(dot(normalize(vDir),normalize(sun)),0.0); c+=vec3(1.0,.72,.38)*(pow(s,320.0)*2.0+pow(s,18.0)*.12); gl_FragColor=vec4(c,1.0);}`,
    })
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 14), material)
    mesh.renderOrder = -1
    return mesh
  }

  private addGround(): void {
    const ground = new THREE.Mesh(new THREE.BoxGeometry(CITY, 0.5, CITY), mat(palette.grass, { roughness: 1 }))
    ground.position.y = -0.28
    ground.receiveShadow = true
    this.scene.add(ground)
    this.physics.addStaticBox(ground.position, new THREE.Vector3(CITY, 0.5, CITY))
  }

  private addRoadNetwork(): void {
    const road = mat(palette.asphalt, { roughness: 0.94 })
    const sidewalk = mat(palette.sidewalk, { roughness: 1 })
    const curb = mat(palette.curb, { roughness: 0.96 })
    const lane = mat(palette.lane, { roughness: 0.8 })
    const city = CITY - 8
    for (let n = -4; n <= 4; n += 1) {
      const p = n * ROAD_STEP
      this.addMesh(new THREE.BoxGeometry(ROAD_WIDTH, 0.08, city), new THREE.Vector3(p, 0.02, 0), road)
      this.addMesh(new THREE.BoxGeometry(city, 0.08, ROAD_WIDTH), new THREE.Vector3(0, 0.025, p), road)
      for (const side of [-1, 1]) {
        this.addMesh(new THREE.BoxGeometry(1.5, 0.12, city), new THREE.Vector3(p + side * (ROAD_WIDTH / 2 + 0.8), 0.04, 0), sidewalk)
        this.addMesh(new THREE.BoxGeometry(city, 0.12, 1.5), new THREE.Vector3(0, 0.04, p + side * (ROAD_WIDTH / 2 + 0.8)), sidewalk)
        this.addMesh(new THREE.BoxGeometry(0.16, 0.15, city), new THREE.Vector3(p + side * (ROAD_WIDTH / 2 + 1.62), 0.08, 0), curb)
        this.addMesh(new THREE.BoxGeometry(city, 0.15, 0.16), new THREE.Vector3(0, 0.08, p + side * (ROAD_WIDTH / 2 + 1.62)), curb)
      }
      for (let d = -112; d <= 112; d += 14) {
        this.addMesh(new THREE.BoxGeometry(0.18, 0.03, 4.8), new THREE.Vector3(p, 0.09, d), lane)
        this.addMesh(new THREE.BoxGeometry(4.8, 0.03, 0.18), new THREE.Vector3(d, 0.095, p), lane)
      }
      if (n % 2 === 0) {
        for (let d = -96; d <= 96; d += 32) {
          this.addStreetlight(new THREE.Vector3(p + 5.2, 0, d + 5.2))
          this.addTrafficLight(new THREE.Vector3(p - 5.2, 0, d - 5.2), n % 4 === 0)
        }
      }
    }
  }

  private addCityBlocks(): void {
    const random = rng(4921)
    for (let ix = -4; ix < 4; ix += 1) {
      for (let iz = -4; iz < 4; iz += 1) {
        const cx = ix * ROAD_STEP + ROAD_STEP / 2
        const cz = iz * ROAD_STEP + ROAD_STEP / 2
        if (Math.hypot(cx, cz) < 18) {
          this.addPlaza(cx, cz)
          continue
        }
        const isPark = (ix + iz * 3) % 7 === 0
        if (isPark) this.addPark(cx, cz, random)
        else if ((ix + iz) % 4 === 0) this.addHouseCluster(cx, cz, random)
        else this.addTowerCluster(cx, cz, random)
      }
    }
  }

  private addTowerCluster(cx: number, cz: number, random: () => number): void {
    const count = 1 + Math.floor(random() * 2)
    for (let i = 0; i < count; i += 1) {
      const width = 10 + random() * 5
      const depth = 10 + random() * 5
      const height = 10 + random() * 26
      const x = cx + (i === 0 ? -4 : 5) + (random() - 0.5) * 3
      const z = cz + (i === 0 ? 2 : -4) + (random() - 0.5) * 3
      this.addBuilding(x, z, width, depth, height, [palette.buildingA, palette.buildingB, palette.buildingC, palette.buildingD][Math.floor(random() * 4)], random)
    }
  }

  private addHouseCluster(cx: number, cz: number, random: () => number): void {
    for (let i = 0; i < 3; i += 1) {
      const x = cx - 7 + (i % 2) * 13
      const z = cz - 5 + Math.floor(i / 2) * 10
      this.addHouse(x, z, 10, 8, 4.5 + random() * 2, random)
    }
    for (let i = 0; i < 4; i += 1) this.addTree(cx - 9 + random() * 18, 0, cz - 8 + random() * 16, 0.8 + random() * 0.4)
  }

  private addBuilding(x: number, z: number, width: number, depth: number, height: number, color: string, random: () => number): void {
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color, { roughness: 0.83 }))
    body.position.set(x, height / 2, z)
    body.castShadow = true
    body.receiveShadow = true
    this.scene.add(body)
    this.physics.addStaticBox(body.position, new THREE.Vector3(width, height, depth))
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, 0.35, depth + 0.25), mat(palette.roof, { roughness: 0.76 }))
    roof.position.set(x, height + 0.18, z)
    roof.castShadow = true
    this.scene.add(roof)
    const windowMat = mat(random() > 0.4 ? palette.window : palette.windowWarm, { emissive: random() > 0.4 ? palette.window : palette.windowWarm, emissiveIntensity: 0.3, roughness: 0.42, metalness: 0.16 })
    this.windowMats.push(windowMat)
    const windowGeo = new THREE.BoxGeometry(0.82, 1.15, 0.04)
    const floors = Math.max(2, Math.floor(height / 4.2))
    const cols = Math.max(2, Math.floor(width / 2.8))
    for (let f = 0; f < floors; f += 1) {
      for (let c = 0; c < cols; c += 1) {
        if ((c + f) % 5 === 0 && height > 20) continue
        const wx = x - width / 2 + 1.6 + c * ((width - 3) / Math.max(1, cols - 1))
        const wy = 2 + f * 3.8
        for (const face of [-1, 1]) {
          const w = new THREE.Mesh(windowGeo, windowMat)
          w.position.set(wx, wy, z + face * (depth / 2 + 0.025))
          w.rotation.y = face < 0 ? Math.PI : 0
          this.scene.add(w)
        }
      }
    }
    if (height > 22) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6), mat('#324a5d', { metalness: 0.45, roughness: 0.45 }))
      antenna.position.set(x + width * 0.22, height + 2, z - depth * 0.18)
      this.scene.add(antenna)
    }
  }

  private addHouse(x: number, z: number, width: number, depth: number, height: number, random: () => number): void {
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(random() > 0.5 ? '#b8aa92' : '#839a9f', { roughness: 0.9 }))
    body.position.set(x, height / 2, z)
    body.castShadow = true
    body.receiveShadow = true
    this.scene.add(body)
    this.physics.addStaticBox(body.position, new THREE.Vector3(width, height, depth))
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, 3.2, 4), mat('#394c55', { roughness: 0.86 }))
    roof.position.set(x, height + 1.55, z)
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    this.scene.add(roof)
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.08), mat('#314454', { roughness: 0.65 }))
    door.position.set(x, 1.05, z + depth / 2 + 0.05)
    this.scene.add(door)
  }

  private addPark(cx: number, cz: number, random: () => number): void {
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(22, 0.14, 21), mat(palette.grassDark, { roughness: 1 }))
    lawn.position.set(cx, 0.08, cz)
    lawn.receiveShadow = true
    this.scene.add(lawn)
    for (let i = 0; i < 12; i += 1) this.addTree(cx - 9 + random() * 18, 0.13, cz - 8 + random() * 16, 0.72 + random() * 0.42)
    for (let i = 0; i < 2; i += 1) this.addBench(cx - 6 + i * 12, 0.35, cz + 2, Math.PI / 2)
  }

  private addPlaza(cx: number, cz: number): void {
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.18, 32), mat('#687a82', { roughness: 0.92 }))
    plaza.position.set(cx, 0.11, cz)
    plaza.receiveShadow = true
    this.scene.add(plaza)
    const sculpture = new THREE.Mesh(new THREE.TorusKnotGeometry(2.5, 0.34, 64, 8), mat('#72e9e1', { emissive: '#72e9e1', emissiveIntensity: 1.4, roughness: 0.24, metalness: 0.4 }))
    sculpture.position.set(cx, 3, cz)
    sculpture.rotation.x = 0.35
    sculpture.castShadow = true
    this.scene.add(sculpture)
    this.physics.addStaticCylinder(new THREE.Vector3(cx, 0.14, cz), 11, 0.18)
  }

  private addRiverfront(): void {
    const river = new THREE.Mesh(new THREE.BoxGeometry(26, 0.16, CITY - 8), mat(palette.river, { roughness: 0.25, metalness: 0.08 }))
    river.position.set(-CITY / 2 + 20, 0.04, 0)
    this.scene.add(river)
    const promenade = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, CITY - 8), mat('#b3a990', { roughness: 0.95 }))
    promenade.position.set(-CITY / 2 + 37, 0.08, 0)
    this.scene.add(promenade)
    for (let z = -112; z <= 112; z += 18) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), mat('#425462', { metalness: 0.4, roughness: 0.5 }))
      post.position.set(-CITY / 2 + 33, 0.55, z)
      this.scene.add(post)
    }
  }

  private addLandmarks(): void {
    this.addSign(-96, 0, -88, 'HARBOR LOOP')
    this.addSign(70, 0, 70, 'JUNIPER')
    this.addSign(18, 0, -14, 'CIVIC CENTER')
    this.addSign(-52, 0, 84, 'SOUTH MARKET')
    const random = rng(712)
    for (let i = 0; i < 30; i += 1) {
      const x = -112 + random() * 224
      const z = -112 + random() * 224
      if (Math.hypot(x, z) < 18) continue
      this.addCar(x, z, random() > 0.5 ? 0 : Math.PI / 2, i % 3)
    }
  }

  private addCityLife(): void {
    this.addCrosswalk(0, 0, 0)
    this.addCrosswalk(32, 0, Math.PI / 2)
    this.addCrosswalk(-32, 0, Math.PI / 2)
    this.addHighwayConnector()
    this.addDestination('Harbor Market', 'supermarket', -74, -46, '#e4a762', 12, 7)
    this.addDestination('Juniper Eats', 'restaurant', 74, 46, '#d7766e', 9, 7)
    this.addDestination('Civic Arcade', 'mall', 18, -46, '#6fa6b5', 18, 10)
    this.addDestination('Northline Fuel', 'petrol', -18, 46, '#d0c06a', 11, 7)
    this.addDestination('Corner Shop', 'shop', 46, 18, '#8c79ad', 8, 6)
    this.destinations.push({ name: 'Riverside Park', kind: 'park', position: new THREE.Vector3(-92, 0, 42), radius: 15 })
  }

  private addHighwayConnector(): void {
    const highway = mat('#101c2b', { roughness: 0.96 })
    const shoulder = mat('#5a6870', { roughness: 0.95 })
    this.addMesh(new THREE.BoxGeometry(9, 0.08, CITY - 8), new THREE.Vector3(94, 0.03, 0), highway)
    this.addMesh(new THREE.BoxGeometry(0.35, 0.04, CITY - 8), new THREE.Vector3(89.5, 0.09, 0), shoulder)
    this.addMesh(new THREE.BoxGeometry(0.35, 0.04, CITY - 8), new THREE.Vector3(98.5, 0.09, 0), shoulder)
    for (let z = -112; z <= 112; z += 9) this.addMesh(new THREE.BoxGeometry(0.2, 0.03, 4), new THREE.Vector3(94, 0.1, z), mat(palette.lane, { roughness: 0.8 }))
  }

  private addCrosswalk(x: number, z: number, rotation: number): void {
    const stripe = mat('#e6e4d2', { roughness: 0.9 })
    const group = new THREE.Group()
    group.position.set(x, 0.105, z)
    group.rotation.y = rotation
    for (let i = -4; i <= 4; i += 1) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.025, 5.6), stripe)
      bar.position.x = i * 1.2
      group.add(bar)
    }
    this.scene.add(group)
  }

  private addDestination(name: string, kind: Destination['kind'], x: number, z: number, color: string, width: number, depth: number): void {
    const height = kind === 'mall' ? 8 : 4.4
    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color, { roughness: 0.74 }))
    building.position.set(x, height / 2, z)
    building.castShadow = true
    building.receiveShadow = true
    this.scene.add(building)
    this.physics.addStaticBox(building.position, new THREE.Vector3(width, height, depth))
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.55, 0.12), mat('#203448', { emissive: '#174b5c', emissiveIntensity: 0.42, roughness: 0.45 }))
    fascia.position.set(x, height * 0.62, z + depth / 2 + 0.08)
    this.scene.add(fascia)
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(Math.min(7, width * 0.7), 0.22, 1.1), mat('#f5bd78', { roughness: 0.55 }))
    canopy.position.set(x, 2.4, z + depth / 2 + 0.7)
    this.scene.add(canopy)
    this.destinations.push({ name, kind, position: new THREE.Vector3(x, 0, z), radius: Math.max(8, Math.min(width, depth) * 1.3) })
  }

  private addSign(x: number, y: number, z: number, text: string): void {
    void text
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 6), mat('#445361', { roughness: 0.7, metalness: 0.2 }))
    pole.position.set(x, y + 1.4, z)
    this.scene.add(pole)
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.65, 0.08), mat('#243b52', { emissive: '#0d2740', emissiveIntensity: 0.25, roughness: 0.55 }))
    board.position.set(x, y + 2.75, z)
    this.scene.add(board)
    // Live text stays in UI; the board is intentionally abstract and readable as a transit sign.
  }

  private addTree(x: number, y: number, z: number, scale: number): void {
    const tree = new THREE.Group()
    tree.position.set(x, y, z)
    tree.scale.setScalar(scale)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.5, 7), mat(palette.trunk, { roughness: 1 }))
    trunk.position.y = 0.75
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), mat(palette.tree, { roughness: 0.94 }))
    crown.position.y = 1.8
    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.84, 1), mat(palette.treeDark, { roughness: 0.96 }))
    crown2.position.set(0.28, 2.5, 0.08)
    tree.add(trunk, crown, crown2)
    tree.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true })
    this.scene.add(tree)
    this.physics.addStaticCylinder(new THREE.Vector3(x, y + 0.75 * scale, z), 0.22 * scale, 1.5 * scale)
  }

  private addBench(x: number, y: number, z: number, rotation: number): void {
    const bench = new THREE.Group()
    bench.position.set(x, y, z)
    bench.rotation.y = rotation
    const wood = mat('#8f6648', { roughness: 0.9 })
    const metal = mat('#344853', { metalness: 0.45, roughness: 0.52 })
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 0.45), wood)
    seat.position.y = 0.55
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 0.12), wood)
    back.position.set(0, 0.92, 0.18)
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 0.12), metal)
    leg.position.y = 0.27
    bench.add(seat, back, leg)
    this.scene.add(bench)
  }

  private addCar(x: number, z: number, rotation: number, variant: number): void {
    const group = new THREE.Group()
    group.position.set(x, 0.32, z)
    group.rotation.y = rotation
    const bodyMat = mat([palette.car, palette.carBlue, palette.carGold][variant], { roughness: 0.36, metalness: 0.25 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.75, 1.75), bodyMat)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.62, 1.48), mat('#405b6b', { roughness: 0.25, metalness: 0.1 }))
    cabin.position.set(-0.25, 0.54, 0)
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 1.86), mat('#d9dfd4', { metalness: 0.5, roughness: 0.32 }))
    bumper.position.x = 1.9
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.22, 12)
    const wheelMat = mat('#202938', { roughness: 0.72 })
    group.add(body, cabin, bumper)
    for (const wx of [-1.25, 1.25]) {
      for (const wz of [-0.86, 0.86]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat)
        wheel.rotation.x = Math.PI / 2
        wheel.position.set(wx, -0.22, wz)
        group.add(wheel)
      }
    }
    group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true })
    this.scene.add(group)
  }

  private addStreetlight(position: THREE.Vector3): void {
    const group = new THREE.Group()
    group.position.copy(position)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.4, 7), mat('#405363', { metalness: 0.55, roughness: 0.45 }))
    pole.position.y = 2.2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), mat('#405363', { metalness: 0.55, roughness: 0.45 }))
    arm.position.set(0.55, 4.2, 0)
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#ffd286', { emissive: '#ffd286', emissiveIntensity: 1, roughness: 0.25 }))
    glow.position.set(1.05, 4.06, 0)
    group.add(pole, arm, glow)
    this.scene.add(group)
    const light = new THREE.PointLight('#ffd286', 0.3, 12, 2)
    light.position.copy(group.position).add(new THREE.Vector3(1.05, 4.06, 0))
    this.scene.add(light)
    this.lamps.push({ light, glow })
  }

  private addTrafficLight(position: THREE.Vector3, horizontal: boolean): void {
    const group = new THREE.Group()
    group.position.copy(position)
    group.rotation.y = horizontal ? Math.PI / 2 : 0
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), mat('#354854', { metalness: 0.42, roughness: 0.56 }))
    pole.position.y = 2
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.5, 0.34), mat('#1c2736', { roughness: 0.58 }))
    head.position.set(0, 3.15, 0)
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#e86c6a', { emissive: '#e86c6a', emissiveIntensity: 0.45 }))
    const amber = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#e9bb68', { emissive: '#e9bb68', emissiveIntensity: 0.35 }))
    const green = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat('#72e9a0', { emissive: '#72e9a0', emissiveIntensity: 0.35 }))
    red.position.set(0, 3.52, 0.18); amber.position.set(0, 3.15, 0.18); green.position.set(0, 2.78, 0.18)
    group.add(pole, head, red, amber, green)
    this.scene.add(group)
  }

  private addMesh(geometry: THREE.BufferGeometry, position: THREE.Vector3, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.receiveShadow = true
    this.scene.add(mesh)
    return mesh
  }
}
