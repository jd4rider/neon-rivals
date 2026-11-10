import Phaser from 'phaser'
import { sound } from '../core/audio'
import { OrientationManager } from '../core/orientation'
import { currentSave, resetSave, updateSettings, type TouchPadMode } from '../core/saves'
import { ARENAS, DIFFICULTY_ORDER, DIFFICULTY_PRESETS } from '../game/roster'
import type { Difficulty } from '../game/types'
import { ArenaBackdrop } from './ArenaBackdrop'
import { applyStage } from './stage'
import { backButton, button, display, fadeTo, label, panel, toast } from './ui'

interface OptionsData {
  from?: string
}

export class OptionsScene extends Phaser.Scene {
  private from = 'Title'
  private backdrop!: ArenaBackdrop
  private difficultyPills: Array<{ id: Difficulty; setActive: (active: boolean) => void }> = []
  private roundPills: Array<{ value: 1 | 3; setActive: (active: boolean) => void }> = []
  private touchPills: Array<{ mode: TouchPadMode; setActive: (active: boolean) => void }> = []
  private shakePills: Array<{ value: boolean; setActive: (active: boolean) => void }> = []
  private motionPills: Array<{ value: boolean; setActive: (active: boolean) => void }> = []
  private opacityText!: Phaser.GameObjects.Text
  private musicText!: Phaser.GameObjects.Text
  private sfxText!: Phaser.GameObjects.Text
  private resetArmed = false
  private resetTimer: Phaser.Time.TimerEvent | null = null

  constructor() {
    super('Options')
  }

  init(data: OptionsData): void {
    this.from = data.from ?? 'Title'
  }

  create(): void {
    applyStage(this)
    this.difficultyPills = []
    this.roundPills = []
    this.touchPills = []
    this.shakePills = []
    this.motionPills = []
    this.resetArmed = false

    this.backdrop = new ArenaBackdrop(this, ARENAS[2]!)
    this.backdrop.container.setAlpha(0.55).setDepth(-10)
    this.cameras.main.fadeIn(220, 5, 3, 15)

    backButton(this, () => fadeTo(this, this.from))
    label(this, 640, 96, 'OPTIONS', 12, '#4df3ff', { origin: 0.5, fontStyle: 'bold', letterSpacing: 5 })
    display(this, 640, 132, 'TUNE THE FIGHT', 34, '#eaf9ff')

    panel(this, 210, 168, 860, 470, {
      fill: 0x0b1026,
      radius: 24,
      stroke: 0x4df3ff,
      strokeAlpha: 0.22,
    })

    const rows = [214, 258, 302, 346, 390, 434, 478, 522]
    const rowLabel = (y: number, text: string, note: string): void => {
      this.add.existing(label(this, 250, y - 2, text, 13, '#ffffff', { fontStyle: 'bold', letterSpacing: 1 }))
      this.add.existing(label(this, 250, y + 16, note, 9, '#6d82a7', { letterSpacing: 1 }))
    }

    rowLabel(rows[0]!, 'DIFFICULTY', 'How quickly the CPU reads and punishes')
    DIFFICULTY_ORDER.forEach((id, index) => {
      const pill = this.pill(600 + index * 136, rows[0]!, 124, 34, DIFFICULTY_PRESETS[id].label, () => {
        updateSettings({ difficulty: id })
        this.refresh()
        sound.select()
      })
      this.difficultyPills.push({ id, setActive: pill.setActive })
    })

    rowLabel(rows[1]!, 'MATCH LENGTH', 'Rounds per match in every mode')
    const single = this.pill(600, rows[1]!, 110, 34, '1 ROUND', () => {
      updateSettings({ rounds: 1 })
      this.refresh()
    })
    const best = this.pill(724, rows[1]!, 130, 34, 'BEST OF 3', () => {
      updateSettings({ rounds: 3 })
      this.refresh()
    })
    this.roundPills.push({ value: 1, setActive: single.setActive }, { value: 3, setActive: best.setActive })

    rowLabel(rows[2]!, 'TOUCH CONTROLS', 'Auto shows the pad only on touch devices')
    const touchModes: Array<[TouchPadMode, string]> = [
      ['auto', 'AUTO'],
      ['always', 'ALWAYS'],
      ['never', 'NEVER'],
    ]
    touchModes.forEach(([mode, text], index) => {
      const pill = this.pill(600 + index * 136, rows[2]!, 124, 34, text, () => {
        updateSettings({ touchPad: mode })
        this.refresh()
      })
      this.touchPills.push({ mode, setActive: pill.setActive })
    })

    rowLabel(rows[3]!, 'TOUCH PAD OPACITY', 'Applied to the next match')
    this.stepper(rows[3]!, (delta) => {
      const current = currentSave().settings.touchOpacity
      updateSettings({ touchOpacity: Math.min(0.9, Math.max(0.2, Number((current + delta * 0.1).toFixed(2)))) })
      this.refresh()
    })
    this.opacityText = this.textValue(rows[3]!)

    rowLabel(rows[4]!, 'MUSIC', 'Synthesised arcade loop')
    this.stepper(rows[4]!, (delta) => {
      const current = currentSave().settings.musicVolume
      updateSettings({ musicVolume: Math.min(1, Math.max(0, Number((current + delta * 0.1).toFixed(2)))) })
      this.applyVolumes()
      this.refresh()
    })
    this.musicText = this.textValue(rows[4]!)

    rowLabel(rows[5]!, 'SOUND EFFECTS', 'Punches, blocks, projectiles, K.O.')
    this.stepper(rows[5]!, (delta) => {
      const current = currentSave().settings.sfxVolume
      updateSettings({ sfxVolume: Math.min(1, Math.max(0, Number((current + delta * 0.1).toFixed(2)))) })
      this.applyVolumes()
      this.refresh()
    })
    this.sfxText = this.textValue(rows[5]!)

    rowLabel(rows[6]!, 'SCREEN SHAKE', 'Impacts nudge the camera')
    const shakeOn = this.pill(600, rows[6]!, 92, 32, 'ON', () => {
      updateSettings({ shake: true })
      this.refresh()
    })
    const shakeOff = this.pill(704, rows[6]!, 92, 32, 'OFF', () => {
      updateSettings({ shake: false })
      this.refresh()
    })
    this.shakePills.push({ value: true, setActive: shakeOn.setActive }, { value: false, setActive: shakeOff.setActive })

    rowLabel(rows[7]!, 'REDUCED MOTION', 'Turns off shakes, flashes and zoom punches')
    const motionOn = this.pill(600, rows[7]!, 92, 32, 'ON', () => {
      updateSettings({ reducedMotion: true })
      this.refresh()
    })
    const motionOff = this.pill(704, rows[7]!, 92, 32, 'OFF', () => {
      updateSettings({ reducedMotion: false })
      this.refresh()
    })
    this.motionPills.push({ value: true, setActive: motionOn.setActive }, { value: false, setActive: motionOff.setActive })

    button(this, 390, 596, 300, 48, 'FULLSCREEN / LANDSCAPE', () => void this.requestFullscreen(), {
      fill: 0x1b2a63,
      accent: 0x4df3ff,
      size: 13,
      radius: 14,
    })
    button(this, 720, 596, 260, 48, 'RESET PROGRESS', () => this.resetProgress(), {
      fill: 0x2a1224,
      accent: 0xff3ea5,
      size: 13,
      radius: 14,
    })

    label(
      this,
      640,
      662,
      'PROGRESS AND SETTINGS SAVE LOCALLY AND SYNC THROUGH THE ARCADE ACCOUNT WHEN SIGNED IN',
      9,
      '#5f7194',
      { origin: 0.5, letterSpacing: 2 },
    )

    this.input.keyboard?.on('keydown-ESC', () => fadeTo(this, this.from))
    this.refresh()
  }

  override update(time: number): void {
    this.backdrop.update(time)
  }

  private pill(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onClick: () => void,
  ): { setActive: (active: boolean) => void } {
    const container = this.add.container(x, y)
    const graphics = this.add.graphics()
    const paint = (active: boolean): void => {
      graphics.clear()
      graphics.fillStyle(active ? 0x1d2f66 : 0x101833, 1)
      graphics.fillRoundedRect(0, -height / 2, width, height, height / 2)
      graphics.lineStyle(1.5, active ? 0x4df3ff : 0x3a4870, active ? 0.9 : 0.55)
      graphics.strokeRoundedRect(0, -height / 2, width, height, height / 2)
    }
    paint(false)
    container.add(graphics)
    container.add(label(this, width / 2, 0, text, 9, '#dfe9ff', { origin: 0.5, fontStyle: 'bold', letterSpacing: 1 }))
    const hit = this.add.rectangle(width / 2, 0, width, height, 0xffffff, 0.001).setInteractive({ useHandCursor: true })
    container.add(hit)
    hit.on('pointerup', () => {
      sound.click()
      onClick()
    })
    return { setActive: paint }
  }

  private stepper(y: number, onStep: (delta: number) => void): void {
    button(this, 610, y, 44, 32, '\u2212', () => onStep(-1), {
      fill: 0x101833,
      accent: 0x7d8cff,
      size: 18,
      radius: 10,
    })
    button(this, 734, y, 44, 32, '+', () => onStep(1), {
      fill: 0x101833,
      accent: 0x7d8cff,
      size: 18,
      radius: 10,
    })
  }

  private textValue(y: number): Phaser.GameObjects.Text {
    return label(this, 672, y, '', 13, '#ffffff', { origin: 0.5, fontStyle: 'bold' })
  }

  private refresh(): void {
    const settings = currentSave().settings
    this.difficultyPills.forEach((pill) => pill.setActive(pill.id === settings.difficulty))
    this.roundPills.forEach((pill) => pill.setActive(pill.value === settings.rounds))
    this.touchPills.forEach((pill) => pill.setActive(pill.mode === settings.touchPad))
    this.shakePills.forEach((pill) => pill.setActive(pill.value === settings.shake))
    this.motionPills.forEach((pill) => pill.setActive(pill.value === settings.reducedMotion))
    this.opacityText.setText(`${Math.round(settings.touchOpacity * 100)}%`)
    this.musicText.setText(`${Math.round(settings.musicVolume * 100)}%`)
    this.sfxText.setText(`${Math.round(settings.sfxVolume * 100)}%`)
  }

  private applyVolumes(): void {
    const settings = currentSave().settings
    sound.setVolumes(settings.sfxVolume, settings.musicVolume, settings.muted)
  }

  private async requestFullscreen(): Promise<void> {
    const ok = await OrientationManager.current?.requestLandscapeFullscreen()
    toast(
      this,
      ok ? 'FULLSCREEN AND LANDSCAPE LOCK REQUESTED' : 'BLOCKED BY THIS BROWSER — ROTATE THE DEVICE MANUALLY',
      ok ? 0x4df3ff : 0xffc247,
      150,
    )
  }

  private resetProgress(): void {
    if (!this.resetArmed) {
      this.resetArmed = true
      toast(this, 'TAP RESET AGAIN TO WIPE PROGRESS, RECORDS AND SETTINGS', 0xff3ea5, 150)
      this.resetTimer?.remove()
      this.resetTimer = this.time.delayedCall(3200, () => {
        this.resetArmed = false
      })
      return
    }
    this.resetArmed = false
    resetSave()
    this.applyVolumes()
    this.refresh()
    toast(this, 'PROGRESS RESET', 0x4df3ff, 150)
  }
}
