/**
 * Authoritative Web Audio API Sound Synthesizer for Random Target Arcade.
 * Zero external audio dependencies, instant low-latency playback across all browsers.
 */
class RandomTargetSoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private volume: number = 0.8;
  private isMuted: boolean = false;
  private bgmIntervalId: any = null;
  private isBgmPlaying: boolean = false;
  private currentThemeId: string = 'desert-quick-draw';

  private initCtx() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);

        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.12 * this.volume;
        this.bgmGain.connect(this.masterGain);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx?.currentTime || 0);
    }
    if (this.bgmGain && !this.isMuted) {
      this.bgmGain.gain.setValueAtTime(0.12 * this.volume, this.ctx?.currentTime || 0);
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx?.currentTime || 0);
    }
  }

  public setTheme(themeId: string) {
    this.currentThemeId = themeId;
  }

  /**
   * Positive Target Hit (Bandit captured / Treasure hooked)
   */
  public playPositiveHit() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, t); // D5
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.08); // A5
    osc.frequency.exponentialRampToValueAtTime(1174.66, t + 0.18); // D6

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Negative Target Penalty (Merchant hit / Shark bit)
   */
  public playNegativeHit() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.2);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Tool Shot / Action: Pistol Gunshot or Fishing Cast
   */
  public playToolAction(type: 'pistol' | 'fishing-rod' | string = 'pistol') {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;

    if (type === 'fishing-rod') {
      // Whistle / line whirring + water splash
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.15);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.18);
    } else {
      // Snappy cartoon gun crack
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  public playGunshot() {
    this.playToolAction('pistol');
  }

  public playCastWhistle() {
    this.playToolAction('fishing-rod');
  }

  public playNegativePenalty() {
    this.playNegativeHit();
  }

  public stopAll() {
    this.stopBgm();
  }

  /**
   * Countdown warning beep for final 5 seconds
   */
  public playCountdownTick(isFinal: boolean = false) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 520, t);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * Round Game Over fanfare
   */
  public playGameOver() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A major arpeggio
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = t + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);
      gain.gain.setValueAtTime(0.3, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.22);
    });
  }

  /**
   * Starts light procedural background music loop
   */
  public startBgm() {
    if (this.isBgmPlaying || this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.bgmGain) return;

    this.isBgmPlaying = true;
    let step = 0;
    const isOcean = this.currentThemeId.includes('ocean');

    // Western pentatonic: D - F - G - A - C
    // Ocean harmonic: C - E - G - B - C
    const westernPenta = [293.66, 349.23, 392.0, 440.0, 523.25, 440.0, 392.0, 349.23];
    const oceanArp = [261.63, 329.63, 392.0, 493.88, 523.25, 392.0, 329.63, 261.63];
    const melody = isOcean ? oceanArp : westernPenta;

    this.bgmIntervalId = setInterval(() => {
      if (!this.isBgmPlaying || !this.ctx || !this.bgmGain || this.isMuted) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = isOcean ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(melody[step % melody.length], t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);

      osc.connect(gain);
      gain.connect(this.bgmGain);

      osc.start(t);
      osc.stop(t + 0.28);

      step++;
    }, 320);
  }

  public stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmIntervalId) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }

  public dispose() {
    this.stopBgm();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const randomTargetSounds = new RandomTargetSoundManager();
