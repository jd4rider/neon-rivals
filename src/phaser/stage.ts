import Phaser from 'phaser'

/*
 * Every scene is authored on a 1280x720 stage, but the canvas is sized to the
 * real viewport aspect so a phone in landscape is filled edge to edge instead
 * of showing black side bars. The extra width is "bleed": the backdrop paints
 * into it and the 1280x720 design stays centred.
 */

export const DESIGN = { width: 1280, height: 720 } as const

/** 16:9 is the narrowest stage we render; anything taller letterboxes. */
export const MIN_ASPECT = DESIGN.width / DESIGN.height
/** Wide phones and short browser windows get the stage extended, never cropped. */
export const MAX_ASPECT = 2.8

let bleed = 0

export function stageBleed(): number {
  return bleed
}

export function stageLeft(): number {
  return -bleed
}

export function stageRight(): number {
  return DESIGN.width + bleed
}

export function stageWidth(): number {
  return DESIGN.width + bleed * 2
}

export function setStageBleed(value: number): void {
  bleed = Math.max(0, Math.round(value))
}

/** Logical canvas width for a viewport: always the right aspect, never cropped. */
export function baseWidthFor(viewport: { width: number; height: number }): number {
  const aspect = viewport.width / Math.max(1, viewport.height)
  const clamped = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect))
  return Math.round(DESIGN.height * clamped)
}

/** Centres the 1280x720 design inside the (wider) stage. */
export function applyStage(scene: Phaser.Scene): void {
  const centre = (): void => {
    const camera = scene.cameras?.main
    if (camera) camera.setScroll(-bleed, 0)
  }
  centre()
  const onResize = (): void => centre()
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, onResize)
  })
}
