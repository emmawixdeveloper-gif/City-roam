import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'
import { tuning } from './tuning'
import type { MovingPlatform } from './world'

export type PlayerIntent = { moveX: number; moveY: number; sprint: boolean; jumpPressed: boolean; jumpHeld: boolean; dashPressed: boolean }
export type PlayerEvent = { type: 'jump' } | { type: 'land'; impact: number } | { type: 'dash' }

const P = CONFIG.player
const UP = new THREE.Vector3(0, 1, 0)

export class Player {
  readonly root = new THREE.Group()
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly velocity = new THREE.Vector3()
  grounded = false
  facing = 0
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly model = new THREE.Group()
  private readonly eyes: THREE.Mesh
  private readonly shadow: THREE.Mesh
  private readonly limbs: THREE.Object3D[] = []
  private mixer?: THREE.AnimationMixer
  private idleAction?: THREE.AnimationAction
  private walkAction?: THREE.AnimationAction
  private activeAction?: THREE.AnimationAction
  private coyote = 0
  private jumpBuffer = 0
  private jumping = false
  private dashTime = 0
  private dashCooldown = 0
  private squash = 0
  private runCycle = 0
  private visible = true
  private platform?: MovingPlatform
  readonly safe = new THREE.Vector3()
  private safeTimer = 0

  constructor(private readonly physics: Physics, spawn: THREE.Vector3, private readonly movers: MovingPlatform[]) {
    const world = physics.world
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z))
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(P.halfHeight, P.radius).setFriction(0), this.body)
    this.controller = world.createCharacterController(0.02)
    this.controller.enableAutostep(0.4, 0.25, false)
    this.controller.enableSnapToGround(0.35)
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(50))
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(35))
    this.controller.setApplyImpulsesToDynamicBodies(true)
    this.safe.copy(spawn)
    this.root.position.copy(spawn)
    this.eyes = this.buildModel()
    this.model.rotation.order = 'YXZ'
    this.root.add(this.model)
    physics.bind(this.body, this.root)
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(P.radius * 1.35, 24), new THREE.MeshBasicMaterial({ color: '#101827', transparent: true, opacity: 0.35, depthWrite: false }))
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.renderOrder = 1
  }

  get shadowMesh(): THREE.Mesh { return this.shadow }
  get position(): THREE.Vector3 { const t = this.body.translation(); return new THREE.Vector3(t.x, t.y, t.z) }
  get dashing(): boolean { return this.dashTime > 0 }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.root.visible = visible
    this.shadow.visible = visible
  }

  /** Load the registered hero asset without blocking the first playable frame. */
  async loadHero(url: string): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(url)
      const hero = gltf.scene
      const bounds = new THREE.Box3().setFromObject(hero)
      const size = bounds.getSize(new THREE.Vector3())
      const scale = 1.78 / Math.max(size.y, 0.01)
      hero.scale.setScalar(scale)
      const scaledBounds = new THREE.Box3().setFromObject(hero)
      hero.position.y = -(P.halfHeight + P.radius) - scaledBounds.min.y
      hero.traverse(object => {
        if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true }
      })
      for (const child of this.model.children) child.visible = false
      this.model.add(hero)
      this.mixer = new THREE.AnimationMixer(hero)
      const idle = gltf.animations.find(clip => /standing_relax|idle/i.test(clip.name))
      const walk = gltf.animations.find(clip => /walk/i.test(clip.name))
      this.idleAction = idle ? this.mixer.clipAction(idle) : undefined
      this.walkAction = walk ? this.mixer.clipAction(walk) : undefined
      this.activeAction = this.idleAction ?? this.walkAction
      this.activeAction?.reset().play()
    } catch {
      // The procedural courier remains visible when the registered asset is unavailable.
    }
  }

  step(dt: number, intent: PlayerIntent, cameraYaw: number, events: PlayerEvent[]): void {
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right = new THREE.Vector3().crossVectors(forward, UP)
    const wish = new THREE.Vector3().addScaledVector(right, intent.moveX).addScaledVector(forward, intent.moveY)
    const wishLen = Math.min(1, wish.length())
    if (wishLen > 0.01) wish.normalize()
    this.coyote = this.grounded ? P.coyoteTime : Math.max(0, this.coyote - dt)
    this.jumpBuffer = intent.jumpPressed ? P.jumpBuffer : Math.max(0, this.jumpBuffer - dt)
    this.dashCooldown = Math.max(0, this.dashCooldown - dt)
    const jumpReady = this.jumpBuffer > 0 && this.coyote > 0
    if (jumpReady) this.dashTime = 0
    if (intent.dashPressed && this.dashCooldown <= 0 && !jumpReady) {
      tuning.activate('dash')
      const dir = wishLen > 0.01 ? wish : new THREE.Vector3(-Math.sin(this.facing), 0, -Math.cos(this.facing))
      this.facing = Math.atan2(-dir.x, -dir.z)
      this.velocity.set(dir.x * P.dashSpeed, Math.max(this.velocity.y, 0), dir.z * P.dashSpeed)
      this.dashTime = P.dashTime
      this.dashCooldown = P.dashCooldown
      events.push({ type: 'dash' })
    }
    if (this.dashTime > 0) {
      this.dashTime -= dt
      this.velocity.y = Math.max(this.velocity.y, 0)
    } else {
      const speed = (intent.sprint ? P.sprintSpeed : P.walkSpeed) * wishLen
      const target = wish.clone().multiplyScalar(speed)
      const horizontal = new THREE.Vector3(this.velocity.x, 0, this.velocity.z)
      horizontal.lerp(target, 1 - Math.exp(-(P.acceleration / 6) * (this.grounded ? 1 : P.airControl) * dt))
      this.velocity.x = horizontal.x
      this.velocity.z = horizontal.z
      if (jumpReady) {
        tuning.activate('jump')
        this.velocity.y = P.jumpSpeed
        this.jumping = true
        this.jumpBuffer = 0
        this.coyote = 0
        this.grounded = false
        this.platform = undefined
        this.squash = -0.35
        events.push({ type: 'jump' })
      }
      const rising = this.velocity.y > 0
      this.velocity.y = Math.max(P.maxFall, this.velocity.y + (rising && this.jumping && !intent.jumpHeld ? P.lowJumpGravity : P.gravity) * dt)
    }
    if (wishLen > 0.1 && this.dashTime <= 0) this.facing = dampAngle(this.facing, Math.atan2(-wish.x, -wish.z), P.turnSpeed, dt)
    const desired = this.velocity.clone().multiplyScalar(dt)
    if (this.platform) desired.add(this.platform.delta)
    this.controller.computeColliderMovement(this.collider, desired)
    const moved = this.controller.computedMovement()
    const wasGrounded = this.grounded
    this.grounded = this.controller.computedGrounded()
    if (this.velocity.y > 0 && moved.y < desired.y - 1e-3) this.velocity.y = 0
    if (this.grounded) {
      if (!wasGrounded && this.velocity.y < -6) events.push({ type: 'land', impact: Math.min(1, -this.velocity.y / 30) })
      if (this.velocity.y < 0) this.velocity.y = -1
      this.jumping = false
    }
    const cur = this.body.translation()
    const next = { x: cur.x + moved.x, y: cur.y + moved.y, z: cur.z + moved.z }
    this.body.setNextKinematicTranslation(next)
    this.platform = this.grounded ? this.findPlatform(next) : undefined
    if (this.grounded && !this.platform) {
      this.safeTimer += dt
      if (this.safeTimer > 0.4) this.safe.set(next.x, next.y + 0.2, next.z)
    } else this.safeTimer = 0
  }

  private findPlatform(pos: { x: number; y: number; z: number }): MovingPlatform | undefined {
    const feet = pos.y - P.halfHeight - P.radius
    return this.movers.find(m => { const c = m.body.translation(); return Math.abs(feet - (c.y + m.half.y)) < 0.2 && Math.abs(pos.x - c.x) < m.half.x + P.radius * 0.6 && Math.abs(pos.z - c.z) < m.half.z + P.radius * 0.6 })
  }

  teleport(to: THREE.Vector3): void {
    this.body.setTranslation(to, true)
    this.body.setNextKinematicTranslation(to)
    this.velocity.set(0, 0, 0)
    this.platform = undefined
    this.root.position.copy(to)
    this.physics.snap(this.body)
  }

  animate(frameSeconds: number, time: number, invulnerable: boolean, ground: number | null): void {
    if (!this.visible) { this.shadow.visible = false; return }
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.mixer) {
      const next = this.grounded && speed > 0.45 ? this.walkAction : this.idleAction
      if (next && next !== this.activeAction) {
        this.activeAction?.fadeOut(0.16)
        next.reset().fadeIn(0.16).play()
        this.activeAction = next
      }
      this.mixer.update(frameSeconds)
      if (this.model.children.length > 0) this.model.children[this.model.children.length - 1].position.x = 0
      if (this.model.children.length > 0) this.model.children[this.model.children.length - 1].position.z = 0
    }
    this.model.rotation.y = this.facing
    this.squash = THREE.MathUtils.damp(this.squash, 0, 10, frameSeconds)
    const stretch = this.grounded ? 0 : THREE.MathUtils.clamp(this.velocity.y / 60, -0.12, 0.18)
    const s = 1 - this.squash + stretch
    this.model.scale.set(1 / Math.sqrt(Math.max(s, 0.5)), s, 1 / Math.sqrt(Math.max(s, 0.5)))
    if (this.grounded && speed > 0.4) this.runCycle += frameSeconds * speed * 1.55
    const stride = this.grounded ? Math.sin(this.runCycle) * Math.min(0.28, speed / 22) : 0
    this.limbs[0].rotation.x = stride
    this.limbs[1].rotation.x = -stride
    this.limbs[2].rotation.x = -stride * 0.7
    this.limbs[3].rotation.x = stride * 0.7
    this.model.position.y = this.grounded ? Math.abs(Math.sin(this.runCycle)) * 0.055 * Math.min(1, speed / 6) : 0
    this.model.rotation.x = -Math.min(0.18, speed / 45)
    this.model.visible = !invulnerable || Math.floor(time * 16) % 2 === 0
    ;(this.eyes.material as THREE.MeshStandardMaterial).emissiveIntensity = this.dashing ? 4 : 2.2
    if (ground === null) this.shadow.visible = false
    else {
      const feet = this.root.position.y - P.halfHeight - P.radius
      const height = Math.max(0, feet - ground)
      this.shadow.visible = height < 14
      this.shadow.position.set(this.root.position.x, ground + 0.03, this.root.position.z)
      const k = THREE.MathUtils.clamp(1 - height / 14, 0.25, 1)
      this.shadow.scale.setScalar(k)
      ;(this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.38 * k
    }
  }

  private buildModel(): THREE.Mesh {
    const shell = new THREE.MeshStandardMaterial({ color: '#e9eef0', roughness: 0.5 })
    const jacket = new THREE.MeshStandardMaterial({ color: '#2f5365', roughness: 0.68, metalness: 0.06 })
    const accent = new THREE.MeshStandardMaterial({ color: '#72e9e1', emissive: '#72e9e1', emissiveIntensity: 0.7, roughness: 0.35 })
    const dark = new THREE.MeshStandardMaterial({ color: '#203044', roughness: 0.4, metalness: 0.18 })
    const scarf = new THREE.MeshStandardMaterial({ color: '#ef9c62', roughness: 0.62 })
    const eyes = new THREE.MeshStandardMaterial({ color: '#b8fff6', emissive: '#72e9e1', emissiveIntensity: 2.2 })
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.46, 6, 12), jacket)
    torso.position.y = -0.25
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), shell)
    head.position.y = 0.44
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.12), dark)
    visor.position.set(0, 0.46, -0.32)
    const scarfBand = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.055, 6, 16), scarf)
    scarfBand.rotation.x = Math.PI / 2
    scarfBand.position.y = 0.03
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 6, 16), accent)
    belt.rotation.x = Math.PI / 2
    belt.position.y = -0.42
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.18), accent)
    pack.position.set(0, -0.18, 0.34)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyes)
    const eyeR = eyeL.clone()
    eyeL.position.set(-0.11, 0.48, -0.35); eyeR.position.set(0.11, 0.48, -0.35)
    const limbGeo = new THREE.CapsuleGeometry(0.105, 0.43, 4, 8)
    const legGeo = new THREE.CapsuleGeometry(0.13, 0.48, 4, 8)
    const armL = new THREE.Mesh(limbGeo, shell); const armR = new THREE.Mesh(limbGeo, shell)
    const legL = new THREE.Mesh(legGeo, dark); const legR = new THREE.Mesh(legGeo, dark)
    armL.position.set(-0.42, -0.2, 0); armR.position.set(0.42, -0.2, 0)
    legL.position.set(-0.17, -0.82, 0); legR.position.set(0.17, -0.82, 0)
    this.limbs.push(legL, legR, armL, armR)
    for (const mesh of [torso, head, visor, scarfBand, belt, pack, eyeL, eyeR, armL, armR, legL, legR]) { mesh.castShadow = true; this.model.add(mesh) }
    return eyeL
  }
}

function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * (1 - Math.exp(-lambda * dt))
}
