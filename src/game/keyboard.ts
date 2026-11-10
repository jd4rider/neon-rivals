import { NO_INPUT, type InputFrame } from './types'

/*
 * Keyboard bindings that work out of the box on a PC, with two layouts so a
 * player can keep their hands on either side:
 *
 *   Move    A / D  or  Left / Right            Jump  W or Up
 *   Light   J or Z                             Heavy K or X
 *   Special L or C                             Guard I or Shift
 *   Pause   Esc or P
 *
 * The key codes are physical (event.code), so WASD stays in the same place on
 * AZERTY and other layouts. Browser scrolling is suppressed for every game key
 * while the canvas is focused.
 */
export const KEYBOARD_BINDINGS: Record<keyof InputFrame, string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['ArrowUp', 'KeyW'],
  crouch: ['ArrowDown', 'KeyS'],
  light: ['KeyJ', 'KeyZ'],
  heavy: ['KeyK', 'KeyX'],
  special: ['KeyL', 'KeyC'],
  guard: ['KeyI', 'ShiftLeft', 'ShiftRight'],
}

export const PAUSE_KEYS = ['Escape', 'KeyP']
const BLOCKED_DEFAULT = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

function matches(code: string, keys: string[]): boolean {
  return keys.includes(code)
}

export class KeyboardInput {
  private readonly held = new Set<string>()
  private readonly pressed = new Set<string>()
  private pauseQueued = false
  private readonly target: Window

  constructor(target: Window = window) {
    this.target = target
    this.target.addEventListener('keydown', this.onKeyDown, { capture: true })
    this.target.addEventListener('keyup', this.onKeyUp, { capture: true })
    this.target.addEventListener('blur', this.onBlur)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const pauseKey = matches(event.code, PAUSE_KEYS)
    const gameKey = pauseKey || (Object.keys(KEYBOARD_BINDINGS) as Array<keyof InputFrame>).some((action) =>
      matches(event.code, KEYBOARD_BINDINGS[action]),
    )
    if (!gameKey && !BLOCKED_DEFAULT.includes(event.code)) return

    if (event.code !== 'F5' && event.code !== 'F12') event.preventDefault()
    if (event.repeat) return

    this.held.add(event.code)
    this.pressed.add(event.code)
    if (pauseKey) this.pauseQueued = true
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code)
  }

  private readonly onBlur = (): void => {
    // Alt-tabbing away must not leave a key stuck down.
    this.held.clear()
  }

  sample(): InputFrame {
    const frame: InputFrame = { ...NO_INPUT }
    for (const action of Object.keys(KEYBOARD_BINDINGS) as Array<keyof InputFrame>) {
      const keys = KEYBOARD_BINDINGS[action]
      if (action === 'light' || action === 'heavy' || action === 'special' || action === 'jump') {
        frame[action] = keys.some((code) => this.pressed.has(code))
      } else {
        frame[action] = keys.some((code) => this.held.has(code))
      }
    }
    this.pressed.clear()
    return frame
  }

  consumePause(): boolean {
    if (!this.pauseQueued) return false
    this.pauseQueued = false
    return true
  }

  get active(): boolean {
    return this.held.size > 0
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown, { capture: true })
    this.target.removeEventListener('keyup', this.onKeyUp, { capture: true })
    this.target.removeEventListener('blur', this.onBlur)
    this.held.clear()
    this.pressed.clear()
  }
}
