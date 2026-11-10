import Phaser from 'phaser'
import { sound } from '../core/audio'
import { currentSave } from '../core/saves'
import { ARENAS, CHARACTERS } from '../game/roster'
import type { Character } from '../game/types'
import { ArenaBackdrop } from './ArenaBackdrop'
import { FighterView, idlePose } from './FighterView'
import { applyStage, stageWidth } from './stage'
import { attachMenuKeys, button, display, fadeIn, fadeTo, hex, label, panel, type MenuButton } from './ui'

export class TitleScene extends Phaser.Scene {
  private backdrop!: ArenaBackdrop
  private menuCleanup: (() => void) | null = null
  private showcase!: FighterView
  private showcaseIndex = 0
  private modal: Phaser.GameObjects.Container | null = null

  constructor() {
    super('Title')
  }

  create(): void {
    applyStage(this)
    this.backdrop = new ArenaBackdrop(this, ARENAS[0]!)
    this.backdrop.container.setDepth(-10)
    fadeIn(this)

    this.buildLogo()
    this.buildShowcase()
    this.buildMenu()
    this.buildFooter()

    sound.startMusic('menu')

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menuCleanup?.()
      this.menuCleanup = null
    })
    this.input.keyboard?.on('keydown-ESC', () => this.closeModal())
  }

  override update(time: number): void {
    this.backdrop.update(time)
    if (!this.showcase) return
    const character = this.currentShowcase()
    if (character) this.showcase.update(idlePose(character, 286, 656), time)
  }

  private currentShowcase(): Character {
    return CHARACTERS[this.showcaseIndex % CHARACTERS.length] ?? CHARACTERS[0]!
  }

  private buildLogo(): void {
    const glow = display(this, 262, 214, 'NEON', 118, '#4df3ff')
    glow.setAlpha(0.34).setScale(1.08).setDepth(10)
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.1, to: 0.28 },
      scale: 1.12,
      duration: 2400,
      yoyo: true,
      repeat: -1,
    })
    display(this, 258, 210, 'NEON', 118, '#d6fbff').setStroke('#043047', 7).setDepth(11)
    const rivals = display(this, 258, 306, 'RIVALS', 118, '#ff3ea5')
    rivals.setStroke('#3d0524', 8).setDepth(11)
    const rivalsGlow = display(this, 262, 310, 'RIVALS', 118, '#ff3ea5')
    rivalsGlow.setAlpha(0.2).setDepth(10)
    this.tweens.add({
      targets: rivalsGlow,
      alpha: { from: 0.12, to: 0.32 },
      duration: 1900,
      yoyo: true,
      repeat: -1,
    })

    label(this, 260, 370, 'FOUR RIVALS. ONE NEON CITY.', 13, '#9fb4d8', {
      origin: 0.5,
      fontStyle: 'bold',
      letterSpacing: 4,
    }).setDepth(11)

    const bolt = this.add.graphics()
    bolt.fillStyle(0xffffff, 0.9)
    bolt.fillTriangle(396, 150, 430, 150, 404, 196)
    bolt.fillTriangle(404, 196, 420, 196, 392, 246)
    bolt.setAlpha(0.75).setDepth(12)
    this.tweens.add({
      targets: bolt,
      alpha: { from: 0.2, to: 0.95 },
      duration: 90,
      repeat: -1,
      repeatDelay: 2600,
      yoyo: true,
    })

    label(this, 260, 402, 'A LANDSCAPE ARCADE FIGHTER', 11, hex(0x4df3ff), {
      origin: 0.5,
      letterSpacing: 2,
      fontStyle: 'bold',
    }).setDepth(11)
  }

  private buildShowcase(): void {
    this.showcase = new FighterView(this, this.currentShowcase(), 1.45)
    this.showcase.setDepth(8)
    this.time.addEvent({
      delay: 3400,
      loop: true,
      callback: () => {
        this.showcaseIndex += 1
        const outgoing = this.showcase
        this.tweens.add({
          targets: outgoing.container,
          alpha: 0,
          duration: 220,
          onComplete: () => outgoing.destroy(),
        })
        this.showcase = new FighterView(this, this.currentShowcase(), 1.38)
        this.showcase.setDepth(8)
        this.showcase.container.setAlpha(0)
        this.tweens.add({ targets: this.showcase.container, alpha: 1, duration: 300 })
      },
    })
  }

  private buildMenu(): void {
    const stats = currentSave().stats
    const items: MenuButton[] = []

    const arcade = button(this, 960, 252, 348, 66, 'ARCADE', () => fadeTo(this, 'Select', { mode: 'arcade' }), {
      fill: 0x1b2a63,
      accent: 0x4df3ff,
      subtitle: 'FIGHT THE LADDER',
      size: 25,
    })
    const quick = button(this, 960, 334, 348, 66, 'QUICK FIGHT', () => fadeTo(this, 'Select', { mode: 'quick' }), {
      fill: 0x2a1a4d,
      accent: 0xff3ea5,
      subtitle: 'ONE MATCH, YOUR RULES',
      size: 22,
    })
    const options = button(this, 960, 416, 348, 58, 'OPTIONS', () => fadeTo(this, 'Options', { from: 'Title' }), {
      fill: 0x161f3f,
      accent: 0x7d8cff,
      size: 19,
    })
    const controls = button(this, 960, 484, 348, 58, 'CONTROLS', () => this.openControls(), {
      fill: 0x161f3f,
      accent: 0xb07dff,
      size: 19,
    })

    items.push(arcade, quick, options, controls)
    for (const item of items) item.container.setDepth(14)
    const menu = attachMenuKeys(this, items, { vertical: true, enabled: () => this.modal === null })
    this.menuCleanup = menu.destroy
    arcade.setSelected(true)

    const record = stats.matches > 0 ? `${stats.wins}W · ${stats.losses}L · ${stats.draws}D` : 'NO MATCHES YET'
    label(this, 960, 544, record, 12, '#8aa0c6', { origin: 0.5, letterSpacing: 2, fontStyle: 'bold' }).setDepth(14)
    if (stats.bestStreak >= 2) {
      label(this, 960, 566, `BEST STREAK ${stats.bestStreak}`, 11, '#ffc247', { origin: 0.5, letterSpacing: 2 }).setDepth(14)
    }
    if (stats.arcadeClears > 0) {
      label(this, 960, 586, `ARCADE CLEARS ${stats.arcadeClears}`, 11, '#2fe6a0', {
        origin: 0.5,
        letterSpacing: 2,
      }).setDepth(14)
    }
  }

  private buildFooter(): void {
    label(
      this,
      660,
      690,
      'KEYBOARD   A / D MOVE   ·   W JUMP   ·   J LIGHT   ·   K HEAVY   ·   L SPECIAL   ·   I GUARD   ·   ESC PAUSE',
      10,
      '#aebbdb',
      { origin: 0.5, fontStyle: 'bold', letterSpacing: 1.4 },
    ).setDepth(14)
    const connected = this.registry.get('controllerLabel') as string | undefined
    label(
      this,
      660,
      708,
      connected
        ? `CONTROLLER: ${connected.toUpperCase().slice(0, 46)}`
        : 'GAMEPAD   STICK MOVE   ·   A LIGHT   ·   B HEAVY   ·   X SPECIAL   ·   Y GUARD   ·   START PAUSE',
      9,
      connected ? '#b07dff' : '#6d82a7',
      { origin: 0.5, letterSpacing: 1.4 },
    ).setDepth(14)
    label(this, 1234, 14, 'v1.0.1  ·  LITTLE JOY ARCADE', 10, '#5f7194', {
      origin: [1, 0],
      letterSpacing: 1.5,
    }).setDepth(14)
    label(this, 1234, 34, 'LANDSCAPE ONLY', 10, '#ff3ea5', {
      origin: [1, 0],
      letterSpacing: 2,
      fontStyle: 'bold',
    }).setDepth(14)
  }

  private openControls(): void {
    if (this.modal) return
    const container = this.add.container(0, 0).setDepth(5000)
    container.add(this.add.rectangle(640, 360, stageWidth(), 720, 0x05030f, 0.84).setInteractive())
    container.add(
      panel(this, 250, 92, 780, 536, { fill: 0x0b1026, stroke: 0x4df3ff, strokeAlpha: 0.35, glow: true }),
    )
    container.add(display(this, 640, 142, 'HOW TO FIGHT', 34, '#eaf9ff'))
    container.add(
      label(this, 640, 178, 'KEYBOARD, CONTROLLER OR TOUCH — ALL WORK AT ONCE', 11, '#8aa0c6', {
        origin: 0.5,
        letterSpacing: 2,
      }),
    )

    const rows: Array<[string, string, string]> = [
      ['MOVE', 'A / D  or  \u2190 \u2192', 'Left stick / D-pad'],
      ['JUMP', 'W  or  \u2191', 'Stick up / D-pad up'],
      ['CROUCH', 'S  or  \u2193', 'Stick down / D-pad down'],
      ['LIGHT', 'J  or  Z', 'A / Cross'],
      ['HEAVY', 'K  or  X', 'B / Circle'],
      ['SPECIAL', 'L  or  C', 'X / Square  or  RB / RT'],
      ['GUARD', 'I  or  Shift', 'Y / Triangle  or  LB / LT'],
      ['PAUSE', 'Esc  or  P', 'Menu / Start'],
    ]

    container.add(label(this, 300, 224, 'ACTION', 11, '#4df3ff', { fontStyle: 'bold', letterSpacing: 2 }))
    container.add(label(this, 470, 224, 'KEYBOARD', 11, '#4df3ff', { fontStyle: 'bold', letterSpacing: 2 }))
    container.add(label(this, 790, 224, 'GAMEPAD', 11, '#4df3ff', { fontStyle: 'bold', letterSpacing: 2 }))
    rows.forEach((row, index) => {
      const y = 258 + index * 38
      container.add(label(this, 300, y, row[0], 14, '#ffffff', { fontStyle: 'bold' }))
      container.add(label(this, 470, y, row[1], 14, '#c9d6ee'))
      container.add(label(this, 790, y, row[2], 14, '#c9d6ee'))
    })

    container.add(
      label(
        this,
        640,
        576,
        'Guard beats an attack on the same frame. Specials cost meter — fill it by landing hits.',
        12,
        '#8aa0c6',
        { origin: 0.5 },
      ),
    )

    const close = button(this, 640, 606, 180, 46, 'CLOSE', () => this.closeModal(), {
      fill: 0x1b2a63,
      accent: 0x4df3ff,
      size: 16,
      radius: 14,
    })
    container.add(close.container)
    this.modal = container
    this.input.keyboard?.once('keydown-ESC', () => this.closeModal())
  }

  private closeModal(): void {
    if (!this.modal) return
    this.modal.destroy(true)
    this.modal = null
  }
}
