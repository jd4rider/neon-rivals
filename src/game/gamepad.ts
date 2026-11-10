import { NO_INPUT, type InputFrame } from './types'

/*
 * Gamepad support through the browser's Gamepad API — no plugin, no Phaser
 * gamepad plugin to configure. Any standard-mapping pad works, and we merge it
 * with the keyboard so a player can switch mid-match.
 *
 * Standard layout used here:
 *   D-pad / left stick  move, up jumps, down crouches
 *   A / Cross           light
 *   B / Circle          heavy
 *   X / Square          special
 *   Y / Triangle        guard
 *   LB / RB             guard / special
 *   LT / RT             guard (analog threshold)
 *   Menu / Start        pause
 *
 * Face buttons and triggers are edge-triggered exactly once per press.
 */

const DEADZONE = 0.36
const TRIGGER_THRESHOLD = 0.45

interface PadSnapshot {
  buttons: boolean[]
  light: boolean
  heavy: boolean
  special: boolean
  guard: boolean
  pause: boolean
  left: boolean
  right: boolean
  jump: boolean
  crouch: boolean
}

function snapshot(pad: Gamepad): PadSnapshot {
  const button = (index: number): boolean => Boolean(pad.buttons[index]?.pressed)
  const value = (index: number): number => pad.buttons[index]?.value ?? 0
  const axisX = pad.axes[0] ?? 0
  const axisY = pad.axes[1] ?? 0

  return {
    buttons: pad.buttons.map((item) => item.pressed),
    light: button(0),
    heavy: button(1),
    special: button(2) || button(5) || value(7) > TRIGGER_THRESHOLD,
    guard: button(3) || button(4) || value(6) > TRIGGER_THRESHOLD,
    pause: button(9),
    left: axisX < -DEADZONE || button(14),
    right: axisX > DEADZONE || button(15),
    jump: axisY < -DEADZONE || button(12),
    crouch: axisY > DEADZONE || button(13),
  }
}

export class GamepadInput {
  private previous = new Map<number, PadSnapshot>()
  private pauseQueued = false
  private connected = false
  private padLabel: string | null = null

  constructor(private readonly target: Window = window) {
    this.target.addEventListener('gamepadconnected', this.onConnect)
    this.target.addEventListener('gamepaddisconnected', this.onDisconnect)
  }

  private readonly onConnect = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad
    this.connected = true
    this.padLabel = pad?.id ?? 'Controller'
  }

  private readonly onDisconnect = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad
    this.previous.delete(pad?.index ?? 0)
    this.refreshConnection()
  }

  private refreshConnection(): void {
    const pads = this.pads()
    this.connected = pads.length > 0
    this.padLabel = pads[0]?.id ?? null
  }

  private pads(): Gamepad[] {
    try {
      const nav = this.target.navigator
      if (!nav?.getGamepads) return []
      return Array.from(nav.getGamepads()).filter((pad): pad is Gamepad => Boolean(pad?.connected))
    } catch {
      return []
    }
  }

  get label(): string | null {
    this.refreshConnection()
    return this.padLabel
  }

  get isConnected(): boolean {
    this.refreshConnection()
    return this.connected
  }

  sample(): InputFrame {
    const frame: InputFrame = { ...NO_INPUT }
    const pads = this.pads()
    this.connected = pads.length > 0
    if (pads.length === 0) return frame

    const seen = new Set<number>()
    for (const pad of pads) {
      seen.add(pad.index)
      const current = snapshot(pad)
      const previous = this.previous.get(pad.index)
      frame.left = frame.left || current.left
      frame.right = frame.right || current.right
      frame.jump = frame.jump || (current.jump && !previous?.jump)
      frame.crouch = frame.crouch || current.crouch
      frame.light = frame.light || (current.light && !previous?.light)
      frame.heavy = frame.heavy || (current.heavy && !previous?.heavy)
      frame.special = frame.special || (current.special && !previous?.special)
      frame.guard = frame.guard || current.guard
      if (current.pause && !previous?.pause) this.pauseQueued = true
      this.previous.set(pad.index, current)
    }
    for (const index of Array.from(this.previous.keys())) {
      if (!seen.has(index)) this.previous.delete(index)
    }
    return frame
  }

  consumePause(): boolean {
    if (!this.pauseQueued) return false
    this.pauseQueued = false
    return true
  }

  /** Dual-rumble where the browser exposes it; silently ignored otherwise. */
  rumble(strong = 0.5, duration = 90): void {
    const pads = this.pads()
    for (const pad of pads) {
      const actuator = (
        pad as Gamepad & {
          vibrationActuator?: {
            playEffect?: (
              type: 'dual-rumble',
              params: { duration: number; strongMagnitude: number; weakMagnitude: number },
            ) => Promise<unknown>
          }
        }
      ).vibrationActuator
      if (!actuator?.playEffect) continue
      try {
        void actuator.playEffect('dual-rumble', {
          duration,
          strongMagnitude: Math.min(1, strong),
          weakMagnitude: Math.min(1, strong * 0.6),
        })
      } catch {
        // Some browsers expose the actuator but reject the effect; ignore.
      }
      break
    }
  }

  destroy(): void {
    this.target.removeEventListener('gamepadconnected', this.onConnect)
    this.target.removeEventListener('gamepaddisconnected', this.onDisconnect)
    this.previous.clear()
  }
}
