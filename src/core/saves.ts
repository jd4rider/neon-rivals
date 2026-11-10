import type { Difficulty } from '../game/types'

export const SAVE_KEY = 'neon-rivals-save-v1'
export const SAVE_VERSION = 2

export type TouchPadMode = 'auto' | 'always' | 'never'

export interface Settings {
  difficulty: Difficulty
  rounds: 1 | 3
  touchPad: TouchPadMode
  touchOpacity: number
  sfxVolume: number
  musicVolume: number
  muted: boolean
  shake: boolean
  reducedMotion: boolean
}

export interface Stats {
  matches: number
  wins: number
  losses: number
  draws: number
  arcadeClears: number
  bestStreak: number
  currentStreak: number
  maxCombo: number
  totalHits: number
  totalRounds: number
  playMs: number
  characterWins: Record<string, number>
}

export interface SaveData {
  version: number
  settings: Settings
  stats: Stats
}

export interface SaveStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'fighter',
  rounds: 3,
  touchPad: 'auto',
  touchOpacity: 0.55,
  sfxVolume: 0.8,
  musicVolume: 0.45,
  muted: false,
  shake: true,
  reducedMotion: false,
}

function emptyStats(): Stats {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    arcadeClears: 0,
    bestStreak: 0,
    currentStreak: 0,
    maxCombo: 0,
    totalHits: 0,
    totalRounds: 0,
    playMs: 0,
    characterWins: {},
  }
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, settings: { ...DEFAULT_SETTINGS }, stats: emptyStats() }
}

function memoryStore(): SaveStore {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

const fallback = memoryStore()

export function defaultStore(): SaveStore {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__neon_rivals_probe__'
      localStorage.setItem(probe, '1')
      localStorage.removeItem(probe)
      return localStorage
    }
  } catch {
    // Private-mode Safari and embedded webviews can refuse storage; the game
    // still plays, it just forgets between sessions.
  }
  return fallback
}

function number(value: unknown, fallbackValue: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallbackValue
  return Math.min(max, Math.max(min, value))
}

function boolean(value: unknown, fallbackValue: boolean): boolean {
  return typeof value === 'boolean' ? value : fallbackValue
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallbackValue: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallbackValue
}

function sanitizeSettings(raw: unknown): Settings {
  const source = (raw ?? {}) as Record<string, unknown>
  return {
    difficulty: oneOf<Difficulty>(source.difficulty, ['rookie', 'fighter', 'master'], DEFAULT_SETTINGS.difficulty),
    rounds: source.rounds === 1 ? 1 : 3,
    touchPad: oneOf<TouchPadMode>(source.touchPad, ['auto', 'always', 'never'], DEFAULT_SETTINGS.touchPad),
    touchOpacity: number(source.touchOpacity, DEFAULT_SETTINGS.touchOpacity, 0.2, 0.95),
    sfxVolume: number(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume, 0, 1),
    musicVolume: number(source.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
    muted: boolean(source.muted, DEFAULT_SETTINGS.muted),
    shake: boolean(source.shake, DEFAULT_SETTINGS.shake),
    reducedMotion: boolean(source.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
  }
}

function sanitizeStats(raw: unknown): Stats {
  const source = (raw ?? {}) as Record<string, unknown>
  const wins = Math.max(0, Math.floor(number(source.wins, 0, 0, 1e9)))
  const losses = Math.max(0, Math.floor(number(source.losses, 0, 0, 1e9)))
  const draws = Math.max(0, Math.floor(number(source.draws, 0, 0, 1e9)))
  const characterWins: Record<string, number> = {}
  const rawWins = source.characterWins
  if (rawWins && typeof rawWins === 'object') {
    for (const [key, value] of Object.entries(rawWins as Record<string, unknown>)) {
      if (!/^[a-z0-9-]{1,24}$/.test(key)) continue
      const count = Math.floor(number(value, 0, 0, 1e9))
      if (count > 0) characterWins[key] = count
    }
  }
  return {
    matches: Math.max(wins + losses + draws, Math.floor(number(source.matches, 0, 0, 1e9))),
    wins,
    losses,
    draws,
    arcadeClears: Math.max(0, Math.floor(number(source.arcadeClears, 0, 0, 1e9))),
    bestStreak: Math.max(0, Math.floor(number(source.bestStreak, 0, 0, 1e9))),
    currentStreak: Math.max(0, Math.floor(number(source.currentStreak, 0, 0, 1e9))),
    maxCombo: Math.max(0, Math.floor(number(source.maxCombo, 0, 0, 1e9))),
    totalHits: Math.max(0, Math.floor(number(source.totalHits, 0, 0, 1e9))),
    totalRounds: Math.max(0, Math.floor(number(source.totalRounds, 0, 0, 1e9))),
    playMs: Math.max(0, Math.floor(number(source.playMs, 0, 0, 1e12))),
    characterWins,
  }
}

export function loadSave(store: SaveStore = defaultStore()): SaveData {
  try {
    const raw = store.getItem(SAVE_KEY)
    if (!raw) return defaultSave()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return defaultSave()
    return {
      version: SAVE_VERSION,
      settings: sanitizeSettings(parsed.settings),
      stats: sanitizeStats(parsed.stats),
    }
  } catch {
    // A corrupted save must never brick the game; fall back to a clean one.
    return defaultSave()
  }
}

export function writeSave(data: SaveData, store: SaveStore = defaultStore()): void {
  try {
    store.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }))
  } catch {
    // Quota or private mode: keep playing with the in-memory copy.
  }
}

export function resetSave(store: SaveStore = defaultStore()): SaveData {
  const fresh = defaultSave()
  try {
    store.removeItem?.(SAVE_KEY)
  } catch {
    // ignore
  }
  writeSave(fresh, store)
  cached = fresh
  return fresh
}

let cached: SaveData | null = null

export function currentSave(): SaveData {
  if (!cached) cached = loadSave()
  return cached
}

export function updateSettings(patch: Partial<Settings>): SaveData {
  const save = currentSave()
  save.settings = sanitizeSettings({ ...save.settings, ...patch })
  writeSave(save)
  return save
}

export function recordMatch(result: {
  outcome: 'win' | 'loss' | 'draw'
  characterId: string
  maxCombo: number
  hits: number
  rounds: number
  durationMs: number
  arcadeClear: boolean
}): SaveData {
  const save = currentSave()
  const stats = save.stats
  stats.matches += 1
  stats.totalRounds += Math.max(0, result.rounds)
  stats.totalHits += Math.max(0, result.hits)
  stats.playMs += Math.max(0, Math.round(result.durationMs))
  stats.maxCombo = Math.max(stats.maxCombo, Math.max(0, result.maxCombo))

  if (result.outcome === 'win') {
    stats.wins += 1
    stats.currentStreak += 1
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak)
    stats.characterWins[result.characterId] = (stats.characterWins[result.characterId] ?? 0) + 1
  } else if (result.outcome === 'loss') {
    stats.losses += 1
    stats.currentStreak = 0
  } else {
    stats.draws += 1
  }

  if (result.arcadeClear) stats.arcadeClears += 1
  writeSave(save)
  return save
}

export function clearCache(): void {
  cached = null
}
