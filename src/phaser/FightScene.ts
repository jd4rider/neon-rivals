import Phaser from 'phaser'
import { sound } from '../core/audio'
import { OrientationManager } from '../core/orientation'
import { currentSave, recordMatch } from '../core/saves'
import { CpuController } from '../game/ai'
import { MatchEngine, TICK_MS, defaultMatchConfig } from '../game/engine'
import { PlayerInput } from '../game/input'
import { ladderFor } from '../game/roster'
import type { Difficulty } from '../game/types'
import { ArenaBackdrop } from './ArenaBackdrop'
import { FighterView } from './FighterView'
import { TouchPad } from './TouchPad'
import { button, display, hex, label, panel, toast } from './ui'
import type { ResultsData } from './ResultsScene'

export interface FightStartData {
  p1Char: string
  cpuChar: string
  difficulty: Difficulty
  rounds: 1 | 3
  arena: string
  gauntlet: boolean
  stageIndex: number
  wins: number
}

type Mode = 'running' | 'paused' | 'countdown'

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/*
 * The fight itself. Simulation runs on a fixed 60 Hz accumulator; rendering,
 * particles and camera juice run on the display clock. Rotating the phone or
 * hiding the tab stops the accumulator, which freezes the match exactly where
 * it was — nothing in the engine reads wall-clock time.
 */
export class FightScene extends Phaser.Scene {
  private start!: FightStartData
  private engine!: MatchEngine
  private backdrop!: ArenaBackdrop
  private p1View!: FighterView
  private cpuView!: FighterView
  private cpu!: CpuController
  private playerInput!: PlayerInput
  private pad!: TouchPad
  private settings = currentSave().settings

  private hud!: Phaser.GameObjects.Graphics
  private projectileArt!: Phaser.GameObjects.Graphics
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter

  private p1NameText!: Phaser.GameObjects.Text
  private cpuNameText!: Phaser.GameObjects.Text
  private timerText!: Phaser.GameObjects.Text
  private comboP1Text!: Phaser.GameObjects.Text
  private comboCpuText!: Phaser.GameObjects.Text
  private bannerText!: Phaser.GameObjects.Text
  private bannerSub!: Phaser.GameObjects.Text
  private countdownText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text
  private pauseMenu!: Phaser.GameObjects.Container

  private mode: Mode = 'running'
  private blocked = false
  private autoPaused = false
  private accumulator = 0
  private countdownMs = 0
  private lastCount = 0
  private matchOver = false
  private healthP1 = 1
  private healthCpu = 1
  private lastComboP1 = 0
  private lastComboCpu = 0
  private touchReveal: (() => void) | null = null

  constructor() {
    super('Fight')
  }

  init(data: FightStartData): void {
    this.start = {
      ...data,
      rounds: data.rounds === 1 ? 1 : 3,
      gauntlet: Boolean(data.gauntlet),
    }
  }

  create(): void {
    this.settings = currentSave().settings
    this.mode = 'running'
    this.blocked = OrientationManager.current?.isBlocked ?? false
    this.autoPaused = false
    this.accumulator = 0
    this.countdownMs = 0
    this.matchOver = false
    this.healthP1 = 1
    this.healthCpu = 1
    this.lastComboP1 = 0
    this.lastComboCpu = 0

    this.engine = new MatchEngine(
      defaultMatchConfig({
        p1Char: this.start.p1Char,
        cpuChar: this.start.cpuChar,
        difficulty: this.start.difficulty,
        rounds: this.start.rounds,
        roundSeconds: 60,
        arena: this.start.arena,
        seed: this.start.stageIndex * 131 + 17,
      }),
    )
    this.cpu = new CpuController(this.start.difficulty, this.start.stageIndex * 71 + 9)

    this.backdrop = new ArenaBackdrop(this, this.engine.arena)
    this.backdrop.container.setDepth(-10)
    this.p1View = new FighterView(this, this.engine.p1.character, 1.32)
    this.p1View.setDepth(12)
    this.cpuView = new FighterView(this, this.engine.cpu.character, 1.32)
    this.cpuView.setDepth(13)

    this.projectileArt = this.add.graphics().setDepth(20)
    this.sparks = this.add
      .particles(0, 0, 'spark', {
        lifespan: { min: 220, max: 520 },
        speed: { min: 90, max: 420 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.85, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 560,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(26)
    this.shards = this.add
      .particles(0, 0, 'shard', {
        lifespan: { min: 300, max: 780 },
        speed: { min: 60, max: 340 },
        angle: { min: 0, max: 360 },
        rotate: { min: 0, max: 360 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 700,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(25)

    this.hud = this.add.graphics().setDepth(30)
    this.buildHud()
    this.buildPauseMenu()

    this.playerInput = new PlayerInput()
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches
    const padVisible =
      this.settings.touchPad === 'always' || (this.settings.touchPad === 'auto' && Boolean(coarse))
    this.pad = new TouchPad(this, this.settings.touchOpacity)
    this.pad.setVisible(padVisible)
    if (!padVisible && this.settings.touchPad === 'auto') {
      this.touchReveal = () => this.pad.setVisible(true)
      window.addEventListener('touchstart', this.touchReveal, { passive: true, once: true })
    }

    this.hintText.setText(
      padVisible
        ? 'MOVE · JUMP · LIGHT · HEAVY · SPECIAL · GUARD'
        : 'J LIGHT   K HEAVY   L SPECIAL   I GUARD   ESC PAUSE',
    )

    window.addEventListener('neon:orientation', this.onOrientation as EventListener)
    document.addEventListener('visibilitychange', this.onVisibility)

    this.showBanner(
      `ROUND ${this.engine.round}`,
      `${this.engine.p1.character.name}   VS   ${this.engine.cpu.character.name}`,
      '#ffffff',
      760,
    )
    this.cameras.main.fadeIn(220, 5, 3, 15)
    sound.startMusic('fight')

    const controller = this.playerInput.controllerLabel
    if (controller) {
      toast(this, `CONTROLLER READY · ${controller.slice(0, 34).toUpperCase()}`, 0xb07dff, 150)
    }

    if (this.blocked) {
      this.mode = 'paused'
      this.autoPaused = true
      this.pauseMenu.setVisible(false)
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this)
  }

  override update(time: number, delta: number): void {
    if (!this.matchOver && this.playerInput?.consumePause()) this.togglePause()

    if (this.mode === 'countdown') this.tickCountdown(delta)

    if (this.mode === 'running' && !this.blocked) {
      this.accumulator = Math.min(this.accumulator + delta, 220)
      let steps = 0
      while (this.accumulator >= TICK_MS && steps < 5) {
        this.accumulator -= TICK_MS
        this.stepSimulation()
        steps += 1
      }
    }

    this.render(time)
  }

  private stepSimulation(): void {
    const p1 = this.playerInput.sample()
    const cpu = this.cpu.decide(this.engine.cpu, this.engine.p1)
    this.engine.step({ p1, cpu })
    for (const event of this.engine.drainEvents()) {
      switch (event.type) {
        case 'hit':
          this.onHit(event.x, event.y, event.damage, event.heavy, event.side)
          break
        case 'block':
          this.onBlock(event.x, event.y)
          break
        case 'ko':
          this.onKo(event.x, event.y)
          break
        case 'special':
          this.onSpecial(event.x, event.y, event.side)
          break
        case 'clash':
          this.onClash(event.x, event.y)
          break
        case 'fight':
          this.showBanner('FIGHT!', '', hex(this.engine.arena.accent), 520)
          sound.fight()
          break
        case 'round':
          this.onRound(event.winner, event.round, event.reason)
          break
        case 'perfect':
          toast(this, 'PERFECT ROUND', 0xffc247, 190)
          break
        case 'match':
          this.onMatch(event.winner)
          break
      }
    }
  }

  private render(time: number): void {
    this.backdrop.update(time)
    this.p1View.update(this.engine.p1, time)
    this.cpuView.update(this.engine.cpu, time)
    this.drawProjectiles()
    this.drawHud()
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  private buildHud(): void {
    const p1 = this.engine.p1.character
    const cpu = this.engine.cpu.character

    this.p1NameText = label(this, 44, 10, p1.name, 16, '#ffffff', { fontStyle: 'bold', letterSpacing: 2 })
    this.p1NameText.setDepth(31)
    this.cpuNameText = label(this, 1236, 10, cpu.name, 16, '#ffffff', {
      origin: [1, 0],
      fontStyle: 'bold',
      letterSpacing: 2,
    })
    this.cpuNameText.setDepth(31)

    this.timerText = display(this, 640, 42, '60', 38, '#ffffff')
    this.timerText.setDepth(31).setStroke('#05030f', 6)

    this.comboP1Text = display(this, 330, 206, '', 24, hex(p1.colors.accent))
    this.comboP1Text.setDepth(31).setAlpha(0)
    this.comboCpuText = display(this, 950, 206, '', 24, hex(cpu.colors.accent))
    this.comboCpuText.setDepth(31).setAlpha(0)

    this.bannerText = display(this, 640, 296, '', 84, '#ffffff')
    this.bannerText.setDepth(40).setStroke('#05030f', 12)
    this.bannerSub = label(this, 640, 356, '', 15, '#b9c8e4', {
      origin: 0.5,
      letterSpacing: 4,
      fontStyle: 'bold',
    })
    this.bannerSub.setDepth(40)

    this.countdownText = display(this, 640, 300, '', 116, '#ffffff')
    this.countdownText.setDepth(41).setStroke('#05030f', 12).setVisible(false)

    this.hintText = label(this, 640, 662, '', 10, '#9fb4d8', {
      origin: 0.5,
      letterSpacing: 2,
      alpha: 0.55,
    })
    this.hintText.setDepth(31)

    const modeLabel = this.start.gauntlet
      ? `ARCADE  ·  FIGHT ${this.start.stageIndex + 1} OF ${ladderFor(this.start.p1Char).length}`
      : `QUICK FIGHT  ·  ${this.start.difficulty.toUpperCase()}`
    label(this, 640, 112, modeLabel, 9, '#7c8fb5', { origin: 0.5, letterSpacing: 3 }).setDepth(31)

    // Pause pill, bottom centre between the two touch clusters.
    const pause = this.add.container(640, 690).setDepth(46)
    const pauseArt = this.add.graphics()
    pauseArt.fillStyle(0x0b1026, 0.78)
    pauseArt.fillRoundedRect(-48, -15, 96, 30, 15)
    pauseArt.lineStyle(1, 0xffffff, 0.16)
    pauseArt.strokeRoundedRect(-48, -15, 96, 30, 15)
    pause.add(pauseArt)
    pause.add(label(this, 0, 0, 'II   PAUSE', 10, '#c9d6ee', { origin: 0.5, fontStyle: 'bold', letterSpacing: 1 }))
    const pauseHit = this.add.rectangle(0, 0, 100, 34, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
    pause.add(pauseHit)
    pauseHit.on('pointerup', () => this.togglePause())
  }

  private drawHud(): void {
    const g = this.hud
    g.clear()
    const engine = this.engine
    const p1Ratio = clamp01(engine.p1.health / engine.p1.maxHealth)
    const cpuRatio = clamp01(engine.cpu.health / engine.cpu.maxHealth)
    this.healthP1 += (p1Ratio - this.healthP1) * 0.16
    this.healthCpu += (cpuRatio - this.healthCpu) * 0.16

    this.drawBar(g, 44, 42, 470, 26, p1Ratio, this.healthP1, engine.p1.character.colors.primary, false)
    this.drawBar(g, 766, 42, 470, 26, cpuRatio, this.healthCpu, engine.cpu.character.colors.primary, true)

    // Meter gauges.
    const p1Meter = clamp01(engine.p1.meter / 100)
    const cpuMeter = clamp01(engine.cpu.meter / 100)
    g.fillStyle(0xffffff, 0.1)
    g.fillRoundedRect(44, 76, 230, 9, 4.5)
    g.fillStyle(p1Meter >= 1 ? 0xffc247 : engine.p1.character.colors.accent, 0.95)
    g.fillRoundedRect(44, 76, Math.max(5, 230 * p1Meter), 9, 4.5)
    g.fillStyle(0xffffff, 0.1)
    g.fillRoundedRect(1006, 76, 230, 9, 4.5)
    g.fillStyle(cpuMeter >= 1 ? 0xffc247 : engine.cpu.character.colors.accent, 0.95)
    g.fillRoundedRect(1236 - Math.max(5, 230 * cpuMeter), 76, Math.max(5, 230 * cpuMeter), 9, 4.5)

    // Round pips.
    const needed = engine.roundsToWin
    for (let index = 0; index < needed; index += 1) {
      const won = index < engine.p1.roundsWon
      g.fillStyle(won ? engine.arena.accent : 0xffffff, won ? 1 : 0.16)
      g.fillCircle(628 - index * 16, 96, 4.5)
      const cpuWon = index < engine.cpu.roundsWon
      g.fillStyle(cpuWon ? engine.arena.accent2 : 0xffffff, cpuWon ? 1 : 0.16)
      g.fillCircle(652 + index * 16, 96, 4.5)
    }

    const seconds = Math.ceil(engine.remainingMs / 1000)
    this.timerText.setText(String(seconds).padStart(2, '0'))
    const urgent = seconds <= 10 && engine.phase === 'fight'
    this.timerText.setColor(urgent ? '#ff5d7a' : '#ffffff')
    this.timerText.setScale(urgent ? 1 + Math.sin(this.time.now / 110) * 0.045 : 1)
    this.timerText.setVisible(engine.phase === 'fight' || engine.phase === 'intro' || engine.phase === 'roundOver')

    this.updateCombo('p1')
    this.updateCombo('cpu')
  }

  private drawBar(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    trail: number,
    color: number,
    fromRight: boolean,
  ): void {
    g.fillStyle(0x05070f, 0.85)
    g.fillRoundedRect(x - 4, y - 4, width + 8, height + 8, 9)
    g.fillStyle(0x1a2038, 1)
    g.fillRoundedRect(x, y, width, height, 6)

    const trailWidth = Math.max(0, width * clamp01(trail))
    const fillWidth = Math.max(0, width * clamp01(ratio))

    if (fromRight) {
      g.fillStyle(0xffffff, 0.55)
      g.fillRoundedRect(x + width - trailWidth, y, trailWidth, height, 6)
      g.fillStyle(color, 1)
      g.fillRoundedRect(x + width - fillWidth, y, fillWidth, height, 6)
      g.fillStyle(0xffffff, 0.22)
      g.fillRoundedRect(x + width - fillWidth + 2, y + 2, Math.max(0, fillWidth - 4), height * 0.34, 3)
    } else {
      g.fillStyle(0xffffff, 0.55)
      g.fillRoundedRect(x, y, trailWidth, height, 6)
      g.fillStyle(color, 1)
      g.fillRoundedRect(x, y, fillWidth, height, 6)
      g.fillStyle(0xffffff, 0.22)
      g.fillRoundedRect(x + 2, y + 2, Math.max(0, fillWidth - 4), height * 0.34, 3)
    }

    g.lineStyle(1, 0x000000, 0.18)
    for (let notch = 1; notch < 10; notch += 1) {
      const nx = x + (width / 10) * notch
      g.lineBetween(nx, y, nx, y + height)
    }
  }

  private updateCombo(who: 'p1' | 'cpu'): void {
    const combo = who === 'p1' ? this.engine.p1.combo : this.engine.cpu.combo
    const text = who === 'p1' ? this.comboP1Text : this.comboCpuText
    const last = who === 'p1' ? this.lastComboP1 : this.lastComboCpu
    if (combo >= 2) {
      if (combo !== last) {
        if (who === 'p1') this.lastComboP1 = combo
        else this.lastComboCpu = combo
        text.setText(`${combo} HIT COMBO`).setAlpha(1).setScale(1.3)
        this.tweens.add({ targets: text, scale: 1, duration: 170, ease: 'Back.Out' })
      }
    } else if (last !== 0) {
      if (who === 'p1') this.lastComboP1 = 0
      else this.lastComboCpu = 0
      this.tweens.add({ targets: text, alpha: 0, duration: 200 })
    }
  }

  // -------------------------------------------------------------------------
  // Effects and announcements
  // -------------------------------------------------------------------------

  private onHit(x: number, y: number, damage: number, heavy: boolean, side: 'p1' | 'cpu'): void {
    const character = side === 'p1' ? this.engine.p1.character : this.engine.cpu.character
    const color = character.colors.accent
    this.sparks.explode(heavy ? 20 : 11, x, y)
    this.ringAt(x, y, color, heavy ? 16 : 9)
    const flash = this.add
      .image(x, y, 'glow')
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(25)
    flash.setScale(heavy ? 1.7 : 1).setAlpha(0.9)
    this.tweens.add({
      targets: flash,
      scale: flash.scale * 1.9,
      alpha: 0,
      duration: 260,
      onComplete: () => flash.destroy(),
    })
    const damageText = display(this, x, y - 34, `-${damage}`, heavy ? 26 : 19, hex(color))
    damageText.setDepth(27)
    this.tweens.add({
      targets: damageText,
      y: damageText.y - 44,
      alpha: 0,
      duration: 640,
      ease: 'Cubic.Out',
      onComplete: () => damageText.destroy(),
    })
    sound.hit(heavy)
    if (this.settings.shake && !this.settings.reducedMotion) {
      this.cameras.main.shake(heavy ? 110 : 70, heavy ? 0.0075 : 0.0035)
    }
    this.playerInput.rumble(heavy ? 0.85 : 0.4, heavy ? 110 : 65)
  }

  private onBlock(x: number, y: number): void {
    this.sparks.explode(6, x, y)
    this.ringAt(x, y, 0xffffff, 12)
    sound.block()
  }

  private onSpecial(x: number, y: number, side: 'p1' | 'cpu'): void {
    const character = side === 'p1' ? this.engine.p1.character : this.engine.cpu.character
    this.shards.explode(10, x, y)
    this.ringAt(x, y, character.colors.glow, 14)
    sound.special()
  }

  private onClash(x: number, y: number): void {
    this.sparks.explode(22, x, y)
    this.ringAt(x, y, 0xffffff, 20)
    sound.clash()
  }

  private onKo(x: number, y: number): void {
    this.shards.explode(26, x, y)
    this.ringAt(x, y, 0xffffff, 24)
    sound.ko()
    this.cameras.main.flash(180, 255, 240, 240)
    if (!this.settings.reducedMotion) {
      this.cameras.main.zoomTo(1.05, 220, 'Quad.Out', true)
      this.time.delayedCall(420, () => this.cameras.main.zoomTo(1, 420, 'Quad.Out', true))
    }
  }

  private onRound(winner: 'p1' | 'cpu' | 'draw', round: number, reason: 'ko' | 'timeout'): void {
    const victor =
      winner === 'draw'
        ? 'DRAW'
        : `${winner === 'p1' ? this.engine.p1.character.name : this.engine.cpu.character.name} TAKES ROUND ${round}`
    this.showBanner(reason === 'ko' ? 'K.O.' : 'TIME UP', victor, '#ff3ea5', 1050)
    sound.round()
  }

  private onMatch(winner: 'p1' | 'cpu' | 'draw'): void {
    if (this.matchOver) return
    this.matchOver = true
    const title = winner === 'p1' ? 'VICTORY' : winner === 'cpu' ? 'DEFEAT' : 'DRAW'
    const subtitle = this.start.gauntlet
      ? winner === 'p1'
        ? 'THE LADDER CONTINUES'
        : 'THE LADDER ENDS HERE'
      : 'MATCH COMPLETE'
    this.showBanner(title, subtitle, winner === 'p1' ? hex(this.engine.arena.accent) : '#ff3ea5', 1700)
    if (winner === 'p1') {
      this.shards.explode(30, 640, 300)
      sound.win()
    } else if (winner === 'cpu') {
      sound.lose()
    }
    this.time.delayedCall(2400, () => this.finishMatch())
  }

  private showBanner(main: string, sub = '', color = '#ffffff', hold = 900): void {
    this.tweens.killTweensOf([this.bannerText, this.bannerSub])
    this.bannerText.setText(main).setColor(color).setAlpha(0).setScale(0.72)
    this.bannerSub.setText(sub).setAlpha(0)
    this.tweens.add({
      targets: this.bannerText,
      alpha: 1,
      scale: 1,
      duration: 190,
      ease: 'Back.Out',
    })
    this.tweens.add({ targets: this.bannerText, alpha: 0, delay: hold, duration: 240 })
    if (sub) {
      this.tweens.add({ targets: this.bannerSub, alpha: 0.95, duration: 220, delay: 70 })
      this.tweens.add({ targets: this.bannerSub, alpha: 0, delay: hold + 60, duration: 240 })
    }
  }

  private ringAt(x: number, y: number, color: number, size: number): void {
    const ring = this.add.circle(x, y, size, 0xffffff, 0).setStrokeStyle(3, color, 0.95)
    ring.setDepth(24)
    this.tweens.add({
      targets: ring,
      scale: 4,
      alpha: 0,
      duration: 330,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    })
  }

  private drawProjectiles(): void {
    const g = this.projectileArt
    g.clear()
    for (const projectile of this.engine.projectiles) {
      const direction = Math.sign(projectile.vx) || 1
      for (let index = 3; index >= 1; index -= 1) {
        g.fillStyle(projectile.color, 0.06 * (4 - index))
        g.fillCircle(projectile.x - direction * index * 16, projectile.y, projectile.radius * (0.5 + index * 0.16))
      }
      g.fillStyle(projectile.color, 0.2)
      g.fillCircle(projectile.x, projectile.y, projectile.radius * 2.1)
      g.fillStyle(projectile.color, 0.95)
      g.fillCircle(projectile.x, projectile.y, projectile.radius)
      g.fillStyle(0xffffff, 0.9)
      g.fillCircle(projectile.x - direction * 2, projectile.y - 2, projectile.radius * 0.4)
    }
  }

  // -------------------------------------------------------------------------
  // Pause, orientation and teardown
  // -------------------------------------------------------------------------

  private buildPauseMenu(): void {
    const container = this.add.container(0, 0).setDepth(50).setVisible(false)
    const dim = this.add.rectangle(640, 360, 1280, 720, 0x05030f, 0.72).setInteractive()
    container.add(dim)
    const card = panel(this, 410, 170, 460, 380, {
      fill: 0x0b1026,
      radius: 24,
      stroke: 0x4df3ff,
      strokeAlpha: 0.3,
      glow: true,
    })
    container.add(card)
    container.add(display(this, 640, 224, 'PAUSED', 42, '#ffffff'))
    container.add(
      label(this, 640, 264, this.blocked ? 'ROTATE BACK TO RESUME' : 'TAKE A BREATH', 11, '#8aa0c6', {
        origin: 0.5,
        letterSpacing: 3,
      }),
    )

    const resume = button(this, 640, 322, 320, 56, 'RESUME', () => this.resume(), {
      fill: 0x1b2a63,
      accent: 0x4df3ff,
      size: 19,
      radius: 16,
    })
    const restart = button(this, 640, 390, 320, 50, 'RESTART MATCH', () => this.scene.restart(this.start), {
      fill: 0x241a44,
      accent: 0xb07dff,
      size: 15,
      radius: 15,
    })
    const quit = button(this, 640, 452, 320, 50, 'QUIT TO TITLE', () => this.scene.start('Title'), {
      fill: 0x1a1626,
      accent: 0xff3ea5,
      size: 15,
      radius: 15,
    })
    container.add([resume.container, restart.container, quit.container])
    this.pauseMenu = container

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.mode === 'paused' && !this.blocked) this.resume()
    })
  }

  private togglePause(): void {
    if (this.matchOver) return
    if (this.mode === 'running') this.pause()
    else if (this.mode === 'paused') this.resume()
  }

  private pause(): void {
    if (this.mode !== 'running') return
    this.mode = 'paused'
    this.pauseMenu.setVisible(!this.blocked)
    this.countdownText.setVisible(false)
  }

  private resume(): void {
    if (this.mode !== 'paused') return
    this.autoPaused = false
    this.mode = 'countdown'
    this.countdownMs = 1700
    this.lastCount = 4
    this.pauseMenu.setVisible(false)
    this.countdownText.setVisible(true).setText('3')
  }

  private tickCountdown(delta: number): void {
    this.countdownMs -= delta
    const remaining = Math.ceil(this.countdownMs / 1000)
    if (remaining !== this.lastCount) {
      this.lastCount = remaining
      this.countdownText.setText(remaining > 0 ? String(remaining) : 'FIGHT!')
      this.countdownText.setScale(1.35)
      this.tweens.add({ targets: this.countdownText, scale: 1, duration: 180, ease: 'Back.Out' })
      if (remaining > 0) sound.tick()
      else sound.fight()
    }
    if (this.countdownMs <= -420) {
      this.countdownText.setVisible(false)
      this.mode = 'running'
      this.accumulator = 0
    }
  }

  private readonly onOrientation = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    const blocked = detail === 'blocked'
    if (blocked === this.blocked) return
    this.blocked = blocked
    if (blocked) {
      if (this.mode === 'running' || this.mode === 'countdown') {
        this.mode = 'paused'
        this.autoPaused = true
      }
      this.pauseMenu.setVisible(false)
      this.countdownText.setVisible(false)
      return
    }
    this.pauseMenu.setVisible(this.mode === 'paused' && !this.autoPaused)
    if (this.autoPaused) {
      this.autoPaused = false
      this.resume()
    }
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      if (this.mode === 'running' || this.mode === 'countdown') {
        this.mode = 'paused'
        this.autoPaused = true
        this.pauseMenu.setVisible(false)
        this.countdownText.setVisible(false)
      }
      return
    }
    if (this.autoPaused) {
      this.autoPaused = false
      this.resume()
    }
  }

  private finishMatch(): void {
    if (!this.scene.isActive()) return
    const winner = this.engine.matchWinner ?? 'draw'
    const stats = this.engine.stats
    const ladder = ladderFor(this.start.p1Char)
    const arcadeClear =
      this.start.gauntlet && winner === 'p1' && this.start.stageIndex >= ladder.length - 1

    recordMatch({
      outcome: winner === 'p1' ? 'win' : winner === 'cpu' ? 'loss' : 'draw',
      characterId: this.start.p1Char,
      maxCombo: stats.p1MaxCombo,
      hits: stats.p1Hits,
      rounds: stats.roundsPlayed,
      durationMs: stats.durationMs || this.engine.elapsedMs,
      arcadeClear,
    })

    const payload: ResultsData = {
      winner,
      p1Char: this.start.p1Char,
      cpuChar: this.start.cpuChar,
      difficulty: this.start.difficulty,
      rounds: this.start.rounds,
      arena: this.start.arena,
      gauntlet: this.start.gauntlet,
      stageIndex: this.start.stageIndex,
      wins: this.start.wins,
      hits: stats.p1Hits,
      maxCombo: stats.p1MaxCombo,
      damage: stats.p1Damage,
      durationMs: stats.durationMs || this.engine.elapsedMs,
      arcadeClear,
      p1Rounds: this.engine.p1.roundsWon,
      cpuRounds: this.engine.cpu.roundsWon,
    }
    this.scene.start('Results', payload)
  }

  private cleanup(): void {
    window.removeEventListener('neon:orientation', this.onOrientation as EventListener)
    document.removeEventListener('visibilitychange', this.onVisibility)
    if (this.touchReveal) {
      window.removeEventListener('touchstart', this.touchReveal)
      this.touchReveal = null
    }
    this.playerInput?.destroy()
  }
}
