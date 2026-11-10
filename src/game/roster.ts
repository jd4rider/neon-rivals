import type { Arena, Character, Difficulty, DifficultyPreset } from './types'

/*
 * The roster is data. Every fighter shares the melee kit and is separated by
 * walk speed, jump height, health, damage and a signature projectile.
 */
export const CHARACTERS: Character[] = [
  {
    id: 'volt',
    name: 'VOLT',
    title: 'The Live Wire',
    blurb: 'Balanced and fast. Arc Bolt punishes anyone who stands still.',
    emblem: 'VL',
    colors: {
      primary: 0x2ec5ff,
      secondary: 0x0a4f9c,
      accent: 0x9bf7ff,
      glow: 0x42e8ff,
      skin: 0xf0c8a6,
      hair: 0xf4fbff,
    },
    stats: { speed: 1.1, jump: 1, health: 1000, power: 1 },
    special: {
      id: 'special',
      label: 'ARC BOLT',
      startup: 13,
      active: 4,
      recovery: 22,
      damage: 17,
      hitstun: 20,
      blockstun: 14,
      meterGain: 0,
      meterCost: 30,
      knockback: 420,
      launch: 0,
      box: { ox: 0, oy: 0, w: 0, h: 0 },
      projectile: { speed: 700, radius: 19, life: 120, color: 0x7df9ff },
    },
  },
  {
    id: 'ember',
    name: 'EMBER',
    title: 'The Furnace',
    blurb: 'Heavy hands, heavy health. Cinder Lance hits like a truck.',
    emblem: 'EM',
    colors: {
      primary: 0xff7a3c,
      secondary: 0x9c1f1f,
      accent: 0xffd166,
      glow: 0xff5a1f,
      skin: 0xe6ac86,
      hair: 0x3b1a12,
    },
    stats: { speed: 0.92, jump: 0.96, health: 1120, power: 1.1 },
    special: {
      id: 'special',
      label: 'CINDER LANCE',
      startup: 18,
      active: 4,
      recovery: 26,
      damage: 25,
      hitstun: 24,
      blockstun: 16,
      meterGain: 0,
      meterCost: 34,
      knockback: 560,
      launch: 0,
      box: { ox: 0, oy: 0, w: 0, h: 0 },
      projectile: { speed: 460, radius: 27, life: 150, color: 0xffb347 },
    },
  },
  {
    id: 'nyx',
    name: 'NYX',
    title: 'The Afterimage',
    blurb: 'Glass cannon. Void Shard crosses the screen before you blink.',
    emblem: 'NX',
    colors: {
      primary: 0xb56bff,
      secondary: 0x3d1466,
      accent: 0xff6ad5,
      glow: 0xd24dff,
      skin: 0xd0a6dd,
      hair: 0x201033,
    },
    stats: { speed: 1.24, jump: 1.08, health: 900, power: 0.92 },
    special: {
      id: 'special',
      label: 'VOID SHARD',
      startup: 11,
      active: 4,
      recovery: 20,
      damage: 15,
      hitstun: 18,
      blockstun: 12,
      meterGain: 0,
      meterCost: 28,
      knockback: 380,
      launch: 0,
      box: { ox: 0, oy: 0, w: 0, h: 0 },
      projectile: { speed: 880, radius: 14, life: 90, color: 0xff6ad5 },
    },
  },
  {
    id: 'jade',
    name: 'JADE',
    title: 'The Bulwark',
    blurb: 'A wall that hits back. Tide Wave is slow, wide and relentless.',
    emblem: 'JD',
    colors: {
      primary: 0x22d193,
      secondary: 0x0b5c46,
      accent: 0xc9ffe8,
      glow: 0x38ffc0,
      skin: 0xd6ac86,
      hair: 0x0f2a22,
    },
    stats: { speed: 0.96, jump: 0.94, health: 1200, power: 1.04 },
    special: {
      id: 'special',
      label: 'TIDE WAVE',
      startup: 16,
      active: 4,
      recovery: 24,
      damage: 20,
      hitstun: 22,
      blockstun: 15,
      meterGain: 0,
      meterCost: 32,
      knockback: 480,
      launch: 0,
      box: { ox: 0, oy: 0, w: 0, h: 0 },
      projectile: { speed: 380, radius: 33, life: 130, color: 0x9dffd9 },
    },
  },
]

export function characterById(id: string): Character {
  return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0]!
}

export const ARENAS: Arena[] = [
  {
    id: 'neon-district',
    name: 'NEON DISTRICT',
    subtitle: 'Downtown, after the rain',
    skyTop: 0x1b0b3f,
    skyBottom: 0x080516,
    accent: 0x4df3ff,
    accent2: 0xff3ea5,
    floor: 0x0a0a1d,
    style: 'district',
  },
  {
    id: 'sky-circuit',
    name: 'SKY CIRCUIT',
    subtitle: 'Rooftops above the traffic',
    skyTop: 0x2b0a3d,
    skyBottom: 0x0d0620,
    accent: 0xffb44d,
    accent2: 0x7d5cff,
    floor: 0x120a20,
    style: 'circuit',
  },
  {
    id: 'reactor-core',
    name: 'REACTOR CORE',
    subtitle: 'Where the city gets its light',
    skyTop: 0x04231f,
    skyBottom: 0x040a12,
    accent: 0x2fe6a0,
    accent2: 0x4df3ff,
    floor: 0x061310,
    style: 'reactor',
  },
]

export function arenaById(id: string | undefined): Arena {
  return ARENAS.find((arena) => arena.id === id) ?? ARENAS[0]!
}

export function arenaForIndex(index: number): Arena {
  return ARENAS[Math.abs(index) % ARENAS.length]!
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  rookie: {
    id: 'rookie',
    label: 'ROOKIE',
    blurb: 'Slower reads. A good place to learn the buttons.',
    reaction: 30,
    guardChance: 0.12,
    jumpChance: 0.02,
    specialChance: 0.18,
  },
  fighter: {
    id: 'fighter',
    label: 'FIGHTER',
    blurb: 'Blocks, punishes and fires projectiles. A fair fight.',
    reaction: 18,
    guardChance: 0.32,
    jumpChance: 0.05,
    specialChance: 0.42,
  },
  master: {
    id: 'master',
    label: 'MASTER',
    blurb: 'Sharp reads and constant pressure. Bring a plan.',
    reaction: 10,
    guardChance: 0.55,
    jumpChance: 0.08,
    specialChance: 0.66,
  },
}

export const DIFFICULTY_ORDER: Difficulty[] = ['rookie', 'fighter', 'master']

/** The arcade ladder: the other three fighters, in roster order. */
export function ladderFor(characterId: string): Character[] {
  return CHARACTERS.filter((character) => character.id !== characterId)
}
