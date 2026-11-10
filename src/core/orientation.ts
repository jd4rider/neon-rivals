/*
 * Landscape gate.
 *
 * The rule is deliberately simple and physical: a touch device whose viewport
 * is taller than it is wide cannot play. Desktop windows are never blocked —
 * the 16:9 stage simply letterboxes — because forcing a monitor rotation would
 * be hostile. Orientation locking is a bonus, never a requirement: if the
 * browser refuses the request the gate still works from the real viewport size.
 */

export interface Viewport {
  width: number
  height: number
}

export function shouldBlockLandscape(viewport: Viewport, coarsePointer: boolean): boolean {
  if (!coarsePointer) return false
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return false
  if (viewport.width <= 0 || viewport.height <= 0) return false
  return viewport.height > viewport.width
}

export function isCoarsePointer(win: Window): boolean {
  try {
    return win.matchMedia?.('(pointer: coarse)')?.matches ?? false
  } catch {
    return false
  }
}

export type OrientationPhase = 'allowed' | 'blocked'

export interface OrientationCallbacks {
  onBlocked?: () => void
  onUnblocked?: () => void
}

export class OrientationManager {
  /** The live manager, so scenes can query blocked state without prop drilling. */
  static current: OrientationManager | null = null

  private readonly win: Window
  private readonly doc: Document
  private readonly callbacks: OrientationCallbacks
  private gate: HTMLElement | null = null
  private hint: HTMLElement | null = null
  private fullscreenButton: HTMLButtonElement | null = null
  private blocked = false
  private started = false
  private listeners: Array<() => void> = []
  private media: MediaQueryList | null = null

  constructor(win: Window, callbacks: OrientationCallbacks = {}) {
    this.win = win
    this.doc = win.document
    this.callbacks = callbacks
  }

  get isBlocked(): boolean {
    return this.blocked
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.gate = this.doc.getElementById('rotate-gate')
    this.hint = this.doc.getElementById('rotate-gate-hint')
    this.fullscreenButton = this.doc.getElementById('rotate-gate-fullscreen') as HTMLButtonElement | null

    if (this.fullscreenButton) {
      if (!this.supportsFullscreen()) {
        this.fullscreenButton.hidden = true
      } else {
        const request = (): void => {
          void this.requestLandscapeFullscreen()
        }
        this.fullscreenButton.addEventListener('click', request)
        this.listeners.push(() => this.fullscreenButton?.removeEventListener('click', request))
      }
    }

    const apply = (): void => this.apply()
    const orientation = (): void => this.apply()

    this.win.addEventListener('resize', apply, { passive: true })
    this.win.addEventListener('orientationchange', orientation)
    this.win.visualViewport?.addEventListener('resize', apply, { passive: true })
    this.doc.addEventListener('fullscreenchange', apply)
    this.doc.addEventListener('visibilitychange', apply)

    try {
      this.media = this.win.matchMedia('(orientation: portrait)')
      if (this.media.addEventListener) {
        this.media.addEventListener('change', apply)
        this.listeners.push(() => this.media?.removeEventListener('change', apply))
      }
    } catch {
      this.media = null
    }

    this.listeners.push(() => this.win.removeEventListener('resize', apply))
    this.listeners.push(() => this.win.removeEventListener('orientationchange', orientation))
    this.listeners.push(() => this.win.visualViewport?.removeEventListener('resize', apply))
    this.listeners.push(() => this.doc.removeEventListener('fullscreenchange', apply))
    this.listeners.push(() => this.doc.removeEventListener('visibilitychange', apply))

    this.apply(true)
  }

  destroy(): void {
    for (const remove of this.listeners) remove()
    this.listeners = []
    this.started = false
  }

  /** Applies the gate immediately; returns true when playback is blocked. */
  refresh(): boolean {
    this.apply()
    return this.blocked
  }

  supportsFullscreen(): boolean {
    return typeof this.doc.documentElement.requestFullscreen === 'function'
  }

  /**
   * Best-effort fullscreen + landscape lock. Both calls are allowed to fail:
   * in an iframe without the right allow attributes, on iOS Safari, or when the
   * operating system has rotation locked. Failure returns false, never throws.
   */
  async requestLandscapeFullscreen(): Promise<boolean> {
    let fullscreen = false
    try {
      if (!this.doc.fullscreenElement && this.supportsFullscreen()) {
        await this.doc.documentElement.requestFullscreen({ navigationUI: 'hide' })
        fullscreen = true
      }
    } catch {
      fullscreen = false
    }

    let locked = false
    try {
      const orientation = (this.win.screen as unknown as {
        orientation?: { lock?: (mode: string) => Promise<void> }
      })?.orientation
      if (orientation?.lock) {
        await orientation.lock('landscape')
        locked = true
      }
    } catch {
      locked = false
    }

    this.apply()
    return fullscreen || locked
  }

  private apply(force = false): void {
    const blocked = shouldBlockLandscape(
      { width: this.win.innerWidth, height: this.win.innerHeight },
      isCoarsePointer(this.win),
    )
    if (!force && blocked === this.blocked) return
    const wasBlocked = this.blocked
    this.blocked = blocked

    this.gate?.classList.toggle('is-visible', blocked)
    this.gate?.setAttribute('aria-hidden', String(!blocked))
    this.doc.documentElement.classList.toggle('nr-portrait-blocked', blocked)

    if (this.hint) {
      const canLock = Boolean(
        (this.win.screen as unknown as { orientation?: { lock?: unknown } })?.orientation?.lock,
      )
      this.hint.textContent = canLock
        ? 'Hold your phone sideways. If the screen will not turn, enable automatic screen rotation in your device settings.'
        : 'Hold your phone sideways, or turn on automatic screen rotation in your device settings.'
    }

    if (blocked && !wasBlocked) {
      this.callbacks.onBlocked?.()
      this.win.dispatchEvent(new CustomEvent<OrientationPhase>('neon:orientation', { detail: 'blocked' }))
    } else if (!blocked && wasBlocked) {
      this.callbacks.onUnblocked?.()
      this.win.dispatchEvent(new CustomEvent<OrientationPhase>('neon:orientation', { detail: 'allowed' }))
    } else if (force && !blocked) {
      this.callbacks.onUnblocked?.()
    }
  }
}
