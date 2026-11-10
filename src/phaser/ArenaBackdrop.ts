import Phaser from 'phaser'
import { STAGE } from '../game/engine'
import { mulberry32 } from '../game/random'
import type { Arena } from '../game/types'
import { display, label } from './ui'

interface Building {
  x: number
  width: number
  height: number
  hue: number
  lights: Array<{ x: number; y: number; height: number; on: number }>
  sign: { x: number; y: number; width: number; height: number } | null
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/*
 * A 1280x720 parallax backdrop per arena: gradient sky, layered skyline with
 * lit windows, neon signage, a perspective floor grid and drifting motes.
 * Everything is drawn from primitives so there are no background textures to
 * download and the palette follows the arena data.
 */
export class ArenaBackdrop {
  readonly container: Phaser.GameObjects.Container
  private readonly scene: Phaser.Scene
  private readonly arena: Arena
  private readonly buildings: Building[]
  private readonly floor: Phaser.GameObjects.Graphics
  private readonly flicker: Phaser.GameObjects.Graphics
  private readonly traffic: Phaser.GameObjects.Container
  private readonly random: () => number

  constructor(scene: Phaser.Scene, arena: Arena) {
    this.scene = scene
    this.arena = arena
    this.container = scene.add.container(0, 0).setDepth(0)
    this.random = mulberry32(hash(arena.id))

    const sky = scene.add.graphics()
    this.paintSky(sky)
    this.container.add(sky)

    const skyline = scene.add.graphics()
    this.buildings = this.makeBuildings()
    this.paintSkyline(skyline)
    this.container.add(skyline)

    this.traffic = scene.add.container(0, 0)
    this.buildTraffic()
    this.container.add(this.traffic)

    this.floor = scene.add.graphics()
    this.container.add(this.floor)

    this.flicker = scene.add.graphics()
    this.container.add(this.flicker)

    this.buildAtmosphere()
    this.paintFrame()
  }

  private paintSky(g: Phaser.GameObjects.Graphics): void {
    const arena = this.arena
    g.fillStyle(arena.skyBottom, 1)
    g.fillRect(0, 0, STAGE.width, STAGE.height)
    g.fillGradientStyle(arena.skyTop, arena.skyTop, arena.skyBottom, arena.skyBottom, 1)
    g.fillRect(0, 0, STAGE.width, STAGE.groundY + 10)

    // Horizon bloom.
    g.fillStyle(arena.accent, 0.07)
    g.fillEllipse(STAGE.width / 2, STAGE.groundY - 40, STAGE.width * 1.2, 300)
    g.fillStyle(arena.accent2, 0.05)
    g.fillEllipse(STAGE.width * 0.22, STAGE.groundY - 10, 560, 220)

    if (arena.style === 'circuit') {
      g.fillStyle(arena.accent2, 0.16)
      g.fillCircle(1040, 170, 92)
      g.fillStyle(0xffe4b0, 0.22)
      g.fillCircle(1040, 170, 64)
      g.lineStyle(1.5, arena.accent, 0.18)
      for (let ring = 1; ring <= 3; ring += 1) g.strokeCircle(1040, 170, 70 + ring * 32)
    } else if (arena.style === 'reactor') {
      g.fillStyle(arena.accent, 0.14)
      g.fillEllipse(640, STAGE.groundY, 900, 260)
      for (let column = 0; column < 5; column += 1) {
        const x = 220 + column * 210
        g.fillStyle(0x061a18, 0.9)
        g.fillRoundedRect(x - 34, 180, 68, STAGE.groundY - 180, 10)
        g.fillStyle(arena.accent, 0.2)
        g.fillRoundedRect(x - 12, 210, 24, STAGE.groundY - 240, 8)
      }
    } else {
      // Moon behind the district.
      g.fillStyle(0xf7f0ff, 0.12)
      g.fillCircle(392, 168, 118)
      g.fillStyle(0xd9c8ff, 0.5)
      g.fillCircle(392, 168, 66)
      g.fillStyle(arena.skyTop, 0.75)
      g.fillCircle(420, 150, 60)
    }

    // Stars.
    g.fillStyle(0xffffff, 0.5)
    for (let index = 0; index < 46; index += 1) {
      const x = this.random() * STAGE.width
      const y = this.random() * 300
      const radius = this.random() < 0.2 ? 1.7 : 1
      g.fillCircle(x, y, radius)
    }
  }

  private makeBuildings(): Building[] {
    const arena = this.arena
    const buildings: Building[] = []
    let x = -30
    while (x < STAGE.width + 40) {
      const width = 52 + this.random() * 84
      const height = 110 + this.random() * 250
      const lights: Building['lights'] = []
      const columns = Math.max(2, Math.floor(width / 20))
      const rows = Math.max(3, Math.floor(height / 34))
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows; row += 1) {
          if (this.random() < 0.42) continue
          lights.push({
            x: 8 + column * 18,
            y: 16 + row * 28,
            height: 8,
            on: this.random(),
          })
        }
      }
      buildings.push({
        x,
        width,
        height,
        hue: this.random() < 0.5 ? arena.accent : arena.accent2,
        lights,
        sign: this.random() < 0.28 ? { x: 10, y: 24, width: width - 20, height: 10 } : null,
      })
      x += width + 8 + this.random() * 22
    }
    return buildings
  }

  private paintSkyline(g: Phaser.GameObjects.Graphics): void {
    for (const building of this.buildings) {
      const top = STAGE.groundY - building.height
      g.fillStyle(0x080614, 1)
      g.fillRect(building.x, top, building.width, building.height)
      g.fillStyle(0x0d0b22, 1)
      g.fillRect(building.x + 3, top + 3, building.width - 6, building.height - 3)

      g.fillStyle(building.hue, 0.45)
      for (const light of building.lights) {
        g.fillRect(building.x + light.x, top + light.y, 10, light.height)
      }

      if (building.sign) {
        g.fillStyle(building.hue, 0.55)
        g.fillRoundedRect(building.x + building.sign.x, top + building.sign.y, building.sign.width, building.sign.height, 4)
      }

      // Rooftop aerial.
      if (building.height > 250) {
        g.lineStyle(2, 0x1b1436, 1)
        g.lineBetween(building.x + building.width / 2, top, building.x + building.width / 2, top - 26)
        g.fillStyle(building.hue, 0.6)
        g.fillCircle(building.x + building.width / 2, top - 28, 3)
      }
    }

    // Haze at the base of the skyline.
    g.fillGradientStyle(0x05030f, 0x05030f, this.arena.skyTop, this.arena.skyTop, 1)
    g.fillRect(0, STAGE.groundY - 110, STAGE.width, 110)
    g.fillStyle(0x05030f, 0.35)
    g.fillRect(0, STAGE.groundY - 110, STAGE.width, 110)
  }

  private buildTraffic(): void {
    if (this.arena.style !== 'circuit') return
    for (let index = 0; index < 7; index += 1) {
      const x = this.random() * STAGE.width
      const y = 90 + this.random() * 200
      const streak = this.scene.add.graphics()
      const color = index % 2 === 0 ? this.arena.accent : this.arena.accent2
      streak.lineStyle(2, color, 0.7)
      streak.lineBetween(0, 0, 44, 0)
      streak.fillStyle(color, 0.95)
      streak.fillCircle(44, 0, 3)
      const car = this.scene.add.container(x, y, [streak])
      car.setAlpha(0.5 + this.random() * 0.3)
      this.scene.tweens.add({
        targets: car,
        x: x + 320 + this.random() * 260,
        duration: 5200 + this.random() * 4200,
        repeat: -1,
        delay: this.random() * 2600,
        onRepeat: () => {
          car.x = -80 - this.random() * 200
        },
        ease: 'Linear',
      })
      this.traffic.add(car)
    }
  }

  private buildAtmosphere(): void {
    const accent = this.arena.accent
    for (let index = 0; index < 16; index += 1) {
      const size = 1.4 + this.random() * 2.6
      const mote = this.scene.add.circle(this.random() * STAGE.width, 200 + this.random() * 430, size, accent, 0.35)
      mote.setBlendMode(Phaser.BlendModes.ADD)
      this.container.add(mote)
      this.scene.tweens.add({
        targets: mote,
        y: mote.y - 120 - this.random() * 140,
        x: mote.x + (this.random() - 0.5) * 90,
        alpha: { from: 0.05, to: 0.4 },
        duration: 5200 + this.random() * 5200,
        repeat: -1,
        yoyo: true,
        delay: this.random() * 3000,
        ease: 'Sine.InOut',
      })
    }

    if (this.arena.style === 'district') {
      const sign = display(this.scene, 180, 250, 'NIGHT MARKET', 20, '#ff8fd0')
      sign.setAlpha(0.4).setAngle(-90).setLetterSpacing(6)
      this.container.add(sign)
      this.scene.tweens.add({ targets: sign, alpha: { from: 0.16, to: 0.5 }, duration: 1600, yoyo: true, repeat: -1 })
    } else if (this.arena.style === 'reactor') {
      const sign = label(this.scene, 640, 150, 'REACTOR 07', 16, '#9fffe0', {
        origin: 0.5,
        fontStyle: 'bold',
        letterSpacing: 8,
      })
      sign.setAlpha(0.45)
      this.container.add(sign)
    }
  }

  private paintFrame(): void {
    const g = this.scene.add.graphics().setDepth(60)
    g.fillStyle(0x05030f, 0.55)
    g.fillRect(0, STAGE.groundY - 2, STAGE.width, 3)
    g.lineStyle(2, this.arena.accent, 0.22)
    g.lineBetween(0, STAGE.groundY - 2, STAGE.width, STAGE.groundY - 2)

    // Vignette.
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.42, 0, 0, 0)
    g.fillRect(0, 0, STAGE.width, 150)
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.5, 0.5)
    g.fillRect(0, STAGE.height - 110, STAGE.width, 110)
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.35, 0, 0.35, 0)
    g.fillRect(0, 0, 120, STAGE.height)
    g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.35, 0, 0.35)
    g.fillRect(STAGE.width - 120, 0, 120, STAGE.height)

    // Scanlines, very faint.
    g.lineStyle(1, 0xffffff, 0.016)
    for (let y = 0; y < STAGE.height; y += 4) g.lineBetween(0, y, STAGE.width, y)
    this.container.add(g)
  }

  update(time: number): void {
    const arena = this.arena
    const g = this.floor
    g.clear()

    g.fillStyle(arena.floor, 1)
    g.fillRect(0, STAGE.groundY, STAGE.width, STAGE.height - STAGE.groundY)
    g.fillGradientStyle(arena.accent, arena.accent, arena.floor, arena.floor, 0.14, 0.14, 0.9, 0.9)
    g.fillRect(0, STAGE.groundY, STAGE.width, STAGE.height - STAGE.groundY)

    // Reflection of the horizon.
    g.fillStyle(arena.accent2, 0.08)
    g.fillEllipse(STAGE.width / 2, STAGE.groundY + 34, 760, 78)

    // Perspective grid.
    const vanishX = STAGE.width / 2
    g.lineStyle(1.5, arena.accent, 0.14)
    for (let column = -10; column <= 10; column += 1) {
      g.lineBetween(vanishX + column * 32, STAGE.groundY, vanishX + column * 118, STAGE.height)
    }
    const scroll = (time / 26) % 44
    for (let row = 0; row < 5; row += 1) {
      const t = (row * 44 + scroll) / (5 * 44)
      const y = STAGE.groundY + Math.pow(t, 1.7) * (STAGE.height - STAGE.groundY)
      g.lineStyle(1.5, arena.accent, 0.08 + t * 0.14)
      g.lineBetween(0, y, STAGE.width, y)
    }

    // Flickering windows and signs on a quantised clock, so it stays cheap.
    const tick = Math.floor(time / 260)
    const fg = this.flicker
    fg.clear()
    fg.fillStyle(arena.accent, 0.5)
    for (let index = 0; index < this.buildings.length; index += 1) {
      const building = this.buildings[index]
      if (!building) continue
      const seed = (index * 97 + tick * 13) % 31
      if (seed > 3) continue
      const top = STAGE.groundY - building.height
      const light = building.lights[seed % Math.max(1, building.lights.length)]
      if (!light) continue
      fg.fillStyle(building.hue, 0.7)
      fg.fillRect(building.x + light.x, top + light.y, 10, light.height)
    }
  }

  destroy(): void {
    this.container.destroy(true)
  }
}
