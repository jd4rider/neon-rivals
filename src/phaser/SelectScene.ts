import Phaser from 'phaser'
import { sound } from '../core/audio'
import { currentSave, updateSettings } from '../core/saves'
import { ARENAS, CHARACTERS, DIFFICULTY_ORDER, DIFFICULTY_PRESETS, ladderFor } from '../game/roster'
import type { Difficulty } from '../game/types'
import { ArenaBackdrop } from './ArenaBackdrop'
import { FighterView, idlePose } from './FighterView'
import {
  attachMenuKeys,
  backButton,
  button,
  display,
  fadeIn,
  fadeTo,
  hex,
  label,
  panel,
} from './ui'

interface SelectData {
  mode?: 'arcade' | 'quick'
}

interface RivalCard {
  index: number
  container: Phaser.GameObjects.Container
  outline: Phaser.GameObjects.Graphics
  view: FighterView
  setSelected: (selected: boolean) => void
}

export class SelectScene extends Phaser.Scene {
  private mode: 'arcade' | 'quick' = 'arcade'
  private cards: RivalCard[] = []
  private selected = 0
  private difficulty: Difficulty = 'fighter'
  private rounds: 1 | 3 = 3
  private difficultyPills: Array<{ id: Difficulty; setActive: (active: boolean) => void }> = []
  private roundPills: Array<{ value: 1 | 3; setActive: (active: boolean) => void }> = []
  private blurbText!: Phaser.GameObjects.Text
  private menuCleanup: (() => void) | null = null
  private backdrop!: ArenaBackdrop
  private starting = false

  constructor() {
    super('Select')
  }

  init(data: SelectData): void {
    this.mode = data.mode === 'quick' ? 'quick' : 'arcade'
  }

  create(): void {
    const save = currentSave()
    this.difficulty = save.settings.difficulty
    this.rounds = save.settings.rounds
    this.selected = 0
    this.starting = false
    this.cards = []
    this.difficultyPills = []
    this.roundPills = []

    this.backdrop = new ArenaBackdrop(this, ARENAS[0]!)
    this.backdrop.container.setAlpha(0.72).setDepth(-10)
    fadeIn(this)

    label(this, 150, 46, 'SELECT YOUR RIVAL', 12, '#4df3ff', { fontStyle: 'bold', letterSpacing: 4 })
    display(this, 150, 74, 'CHOOSE YOUR FIGHTER', 32, '#eaf9ff', 0)
    label(
      this,
      150,
      116,
      this.mode === 'arcade' ? 'ARCADE LADDER — THREE FIGHTS, BEST OF THREE ROUNDS' : 'QUICK FIGHT — ONE MATCH',
      11,
      '#8aa0c6',
      { letterSpacing: 2 },
    )

    backButton(this, () => this.leave())

    CHARACTERS.forEach((character, index) => this.buildCard(character, index))

    this.buildFooter()
    this.select(0)

    this.menuCleanup = attachMenuKeys(
      this,
      this.cards.map((card) => ({
        container: card.container,
        setSelected: card.setSelected,
        activate: () => this.start(),
        setEnabled: () => undefined,
      })),
      {
        vertical: false,
        onMove: (index) => this.select(index),
      },
    ).destroy

    this.input.keyboard?.on('keydown-ESC', () => this.leave())
    this.input.keyboard?.on('keydown-ONE', () => this.setDifficulty('rookie'))
    this.input.keyboard?.on('keydown-TWO', () => this.setDifficulty('fighter'))
    this.input.keyboard?.on('keydown-THREE', () => this.setDifficulty('master'))
    this.input.keyboard?.on('keydown-R', () => this.setRounds(this.rounds === 3 ? 1 : 3))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.menuCleanup?.()
      this.menuCleanup = null
    })
  }

  override update(time: number): void {
    this.backdrop.update(time)
    for (const card of this.cards) {
      const character = CHARACTERS[card.index]
      if (!character) continue
      const x = 178 + card.index * 308
      card.view.update(idlePose(character, x, 430, card.index % 2 === 0 ? 1 : -1), time)
    }
  }

  private buildCard(character: (typeof CHARACTERS)[number], index: number): void {
    const width = 284
    const height = 372
    const x = 36 + index * 308
    const y = 150
    const container = this.add.container(x, y)
    const card = panel(this, 0, 0, width, height, {
      fill: 0x0b1026,
      stroke: character.colors.primary,
      strokeAlpha: 0.25,
      radius: 20,
    })
    container.add(card)

    const outline = this.add.graphics()
    outline.lineStyle(3, character.colors.primary, 0.9)
    outline.strokeRoundedRect(-3, -3, width + 6, height + 6, 23)
    outline.setAlpha(0)
    container.add(outline)

    const name = display(this, 20, 26, character.name, 28, '#ffffff', 0)
    name.setStroke('#05030f', 5)
    container.add(name)
    container.add(label(this, 21, 64, character.title.toUpperCase(), 10, hex(character.colors.accent), { letterSpacing: 2, fontStyle: 'bold' }))

    const emblem = display(this, width - 26, 40, character.emblem, 26, hex(character.colors.accent))
    emblem.setAlpha(0.28)
    container.add(emblem)

    // Preview fighter stands on a little neon plinth.
    const plinth = this.add.graphics()
    plinth.fillStyle(character.colors.primary, 0.16)
    plinth.fillEllipse(width / 2, 250, 190, 34)
    plinth.lineStyle(2, character.colors.primary, 0.4)
    plinth.beginPath()
    plinth.arc(width / 2, 250, 92, 0.15, Math.PI - 0.15)
    plinth.strokePath()
    container.add(plinth)

    // Stats.
    const stats: Array<[string, number]> = [
      ['POWER', character.stats.power / 1.2],
      ['SPEED', character.stats.speed / 1.3],
      ['VITALITY', character.stats.health / 1250],
    ]
    stats.forEach(([statName, ratio], row) => {
      const barY = 300 + row * 22
      container.add(label(this, 20, barY, statName, 9, '#8aa0c6', { fontStyle: 'bold', letterSpacing: 1.5 }))
      const bar = this.add.graphics()
      bar.fillStyle(0xffffff, 0.1)
      bar.fillRoundedRect(88, barY + 2, 176, 8, 4)
      bar.fillStyle(character.colors.primary, 0.9)
      bar.fillRoundedRect(88, barY + 2, Math.max(10, 176 * Math.min(1, ratio)), 8, 4)
      container.add(bar)
    })

    const view = new FighterView(this, character)
    view.setDepth(6)
    view.update(idlePose(character, x + width / 2, y + 262, 1), 0)

    const hit = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
    container.add(hit)

    const cardState: RivalCard = {
      index,
      container,
      outline,
      view,
      setSelected: (selected: boolean) => {
        outline.setAlpha(selected ? 1 : 0)
        this.tweens.add({ targets: container, scale: selected ? 1.025 : 1, duration: 120, ease: 'Quad.Out' })
      },
    }

    hit.on('pointerover', () => this.select(index))
    hit.on('pointerup', () => {
      if (this.selected === index) this.start()
      else this.select(index)
    })

    this.cards.push(cardState)
  }

  private buildFooter(): void {
    const footer = panel(this, 36, 540, 1208, 152, { fill: 0x080d1e, radius: 18, strokeAlpha: 0.1 })
    footer.setAlpha(0.96)

    this.blurbText = label(this, 58, 560, '', 12, '#b9c8e4', { wrap: 520, lineSpacing: 3 })

    label(this, 58, 612, 'DIFFICULTY', 9, '#6d82a7', { fontStyle: 'bold', letterSpacing: 2 })
    DIFFICULTY_ORDER.forEach((id, index) => {
      const pill = this.createPill(174 + index * 128, 618, 118, 30, DIFFICULTY_PRESETS[id].label, () => this.setDifficulty(id))
      this.difficultyPills.push({ id, setActive: pill.setActive })
    })

    label(this, 58, 654, 'MATCH LENGTH', 9, '#6d82a7', { fontStyle: 'bold', letterSpacing: 2 })
    const single = this.createPill(212, 660, 92, 28, '1 ROUND', () => this.setRounds(1))
    const best = this.createPill(312, 660, 118, 28, 'BEST OF 3', () => this.setRounds(3))
    this.roundPills.push({ value: 1, setActive: single.setActive }, { value: 3, setActive: best.setActive })

    button(this, 1062, 612, 322, 76, 'FIGHT', () => this.start(), {
      fill: 0x2b1550,
      accent: 0xff3ea5,
      size: 30,
      subtitle: this.mode === 'arcade' ? 'START THE LADDER' : 'START THE MATCH',
      glow: true,
      radius: 22,
    })
    label(this, 1062, 664, 'ENTER  ·  TAP TO FIGHT', 9, '#8aa0c6', { origin: 0.5, letterSpacing: 2 })

    this.roundPills.forEach((pill) => pill.setActive(pill.value === this.rounds))
    this.difficultyPills.forEach((pill) => pill.setActive(pill.id === this.difficulty))
  }

  private createPill(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void,
  ): { container: Phaser.GameObjects.Container; setActive: (active: boolean) => void } {
    const container = this.add.container(x, y)
    const graphics = this.add.graphics()
    const paint = (active: boolean): void => {
      graphics.clear()
      graphics.fillStyle(active ? 0x1d2f66 : 0x101833, 1)
      graphics.fillRoundedRect(0, 0, width, height, height / 2)
      graphics.lineStyle(1.5, active ? 0x4df3ff : 0x3a4870, active ? 0.9 : 0.6)
      graphics.strokeRoundedRect(0, 0, width, height, height / 2)
    }
    paint(false)
    container.add(graphics)
    container.add(label(this, width / 2, height / 2, text, 10, '#dfe9ff', { origin: 0.5, fontStyle: 'bold', letterSpacing: 1 }))
    const hit = this.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerup', () => {
      sound.click()
      onClick()
    })
    return {
      container,
      setActive: (active: boolean) => paint(active),
    }
  }

  private select(index: number): void {
    if (this.cards.length === 0) return
    const next = Math.max(0, Math.min(CHARACTERS.length - 1, index))
    const changed = next !== this.selected
    this.selected = next
    for (const card of this.cards) card.setSelected(card.index === this.selected)
    const character = CHARACTERS[this.selected]
    if (character) {
      this.blurbText.setText(`${character.name} — ${character.blurb}`)
      if (changed) sound.select()
    }
  }

  private setDifficulty(id: Difficulty): void {
    this.difficulty = id
    this.difficultyPills.forEach((pill) => pill.setActive(pill.id === id))
    updateSettings({ difficulty: id })
    sound.click()
  }

  private setRounds(value: 1 | 3): void {
    this.rounds = value
    this.roundPills.forEach((pill) => pill.setActive(pill.value === value))
    updateSettings({ rounds: value })
    sound.click()
  }

  private start(): void {
    if (this.starting) return
    const character = CHARACTERS[this.selected]
    if (!character) return
    this.starting = true
    const ladder = ladderFor(character.id)
    fadeTo(this, 'Fight', {
      p1Char: character.id,
      cpuChar: ladder[0]?.id ?? 'ember',
      difficulty: this.difficulty,
      rounds: this.rounds,
      arena: ARENAS[(this.selected + 1) % ARENAS.length]!.id,
      gauntlet: this.mode === 'arcade',
      stageIndex: 0,
      wins: 0,
    })
  }

  private leave(): void {
    if (this.starting) return
    this.starting = true
    fadeTo(this, 'Title')
  }
}
