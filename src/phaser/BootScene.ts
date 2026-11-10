import Phaser from 'phaser'
import { sound } from '../core/audio'
import { currentSave } from '../core/saves'

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot')
  }

  create(): void {
    this.makeSpark()
    this.makeGlow()
    this.makeShard()

    const save = currentSave()
    sound.setVolumes(save.settings.sfxVolume, save.settings.musicVolume, save.settings.muted)

    this.scene.start('Title')
  }

  private makeSpark(): void {
    if (this.textures.exists('spark')) return
    const graphics = this.make.graphics({ x: 0, y: 0 }, false)
    graphics.fillStyle(0xffffff, 0.35)
    graphics.fillCircle(9, 9, 9)
    graphics.fillStyle(0xffffff, 1)
    graphics.fillCircle(9, 9, 5)
    graphics.generateTexture('spark', 18, 18)
    graphics.destroy()
  }

  private makeGlow(): void {
    if (this.textures.exists('glow')) return
    const graphics = this.make.graphics({ x: 0, y: 0 }, false)
    graphics.fillStyle(0xffffff, 0.08)
    graphics.fillCircle(64, 64, 64)
    graphics.fillStyle(0xffffff, 0.14)
    graphics.fillCircle(64, 64, 44)
    graphics.fillStyle(0xffffff, 0.26)
    graphics.fillCircle(64, 64, 26)
    graphics.fillStyle(0xffffff, 0.6)
    graphics.fillCircle(64, 64, 13)
    graphics.fillStyle(0xffffff, 1)
    graphics.fillCircle(64, 64, 6)
    graphics.generateTexture('glow', 128, 128)
    graphics.destroy()
  }

  private makeShard(): void {
    if (this.textures.exists('shard')) return
    const graphics = this.make.graphics({ x: 0, y: 0 }, false)
    graphics.fillStyle(0xffffff, 1)
    graphics.fillTriangle(10, 0, 20, 10, 10, 20)
    graphics.fillTriangle(10, 0, 0, 10, 10, 20)
    graphics.generateTexture('shard', 20, 20)
    graphics.destroy()
  }
}
