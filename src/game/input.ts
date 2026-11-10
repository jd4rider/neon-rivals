import { GamepadInput } from './gamepad'
import { KeyboardInput } from './keyboard'
import { NO_INPUT, type InputFrame } from './types'

/** Merges keyboard and gamepad into the single frame the engine consumes. */
export class PlayerInput {
  readonly keyboard: KeyboardInput
  readonly gamepad: GamepadInput

  constructor(target: Window = window) {
    this.keyboard = new KeyboardInput(target)
    this.gamepad = new GamepadInput(target)
  }

  sample(): InputFrame {
    const keys = this.keyboard.sample()
    const pad = this.gamepad.sample()
    const frame: InputFrame = { ...NO_INPUT }
    for (const action of Object.keys(frame) as Array<keyof InputFrame>) {
      frame[action] = keys[action] || pad[action]
    }
    return frame
  }

  consumePause(): boolean {
    return this.keyboard.consumePause() || this.gamepad.consumePause()
  }

  rumble(strength = 0.5, duration = 90): void {
    this.gamepad.rumble(strength, duration)
  }

  get controllerLabel(): string | null {
    return this.gamepad.isConnected ? this.gamepad.label : null
  }

  destroy(): void {
    this.keyboard.destroy()
    this.gamepad.destroy()
  }
}
