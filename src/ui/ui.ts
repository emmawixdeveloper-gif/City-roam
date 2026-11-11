import type { Audio } from '../engine/audio'
import type { I18n } from '../engine/i18n'
import type { Input } from '../engine/input'
import type { Quality, SaveData, SaveStore } from '../engine/save'
import type { CityStatus } from '../game/world'
import type { Hint } from '../game/game'
import type { RunState } from '../game/rules'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'results'
export type UiActions = { play(): void; resume(): void; restart(): void; quit(): void; settings(patch: Partial<SaveData>): void }

export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private hintKey: Hint | null = null
  private navRepeat = 0
  private lastMethod = ''

  constructor(private readonly i18n: I18n, private readonly save: SaveStore, private readonly audio: Audio, private readonly input: Input, private readonly actions: UiActions) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = this.template()
    this.root.addEventListener('click', e => this.onClick(e))
    this.root.addEventListener('input', e => this.onInput(e))
    this.root.addEventListener('focusin', e => { if ((e.target as HTMLElement).matches('.btn, .seg button, .toggle')) this.audio.play('ui') })
    window.addEventListener('keydown', e => this.onKey(e))
    i18n.onChange(() => this.translate())
    this.translate()
    this.refreshSettings()
  }

  show(screen: Screen): void {
    this.screen = screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = el.dataset.screen === screen || (el.dataset.screen === 'hud' && (screen === 'pause' || screen === 'settings'))
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
    requestAnimationFrame(() => { const first = this.navItems()[0]; if (first && this.input.method !== 'touch') first.focus({ preventScroll: true }) })
  }

  setBootProgress(progress: number): void { this.q<HTMLElement>('.boot-bar i').style.transform = `scaleX(${Math.max(0.04, Math.min(1, progress))})` }

  updateHud(run: RunState, status: CityStatus): void {
    this.q('[data-slot="district"]').textContent = status.district
    this.q('[data-slot="time"]').textContent = status.time
    this.q('[data-slot="session"]').textContent = this.i18n.t('hud.session', { m: Math.floor(run.elapsed) })
    this.q('[data-slot="daylight"]').textContent = status.daylight > 0.55 ? this.i18n.t('hud.day') : this.i18n.t('hud.night')
    this.q('[data-slot="vehicle"]').textContent = this.i18n.t(status.vehicle ?? 'vehicle.onFoot')
    this.q('[data-slot="prompt"]').textContent = status.destination ? this.i18n.t(status.destination) : ''
    this.q('.hud-clock').classList.toggle('is-night', status.daylight <= 0.35)
  }

  popup(text: string, at: { x: number; y: number }, kind: 'score' | 'hurt'): void {
    const el = document.createElement('div')
    el.className = `popup popup-${kind}`
    el.textContent = text
    el.style.left = `${at.x}px`; el.style.top = `${at.y}px`
    this.q('.popups').append(el)
    el.addEventListener('animationend', () => el.remove())
  }

  hurt(): void {
    const el = this.q('.hurt-vignette')
    el.classList.remove('flash'); void (el as HTMLElement).offsetWidth; el.classList.add('flash')
  }

  hint(hint: Hint | null): void {
    this.hintKey = hint
    const el = this.q('.hint')
    if (!hint) { el.classList.remove('is-active'); return }
    const key = `hint.${hint}.${this.input.method === 'touch' ? 'touch' : 'keyboard'}`
    el.querySelector('span')!.textContent = this.i18n.t(key)
    el.classList.add('is-active')
  }

  showResults(run: RunState): void {
    this.q('.results-title').textContent = this.i18n.t('results.title')
    this.q('.results-copy').textContent = this.i18n.t(run.loseReason === 'time' ? 'results.time' : 'results.lives')
    this.q('.results-elapsed').textContent = `${Math.floor(run.elapsed)} s`
    this.show('results')
  }

  refreshSettings(): void {
    const d = this.save.data
    this.q<HTMLInputElement>('[name="musicVolume"]').value = String(d.musicVolume)
    this.q<HTMLInputElement>('[name="sfxVolume"]').value = String(d.sfxVolume)
    this.q<HTMLInputElement>('[name="sensitivity"]').value = String(d.sensitivity)
    for (const t of this.qa<HTMLButtonElement>('.toggle')) {
      const on = d[t.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'] === true
      t.setAttribute('aria-pressed', String(on)); t.querySelector('span')!.textContent = this.i18n.t(on ? 'settings.on' : 'settings.off')
    }
    for (const b of this.qa<HTMLButtonElement>('.seg button')) {
      const key = b.parentElement!.dataset.setting as 'quality' | 'locale'
      const current = key === 'locale' ? this.i18n.locale : d.quality
      b.setAttribute('aria-pressed', String(b.dataset.value === current))
    }
    for (const r of this.qa<HTMLInputElement>('input[type="range"]')) r.style.setProperty('--fill', `${((Number(r.value) - Number(r.min)) / (Number(r.max) - Number(r.min))) * 100}%`)
  }

  frame(frameSeconds: number): void {
    if (this.input.method !== this.lastMethod) { this.lastMethod = this.input.method; this.translate(); this.hint(this.hintKey) }
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (this.input.method !== 'gamepad') { this.input.consume('confirm'); this.input.consume('back'); return }
    this.navRepeat = Math.max(0, this.navRepeat - frameSeconds)
    if (Math.abs(this.input.move.y) > 0.6 && this.navRepeat <= 0) { this.moveFocus(this.input.move.y < 0 ? 1 : -1); this.navRepeat = 0.22 }
    if (this.input.consume('confirm')) (document.activeElement as HTMLElement | null)?.click()
    if (this.input.consume('back') && this.screen !== 'title') this.show(this.screen === 'settings' ? 'pause' : 'title')
  }

  renderPrompts(): void { /* Prompts are part of the static City Roam HUD. */ }

  private onClick(e: MouseEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action], .toggle, .seg button')
    if (!target) return
    this.audio.unlock()
    if (target.matches('.toggle')) {
      const key = target.dataset.setting as 'muted' | 'invertY' | 'reducedMotion'
      this.actions.settings({ [key]: !this.save.data[key] }); this.refreshSettings(); this.audio.play('ui'); return
    }
    if (target.matches('.seg button')) {
      const key = target.parentElement!.dataset.setting
      if (key === 'quality') this.actions.settings({ quality: target.dataset.value as Quality })
      if (key === 'locale') this.actions.settings({ locale: target.dataset.value as 'en' | 'zh-CN' })
      this.refreshSettings(); this.audio.play('ui'); return
    }
    switch (target.dataset.action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'restart': this.actions.restart(); break
      case 'quit': this.actions.quit(); break
      case 'settings': this.show('settings'); break
      case 'back': this.show('pause'); break
      case 'pause': window.dispatchEvent(new CustomEvent('game:pause')); break
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement
    if (el.type !== 'range') return
    el.style.setProperty('--fill', `${((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100}%`)
    this.actions.settings({ [el.name]: Number(el.value) } as Partial<SaveData>)
  }

  private onKey(e: KeyboardEvent): void {
    if (this.screen === 'hud' || this.screen === 'boot') return
    if (e.code === 'Escape' && this.screen === 'settings') { e.preventDefault(); this.input.consume('pause'); this.show('pause'); return }
    if (e.code === 'Escape' && this.screen !== 'title') { e.preventDefault(); this.input.consume('pause'); this.show('title'); return }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); this.moveFocus(e.code === 'ArrowDown' ? 1 : -1) }
  }

  private translate(): void {
    for (const el of this.qa<HTMLElement>('[data-i18n]')) el.textContent = this.i18n.t(el.dataset.i18n!)
    for (const el of this.qa<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', this.i18n.t(el.dataset.i18nLabel!))
    document.title = this.i18n.t('game.title')
  }

  private navItems(): HTMLElement[] { return [...this.root.querySelectorAll<HTMLElement>(`[data-screen="${this.screen}"] [data-nav]`)].filter(el => el.offsetParent !== null) }
  private moveFocus(dir: 1 | -1): void {
    const items = this.navItems(); if (!items.length) return
    const current = items.indexOf(document.activeElement as HTMLElement)
    items[(current + dir + items.length) % items.length].focus()
  }
  private q<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)! }
  private qa<T extends HTMLElement = HTMLElement>(selector: string): T[] { return [...this.root.querySelectorAll<T>(selector)] }

  private template(): string {
    const range = (name: string, label: string, min: number, max: number, step: number) => `<label class="row"><span data-i18n="${label}"></span><input data-nav type="range" name="${name}" min="${min}" max="${max}" step="${step}"></label>`
    const toggle = (setting: string, label: string) => `<div class="row"><span data-i18n="${label}"></span><button data-nav class="toggle" data-setting="${setting}" aria-pressed="false"><i></i><span></span></button></div>`
    return `<section class="screen screen-boot is-active" data-screen="boot"><div class="boot-mark"><span></span><span></span><span></span></div><div class="boot-logo" data-i18n="game.title"></div><div class="boot-bar"><i></i></div><div class="boot-label" data-i18n="boot.loading"></div></section>
<section class="screen screen-title" data-screen="title"><div class="title-grid"></div><div class="title-rail"><div class="eyebrow" data-i18n="menu.kicker"></div><div class="logo-lockup"><div class="route-mark"><i></i></div><h1 class="logo-text" data-i18n="game.title"></h1></div><p class="tagline" data-i18n="game.tagline"></p><p class="title-note" data-i18n="menu.note"></p><nav class="menu"><button data-nav class="btn btn-primary" data-action="play"><span data-i18n="menu.play"></span><b>↗</b></button><button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span><b>◌</b></button><button data-nav class="btn btn-quiet" data-action="quit"><span data-i18n="menu.exit"></span><b>×</b></button></nav></div><div class="title-stats"><span data-i18n="menu.stat1"></span><span data-i18n="menu.stat2"></span><span data-i18n="menu.stat3"></span></div><footer class="title-footer"><span data-i18n="menu.footer"></span><span>THREE.JS / RAPier / OFFLINE</span></footer></section>
<section class="screen screen-hud" data-screen="hud"><div class="hud-top"><div class="hud-brand"><span class="route-mark small"><i></i></span><span data-i18n="game.title"></span></div><div class="hud-clock"><b data-slot="time">17:30</b><span data-slot="daylight"></span></div><button class="hud-pause" data-action="pause" data-i18n-label="touch.pause">Ⅱ</button></div><div class="hud-left"><span class="hud-kicker" data-i18n="hud.current"></span><strong data-slot="district">Civic Center</strong><span class="hud-session" data-slot="session"></span><span class="hud-vehicle" data-slot="vehicle"></span><span class="hud-prompt" data-slot="prompt"></span></div><div class="hud-right"><span class="hud-kicker" data-i18n="hud.route"></span><span class="route-line"><i></i><i></i><i></i><i></i><i></i></span><span data-i18n="hud.explore"></span></div><div class="hint"><span></span></div><div class="popups"></div><div class="hurt-vignette"></div><div class="touch"><div class="touch-stick"><i></i></div><button class="touch-btn touch-interact" data-touch="interact"><span data-i18n="touch.interact"></span></button><button class="touch-btn touch-dash" data-touch="sprint"><span data-i18n="touch.run"></span></button><button class="touch-btn touch-jump" data-touch="jump"><span data-i18n="touch.jump"></span></button></div></section>
<section class="screen screen-pause screen-modal" data-screen="pause"><div class="modal"><span class="modal-kicker" data-i18n="pause.kicker"></span><h2 class="modal-title" data-i18n="pause.title"></h2><p data-i18n="pause.copy"></p><nav class="menu"><button data-nav class="btn btn-primary" data-action="resume"><span data-i18n="menu.resume"></span></button><button data-nav class="btn" data-action="restart"><span data-i18n="menu.restart"></span></button><button data-nav class="btn" data-action="settings"><span data-i18n="menu.settings"></span></button><button data-nav class="btn btn-quiet" data-action="quit"><span data-i18n="menu.exit"></span></button></nav></div></section>
<section class="screen screen-settings screen-modal" data-screen="settings"><div class="modal modal-wide"><span class="modal-kicker" data-i18n="settings.kicker"></span><h2 class="modal-title" data-i18n="settings.title"></h2><div class="settings-grid"><fieldset><legend data-i18n="settings.audio"></legend>${range('musicVolume', 'settings.music', 0, 1, 0.05)}${range('sfxVolume', 'settings.sfx', 0, 1, 0.05)}${toggle('muted', 'settings.mute')}</fieldset><fieldset><legend data-i18n="settings.controls"></legend>${range('sensitivity', 'settings.sensitivity', 0.2, 3, 0.1)}${toggle('invertY', 'settings.invertY')}</fieldset><fieldset><legend data-i18n="settings.display"></legend><div class="row"><span data-i18n="settings.quality"></span><div class="seg" data-setting="quality"><button data-nav data-value="low" data-i18n="settings.quality.low"></button><button data-nav data-value="medium" data-i18n="settings.quality.medium"></button><button data-nav data-value="high" data-i18n="settings.quality.high"></button></div></div>${toggle('reducedMotion', 'settings.reducedMotion')}</fieldset><fieldset><legend data-i18n="settings.language"></legend><div class="seg" data-setting="locale"><button data-nav data-value="en">English</button><button data-nav data-value="zh-CN">简体中文</button></div></fieldset></div><nav class="menu menu-row"><button data-nav class="btn" data-action="back"><span data-i18n="menu.back"></span></button></nav></div></section>
<section class="screen screen-results screen-modal" data-screen="results"><div class="modal"><span class="modal-kicker" data-i18n="results.kicker"></span><h2 class="modal-title results-title"></h2><p class="results-copy"></p><div class="results-elapsed"></div><nav class="menu menu-row"><button data-nav class="btn btn-primary" data-action="restart"><span data-i18n="menu.restart"></span></button><button data-nav class="btn" data-action="quit"><span data-i18n="menu.exit"></span></button></nav></div></section>`
  }
}
