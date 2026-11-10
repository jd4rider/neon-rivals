import Phaser from 'phaser'
import type { AttackState } from '../game/engine'
import type { Character, FighterState } from '../game/types'
import { darken } from './ui'

/** Everything the view needs; both the live engine and idle previews fit it. */
export interface FighterPose {
  character: Character
  x: number
  y: number
  facing: 1 | -1
  state: FighterState
  stateTicks: number
  attack: AttackState | null
  health: number
  maxHealth: number
  meter: number
  grounded: boolean
  flash: number
}

/*
 * A fighter is drawn from primitives every frame rather than from a sprite
 * sheet: rounded neon limbs, a visored head, a glowing chest core and a stance
 * that reflects the simulation state. That keeps the download tiny and lets
 * the pose react to exact startup/active/recovery ticks.
 */
export class FighterView {
  readonly container: Phaser.GameObjects.Container
  private readonly graphics: Phaser.GameObjects.Graphics
  private readonly baseScale: number

  constructor(scene: Phaser.Scene, character: Character, scale = 1) {
    this.baseScale = scale
    this.container = scene.add.container(0, 0)
    this.graphics = scene.add.graphics()
    this.container.add(this.graphics)
  }

  setDepth(depth: number): void {
    this.container.setDepth(depth)
  }

  update(pose: FighterPose, time: number): void {
    const g = this.graphics
    const colors = pose.character.colors
    const flash = pose.flash > 0
    const primary = flash ? 0xffffff : colors.primary
    const secondary = flash ? 0xf2f8ff : colors.secondary
    const accent = flash ? 0xffffff : colors.accent
    const skin = flash ? 0xffffff : colors.skin
    const hair = flash ? 0xffffff : colors.hair
    const glow = flash ? 0xffffff : colors.glow

    const crouch = pose.state === 'crouch'
    const body = crouch ? 0.72 : 1
    const airborne = !pose.grounded
    const walkPhase = Math.sin(time / 78)
    const stride = pose.state === 'walk' ? walkPhase * 13 : 0
    const bob = pose.state === 'idle' ? Math.sin(time / 320) * 2 : 0

    const koProgress = pose.state === 'ko' ? Math.min(1, pose.stateTicks / 26) : 0
    this.container.setPosition(pose.x, pose.y)
    this.container.setScale(pose.facing * this.baseScale, this.baseScale)
    this.container.setAngle(-78 * koProgress)
    this.container.setAlpha(pose.state === 'ko' ? 0.92 : 1)

    g.clear()

    // Ground shadow shrinks as the fighter leaves the floor.
    g.fillStyle(0x000000, airborne ? 0.16 : 0.34)
    g.fillEllipse(0, 4, airborne ? 62 : 98, airborne ? 11 : 18)

    // Meter-full aura.
    if (pose.meter >= 100 && pose.state !== 'ko') {
      const pulse = 0.45 + Math.sin(time / 170) * 0.2
      g.lineStyle(2.5, glow, 0.3 * pulse)
      g.strokeEllipse(0, -66 * body, 96, 156 * body)
      g.lineStyle(1.5, accent, 0.22 * pulse)
      g.strokeEllipse(0, -66 * body, 112, 174 * body)
    }

    const hipY = -56 * body + bob
    const shoulderY = -106 * body + bob
    const headY = -134 * body + bob

    // Back leg.
    const backFootX = airborne ? -18 : -16 - stride
    const backFootY = airborne ? -16 : 0
    this.limb(g, -12, hipY, backFootX, backFootY, 15, secondary, 7, darken(primary, 0.15))

    // Back arm.
    const backHandX = -26 + (pose.state === 'walk' ? -stride * 0.5 : 0)
    this.limb(g, -18, shoulderY + 6, backHandX, shoulderY + 44, 13, secondary, 6, skin)

    // Torso.
    g.fillStyle(secondary, 1)
    g.fillRoundedRect(-28, shoulderY - 8, 56, Math.abs(hipY - shoulderY) + 22, 17)
    g.fillStyle(primary, 1)
    g.fillRoundedRect(-23, shoulderY - 3, 46, Math.abs(hipY - shoulderY) + 10, 14)
    g.fillStyle(0xffffff, 0.14)
    g.fillRoundedRect(-18, shoulderY, 20, 16, 7)

    // Chest core.
    const corePulse = 0.55 + Math.sin(time / 240) * 0.18
    g.fillStyle(glow, 0.28 * corePulse)
    g.fillCircle(0, shoulderY + 22, 15)
    g.fillStyle(accent, 0.95)
    g.fillCircle(0, shoulderY + 22, 6)
    g.fillStyle(0xffffff, 0.75)
    g.fillCircle(-1, shoulderY + 20, 2.4)

    // Character silhouette details.
    this.detail(g, pose, primary, secondary, accent, hair, shoulderY, headY, time)

    // Front leg.
    const frontFootX = airborne ? 20 : 14 + stride
    const frontFootY = airborne ? -22 : 0
    this.limb(g, 10, hipY, frontFootX, frontFootY, 16, primary, 8, darken(primary, 0.08))

    // Front arm and the punch arc.
    const punch = this.punchAmount(pose.attack)
    const specialWind = pose.attack?.def.projectile ? Math.max(0, punch - 0.55) : 0
    const handX = 18 + punch * 58 - specialWind * 10
    const handY = shoulderY + 12 + punch * 6
    this.limb(g, 16, shoulderY + 8, handX, handY + 18 - punch * 10, 15, primary, 8, skin)

    // Energy at the fist when charging a special.
    if (specialWind > 0.02) {
      g.fillStyle(glow, 0.32 * specialWind)
      g.fillCircle(handX + 6, handY + 6, 20 + specialWind * 12)
      g.fillStyle(accent, 0.9 * specialWind)
      g.fillCircle(handX + 6, handY + 6, 7 + specialWind * 4)
    }

    // Head, visor, hair.
    g.fillStyle(secondary, 1)
    g.fillCircle(0, headY, 20)
    g.fillStyle(skin, 1)
    g.fillCircle(0, headY, 17)
    g.fillStyle(hair, 1)
    g.fillRoundedRect(-17, headY - 19, 34, 12, 6)
    g.fillStyle(accent, 1)
    g.fillRoundedRect(-14, headY - 4, 28, 8, 4)
    g.fillStyle(0xffffff, 0.8)
    g.fillRoundedRect(-12, headY - 3, 8, 3, 2)

    // Guard bubble.
    if (pose.state === 'block') {
      const guardPulse = 0.55 + Math.sin(time / 120) * 0.12
      g.lineStyle(4, accent, 0.65 * guardPulse)
      g.beginPath()
      g.arc(20, -84 * body, 54, -1.15, 1.15)
      g.strokePath()
      g.lineStyle(10, accent, 0.1 * guardPulse)
      g.beginPath()
      g.arc(20, -84 * body, 54, -1.15, 1.15)
      g.strokePath()
      g.fillStyle(accent, 0.06)
      g.fillCircle(26, -84 * body, 58)
    }

    // Emblem colour ticks on the belt.
    g.fillStyle(accent, 0.9)
    g.fillRoundedRect(-24, hipY - 6, 48, 5, 2.5)
  }

  private punchAmount(attack: AttackState | null): number {
    if (!attack) return 0
    const { def, ticks } = attack
    if (ticks < def.startup) return 0.18 + 0.5 * (ticks / Math.max(1, def.startup))
    if (ticks < def.startup + def.active) return 1
    const recoveryTick = ticks - def.startup - def.active
    return Math.max(0, 1 - recoveryTick / Math.max(1, def.recovery))
  }

  private limb(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    outer: number,
    innerWidth: number,
    inner: number,
  ): void {
    g.lineStyle(width + 4, 0x000000, 0.24)
    g.lineBetween(x1, y1 + 2, x2, y2 + 2)
    g.lineStyle(width, outer, 1)
    g.lineBetween(x1, y1, x2, y2)
    g.lineStyle(innerWidth, inner, 1)
    g.lineBetween(x1, y1, x2, y2)
  }

  private detail(
    g: Phaser.GameObjects.Graphics,
    pose: FighterPose,
    primary: number,
    secondary: number,
    accent: number,
    hair: number,
    shoulderY: number,
    headY: number,
    time: number,
  ): void {
    const id = pose.character.id
    const sway = Math.sin(time / 260) * 3
    if (id === 'volt') {
      // Antennae and a chest bolt.
      g.lineStyle(3, accent, 0.9)
      g.lineBetween(-10, headY - 17, -16, headY - 30)
      g.lineBetween(8, headY - 17, 16, headY - 28)
      g.fillStyle(accent, 0.9)
      g.fillTriangle(2, shoulderY + 10, 12, shoulderY + 26, 1, shoulderY + 26)
      g.fillTriangle(1, shoulderY + 22, -10, shoulderY + 36, 1, shoulderY + 36)
    } else if (id === 'ember') {
      // Flame crest and shoulder plates.
      g.fillStyle(accent, 0.85)
      g.fillTriangle(-10, headY - 16, 0, headY - 36, 8, headY - 16)
      g.fillStyle(0xff4d1a, 0.8)
      g.fillTriangle(-3, headY - 17, 4, headY - 30, 10, headY - 17)
      g.fillStyle(secondary, 1)
      g.fillRoundedRect(-34, shoulderY - 4, 18, 14, 6)
      g.fillRoundedRect(16, shoulderY - 4, 18, 14, 6)
    } else if (id === 'nyx') {
      // Trailing scarf.
      g.fillStyle(accent, 0.55)
      g.fillRoundedRect(-54 + sway, shoulderY + 2, 44, 9, 4)
      g.fillStyle(accent, 0.3)
      g.fillRoundedRect(-72 + sway * 1.6, shoulderY + 12, 40, 7, 3)
      g.fillStyle(hair, 1)
      g.fillTriangle(-16, headY - 14, -34 + sway, headY - 4, -14, headY + 4)
    } else {
      // Jade's heavy pauldrons and belt plate.
      g.fillStyle(secondary, 1)
      g.fillRoundedRect(-38, shoulderY - 8, 22, 20, 8)
      g.fillRoundedRect(16, shoulderY - 8, 22, 20, 8)
      g.fillStyle(accent, 0.55)
      g.fillRoundedRect(-36, shoulderY - 5, 16, 4, 2)
      g.fillRoundedRect(20, shoulderY - 5, 16, 4, 2)
      g.fillStyle(primary, 0.5)
      g.fillRoundedRect(-18, shoulderY + 44, 36, 12, 5)
    }

    // Universal sleeve trim in the character's accent.
    g.lineStyle(3, accent, 0.5)
    g.lineBetween(-18, shoulderY + 10, -14, shoulderY + 16)
    g.lineBetween(16, shoulderY + 10, 20, shoulderY + 16)
  }

  destroy(): void {
    this.container.destroy(true)
  }
}

export function idlePose(character: Character, x = 0, y = 0, facing: 1 | -1 = 1): FighterPose {
  return {
    character,
    x,
    y,
    facing,
    state: 'idle',
    stateTicks: 0,
    attack: null,
    health: character.stats.health,
    maxHealth: character.stats.health,
    meter: 0,
    grounded: true,
    flash: 0,
  }
}
