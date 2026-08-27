/**
 * Sound Manager for Memory Match game using Web Audio API synthesis.
 * Zero external audio file dependencies, instant playback and crystal clear audio.
 */
class MemorySoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.8;
  private isMuted: boolean = false;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
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
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx?.currentTime || 0);
    }
  }

  /**
   * Crisp tactile card flip sound (light swoosh + click)
   */
  public playCardFlip() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;

    // Subtle noise burst for card texture
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.25 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Harmonious match success sound (ascending chime arpeggio)
   */
  public playMatchSuccess(streak: number = 1) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const baseFreq = streak > 1 ? 587.33 : 523.25; // D5 for streak, C5 normal
    const notes = [baseFreq, baseFreq * 1.2599, baseFreq * 1.4983, baseFreq * 2]; // Major arpeggio

    notes.forEach((freq, i) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.3 * this.volume, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.28);
    });
  }

  /**
   * Gentle mismatch tone (two soft descending low buzzes)
   */
  public playMismatch() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);

    gain.gain.setValueAtTime(0.2 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Celebratory Victory Fanfare
   */
  public playVictory() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const notes = [
      { freq: 523.25, time: 0, dur: 0.15 }, // C5
      { freq: 659.25, time: 0.15, dur: 0.15 }, // E5
      { freq: 783.99, time: 0.3, dur: 0.15 }, // G5
      { freq: 1046.5, time: 0.45, dur: 0.45 }, // C6
      { freq: 1318.51, time: 0.9, dur: 0.6 }, // E6
    ];

    notes.forEach(({ freq, time, dur }) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0.35 * this.volume, now + time);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + time);
      osc.stop(now + time + dur);
    });
  }

  /**
   * Countdown tick
   */
  public playTick(isLast: boolean = false) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isLast ? 880 : 440, now);

    gain.gain.setValueAtTime(0.2 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Button click feedback
   */
  public playButtonClick() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);

    gain.gain.setValueAtTime(0.2 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.05);
  }
}

export const memorySounds = new MemorySoundManager();
