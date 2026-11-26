import { useEffect, useState } from 'react';

type Listener = (enabled: boolean) => void;

export interface SoundConfig {
  soundUrl: string;
  soundVolume: number;
  sfxVolume: number;
}

/**
 * Fallback lokal di folder `public/audio/` jika belum ada audio yang diunggah di Studio Admin.
 */
export const CUSTOM_TRACK_CANDIDATES = [
  '/audio/bgm.mp3',
  '/audio/bgm.ogg',
  '/audio/bgm.wav',
  '/audio/music.mp3',
];

const clampVolume = (value: number | undefined, fallback = 80) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;

const INTERACTIVE_CLICK_SELECTOR =
  'button:not(.sound-toggle):not(.mobile-sound-toggle):not(.mobile-sound-drawer-toggle):not(.badge-tilt), a, [role="tab"]';
const INTERACTIVE_HOVER_SELECTOR =
  '.nav-link, .project-card, .framework-item, .button, .service-heading, .project-filters button';

class SoundEngine {
  private enabled = false;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientStarted = false;
  private suspendTimer: number | null = null;
  private listeners = new Set<Listener>();
  private lastHoverTime = 0;
  private lastHoveredNode: Element | null = null;
  private delegatesBound = false;

  // Dynamic sound & volume configuration (synced from Studio Admin / API content)
  private configuredUrl = '';
  private soundVolume = 80;
  private sfxVolume = 80;

  // BGM track state
  private trackUrl: string | null | undefined = undefined;
  private trackLookup: Promise<string | null> | null = null;
  private bgmAudio: HTMLAudioElement | null = null;
  private volumeRaf = 0;

  isEnabled() {
    return this.enabled;
  }

  getConfig(): SoundConfig {
    return {
      soundUrl: this.configuredUrl,
      soundVolume: this.soundVolume,
      sfxVolume: this.sfxVolume,
    };
  }

  private bgmTargetVolume(): number {
    return clampVolume(this.soundVolume, 80) / 100;
  }

  private masterTargetGain(): number {
    return clampVolume(this.sfxVolume, 80) / 100;
  }

  configure(next: Partial<SoundConfig>) {
    const nextUrl =
      next.soundUrl !== undefined
        ? typeof next.soundUrl === 'string'
          ? next.soundUrl.trim()
          : ''
        : this.configuredUrl;
    const urlChanged = nextUrl !== this.configuredUrl;
    if (urlChanged) {
      this.configuredUrl = nextUrl;
      this.trackUrl = undefined;
      this.trackLookup = null;
      this.disposeBgmAudio();
    }

    if (next.soundVolume !== undefined) {
      const vol = clampVolume(next.soundVolume, this.soundVolume);
      if (vol !== this.soundVolume) {
        this.soundVolume = vol;
        if (this.enabled && this.bgmAudio && !urlChanged) {
          const target = this.bgmTargetVolume();
          if (target > 0 && this.bgmAudio.paused) {
            void this.bgmAudio
              .play()
              .then(() => {
                if (this.enabled) this.fadeBgmVolume(this.bgmTargetVolume(), 180);
              })
              .catch(() => {});
          } else {
            this.fadeBgmVolume(target, 120);
          }
        }
      }
    }

    if (next.sfxVolume !== undefined) {
      const sfx = clampVolume(next.sfxVolume, this.sfxVolume);
      if (sfx !== this.sfxVolume) {
        this.sfxVolume = sfx;
        if (this.enabled && this.ctx && this.masterGain) {
          const now = this.ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
          this.masterGain.gain.linearRampToValueAtTime(this.masterTargetGain(), now + 0.08);
        }
      }
    }

    if (urlChanged && this.enabled) {
      void this.startCustomTrackIfPresent().then((hasCustomTrack) => {
        if (!this.enabled) return;
        this.setAmbientLevel(hasCustomTrack ? 0 : 1, 0.35);
      });
    }
  }

  private disposeBgmAudio() {
    if (this.volumeRaf) {
      cancelAnimationFrame(this.volumeRaf);
      this.volumeRaf = 0;
    }
    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.removeAttribute('src');
      this.bgmAudio = null;
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.enabled));
  }

  private async resolveCustomTrack(): Promise<string | null> {
    if (this.configuredUrl) {
      this.trackUrl = this.configuredUrl;
      return this.configuredUrl;
    }
    if (this.trackUrl !== undefined) return this.trackUrl;
    if (this.trackLookup) return this.trackLookup;

    this.trackLookup = (async () => {
      for (const candidate of CUSTOM_TRACK_CANDIDATES) {
        try {
          const response = await fetch(candidate, { method: 'HEAD' });
          const contentType = response.headers.get('content-type') || '';
          if (
            response.ok &&
            (contentType.startsWith('audio/') ||
              contentType === 'application/ogg' ||
              contentType === 'application/octet-stream')
          ) {
            this.trackUrl = candidate;
            return candidate;
          }
        } catch {
          // Ignore network probe error and fall back to next candidate or built-in synth pad.
        }
      }
      this.trackUrl = null;
      return null;
    })();

    return this.trackLookup;
  }

  private fadeBgmVolume(target: number, durationMs: number, pauseOnZero = false) {
    if (!this.bgmAudio) return;
    if (this.volumeRaf) cancelAnimationFrame(this.volumeRaf);

    const audio = this.bgmAudio;
    const clampedTarget = Math.max(0, Math.min(1, target));
    const start = audio.volume;
    const delta = clampedTarget - start;
    if (Math.abs(delta) < 0.005) {
      audio.volume = clampedTarget;
      if (pauseOnZero && clampedTarget === 0) audio.pause();
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      audio.volume = Math.max(0, Math.min(1, start + delta * eased));
      if (progress < 1) {
        this.volumeRaf = requestAnimationFrame(step);
      } else {
        this.volumeRaf = 0;
        if (pauseOnZero && clampedTarget === 0) audio.pause();
      }
    };
    this.volumeRaf = requestAnimationFrame(step);
  }

  private async startCustomTrackIfPresent(): Promise<boolean> {
    const url = await this.resolveCustomTrack();
    if (!url || !this.enabled) return false;

    if (!this.bgmAudio) {
      const audio = new Audio(url);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      this.bgmAudio = audio;
    }

    try {
      await this.bgmAudio.play();
      if (!this.enabled) {
        this.bgmAudio.pause();
        return false;
      }
      this.fadeBgmVolume(this.bgmTargetVolume(), 650);
      return true;
    } catch {
      return false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      compressor.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(compressor);

      this.ctx = ctx;
      this.masterGain = master;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private startAmbient(ctx: AudioContext) {
    if (this.ambientStarted || !this.masterGain) return;
    this.ambientStarted = true;

    const ambientGain = ctx.createGain();
    ambientGain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 440;
    filter.Q.value = 0.7;

    filter.connect(ambientGain);
    ambientGain.connect(this.masterGain);

    const voices: Array<[number, OscillatorType, number]> = [
      [110, 'sine', 0.06],
      [164.81, 'sine', 0.04],
      [220, 'triangle', 0.02],
    ];

    voices.forEach(([freq, type, level], idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = idx === 1 ? 3 : idx === 2 ? -4 : 0;
      gain.gain.value = level;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
    });

    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    lfoDepth.gain.value = 150;
    lfo.connect(lfoDepth);
    lfoDepth.connect(filter.frequency);
    lfo.start();

    this.ambientGain = ambientGain;
  }

  private setAmbientLevel(level: number, durationSec: number) {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
    this.ambientGain.gain.linearRampToValueAtTime(level, now + durationSec);
  }

  private bindDelegates() {
    if (this.delegatesBound || typeof document === 'undefined') return;
    this.delegatesBound = true;

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.enabled || event.button !== 0) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (target.closest('.badge-tilt')) return;
        if (target.closest(INTERACTIVE_CLICK_SELECTOR)) {
          this.playClick();
        }
      },
      { passive: true },
    );

    document.addEventListener(
      'pointerover',
      (event) => {
        if (!this.enabled || event.pointerType !== 'mouse') return;
        const target = event.target as HTMLElement | null;
        const interactive = target?.closest(INTERACTIVE_HOVER_SELECTOR) || null;
        if (!interactive) {
          this.lastHoveredNode = null;
          return;
        }
        if (interactive === this.lastHoveredNode) return;
        this.lastHoveredNode = interactive;
        this.playHover();
      },
      { passive: true },
    );
  }

  toggle(): boolean {
    if (this.suspendTimer !== null) {
      window.clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }

    const next = !this.enabled;
    this.enabled = next;

    const ctx = this.ensureContext();
    if (ctx && this.masterGain) {
      const now = ctx.currentTime;
      if (next) {
        this.bindDelegates();
        this.startAmbient(ctx);
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
        this.masterGain.gain.linearRampToValueAtTime(this.masterTargetGain(), now + 0.18);

        if (this.sfxVolume > 0) this.playToggleChime(true);
        void this.startCustomTrackIfPresent().then((hasCustomTrack) => {
          if (!this.enabled) return;
          if (hasCustomTrack) {
            this.setAmbientLevel(0, 0.35);
          } else {
            this.setAmbientLevel(1, 0.75);
          }
        });
      } else {
        if (this.sfxVolume > 0) this.playToggleChime(false);
        this.fadeBgmVolume(0, 220, true);
        this.setAmbientLevel(0, 0.14);
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.linearRampToValueAtTime(0, now + 0.18);

        this.suspendTimer = window.setTimeout(() => {
          if (!this.enabled && this.ctx?.state === 'running') {
            void this.ctx.suspend().catch(() => {});
          }
          this.suspendTimer = null;
        }, 240);
      }
    } else if (!next) {
      this.fadeBgmVolume(0, 220, true);
    }

    this.notify();
    return next;
  }

  stop() {
    if (!this.enabled) return;
    this.toggle();
  }

  previewEffect(volumePercent = this.sfxVolume) {
    if (this.suspendTimer !== null) {
      window.clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const level = clampVolume(volumePercent, 80) / 100;
    const now = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(level, now);
    this.playToggleChime(true);
    if (!this.enabled) {
      this.suspendTimer = window.setTimeout(() => {
        if (!this.enabled && this.masterGain && this.ctx) {
          const endNow = this.ctx.currentTime;
          this.masterGain.gain.cancelScheduledValues(endNow);
          this.masterGain.gain.setValueAtTime(0, endNow);
          if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
        }
        this.suspendTimer = null;
      }, 480);
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    gainPeak: number,
    type: OscillatorType = 'sine',
    delay = 0,
  ) {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playToggleChime(on: boolean) {
    if (!this.ctx || !this.masterGain) return;
    if (on) {
      this.playTone(587.33, 587.33, 0.24, 0.14, 'sine', 0);
      this.playTone(880, 880, 0.34, 0.12, 'triangle', 0.065);
    } else {
      this.playTone(523.25, 392, 0.14, 0.1, 'sine', 0);
    }
  }

  playClick() {
    if (!this.enabled || !this.ctx || !this.masterGain || this.sfxVolume <= 0) return;
    this.playTone(760, 480, 0.048, 0.13, 'sine');
    this.playTone(1480, 1120, 0.026, 0.05, 'triangle');
  }

  playHover() {
    if (!this.enabled || !this.ctx || !this.masterGain || this.sfxVolume <= 0) return;
    const nowMs = performance.now();
    if (nowMs - this.lastHoverTime < 85) return;
    this.lastHoverTime = nowMs;
    this.playTone(1160, 1280, 0.024, 0.042, 'sine');
  }

  playGrab() {
    if (!this.enabled || !this.ctx || !this.masterGain || this.sfxVolume <= 0) return;
    this.playTone(360, 540, 0.055, 0.12, 'triangle');
    this.playTone(1040, 1240, 0.035, 0.055, 'sine', 0.01);
  }

  playRelease() {
    if (!this.enabled || !this.ctx || !this.masterGain || this.sfxVolume <= 0) return;
    this.playTone(520, 320, 0.11, 0.1, 'sine');
    this.playTone(780, 620, 0.07, 0.045, 'triangle', 0.025);
  }

  playMorph(toAlternate: boolean) {
    if (!this.enabled || !this.ctx || !this.masterGain || this.sfxVolume <= 0) return;
    if (toAlternate) {
      this.playTone(280, 640, 0.22, 0.11, 'sine');
      this.playTone(560, 920, 0.18, 0.06, 'triangle', 0.04);
    } else {
      this.playTone(620, 300, 0.18, 0.1, 'sine');
    }
  }
}

export const soundEngine = new SoundEngine();

export function useSoundEnabled(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(() => soundEngine.isEnabled());
  useEffect(() => soundEngine.subscribe(setEnabled), []);
  return [enabled, () => soundEngine.toggle()];
}
