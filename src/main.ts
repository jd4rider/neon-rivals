import Phaser from 'phaser'
import './style.css'
import { sound } from './core/audio'
import { OrientationManager } from './core/orientation'
import { BootScene } from './phaser/BootScene'
import { FightScene } from './phaser/FightScene'
import { OptionsScene } from './phaser/OptionsScene'
import { ResultsScene } from './phaser/ResultsScene'
import { SelectScene } from './phaser/SelectScene'
import { TitleScene } from './phaser/TitleScene'
import { baseWidthFor, DESIGN, setStageBleed } from './phaser/stage'

declare global {
  interface Window {
    __NEON_RIVALS__?: Phaser.Game
  }
}

// The logical stage follows the real viewport aspect (16:9 up to 2.8:1) so the
// game fills a wide phone sideways instead of sitting in a 16:9 pillarbox. The
// 1280x720 design stays centred and the extra width is drawn by the backdrop.
const initialWidth = baseWidthFor({ width: window.innerWidth, height: window.innerHeight })
setStageBleed((initialWidth - DESIGN.width) / 2)

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#05030f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: initialWidth,
    height: DESIGN.height,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    // Move + jump + attack + guard can all be held at once on a phone.
    activePointers: 6,
  },
  fps: { target: 60, forceSetTimeOut: false, smoothStep: false },
  scene: [BootScene, TitleScene, SelectScene, FightScene, ResultsScene, OptionsScene],
}

export const game = new Phaser.Game(config)
window.__NEON_RIVALS__ = game

// The landscape gate is created outside Phaser so it can cover the canvas,
// including when the game is embedded in the Little Joy Arcade iframe.
const orientation = new OrientationManager(window)
OrientationManager.current = orientation
orientation.start()

function refreshController(): void {
  try {
    const pads = navigator.getGamepads?.() ?? []
    const pad = Array.from(pads).find((candidate) => candidate?.connected)
    game.registry.set('controllerLabel', pad?.id ?? undefined)
  } catch {
    game.registry.set('controllerLabel', undefined)
  }
}

window.addEventListener('gamepadconnected', refreshController)
window.addEventListener('gamepaddisconnected', refreshController)
refreshController()

// Phaser's FIT scale manager usually reacts to resize on its own, but a few
// embedded/mobile browsers report the new viewport a beat late after rotation.
// Refreshing once after the change keeps the 16:9 stage filling the landscape
// screen instead of staying at the old portrait size.
let refreshTimer: number | null = null
const refreshScale = (): void => {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    const width = baseWidthFor({ width: window.innerWidth, height: window.innerHeight })
    setStageBleed((width - DESIGN.width) / 2)
    if (game.scale.gameSize.width !== width || game.scale.gameSize.height !== DESIGN.height) {
      game.scale.setGameSize(width, DESIGN.height)
    }
    game.scale.refresh()
  }, 80)
}
window.addEventListener('resize', refreshScale, { passive: true })
window.addEventListener('orientationchange', refreshScale)
window.visualViewport?.addEventListener('resize', refreshScale, { passive: true })

// Browsers require a gesture before audio may start; unlock once, quietly.
document.addEventListener('pointerdown', () => sound.unlock(), { once: true, capture: true })
document.addEventListener('keydown', () => sound.unlock(), { once: true, capture: true })

// Stop iOS Safari from rubber-banding the page while playing.
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1) return
    const target = event.target as HTMLElement | null
    if (target && target.tagName === 'CANVAS') event.preventDefault()
  },
  { passive: false },
)
