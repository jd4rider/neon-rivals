export type Difficulty = 'rookie' | 'fighter' | 'master'
export type Side = 'p1' | 'cpu'
export type FighterState = 'idle' | 'walk' | 'crouch' | 'jump' | 'attack' | 'hit' | 'block' | 'ko'
export type MatchPhase = 'intro' | 'fight' | 'roundOver' | 'matchOver'

export interface InputFrame {
  left: boolean
  right: boolean
  jump: boolean
  crouch: boolean
  /** Light attack, edge-triggered: true for one simulation tick only. */
  light: boolean
  /** Heavy attack, edge-triggered. */
  heavy: boolean
  /** Special attack, edge-triggered. */
  special: boolean
  guard: boolean
}

export const NO_INPUT: InputFrame = {
  left: false,
  right: false,
  jump: false,
  crouch: false,
  light: false,
  heavy: false,
  special: false,
  guard: false,
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface CharacterStats {
  /** Walk-speed multiplier. */
  speed: number
  /** Jump-height multiplier. */
  jump: number
  /** Starting health. */
  health: number
  /** Damage multiplier. */
  power: number
}

export interface CharacterColors {
  primary: number
  secondary: number
  accent: number
  glow: number
  skin: number
  hair: number
}

export interface ProjectileDef {
  speed: number
  radius: number
  /** Ticks before the projectile fizzles out. */
  life: number
  color?: number
}

export interface MoveDef {
  id: 'light' | 'heavy' | 'special'
  label: string
  /** Ticks before the hitbox appears. */
  startup: number
  /** Ticks the hitbox is live. */
  active: number
  /** Ticks of recovery after the hitbox. */
  recovery: number
  damage: number
  hitstun: number
  blockstun: number
  meterGain: number
  meterCost: number
  knockback: number
  /** Upward launch speed; 0 keeps the opponent grounded. */
  launch: number
  /** Hitbox measured from the fighter's centre; oy is the height above the feet. */
  box: { ox: number; oy: number; w: number; h: number }
  projectile?: ProjectileDef
}

export interface Character {
  id: string
  name: string
  title: string
  blurb: string
  /** Two-letter emblem shown on select cards. */
  emblem: string
  colors: CharacterColors
  stats: CharacterStats
  special: MoveDef
}

export type ArenaStyle = 'district' | 'circuit' | 'reactor'

export interface Arena {
  id: string
  name: string
  subtitle: string
  skyTop: number
  skyBottom: number
  accent: number
  accent2: number
  floor: number
  style: ArenaStyle
}

export interface DifficultyPreset {
  id: Difficulty
  label: string
  blurb: string
  /** Ticks between CPU decisions; lower is sharper. */
  reaction: number
  guardChance: number
  jumpChance: number
  specialChance: number
}
