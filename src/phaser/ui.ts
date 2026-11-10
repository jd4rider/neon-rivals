import Phaser from 'phaser'
import { sound } from '../core/audio'
import { DESIGN } from './stage'

export const FONT = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif'
export const DISPLAY = '"Arial Black", "Archivo Black", Impact, sans-serif'

export interface TextOptions {
  origin?: number | [number, number]
  align?: 'left' | 'center' | 'right'
  fontStyle?: string
  wrap?: number
  alpha?: number
  lineSpacing?: number
  fontFamily?: string
  letterSpacing?: number
}

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size = 18,
  color = '#ffffff',
  options: TextOptions = {},
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, content, {
    fontFamily: options.fontFamily ?? FONT,
    fontSize: `${size}px`,
    color,
    align: options.align ?? 'left',
    fontStyle: options.fontStyle,
    lineSpacing: options.lineSpacing,
    resolution: Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 1))),
    wordWrap: options.wrap ? { width: options.wrap, useAdvancedWrap: true } : undefined,
  })
  if (options.origin !== undefined) {
    if (Array.isArray(options.origin)) text.setOrigin(options.origin[0], options.origin[1])
    else text.setOrigin(options.origin, options.origin)
  }
  if (options.alpha !== undefined) text.setAlpha(options.alpha)
  if (options.letterSpacing !== undefined) text.setLetterSpacing(options.letterSpacing)
  return text
}

export function display(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  size = 48,
  color = '#ffffff',
  origin = 0.5,
): Phaser.GameObjects.Text {
  return label(scene, x, y, content, size, color, {
    origin,
    fontFamily: DISPLAY,
    fontStyle: 'bold',
    letterSpacing: 1,
  })
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export interface PanelOptions {
  radius?: number
  fill?: number
  alpha?: number
  stroke?: number
  strokeAlpha?: number
  raised?: number
  glow?: boolean
}

export function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PanelOptions = {},
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y)
  const graphics = scene.add.graphics()
  const radius = options.radius ?? 22
  const raised = options.raised ?? 6
  graphics.fillStyle(0x000000, 0.35)
  graphics.fillRoundedRect(2, raised + 6, width, height, radius)
  graphics.fillStyle(options.fill ?? 0x0d1230, options.alpha ?? 0.94)
  graphics.fillRoundedRect(0, raised, width, height, radius)
  graphics.fillStyle(options.fill ?? 0x0d1230, options.alpha ?? 0.94)
  graphics.fillRoundedRect(0, 0, width, height, radius)
  graphics.fillStyle(0xffffff, 0.05)
  graphics.fillRoundedRect(6, 5, width - 12, height * 0.32, radius * 0.7)
  graphics.lineStyle(1.5, options.stroke ?? 0xffffff, options.strokeAlpha ?? 0.14)
  graphics.strokeRoundedRect(1, 1, width - 2, height - 2, radius)
  if (options.glow) {
    graphics.lineStyle(6, options.stroke ?? 0x4df3ff, 0.1)
    graphics.strokeRoundedRect(-2, -2, width + 4, height + 4, radius + 2)
  }
  container.add(graphics)
  return container
}

export interface ButtonOptions {
  fill?: number
  accent?: number
  textColor?: string
  size?: number
  subtitle?: string
  disabled?: boolean
  radius?: number
  glow?: boolean
  onHover?: () => void
}

export interface MenuButton {
  container: Phaser.GameObjects.Container
  setSelected: (selected: boolean) => void
  activate: () => void
  setEnabled: (enabled: boolean) => void
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  onClick: () => void,
  options: ButtonOptions = {},
): MenuButton {
  const container = scene.add.container(x, y)
  const radius = options.radius ?? Math.min(26, height / 2.3)
  const fill = options.fill ?? 0x1e2a5a
  const accent = options.accent ?? 0x4df3ff
  const graphics = scene.add.graphics()
  const outline = scene.add.graphics()

  const paint = (): void => {
    graphics.clear()
    graphics.fillStyle(0x000000, 0.4)
    graphics.fillRoundedRect(-width / 2 + 2, -height / 2 + 6, width, height, radius)
    graphics.fillStyle(darken(fill, 0.4), 1)
    graphics.fillRoundedRect(-width / 2, -height / 2 + 4, width, height, radius)
    graphics.fillStyle(fill, 1)
    graphics.fillRoundedRect(-width / 2, -height / 2, width, height, radius)
    graphics.fillStyle(0xffffff, 0.12)
    graphics.fillRoundedRect(-width / 2 + 5, -height / 2 + 4, width - 10, height * 0.36, radius * 0.7)
    graphics.lineStyle(1.5, 0xffffff, 0.16)
    graphics.strokeRoundedRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2, radius)

    outline.clear()
    outline.lineStyle(2.5, accent, 0.85)
    outline.strokeRoundedRect(-width / 2 - 2, -height / 2 - 2, width + 4, height + 4, radius + 2)
    outline.setAlpha(0)
  }
  paint()
  container.add([graphics, outline])

  const content = display(scene, 0, options.subtitle ? -8 : 0, text, options.size ?? 22, options.textColor ?? '#ffffff')
  container.add(content)
  if (options.subtitle) {
    container.add(label(scene, 0, 20, options.subtitle, 12, hex(accent), { origin: 0.5, fontStyle: 'bold' }))
  }

  const hit = scene.add
    .rectangle(0, 0, width, height + 8, 0xffffff, 0)
    .setInteractive({ useHandCursor: !options.disabled })
  container.add(hit)

  let selected = false
  const state = { enabled: !options.disabled }

  const setSelected = (value: boolean): void => {
    selected = value
    outline.setAlpha(value ? 1 : 0)
    scene.tweens.add({
      targets: container,
      scale: value ? 1.035 : 1,
      duration: 110,
      ease: 'Quad.Out',
    })
    if (value && state.enabled) sound.click()
  }

  const activate = (): void => {
    if (!state.enabled) return
    if (!selected) setSelected(true)
    scene.tweens.add({ targets: container, scale: 0.96, duration: 60, yoyo: true })
    onClick()
  }

  hit.on('pointerover', () => {
    options.onHover?.()
    if (state.enabled && !selected) setSelected(true)
  })
  hit.on('pointerout', () => {
    if (!selected) return
    setSelected(false)
  })
  hit.on('pointerdown', () => {
    if (state.enabled) scene.tweens.add({ targets: container, scale: 0.955, duration: 55 })
  })
  hit.on('pointerup', () => {
    if (state.enabled) scene.tweens.add({ targets: container, scale: 1, duration: 110 })
    activate()
  })

  const setEnabled = (enabled: boolean): void => {
    state.enabled = enabled
    container.setAlpha(enabled ? 1 : 0.45)
    if (enabled) hit.setInteractive({ useHandCursor: true })
    else hit.disableInteractive()
  }
  setEnabled(state.enabled)

  return { container, setSelected, activate, setEnabled }
}

/** Wires arrow/WASD + Enter navigation for a vertical or horizontal menu. */
export function attachMenuKeys(
  scene: Phaser.Scene,
  items: MenuButton[],
  options: {
    vertical?: boolean
    onMove?: (index: number) => void
    startIndex?: number
    /** Menu keys do nothing while this returns false (e.g. a modal is open). */
    enabled?: () => boolean
  } = {},
): { destroy: () => void; select: (index: number) => void } {
  let index = options.startIndex ?? 0
  const vertical = options.vertical ?? true
  const keyboard = scene.input.keyboard

  const enabled = (): boolean => options.enabled?.() ?? true

  const select = (next: number): void => {
    if (items.length === 0 || !enabled()) return
    const clamped = Math.max(0, Math.min(items.length - 1, next))
    index = clamped
    items.forEach((item, itemIndex) => item.setSelected(itemIndex === clamped))
    options.onMove?.(clamped)
  }

  const previousKey = vertical ? 'keydown-UP' : 'keydown-LEFT'
  const nextKey = vertical ? 'keydown-DOWN' : 'keydown-RIGHT'
  const altPrevious = vertical ? 'keydown-W' : 'keydown-A'
  const altNext = vertical ? 'keydown-S' : 'keydown-D'

  const handlers: Array<[string, (...args: unknown[]) => void]> = [
    [previousKey, () => select(index - 1)],
    [nextKey, () => select(index + 1)],
    [altPrevious, () => select(index - 1)],
    [altNext, () => select(index + 1)],
    [
      'keydown-ENTER',
      () => {
        if (enabled()) items[index]?.activate()
      },
    ],
    [
      'keydown-SPACE',
      () => {
        if (enabled()) items[index]?.activate()
      },
    ],
  ]

  for (const [event, handler] of handlers) keyboard?.on(event, handler)

  items.forEach((item, itemIndex) => {
    item.container.on('pointerover', () => {
      if (itemIndex === index || !enabled()) return
      index = itemIndex
      items.forEach((other, otherIndex) => other.setSelected(otherIndex === itemIndex))
      options.onMove?.(itemIndex)
    })
  })

  select(index)

  return {
    destroy: () => {
      for (const [event, handler] of handlers) keyboard?.off(event, handler)
    },
    select,
  }
}

export function backButton(scene: Phaser.Scene, onClick: () => void): Phaser.GameObjects.Container {
  const container = scene.add.container(66, 60)
  const graphics = scene.add.graphics()
  graphics.fillStyle(0x0d1230, 0.9)
  graphics.fillRoundedRect(-28, -28, 56, 56, 16)
  graphics.lineStyle(1.5, 0xffffff, 0.18)
  graphics.strokeRoundedRect(-28, -28, 56, 56, 16)
  container.add(graphics)
  container.add(display(scene, 0, 0, '\u2190', 24, '#eaf2ff'))
  const hit = scene.add.rectangle(0, 0, 60, 60, 0xffffff, 0).setInteractive({ useHandCursor: true })
  container.add(hit)
  hit.on('pointerup', () => {
    sound.click()
    onClick()
  })
  return container
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  const camera = scene.cameras.main
  if (camera.fadeEffect?.isRunning) return
  camera.fadeOut(180, 5, 3, 15)
  camera.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data))
}

export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(240, 5, 3, 15)
}

export function toast(scene: Phaser.Scene, message: string, accent = 0x4df3ff, y = 118): void {
  const width = Math.min(620, DESIGN.width - 80)
  const container = scene.add.container(DESIGN.width / 2, y).setDepth(6000)
  const card = panel(scene, -width / 2, 0, width, 50, {
    fill: 0x0b1026,
    radius: 14,
    stroke: accent,
    strokeAlpha: 0.4,
    raised: 3,
  })
  container.add(card)
  container.add(label(scene, 0, 25, message, 14, '#eaf2ff', { origin: 0.5, wrap: width - 30, align: 'center' }))
  container.setAlpha(0)
  scene.tweens.add({
    targets: container,
    alpha: 1,
    y: y + 8,
    duration: 140,
    hold: 1500,
    yoyo: true,
    onComplete: () => container.destroy(),
  })
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function formatSeconds(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`
}

export function darken(color: number, amount = 0.3): number {
  const r = Math.max(0, Math.round(((color >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((color >> 8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round((color & 0xff) * (1 - amount)))
  return (r << 16) | (g << 8) | b
}

export function announce(message: string): void {
  if (typeof document === 'undefined') return
  const node = document.getElementById('game-status')
  if (node) node.textContent = message
}
