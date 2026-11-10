import { HEAVY, LIGHT } from './moves'
import { arenaById, characterById } from './roster'
import type {
  Arena,
  Box,
  Character,
  Difficulty,
  FighterState,
  InputFrame,
  MatchPhase,
  MoveDef,
  Side,
} from './types'

/*
 * Neon Rivals simulation.
 *
 * Pure TypeScript with no Phaser dependency: the scene feeds it one InputFrame
 * per 1/60s tick and it owns every rule. That keeps combat deterministic and
 * makes the "rotate the phone mid-match" promise easy to keep — when the scene
 * stops calling step(), health, positions, meters, combos and the round clock
 * simply stop with it.
 */

export const TICK_MS = 1000 / 60
export const STAGE = {
  width: 1280,
  height: 720,
  /** Fighters' feet rest here. */
  groundY: 640,
  minX: 110,
  maxX: 1170,
} as const

const GRAVITY = 2600
const JUMP_VELOCITY = -930
const PUSHBOX = 78
const INTRO_TICKS = 108
const ROUND_END_TICKS = 150
const COMBO_WINDOW = 80
const CHIP_RATIO = 0.14
const METER_MAX = 100

export interface MatchConfig {
  p1Char: string
  cpuChar: string
  difficulty: Difficulty
  rounds: 1 | 3
  roundSeconds: number
  arena: string
  seed: number
}

export function defaultMatchConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  const p1Char = overrides.p1Char ?? 'volt'
  const fallbackFoe = p1Char === 'ember' ? 'volt' : 'ember'
  return {
    p1Char,
    cpuChar: overrides.cpuChar ?? fallbackFoe,
    difficulty: overrides.difficulty ?? 'fighter',
    rounds: overrides.rounds ?? 3,
    roundSeconds: overrides.roundSeconds ?? 60,
    arena: overrides.arena ?? 'neon-district',
    seed: overrides.seed ?? 7,
  }
}

export interface AttackState {
  def: MoveDef
  ticks: number
  hit: boolean
}

export interface FighterRuntime {
  side: Side
  character: Character
  x: number
  y: number
  vx: number
  vy: number
  facing: 1 | -1
  health: number
  maxHealth: number
  meter: number
  state: FighterState
  stateTicks: number
  attack: AttackState | null
  hitstun: number
  blockstun: number
  combo: number
  comboTicks: number
  roundsWon: number
  guardHeld: boolean
  grounded: boolean
  flash: number
}

export interface Projectile {
  id: number
  owner: Side
  x: number
  y: number
  vx: number
  radius: number
  life: number
  def: MoveDef
  color: number
  spin: number
}

export type MatchEvent =
  | { type: 'hit'; x: number; y: number; damage: number; heavy: boolean; combo: number; side: Side }
  | { type: 'block'; x: number; y: number }
  | { type: 'ko'; x: number; y: number; winner: Side }
  | { type: 'special'; x: number; y: number; side: Side }
  | { type: 'clash'; x: number; y: number }
  | { type: 'round'; winner: Side | 'draw'; round: number; reason: 'ko' | 'timeout' }
  | { type: 'perfect'; side: Side }
  | { type: 'fight' }
  | { type: 'match'; winner: Side | 'draw' }

export interface MatchStats {
  p1Hits: number
  cpuHits: number
  p1MaxCombo: number
  cpuMaxCombo: number
  p1Damage: number
  cpuDamage: number
  roundsPlayed: number
  perfectRounds: number
  durationMs: number
}

export interface StepInputs {
  p1: InputFrame
  cpu: InputFrame
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function circleHitsBox(x: number, y: number, radius: number, box: Box): boolean {
  const nearestX = clamp(x, box.x, box.x + box.w)
  const nearestY = clamp(y, box.y, box.y + box.h)
  const dx = x - nearestX
  const dy = y - nearestY
  return dx * dx + dy * dy <= radius * radius
}

export function attackBox(fighter: FighterRuntime, move: MoveDef): Box {
  const { ox, oy, w, h } = move.box
  return {
    x: fighter.facing === 1 ? fighter.x + ox : fighter.x - ox - w,
    y: fighter.y - oy,
    w,
    h,
  }
}

export function hurtBox(fighter: FighterRuntime): Box {
  const height = fighter.state === 'crouch' ? 116 : 168
  return { x: fighter.x - 27, y: fighter.y - height, w: 54, h: height }
}

function createFighter(side: Side, character: Character, x: number, facing: 1 | -1): FighterRuntime {
  return {
    side,
    character,
    x,
    y: STAGE.groundY,
    vx: 0,
    vy: 0,
    facing,
    health: character.stats.health,
    maxHealth: character.stats.health,
    meter: 0,
    state: 'idle',
    stateTicks: 0,
    attack: null,
    hitstun: 0,
    blockstun: 0,
    combo: 0,
    comboTicks: 0,
    roundsWon: 0,
    guardHeld: false,
    grounded: true,
    flash: 0,
  }
}

export class MatchEngine {
  readonly config: MatchConfig
  readonly arena: Arena
  readonly p1: FighterRuntime
  readonly cpu: FighterRuntime
  phase: MatchPhase = 'intro'
  round = 1
  phaseTicks = 0
  timerTicks = 0
  matchTicks = 0
  hitstop = 0
  roundWinner: Side | 'draw' | null = null
  matchWinner: Side | 'draw' | null = null
  projectiles: Projectile[] = []
  stats: MatchStats = {
    p1Hits: 0,
    cpuHits: 0,
    p1MaxCombo: 0,
    cpuMaxCombo: 0,
    p1Damage: 0,
    cpuDamage: 0,
    roundsPlayed: 0,
    perfectRounds: 0,
    durationMs: 0,
  }

  private readonly events: MatchEvent[] = []
  private projectileId = 0

  constructor(config: MatchConfig) {
    this.config = { ...config, rounds: config.rounds === 1 ? 1 : 3 }
    this.arena = arenaById(config.arena)
    this.p1 = createFighter('p1', characterById(config.p1Char), 470, 1)
    this.cpu = createFighter('cpu', characterById(config.cpuChar), 810, -1)
    this.startRound()
  }

  get roundTicks(): number {
    return Math.round(this.config.roundSeconds * 60)
  }

  get remainingMs(): number {
    return Math.max(0, (this.roundTicks - this.timerTicks) * TICK_MS)
  }

  get elapsedMs(): number {
    return this.matchTicks * TICK_MS
  }

  get roundsToWin(): number {
    return Math.ceil(this.config.rounds / 2)
  }

  drainEvents(): MatchEvent[] {
    if (this.events.length === 0) return []
    return this.events.splice(0, this.events.length)
  }

  step(inputs: StepInputs): void {
    if (this.phase === 'matchOver') return

    if (this.hitstop > 0) {
      this.hitstop -= 1
      return
    }

    if (this.phase === 'intro') {
      this.phaseTicks += 1
      if (this.phaseTicks >= INTRO_TICKS) {
        this.phase = 'fight'
        this.phaseTicks = 0
        this.events.push({ type: 'fight' })
      }
      return
    }

    if (this.phase === 'roundOver') {
      this.phaseTicks += 1
      this.stepPassive(this.p1)
      this.stepPassive(this.cpu)
      this.stepProjectiles()
      if (this.phaseTicks >= ROUND_END_TICKS) this.finishRound()
      return
    }

    this.matchTicks += 1
    this.timerTicks += 1
    this.phaseTicks += 1

    // Guard is sampled for both fighters before either advances, so a guard
    // pressed on the exact active frame still blocks regardless of turn order.
    this.p1.guardHeld = inputs.p1.guard
    this.cpu.guardHeld = inputs.cpu.guard

    this.stepFighter(this.p1, inputs.p1, this.cpu)
    this.stepFighter(this.cpu, inputs.cpu, this.p1)
    this.separate()
    this.stepProjectiles()
    this.decayCombos()
    this.checkRoundEnd()
  }

  private startRound(): void {
    this.phase = 'intro'
    this.phaseTicks = 0
    this.timerTicks = 0
    this.hitstop = 0
    this.roundWinner = null
    this.projectiles = []
    this.resetFighter(this.p1, 470, 1)
    this.resetFighter(this.cpu, 810, -1)
  }

  private resetFighter(fighter: FighterRuntime, x: number, facing: 1 | -1): void {
    fighter.x = x
    fighter.y = STAGE.groundY
    fighter.vx = 0
    fighter.vy = 0
    fighter.facing = facing
    fighter.health = fighter.maxHealth
    fighter.state = 'idle'
    fighter.stateTicks = 0
    fighter.attack = null
    fighter.hitstun = 0
    fighter.blockstun = 0
    fighter.combo = 0
    fighter.comboTicks = 0
    fighter.guardHeld = false
    fighter.grounded = true
    fighter.flash = 0
  }

  private stepFighter(fighter: FighterRuntime, input: InputFrame, foe: FighterRuntime): void {
    fighter.stateTicks += 1
    if (fighter.flash > 0) fighter.flash -= 1

    if (fighter.state === 'ko') {
      this.physics(fighter)
      return
    }

    if (fighter.hitstun > 0) {
      fighter.hitstun -= 1
      fighter.state = 'hit'
      this.physics(fighter)
      return
    }

    if (fighter.attack) {
      this.advanceAttack(fighter, foe)
      this.physics(fighter)
      return
    }

    if (fighter.blockstun > 0) {
      fighter.blockstun -= 1
      fighter.state = 'block'
      fighter.vx *= 0.6
      this.physics(fighter)
      return
    }

    // Guard is a dedicated button and always beats an attack input on the same
    // tick; letting both fire made touch play feel random.
    if (input.guard && fighter.grounded) {
      fighter.state = 'block'
      fighter.vx = 0
      fighter.stateTicks = 0
      this.faceFoe(fighter, foe)
      return
    }

    const requested = input.special ? fighter.character.special : input.heavy ? HEAVY : input.light ? LIGHT : null
    if (requested && this.beginAttack(fighter, requested)) {
      this.physics(fighter)
      return
    }

    if (input.jump && fighter.grounded) {
      fighter.vy = JUMP_VELOCITY * fighter.character.stats.jump
      fighter.grounded = false
      fighter.state = 'jump'
      fighter.stateTicks = 0
    }

    if (fighter.grounded) {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
      if (input.crouch) {
        fighter.state = 'crouch'
        fighter.vx = 0
      } else if (dir !== 0) {
        fighter.state = 'walk'
        fighter.vx = dir * 300 * fighter.character.stats.speed
      } else {
        fighter.state = 'idle'
        fighter.vx = 0
      }
    } else {
      fighter.state = 'jump'
      if (input.left) fighter.vx -= 11
      if (input.right) fighter.vx += 11
      fighter.vx = clamp(fighter.vx, -320, 320)
    }

    this.physics(fighter)
    this.faceFoe(fighter, foe)
  }

  private stepPassive(fighter: FighterRuntime): void {
    fighter.stateTicks += 1
    if (fighter.flash > 0) fighter.flash -= 1
    this.physics(fighter)
  }

  private beginAttack(fighter: FighterRuntime, move: MoveDef): boolean {
    if (move.meterCost > fighter.meter) return false
    fighter.meter = Math.max(0, fighter.meter - move.meterCost)
    fighter.attack = { def: move, ticks: 0, hit: false }
    fighter.state = 'attack'
    fighter.stateTicks = 0
    return true
  }

  private advanceAttack(fighter: FighterRuntime, foe: FighterRuntime): void {
    const attack = fighter.attack
    if (!attack) return
    attack.ticks += 1
    const move = attack.def
    const total = move.startup + move.active + move.recovery

    if (move.projectile && attack.ticks === move.startup) {
      this.spawnProjectile(fighter, move)
    }

    if (
      !move.projectile &&
      !attack.hit &&
      attack.ticks >= move.startup &&
      attack.ticks < move.startup + move.active &&
      foe.state !== 'ko' &&
      overlaps(attackBox(fighter, move), hurtBox(foe))
    ) {
      attack.hit = true
      this.resolveHit(fighter, foe, move)
    }

    if (attack.ticks >= total) {
      fighter.attack = null
      fighter.state = fighter.grounded ? 'idle' : 'jump'
      fighter.stateTicks = 0
    }
  }

  private physics(fighter: FighterRuntime): void {
    if (!fighter.grounded) {
      fighter.vy += GRAVITY / 60
      fighter.y += fighter.vy / 60
    }
    fighter.x += fighter.vx / 60
    const friction = fighter.state === 'hit' ? 0.84 : fighter.state === 'block' ? 0.7 : 0.86
    fighter.vx *= friction

    if (fighter.y >= STAGE.groundY) {
      fighter.y = STAGE.groundY
      if (!fighter.grounded) {
        fighter.grounded = true
        fighter.vy = 0
        if (fighter.state === 'jump') {
          fighter.state = 'idle'
          fighter.stateTicks = 0
        }
      }
    }
    fighter.x = clamp(fighter.x, STAGE.minX, STAGE.maxX)
  }

  private faceFoe(fighter: FighterRuntime, foe: FighterRuntime): void {
    if (!fighter.grounded || fighter.attack || fighter.state === 'hit' || fighter.state === 'ko') return
    fighter.facing = foe.x >= fighter.x ? 1 : -1
  }

  private separate(): void {
    const dx = this.cpu.x - this.p1.x
    const distance = Math.abs(dx)
    if (distance >= PUSHBOX) return
    const direction = dx >= 0 ? 1 : -1
    const push = (PUSHBOX - distance) / 2
    this.p1.x = clamp(this.p1.x - push * direction, STAGE.minX, STAGE.maxX)
    this.cpu.x = clamp(this.cpu.x + push * direction, STAGE.minX, STAGE.maxX)
  }

  private spawnProjectile(fighter: FighterRuntime, move: MoveDef): void {
    const projectile = move.projectile
    if (!projectile) return
    this.projectiles.push({
      id: (this.projectileId += 1),
      owner: fighter.side,
      x: fighter.x + fighter.facing * 46,
      y: fighter.y - 124,
      vx: fighter.facing * projectile.speed,
      radius: projectile.radius,
      life: projectile.life,
      def: move,
      color: projectile.color ?? fighter.character.colors.accent,
      spin: 0,
    })
    this.hitstop = Math.max(this.hitstop, 2)
    this.events.push({
      type: 'special',
      x: fighter.x + fighter.facing * 46,
      y: fighter.y - 124,
      side: fighter.side,
    })
  }

  private stepProjectiles(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index]
      if (!projectile) continue
      projectile.x += projectile.vx / 60
      projectile.life -= 1
      projectile.spin += 0.35

      const target = projectile.owner === 'p1' ? this.cpu : this.p1
      const attacker = projectile.owner === 'p1' ? this.p1 : this.cpu

      if (target.state !== 'ko' && circleHitsBox(projectile.x, projectile.y, projectile.radius, hurtBox(target))) {
        this.resolveHit(attacker, target, projectile.def)
        this.projectiles.splice(index, 1)
        continue
      }

      let clashed = false
      for (let other = this.projectiles.length - 1; other >= 0; other -= 1) {
        if (other === index) continue
        const rival = this.projectiles[other]
        if (!rival || rival.owner === projectile.owner) continue
        const dx = rival.x - projectile.x
        const dy = rival.y - projectile.y
        if (Math.hypot(dx, dy) < rival.radius + projectile.radius) {
          this.events.push({ type: 'clash', x: (rival.x + projectile.x) / 2, y: (rival.y + projectile.y) / 2 })
          this.projectiles.splice(Math.max(index, other), 1)
          this.projectiles.splice(Math.min(index, other), 1)
          clashed = true
          break
        }
      }
      if (clashed) continue

      if (projectile.life <= 0 || projectile.x < 20 || projectile.x > STAGE.width - 20) {
        this.projectiles.splice(index, 1)
      }
    }
  }

  private resolveHit(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDef): void {
    if (defender.state === 'ko') return

    const power = attacker.character.stats.power
    const hitX = (attacker.x + defender.x) / 2
    const hitY = STAGE.groundY - 124
    const guarded =
      defender.guardHeld && defender.grounded && !defender.attack && defender.hitstun <= 0

    if (guarded) {
      const chip = Math.max(1, Math.round(move.damage * power * CHIP_RATIO))
      defender.health = Math.max(0, defender.health - chip)
      defender.blockstun = move.blockstun
      defender.state = 'block'
      defender.vx = attacker.facing * move.knockback * 0.4
      attacker.meter = Math.min(METER_MAX, attacker.meter + move.meterGain * 0.35)
      defender.meter = Math.min(METER_MAX, defender.meter + move.meterGain * 0.8)
      this.hitstop = Math.max(this.hitstop, 2)
      this.events.push({ type: 'block', x: hitX, y: hitY })
      return
    }

    attacker.combo = attacker.comboTicks > 0 ? attacker.combo + 1 : 1
    attacker.comboTicks = COMBO_WINDOW
    const scaling = Math.max(0.45, 1 - 0.07 * (attacker.combo - 1))
    const damage = Math.max(1, Math.round(move.damage * power * scaling))
    const before = defender.health

    defender.health = Math.max(0, defender.health - damage)
    defender.hitstun = move.hitstun
    defender.blockstun = 0
    defender.attack = null
    defender.state = 'hit'
    defender.stateTicks = 0
    defender.flash = 6
    defender.vx = attacker.facing * move.knockback
    if (move.launch > 0 && defender.grounded) {
      defender.vy = -move.launch
      defender.grounded = false
    }

    attacker.meter = Math.min(METER_MAX, attacker.meter + move.meterGain)
    defender.meter = Math.min(METER_MAX, defender.meter + move.meterGain * 0.7)
    this.hitstop = Math.max(this.hitstop, move.id === 'heavy' ? 5 : 3)

    if (attacker.side === 'p1') {
      this.stats.p1Hits += 1
      this.stats.p1Damage += damage
      this.stats.p1MaxCombo = Math.max(this.stats.p1MaxCombo, attacker.combo)
    } else {
      this.stats.cpuHits += 1
      this.stats.cpuDamage += damage
      this.stats.cpuMaxCombo = Math.max(this.stats.cpuMaxCombo, attacker.combo)
    }

    this.events.push({
      type: 'hit',
      x: hitX,
      y: hitY,
      damage,
      heavy: move.id === 'heavy',
      combo: attacker.combo,
      side: attacker.side,
    })

    if (before > 0 && defender.health <= 0) {
      defender.state = 'ko'
      defender.stateTicks = 0
      defender.hitstun = 0
      defender.blockstun = 0
      defender.attack = null
      defender.vy = -380
      defender.vx = attacker.facing * 320
      defender.grounded = false
      this.events.push({ type: 'ko', x: defender.x, y: STAGE.groundY - 80, winner: attacker.side })
    }
  }

  private decayCombos(): void {
    for (const fighter of [this.p1, this.cpu]) {
      if (fighter.comboTicks > 0) {
        fighter.comboTicks -= 1
        if (fighter.comboTicks === 0) fighter.combo = 0
      }
    }
  }

  private checkRoundEnd(): void {
    const p1Dead = this.p1.health <= 0
    const cpuDead = this.cpu.health <= 0
    if (p1Dead || cpuDead) {
      this.endRound(p1Dead && cpuDead ? 'draw' : p1Dead ? 'cpu' : 'p1', 'ko')
      return
    }
    if (this.timerTicks >= this.roundTicks) {
      const winner: Side | 'draw' =
        this.p1.health === this.cpu.health ? 'draw' : this.p1.health > this.cpu.health ? 'p1' : 'cpu'
      this.endRound(winner, 'timeout')
    }
  }

  private endRound(winner: Side | 'draw', reason: 'ko' | 'timeout'): void {
    this.roundWinner = winner
    if (winner !== 'draw') {
      const victor = winner === 'p1' ? this.p1 : this.cpu
      victor.roundsWon += 1
      if (reason === 'ko' && victor.health >= victor.maxHealth) {
        this.stats.perfectRounds += 1
        this.events.push({ type: 'perfect', side: winner })
      }
    }
    this.phase = 'roundOver'
    this.phaseTicks = 0
    this.projectiles = []
    this.stats.roundsPlayed += 1
    this.stats.durationMs = this.elapsedMs
    for (const fighter of [this.p1, this.cpu]) {
      fighter.attack = null
      fighter.guardHeld = false
    }
    this.events.push({ type: 'round', winner, round: this.round, reason })
  }

  private finishRound(): void {
    const needed = this.roundsToWin
    if (
      this.p1.roundsWon >= needed ||
      this.cpu.roundsWon >= needed ||
      this.round >= this.config.rounds
    ) {
      this.matchWinner =
        this.p1.roundsWon === this.cpu.roundsWon ? 'draw' : this.p1.roundsWon > this.cpu.roundsWon ? 'p1' : 'cpu'
      this.phase = 'matchOver'
      this.phaseTicks = 0
      this.events.push({ type: 'match', winner: this.matchWinner })
      return
    }
    this.round += 1
    this.startRound()
  }
}
