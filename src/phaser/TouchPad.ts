import Phaser from 'phaser'
import { NO_INPUT, type InputFrame } from '../game/types'
import { darken, display, hex, label } from './ui'

type Action = keyof InputFrame

/*
 * Landscape touch controls: a movement cluster under the left thumb and four
 * action buttons under the right. Multi-touch is required (move + jump +
 * attack at once), so every button captures its own pointer and the pad never
 * steals input from the other side.
 */
export class TouchPad {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly held = new Set<Action>()
  private readonly pressed = new Set<Action>()
  private opacity = 0.55

  constructor(scene: Phaser.Scene, opacity: number) {
    this.scene = scene
    this.container = scene.add.container(0, 0).setDepth(45)
    this.container.setAlpha(opacity)
    this.opacity = opacity
    this.build()
  }

  private build(): void {
    // Radius, not diameter: 46 leaves a small gap between neighbouring
    // buttons and keeps every target comfortably above 44 CSS px on a phone.
    this.makeButton('left', 96, 646, 46, '\u25C0', 0x3f8dff)
    this.makeButton('right', 198, 646, 46, '\u25B6', 0x3f8dff)
    this.makeButton('jump', 96, 546, 42, 'JUMP', 0x2fe6a0, 11)
    this.makeButton('crouch', 198, 546, 42, 'DUCK', 0x2fe6a0, 11)

    this.makeButton('light', 1002, 546, 46, 'LIGHT', 0x4df3ff, 11)
    this.makeButton('heavy', 1104, 546, 46, 'HEAVY', 0xff3ea5, 11)
    this.makeButton('special', 1002, 646, 46, 'SPECIAL', 0xffc247, 10)
    this.makeButton('guard', 1104, 646, 46, 'GUARD', 0xb07dff, 11)
  }

  private makeButton(
    action: Action,
    x: number,
    y: number,
    radius: number,
    text: string,
    color: number,
    fontSize = 16,
  ): void {
    const container = this.scene.add.container(x, y)
    const graphics = this.scene.add.graphics()
    const paint = (pressed: boolean): void => {
      graphics.clear()
      const scale = pressed ? 0.94 : 1
      const r = radius * scale
      graphics.fillStyle(0x000000, 0.32)
      graphics.fillCircle(2, 5, r + 2)
      graphics.fillStyle(darken(color, 0.62), 0.82)
      graphics.fillCircle(0, 3, r)
      graphics.fillStyle(color, pressed ? 0.62 : 0.26)
      graphics.fillCircle(0, 0, r)
      graphics.lineStyle(2, color, pressed ? 0.95 : 0.6)
      graphics.strokeCircle(0, 0, r)
      graphics.fillStyle(0xffffff, pressed ? 0.18 : 0.08)
      graphics.fillEllipse(0, -r * 0.34, r * 1.3, r * 0.6)
    }
    paint(false)
    container.add(graphics)

    const content = display(this.scene, 0, 0, text, fontSize, '#f4f9ff')
    if (action === 'left' || action === 'right') content.setFontSize(30)
    container.add(content)

    const glyph = label(this.scene, 0, radius * 0.62, '', 10, hex(color), {
      origin: 0.5,
      fontStyle: 'bold',
    })
    container.add(glyph)

    const hit = this.scene.add.circle(0, 0, radius, 0xffffff, 0.001)
    hit.setInteractive({ useHandCursor: false })
    container.add(hit)
    this.container.add(container)

    const press = (): void => {
      this.held.add(action)
      this.pressed.add(action)
      paint(true)
      this.scene.tweens.add({ targets: container, scale: 0.95, duration: 60 })
    }
    const release = (): void => {
      this.held.delete(action)
      paint(false)
      this.scene.tweens.add({ targets: container, scale: 1, duration: 90 })
    }

    hit.on('pointerdown', press)
    hit.on('pointerup', release)
    hit.on('pointerout', release)
    hit.on('pointerupoutside', release)
  }

  sample(): InputFrame {
    const frame: InputFrame = { ...NO_INPUT }
    for (const action of this.held) {
      if (action === 'light' || action === 'heavy' || action === 'special' || action === 'jump') continue
      frame[action] = true
    }
    for (const action of this.pressed) frame[action] = true
    this.pressed.clear()
    return frame
  }

  setOpacity(value: number): void {
    this.opacity = value
    this.container.setAlpha(value)
  }

  get currentOpacity(): number {
    return this.opacity
  }

  setVisible(visible: boolean): void {
    this.container.setVisible(visible)
  }

  destroy(): void {
    this.container.destroy(true)
  }
}
