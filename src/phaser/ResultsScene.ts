import Phaser from 'phaser'
import { sound } from '../core/audio'
import { ARENAS, CHARACTERS, ladderFor } from '../game/roster'
import type { Difficulty } from '../game/types'
import { ArenaBackdrop } from './ArenaBackdrop'
import { applyStage } from './stage'
import { FighterView } from './FighterView'
import { button, display, fadeTo, formatSeconds, hex, label, panel } from './ui'

export interface ResultsData {
  winner: 'p1' | 'cpu' | 'draw'
  p1Char: string
  cpuChar: string
  difficulty: Difficulty
  rounds: 1 | 3
  arena: string
  gauntlet: boolean
  stageIndex: number
  wins: number
  hits: number
  maxCombo: number
  damage: number
  durationMs: number
  arcadeClear: boolean
  p1Rounds: number
  cpuRounds: number
}

export class ResultsScene extends Phaser.Scene {
  private result!: ResultsData
  private backdrop!: ArenaBackdrop

  constructor() {
    super('Results')
  }

  init(data: ResultsData): void {
    this.result = data
  }

  create(): void {
    applyStage(this)
    this.backdrop = new ArenaBackdrop(this, ARENAS.find((arena) => arena.id === this.result.arena) ?? ARENAS[0]!)
    this.backdrop.container.setAlpha(0.6).setDepth(-10)
    this.cameras.main.fadeIn(260, 5, 3, 15)

    const p1 = CHARACTERS.find((character) => character.id === this.result.p1Char) ?? CHARACTERS[0]!
    const cpu = CHARACTERS.find((character) => character.id === this.result.cpuChar) ?? CHARACTERS[1]!
    const win = this.result.winner === 'p1'
    const draw = this.result.winner === 'draw'
    const accent = win ? 0x4df3ff : draw ? 0xffc247 : 0xff3ea5
    const title = draw ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT'
    const ladder = ladderFor(p1.id)
    const nextCpu = ladder[this.result.stageIndex + 1]
    const arcadeDone = this.result.gauntlet && win && !nextCpu

    sound.startMusic(win ? 'results' : 'menu')
    if (win) sound.win()
    else if (!draw) sound.lose()

    new FighterView(this, p1, 1.3).update(
      {
        character: p1,
        x: 300,
        y: 520,
        facing: 1,
        state: win ? 'idle' : 'ko',
        stateTicks: win ? 0 : 40,
        attack: null,
        health: win ? p1.stats.health : 0,
        maxHealth: p1.stats.health,
        meter: win ? 100 : 0,
        grounded: true,
        flash: 0,
      },
      0,
    )

    new FighterView(this, cpu, 1.3).update(
      {
        character: cpu,
        x: 980,
        y: 520,
        facing: -1,
        state: win ? 'ko' : 'idle',
        stateTicks: win ? 40 : 0,
        attack: null,
        health: win ? 0 : cpu.stats.health,
        maxHealth: cpu.stats.health,
        meter: win ? 0 : 100,
        grounded: true,
        flash: 0,
      },
      0,
    )

    const headline = display(this, 640, 92, title, 78, hex(accent))
    headline.setStroke('#05030f', 10)
    headline.setScale(0.6).setAlpha(0)
    this.tweens.add({ targets: headline, scale: 1, alpha: 1, duration: 420, ease: 'Back.Out' })

    let subtitle = `${p1.name}  VS  ${cpu.name}`
    if (arcadeDone) subtitle = 'ARCADE CLEARED — THE LADDER IS YOURS'
    else if (this.result.gauntlet && win) subtitle = `FIGHT ${this.result.stageIndex + 2} OF ${ladder.length} UNLOCKED`
    else if (this.result.gauntlet && !win) subtitle = `THE LADDER ENDS AT FIGHT ${this.result.stageIndex + 1}`
    label(this, 640, 142, subtitle, 14, '#b9c8e4', {
      origin: 0.5,
      letterSpacing: 3,
      fontStyle: 'bold',
    })

    this.buildStats(accent)
    this.buildButtons(p1, nextCpu, arcadeDone)

    if (win) this.celebrate(accent)
    else if (!draw) this.debris()

    this.input.keyboard?.on('keydown-ENTER', () => this.primary(nextCpu, arcadeDone))
    this.input.keyboard?.on('keydown-ESC', () => fadeTo(this, 'Title'))
  }

  override update(time: number): void {
    this.backdrop.update(time)
  }

  private buildStats(accent: number): void {
    const card = panel(this, 400, 190, 480, 300, {
      fill: 0x0b1026,
      radius: 22,
      stroke: accent,
      strokeAlpha: 0.25,
      glow: true,
    })
    card.setAlpha(0.97)

    label(this, 640, 216, 'MATCH REPORT', 11, hex(accent), {
      origin: 0.5,
      fontStyle: 'bold',
      letterSpacing: 4,
    })

    const rows: Array<[string, string]> = [
      ['HITS LANDED', String(this.result.hits)],
      ['BEST COMBO', this.result.maxCombo > 1 ? `${this.result.maxCombo} HITS` : '—'],
      ['DAMAGE DEALT', String(Math.round(this.result.damage))],
      ['ROUNDS', `${this.result.p1Rounds} - ${this.result.cpuRounds}`],
      ['MATCH TIME', formatSeconds(this.result.durationMs)],
    ]

    rows.forEach(([name, value], index) => {
      const y = 258 + index * 42
      label(this, 440, y, name, 11, '#8aa0c6', { fontStyle: 'bold', letterSpacing: 2 })
      display(this, 840, y - 4, value, 20, '#ffffff', 1)
      const line = this.add.graphics()
      line.lineStyle(1, 0xffffff, 0.06)
      line.lineBetween(440, y + 20, 840, y + 20)
    })

    if (this.result.arcadeClear) {
      label(this, 640, 470, 'ARCADE CLEAR', 12, '#ffc247', {
        origin: 0.5,
        letterSpacing: 3,
        fontStyle: 'bold',
      })
    }
  }

  private buildButtons(
    p1: (typeof CHARACTERS)[number],
    nextCpu: (typeof CHARACTERS)[number] | undefined,
    arcadeDone: boolean,
  ): void {
    const canContinue = this.result.gauntlet && this.result.winner === 'p1' && Boolean(nextCpu) && !arcadeDone
    const primaryLabel = canContinue ? 'NEXT FIGHT' : arcadeDone ? 'RUN IT BACK' : this.result.gauntlet ? 'TRY AGAIN' : 'REMATCH'
    const primary = button(this, 520, 566, 260, 66, primaryLabel, () => this.primary(nextCpu, arcadeDone), {
      fill: 0x1b2a63,
      accent: 0x4df3ff,
      size: 20,
      subtitle: canContinue ? `${nextCpu?.name} IS WAITING` : 'SAME RIVALS, FRESH ROUNDS',
      radius: 20,
    })
    button(this, 800, 566, 200, 58, 'TITLE', () => fadeTo(this, 'Title'), {
      fill: 0x161f3f,
      accent: 0x7d8cff,
      size: 17,
    })
    primary.setSelected(true)

    button(
      this,
      640,
      646,
      260,
      42,
      'CHANGE FIGHTER',
      () => fadeTo(this, 'Select', { mode: this.result.gauntlet ? 'arcade' : 'quick' }),
      { fill: 0x101833, accent: 0x8aa0c6, size: 13, radius: 14 },
    )
    label(this, 640, 688, `RIVAL: ${p1.name}  ·  ${this.result.gauntlet ? 'ARCADE' : 'QUICK FIGHT'}`, 10, '#6d82a7', {
      origin: 0.5,
      letterSpacing: 2,
    })
  }

  private primary(nextCpu: (typeof CHARACTERS)[number] | undefined, arcadeDone: boolean): void {
    const canContinue = this.result.gauntlet && this.result.winner === 'p1' && Boolean(nextCpu) && !arcadeDone
    if (canContinue && nextCpu) {
      fadeTo(this, 'Fight', {
        p1Char: this.result.p1Char,
        cpuChar: nextCpu.id,
        difficulty: this.result.difficulty,
        rounds: this.result.rounds,
        arena: ARENAS[(this.result.stageIndex + 2) % ARENAS.length]!.id,
        gauntlet: true,
        stageIndex: this.result.stageIndex + 1,
        wins: this.result.wins + 1,
      })
      return
    }
    if (this.result.gauntlet) {
      const ladder = ladderFor(this.result.p1Char)
      fadeTo(this, 'Fight', {
        p1Char: this.result.p1Char,
        cpuChar: ladder[0]?.id ?? 'ember',
        difficulty: this.result.difficulty,
        rounds: this.result.rounds,
        arena: ARENAS[0]!.id,
        gauntlet: true,
        stageIndex: 0,
        wins: 0,
      })
      return
    }
    fadeTo(this, 'Fight', {
      p1Char: this.result.p1Char,
      cpuChar: this.result.cpuChar,
      difficulty: this.result.difficulty,
      rounds: this.result.rounds,
      arena: this.result.arena,
      gauntlet: false,
      stageIndex: 0,
      wins: 0,
    })
  }

  private celebrate(accent: number): void {
    const emitter = this.add.particles(0, 0, 'shard', {
      x: { min: 160, max: 1120 },
      y: -20,
      lifespan: 3200,
      speedY: { min: 90, max: 260 },
      speedX: { min: -80, max: 80 },
      rotate: { min: 0, max: 360 },
      scale: { start: 1.1, end: 0.4 },
      alpha: { start: 1, end: 0.5 },
      gravityY: 90,
      frequency: 55,
      quantity: 2,
      blendMode: 'ADD',
      tint: accent,
    })
    emitter.setDepth(20)
    this.time.delayedCall(2600, () => emitter.stop())
    this.cameras.main.flash(240, 30, 60, 90)
  }

  private debris(): void {
    const emitter = this.add.particles(0, 0, 'spark', {
      x: { min: 220, max: 1060 },
      y: { min: 300, max: 620 },
      lifespan: 1400,
      speed: { min: 20, max: 90 },
      alpha: { start: 0.4, end: 0 },
      scale: { start: 0.5, end: 0 },
      frequency: 90,
      blendMode: 'ADD',
      tint: 0xff3ea5,
    })
    emitter.setDepth(8)
    this.time.delayedCall(1800, () => emitter.stop())
  }
}
