import { describe, expect, it } from 'vitest'
import { CpuController } from '../src/game/ai'
import { MatchEngine, defaultMatchConfig, STAGE, TICK_MS } from '../src/game/engine'
import { NO_INPUT, type InputFrame } from '../src/game/types'

const idle = (): InputFrame => ({ ...NO_INPUT })
const press = (overrides: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...overrides })

function newMatch(overrides: Partial<Parameters<typeof defaultMatchConfig>[0]> = {}): MatchEngine {
  return new MatchEngine(
    defaultMatchConfig({ p1Char: 'volt', cpuChar: 'ember', rounds: 3, roundSeconds: 60, seed: 4, ...overrides }),
  )
}

function skipIntro(engine: MatchEngine): void {
  let guard = 0
  while (engine.phase === 'intro' && guard < 400) {
    engine.step({ p1: idle(), cpu: idle() })
    guard += 1
  }
  expect(engine.phase).toBe('fight')
}

function stepIdle(engine: MatchEngine, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) engine.step({ p1: idle(), cpu: idle() })
}

describe('match setup', () => {
  it('starts each round with a full-health intro and then fights', () => {
    const engine = newMatch()
    expect(engine.round).toBe(1)
    expect(engine.phase).toBe('intro')
    expect(engine.p1.health).toBe(engine.p1.maxHealth)
    expect(engine.p1.x).toBeLessThan(engine.cpu.x)
    expect(engine.p1.facing).toBe(1)
    expect(engine.cpu.facing).toBe(-1)

    skipIntro(engine)
    expect(engine.timerTicks).toBe(0)
    expect(engine.roundTicks).toBe(3600)
    expect(engine.remainingMs).toBeCloseTo(60_000, 5)
  })

  it('applies character stats to health and keeps fighters inside the stage', () => {
    const engine = newMatch({ p1Char: 'jade', cpuChar: 'nyx' })
    expect(engine.p1.maxHealth).toBe(1200)
    expect(engine.cpu.maxHealth).toBe(900)

    skipIntro(engine)
    for (let index = 0; index < 600; index += 1) {
      engine.step({ p1: press({ left: true }), cpu: press({ right: true }) })
    }
    expect(engine.p1.x).toBeGreaterThanOrEqual(STAGE.minX)
    expect(engine.cpu.x).toBeLessThanOrEqual(STAGE.maxX)
  })
})

describe('melee combat', () => {
  it('lands a light attack on an idle opponent', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 560
    engine.cpu.x = 620

    const before = engine.cpu.health
    engine.step({ p1: press({ light: true }), cpu: idle() })
    stepIdle(engine, 10)

    expect(engine.cpu.health).toBeLessThan(before)
    expect(engine.stats.p1Hits).toBe(1)
    expect(engine.cpu.state).toBe('hit')
  })

  it('does not hit from outside its reach', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 200
    engine.cpu.x = 1100

    engine.step({ p1: press({ heavy: true }), cpu: idle() })
    stepIdle(engine, 40)
    expect(engine.stats.p1Hits).toBe(0)
    expect(engine.cpu.health).toBe(engine.cpu.maxHealth)
  })

  it('reduces damage to chip when the defender holds guard', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 560
    engine.cpu.x = 620

    const before = engine.cpu.health
    engine.step({ p1: press({ heavy: true }), cpu: press({ guard: true }) })
    for (let index = 0; index < 18; index += 1) {
      engine.step({ p1: idle(), cpu: press({ guard: true }) })
    }

    const chip = before - engine.cpu.health
    expect(chip).toBeGreaterThan(0)
    expect(chip).toBeLessThanOrEqual(3)
    expect(engine.stats.p1Hits).toBe(0)
  })

  it('builds a combo and scales later hits down', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 560
    engine.cpu.x = 620

    const damages: number[] = []
    for (let index = 0; index < 3; index += 1) {
      const before = engine.cpu.health
      engine.p1.x = 560
      engine.cpu.x = 620
      engine.step({ p1: press({ light: true }), cpu: idle() })
      for (let tick = 0; tick < 60 && engine.p1.attack; tick += 1) {
        engine.step({ p1: idle(), cpu: idle() })
      }
      damages.push(before - engine.cpu.health)
    }

    expect(damages.every((value) => value > 0)).toBe(true)
    expect(damages[0]!).toBeGreaterThan(damages[2]!)
    expect(engine.stats.p1MaxCombo).toBeGreaterThanOrEqual(3)
    expect(engine.p1.meter).toBeGreaterThan(0)
  })

  it('launches on a heavy hit and keeps the opponent airborne briefly', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 560
    engine.cpu.x = 620

    engine.step({ p1: press({ heavy: true }), cpu: idle() })
    stepIdle(engine, 12)
    expect(engine.cpu.grounded).toBe(false)
    expect(engine.cpu.y).toBeLessThan(STAGE.groundY)
  })

  it('interrupts an attack that is still winding up', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 560
    engine.cpu.x = 620

    engine.step({ p1: press({ heavy: true }), cpu: idle() })
    stepIdle(engine, 2)
    expect(engine.p1.attack).not.toBeNull()

    engine.cpu.state = 'idle'
    engine.cpu.x = 600
    engine.step({ p1: idle(), cpu: press({ light: true }) })
    stepIdle(engine, 6)
    expect(engine.p1.attack).toBeNull()
    expect(engine.p1.state).toBe('hit')
  })
})

describe('specials and meter', () => {
  it('spends meter, fires a projectile and damages the opponent', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 300
    engine.cpu.x = 1000
    engine.p1.meter = 100

    engine.step({ p1: press({ special: true }), cpu: idle() })
    expect(engine.p1.meter).toBe(70)

    let spawned = false
    for (let index = 0; index < 20; index += 1) {
      engine.step({ p1: idle(), cpu: idle() })
      if (engine.projectiles.length > 0) spawned = true
    }
    expect(spawned).toBe(true)

    const before = engine.cpu.health
    for (let index = 0; index < 160; index += 1) engine.step({ p1: idle(), cpu: idle() })
    expect(engine.cpu.health).toBeLessThan(before)
    expect(engine.projectiles.length).toBe(0)
  })

  it('refuses a special without enough meter', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.meter = 0
    engine.p1.x = 560
    engine.cpu.x = 620

    engine.step({ p1: press({ special: true }), cpu: idle() })
    expect(engine.p1.attack).toBeNull()
    expect(engine.p1.meter).toBe(0)
  })

  it('lets opposing projectiles cancel each other out', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.meter = 100
    engine.cpu.meter = 100
    engine.p1.x = 400
    engine.cpu.x = 880

    engine.step({ p1: press({ special: true }), cpu: press({ special: true }) })
    let clashed = false
    for (let index = 0; index < 90; index += 1) {
      engine.step({ p1: idle(), cpu: idle() })
      if (engine.drainEvents().some((event) => event.type === 'clash')) clashed = true
    }
    expect(clashed).toBe(true)
  })
})

describe('rounds and match flow', () => {
  it('ends the round on a KO and starts the next one', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.cpu.health = 4
    engine.p1.x = 560
    engine.cpu.x = 620

    engine.step({ p1: press({ heavy: true }), cpu: idle() })
    for (let index = 0; index < 20; index += 1) engine.step({ p1: idle(), cpu: idle() })

    expect(engine.phase).toBe('roundOver')
    expect(engine.roundWinner).toBe('p1')
    expect(engine.p1.roundsWon).toBe(1)
    expect(engine.cpu.state).toBe('ko')

    stepIdle(engine, 160)
    expect(engine.round).toBe(2)
    expect(engine.phase).toBe('intro')
    expect(engine.cpu.health).toBe(engine.cpu.maxHealth)
    expect(engine.p1.health).toBe(engine.p1.maxHealth)
  })

  it('declares a match winner after two rounds', () => {
    const engine = newMatch()
    for (let round = 0; round < 2; round += 1) {
      skipIntro(engine)
      engine.cpu.health = 2
      engine.p1.x = 560
      engine.cpu.x = 620
      engine.step({ p1: press({ heavy: true }), cpu: idle() })
      stepIdle(engine, 170)
    }
    expect(engine.phase).toBe('matchOver')
    expect(engine.matchWinner).toBe('p1')
    expect(engine.p1.roundsWon).toBe(2)
  })

  it('awards the round on time to the fighter with more health', () => {
    const engine = newMatch({ roundSeconds: 2 })
    skipIntro(engine)
    engine.cpu.health = 500
    stepIdle(engine, 130)
    expect(engine.phase).toBe('roundOver')
    expect(engine.roundWinner).toBe('p1')
  })

  it('reports a draw when time expires with equal health', () => {
    const engine = newMatch({ roundSeconds: 2 })
    skipIntro(engine)
    engine.cpu.health = engine.p1.health
    stepIdle(engine, 130)
    expect(engine.roundWinner).toBe('draw')
    expect(engine.p1.roundsWon).toBe(0)
    expect(engine.cpu.roundsWon).toBe(0)
  })

  it('flags a perfect round', () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.cpu.health = 3
    engine.p1.x = 560
    engine.cpu.x = 620
    engine.step({ p1: press({ heavy: true }), cpu: idle() })
    let perfect = false
    for (let index = 0; index < 30; index += 1) {
      engine.step({ p1: idle(), cpu: idle() })
      if (engine.drainEvents().some((event) => event.type === 'perfect')) perfect = true
    }
    expect(perfect).toBe(true)
  })
})

describe('determinism and pausing', () => {
  it('produces identical outcomes from identical inputs', () => {
    const run = (): { health: number; x: number; meter: number } => {
      const engine = newMatch({ seed: 99 })
      skipIntro(engine)
      for (let index = 0; index < 900; index += 1) {
        engine.step({
          p1: {
            ...NO_INPUT,
            right: index % 90 < 45,
            light: index % 23 === 0,
            guard: index % 120 > 100,
            jump: index % 271 === 0,
          },
          cpu: {
            ...NO_INPUT,
            left: index % 80 < 30,
            heavy: index % 61 === 0,
            special: index % 401 === 0,
          },
        })
      }
      return { health: engine.cpu.health, x: Math.round(engine.p1.x), meter: Math.round(engine.p1.meter) }
    }
    expect(run()).toEqual(run())
  })

  it('freezes every value while it is not stepped, like a rotated phone', async () => {
    const engine = newMatch()
    skipIntro(engine)
    engine.p1.x = 560
    engine.cpu.x = 620
    engine.step({ p1: press({ light: true }), cpu: idle() })
    stepIdle(engine, 5)

    const snapshot = {
      health: engine.cpu.health,
      p1x: engine.p1.x,
      cpuX: engine.cpu.x,
      timer: engine.timerTicks,
      meter: engine.p1.meter,
      round: engine.round,
      phase: engine.phase,
      combo: engine.p1.combo,
    }

    // The scene stops calling step() while the phone is turned; a real-time
    // delay must not move the simulation at all.
    await new Promise((resolve) => setTimeout(resolve, 40))

    const later = {
      health: engine.cpu.health,
      p1x: engine.p1.x,
      cpuX: engine.cpu.x,
      timer: engine.timerTicks,
      meter: engine.p1.meter,
      round: engine.round,
      phase: engine.phase,
      combo: engine.p1.combo,
    }
    expect(later).toEqual(snapshot)
  })

  it('exposes a 60 Hz clock independent of rendering', () => {
    const engine = newMatch()
    skipIntro(engine)
    stepIdle(engine, 60)
    expect(engine.elapsedMs).toBeCloseTo(1000, 0)
    expect(engine.remainingMs).toBeCloseTo(59_000, 0)
    expect(TICK_MS).toBeCloseTo(16.666, 2)
  })
})

describe('CPU opponent', () => {
  it('walks in, attacks and lands hits using only legal inputs', () => {
    const engine = newMatch({ difficulty: 'fighter' })
    const cpu = new CpuController('fighter', 3)
    skipIntro(engine)
    for (let index = 0; index < 900; index += 1) {
      engine.step({ p1: idle(), cpu: cpu.decide(engine.cpu, engine.p1) })
    }
    expect(engine.stats.cpuHits).toBeGreaterThan(0)
    expect(engine.p1.health).toBeLessThan(engine.p1.maxHealth)
  })

  it('swings from the edge of its reach instead of walking away or freezing', () => {
    const engine = newMatch()
    skipIntro(engine)
    const cpu = new CpuController('fighter', 3)
    engine.p1.x = 500
    engine.cpu.x = 617
    let attacks = 0
    let walked = 0
    for (let index = 0; index < 120; index += 1) {
      const frame = cpu.decide(engine.cpu, engine.p1)
      if (frame.light || frame.heavy || frame.special) attacks += 1
      if (frame.left || frame.right) walked += 1
    }
    expect(attacks).toBeGreaterThanOrEqual(2)
    expect(walked).toBe(0)
  })

  it('keeps applying pressure instead of stalling out of range', () => {
    const engine = newMatch({ difficulty: 'fighter' })
    const cpu = new CpuController('fighter', 3)
    skipIntro(engine)
    let attacks = 0
    for (let index = 0; index < 1800; index += 1) {
      const before = engine.cpu.attack
      engine.step({ p1: idle(), cpu: cpu.decide(engine.cpu, engine.p1) })
      if (!before && engine.cpu.attack) attacks += 1
    }
    expect(attacks).toBeGreaterThan(8)
    expect(engine.stats.cpuHits).toBeGreaterThan(2)
  })

  it('never touches the player object and never exceeds valid input', () => {
    const engine = newMatch()
    const cpu = new CpuController('master', 12)
    skipIntro(engine)
    for (let index = 0; index < 200; index += 1) {
      const frame = cpu.decide(engine.cpu, engine.p1)
      for (const value of Object.values(frame)) expect(typeof value).toBe('boolean')
      engine.step({ p1: idle(), cpu: frame })
    }
    expect(engine.phase).not.toBe('matchOver')
  })
})
