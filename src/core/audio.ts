/*
 * Neon Rivals' audio is synthesised with the Web Audio API: no files to
 * download, no licences to track, and the sound design can react to the fight.
 * The AudioContext is only created after a player gesture, so browser autoplay
 * rules are respected.
 */

export type MusicMode = 'menu' | 'fight' | 'results'

interface Pattern {
  step: number
  bass: number[]
  lead: number[]
  drums: boolean
}

const PATTERNS: Record<MusicMode, Pattern> = {
  menu: {
    step: 220,
    bass: [110, 130.81, 146.83, 130.81, 98, 116.54, 130.81, 116.54],
    lead: [440, 523.25, 659.25, 523.25, 392, 466.16, 523.25, 466.16],
    drums: false,
  },
  fight: {
    step: 160,
    bass: [110, 110, 146.83, 146.83, 130.81, 130.81, 164.81, 146.83],
    lead: [440, 587.33, 659.25, 587.33, 523.25, 659.25, 783.99, 659.25],
    drums: true,
  },
  results: {
    step: 190,
    bass: [130.81, 164.81, 196, 164.81, 146.83, 174.61, 196, 174.61],
    lead: [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 783.99, 698.46],
    drums: false,
  },
}

class SoundEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private timer: number | null = null
  private mode: MusicMode = 'menu'
  private stepIndex = 0
  private wanted: MusicMode | null = null
  private sfxVolume = 0.8
  private musicVolume = 0.45
  private muted = false

  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume()
      return
    }
    const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined
    if (!Ctor) return
    this.context = new Ctor()
    this.master = this.context.createGain()
    this.master.connect(this.context.destination)
    this.sfxBus = this.context.createGain()
    this.sfxBus.connect(this.master)
    this.musicBus = this.context.createGain()
    this.musicBus.connect(this.master)
    this.applyVolumes()
    if (this.wanted) {
      const mode = this.wanted
      this.wanted = null
      this.startMusic(mode)
    }
  }

  setVolumes(sfxVolume: number, musicVolume: number, muted: boolean): void {
    this.sfxVolume = sfxVolume
    this.musicVolume = musicVolume
    this.muted = muted
    this.applyVolumes()
  }

  startMusic(mode: MusicMode): void {
    this.mode = mode
    this.stepIndex = 0
    if (!this.context) {
      this.wanted = mode
      return
    }
    this.stopTimer()
    this.timer = window.setInterval(() => this.musicTick(), PATTERNS[mode].step)
    this.musicTick()
  }

  stopMusic(): void {
    this.wanted = null
    this.stopTimer()
  }

  click(): void {
    this.tone(520, 0.055, 'square', 0.1, this.sfxBus, 720)
  }

  select(): void {
    this.tone(560, 0.07, 'triangle', 0.12, this.sfxBus, 840)
    this.tone(840, 0.08, 'triangle', 0.06, this.sfxBus, 1120)
  }

  whoosh(): void {
    this.noise(0.11, 0.12, 1400, 'highpass')
  }

  hit(heavy = false): void {
    if (heavy) {
      this.noise(0.16, 0.42, 700, 'bandpass')
      this.tone(140, 0.16, 'sine', 0.32, this.sfxBus, 62)
      this.tone(72, 0.22, 'triangle', 0.2, this.sfxBus, 48)
    } else {
      this.noise(0.09, 0.28, 1500, 'bandpass')
      this.tone(220, 0.09, 'square', 0.14, this.sfxBus, 110)
    }
  }

  block(): void {
    this.noise(0.07, 0.2, 2800, 'bandpass')
    this.tone(360, 0.06, 'square', 0.1, this.sfxBus, 300)
  }

  special(): void {
    this.tone(180, 0.26, 'sawtooth', 0.14, this.sfxBus, 640)
    this.noise(0.2, 0.12, 900, 'bandpass')
  }

  clash(): void {
    this.tone(880, 0.18, 'square', 0.12, this.sfxBus, 220)
    this.noise(0.16, 0.24, 2400, 'bandpass')
  }

  ko(): void {
    this.tone(200, 0.7, 'sawtooth', 0.24, this.sfxBus, 55)
    this.noise(0.5, 0.3, 500, 'lowpass')
  }

  round(): void {
    this.tone(392, 0.1, 'square', 0.12, this.sfxBus)
    this.tone(587.33, 0.16, 'square', 0.11, this.sfxBus)
  }

  fight(): void {
    this.tone(587.33, 0.09, 'square', 0.13, this.sfxBus)
    this.tone(880, 0.22, 'square', 0.12, this.sfxBus)
  }

  tick(): void {
    this.tone(880, 0.05, 'triangle', 0.07, this.sfxBus)
  }

  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((note, index) => this.tone(note, 0.18, 'square', 0.11, this.sfxBus, undefined, index * 0.11))
  }

  lose(): void {
    const notes = [392, 349.23, 293.66, 220]
    notes.forEach((note, index) => this.tone(note, 0.26, 'triangle', 0.13, this.sfxBus, undefined, index * 0.14))
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
  }

  private applyVolumes(): void {
    if (!this.master || !this.sfxBus || !this.musicBus) return
    const master = this.muted ? 0 : 0.9
    this.master.gain.value = master
    this.sfxBus.gain.value = this.sfxVolume * 0.8
    this.musicBus.gain.value = this.musicVolume * 0.24
  }

  private musicTick(): void {
    const pattern = PATTERNS[this.mode]
    if (!pattern || !this.context || !this.musicBus) return
    const index = this.stepIndex % pattern.bass.length
    this.stepIndex += 1

    const bass = pattern.bass[index]
    if (bass) this.tone(bass, 0.2, 'triangle', 0.5, this.musicBus)

    const lead = pattern.lead[index]
    if (lead) this.tone(lead, 0.12, 'square', 0.12, this.musicBus)

    if (pattern.drums && index % 2 === 0) {
      this.tone(150, 0.08, 'sine', 0.5, this.musicBus, 48)
    }
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    bus: GainNode | null,
    slideTo?: number,
    delay = 0,
  ): void {
    const context = this.context
    if (!context || !bus) return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope)
    envelope.connect(bus)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.03)
  }

  private noise(duration: number, gain: number, frequency: number, type: BiquadFilterType): void {
    const context = this.context
    if (!context || !this.sfxBus) return
    if (!this.noiseBuffer) {
      const length = Math.floor(context.sampleRate * 0.4)
      const buffer = context.createBuffer(1, length, context.sampleRate)
      const data = buffer.getChannelData(0)
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    }
    const source = context.createBufferSource()
    source.buffer = this.noiseBuffer
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = 0.9
    const envelope = context.createGain()
    const start = context.currentTime
    envelope.gain.setValueAtTime(Math.max(0.0002, gain), start)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(this.sfxBus)
    source.start(start)
    source.stop(start + duration + 0.02)
  }
}

export const sound = new SoundEngine()
