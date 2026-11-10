import type { MoveDef } from './types'

/*
 * Frame data for the shared melee kit. All timings are in 1/60s simulation
 * ticks: the engine never reads the render clock, so a punch lands on the same
 * tick on a 120 Hz tablet and a struggling laptop.
 *
 * Light: 15 ticks total (4 startup). Fast poke, tiny damage, safe.
 * Heavy: 33 ticks total (11 startup). Launches, big damage, punishable.
 * Specials live on each character and cost meter.
 */
export const LIGHT: MoveDef = {
  id: 'light',
  label: 'LIGHT',
  startup: 4,
  active: 3,
  recovery: 8,
  damage: 6,
  hitstun: 13,
  blockstun: 9,
  meterGain: 6,
  meterCost: 0,
  knockback: 300,
  launch: 0,
  box: { ox: 12, oy: 160, w: 92, h: 58 },
}

export const HEAVY: MoveDef = {
  id: 'heavy',
  label: 'HEAVY',
  startup: 11,
  active: 4,
  recovery: 18,
  damage: 13,
  hitstun: 20,
  blockstun: 13,
  meterGain: 10,
  meterCost: 0,
  knockback: 560,
  launch: 300,
  box: { ox: 10, oy: 174, w: 108, h: 74 },
}

export function totalTicks(move: MoveDef): number {
  return move.startup + move.active + move.recovery
}
