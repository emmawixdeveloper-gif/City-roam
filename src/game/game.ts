import * as THREE from 'three'
import courierUrl from '../../assets/models/cityroam-courier-animated.glb?url'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import { Physics, RAPIER } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { FollowCamera } from './camera'
import { CONFIG } from './config'
import { tuning } from './tuning'
import { Player, type PlayerEvent } from './player'
import { damage, createRun, tick, type RunState } from './rules'
import { World, type CityStatus } from './world'

export type Mode = 'attract' | 'playing' | 'paused' | 'ended'
export type Hint = 'move' | 'look' | 'jump'
export type Compass = { angle: number; distance: number; rise: number }

export type GameHooks = {
  popup(text: string, screen: { x: number; y: number }, kind: 'score' | 'hurt'): void
  hurt(): void
  hint(hint: Hint | null): void
  tutorialDone(): void
  end(run: RunState): void
}

export class Game {
  mode: Mode = 'attract'
  run: RunState
  reducedMotion = false
  private readonly physics: Physics
  private readonly world: World
  private readonly player: Player
  private readonly cam: FollowCamera
  private simTime = 0
  private time = 0
  private tutorial: Hint | null = null
  private tutorialLook = 0
  private tutorialStart = new THREE.Vector3()
  private readonly down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
  ) {
    this.physics = new Physics(CONFIG.player.gravity)
    this.world = new World(this.physics, renderer.shadowMapSize)
    this.player = new Player(this.physics, this.world.spawn, this.world.movers)
    void this.player.loadHero(courierUrl)
    this.cam = new FollowCamera(this.physics, this.player.collider)
    this.world.scene.add(this.player.root, this.player.shadowMesh)
    this.run = createRun(0)
    this.cam.reset(this.world.spawn, 0.22)
  }

  get camera(): THREE.PerspectiveCamera { return this.cam.camera }

  start(tutorial: boolean): void {
    tuning.activate('run')
    this.player.teleport(this.world.spawn)
    this.player.facing = 0
    this.cam.pitch = 0.36
    this.cam.reset(this.world.spawn, 0.22)
    this.run = createRun(0)
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
    this.tutorial = tutorial ? 'move' : null
    this.tutorialLook = 0
    this.tutorialStart.copy(this.world.spawn)
    this.hooks.hint(this.tutorial)
  }

  pause(): void { if (this.mode === 'playing') this.mode = 'paused' }

  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }

  toTitle(): void {
    this.mode = 'attract'
    this.hooks.hint(null)
  }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    const size = this.renderer.shadowMapSize
    this.world.sun.shadow.map?.dispose()
    this.world.sun.shadow.map = null
    this.world.sun.shadow.mapSize.set(size, size)
    this.world.scene.traverse(obj => {
      const material = (obj as THREE.Mesh).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true
    })
  }

  cityStatus(): CityStatus {
    const status = this.world.status
    return { ...status, district: this.world.districtAt(this.player.position) }
  }

  step(dt: number): void {
    this.simTime += dt
    const jumpPressed = this.input.consume('jump')
    const playing = this.mode === 'playing'
    this.world.stepMovers()
    const events: PlayerEvent[] = []
    if (playing) {
      this.player.step(dt, {
        moveX: this.input.move.x,
        moveY: this.input.move.y,
        sprint: this.input.held('sprint'),
        jumpPressed,
        jumpHeld: this.input.held('jump'),
        dashPressed: false,
      }, this.cam.yaw, events)
    } else this.input.consume('dash')
    this.physics.step(dt)
    if (!playing) return
    this.run = tick(this.run, dt)
    for (const event of events) {
      if (event.type === 'jump') this.audio.play('jump')
      if (event.type === 'land') this.audio.play('land')
    }
    const pos = this.player.position
    if (pos.y < CONFIG.run.killY) {
      const result = damage(this.run, true)
      this.run = result.state
      this.audio.play('hurt')
      this.hooks.hurt()
      this.player.teleport(this.player.safe)
      if (this.run.phase === 'playing') this.hooks.popup('BACK ON ROUTE', this.project(pos), 'hurt')
    }
    this.updateTutorial(pos)
    if (this.run.phase !== 'playing') {
      this.mode = 'ended'
      this.hooks.hint(null)
      this.audio.play('lose')
      this.hooks.end(this.run)
    }
  }

  render(alpha: number, frameSeconds: number): void {
    this.time += frameSeconds
    this.physics.sync(alpha)
    const target = this.player.root.position
    if (this.mode === 'attract') {
      const t = this.time * 0.055 + 0.9
      const cam = this.cam.camera
      cam.position.set(Math.sin(t) * 54, 26 + Math.sin(this.time * 0.18) * 2, Math.cos(t) * 54)
      cam.lookAt(0, 8, 0)
    } else {
      const look = this.mode === 'playing' ? this.input.takeLook() : { x: 0, y: 0 }
      if (this.mode === 'playing' && this.tutorial === 'look') {
        this.tutorialLook += Math.abs(look.x) + Math.abs(look.y)
        if (this.tutorialLook > 0.05) this.advanceTutorial('jump')
      }
      this.cam.update(target, look, frameSeconds, false, this.reducedMotion)
    }
    this.player.animate(frameSeconds, this.time, this.run.invulnerable > 0 && this.mode === 'playing', this.groundBelow(target))
    this.world.update(frameSeconds, target)
    this.renderer.render(this.world.scene, this.cam.camera)
  }

  compass(): Compass | null { return null }

  project(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.cam.camera)
    const canvas = this.renderer.canvas
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight }
  }

  private updateTutorial(pos: THREE.Vector3): void {
    if (this.tutorial === 'move' && pos.distanceTo(this.tutorialStart) > 2.5) this.advanceTutorial(this.input.method === 'touch' ? 'jump' : 'look')
  }

  private advanceTutorial(next: Hint | null): void {
    this.tutorial = next
    this.tutorialLook = 0
    this.hooks.hint(next)
    if (!next) this.hooks.tutorialDone()
  }

  private groundBelow(p: THREE.Vector3): number | null {
    this.down.origin = { x: p.x, y: p.y, z: p.z }
    const hit = this.physics.world.castRay(this.down, 30, true, undefined, undefined, this.player.collider)
    return hit ? p.y - hit.timeOfImpact : null
  }
}
