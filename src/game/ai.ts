import type { FighterRuntime } from './engine'
import { mulberry32 } from './random'
import { DIFFICULTY_PRESETS } from './roster'
import { NO_INPUT, type Difficulty, type InputFrame } from './types'

/*
 * A readable, beatable CPU opponent. It only ever produces the same InputFrame
 * a human could: no health bonuses, no extra damage, no hidden reads. The
 * difficulty knob changes reaction speed, blocking and how often it commits.
 */
export class CpuController {
  private readonly preset
  private readonly rng: () => number
  private cooldown = 14
  private guardTicks = 0
  private jumpCooldown = 60

  constructor(difficulty: Difficulty, seed = 7) {
    this.preset = DIFFICULTY_PRESETS[difficulty]
    this.rng = mulberry32(seed * 977 + 13)
  }

  reset(): void {
    this.cooldown = 20
    this.guardTicks = 0
    this.jumpCooldown = 60
  }

  decide(self: FighterRuntime, foe: FighterRuntime): InputFrame {
    const input: InputFrame = { ...NO_INPUT }
    this.cooldown -= 1
    this.jumpCooldown -= 1

    if (self.state === 'ko') return input

    if (this.guardTicks > 0) {
      this.guardTicks -= 1
      input.guard = true
      return input
    }

    if (self.state === 'hit' || self.hitstun > 0) return input

    const dx = foe.x - self.x
    const distance = Math.abs(dx)
    const toward: 'left' | 'right' = dx > 0 ? 'right' : 'left'
    const away: 'left' | 'right' = toward === 'right' ? 'left' : 'right'

    // React to a committed attack. The guard is held for a short, readable
    // window instead of flickering on and off frame by frame.
    const threat = foe.attack !== null && distance < 210
    if (threat && this.rng() < this.preset.guardChance) {
      this.guardTicks = 10 + Math.floor(this.rng() * 14)
      input.guard = true
      return input
    }

    if (distance > 118) input[toward] = true
    else if (distance < 72 && this.rng() < 0.03) input[away] = true

    if (
      distance > 150 &&
      this.jumpCooldown <= 0 &&
      this.rng() < this.preset.jumpChance &&
      !self.attack
    ) {
      input.jump = true
      this.jumpCooldown = 100
    }

    if (!self.grounded && distance < 140 && !self.attack && this.rng() < 0.18) {
      input.heavy = true
      this.cooldown = this.preset.reaction
      return input
    }

    if (this.cooldown > 0) return input

    if (distance < 116) {
      const roll = this.rng()
      const canSpecial = self.meter >= self.character.special.meterCost
      let choice: 'light' | 'heavy' | 'special' =
        roll < 0.58 ? 'light' : roll < 0.88 ? 'heavy' : 'special'
      if (choice === 'special' && (!canSpecial || this.rng() > this.preset.specialChance)) {
        choice = this.rng() < 0.7 ? 'light' : 'heavy'
      }
      input[choice] = true
      this.cooldown = Math.max(5, Math.round(this.preset.reaction * (0.55 + this.rng() * 0.8)))
      return input
    }

    if (
      distance < 560 &&
      self.meter >= self.character.special.meterCost &&
      this.rng() < this.preset.specialChance
    ) {
      input.special = true
      this.cooldown = this.preset.reaction
    }

    return input
  }
}
