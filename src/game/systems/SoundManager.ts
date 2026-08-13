import { GameSettings } from '../../types';
import { getActiveTheme } from '../../themes';

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private isBgmPlaying: boolean = false;
  private bgmInterval?: number;
  private volume: number = 1.0;

  constructor() {
    // Lazy AudioContext initialization on first user interaction
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public applySettings(settings: GameSettings) {
    this.volume = settings.volume;
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  // Good Item Catch Sound (High Chime / Retro Pluck)
  public playGreenCatch() {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const theme = getActiveTheme();
    if (theme.sounds?.catchGood) {
      this.playAudioFile(theme.sounds.catchGood);
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.12); // C6

    gain.gain.setValueAtTime(0.3 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Bad Item Catch Sound (Thud / Buzz)
  public playOrangeCatch() {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const theme = getActiveTheme();
    if (theme.sounds?.catchBad) {
      this.playAudioFile(theme.sounds.catchBad);
      return;
    }

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    gain.gain.setValueAtTime(0.4 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  // Golden / Bonus Item Catch Sound
  public playGoldenCatch() {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const theme = getActiveTheme();
    if (theme.sounds?.catchBonus) {
      this.playAudioFile(theme.sounds.catchBonus);
      return;
    }

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      const startTime = now + idx * 0.05;
      gain.gain.setValueAtTime(0.25 * this.volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  // Game Start Fanfare
  public playStart() {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const theme = getActiveTheme();
    if (theme.sounds?.gameStart) {
      this.playAudioFile(theme.sounds.gameStart);
      return;
    }

    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'square';
      osc.frequency.value = freq;

      const startTime = now + idx * 0.08;
      gain.gain.setValueAtTime(0.2 * this.volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  // Countdown Beep
  public playCountdownBeep(isFinal: boolean = false) {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isFinal ? 'sine' : 'triangle';
    osc.frequency.value = isFinal ? 880 : 440; // A5 vs A4

    gain.gain.setValueAtTime(0.25 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.3 : 0.12));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + (isFinal ? 0.3 : 0.12));
  }

  // Game Over Jingle
  public playGameOver() {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const theme = getActiveTheme();
    if (theme.sounds?.gameOver) {
      this.playAudioFile(theme.sounds.gameOver);
      return;
    }

    const now = this.ctx.currentTime;
    const notes = [400, 350, 300, 220];
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const startTime = now + idx * 0.12;
      gain.gain.setValueAtTime(0.25 * this.volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  // Upbeat Retro Chiptune BGM Generator
  public startBgm() {
    this.initCtx();
    if (!this.ctx || !this.masterGain || this.isBgmPlaying) return;

    this.isBgmPlaying = true;
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.12 * this.volume;
    this.bgmGain.connect(this.masterGain);

    const bassLine = [130.81, 130.81, 164.81, 146.83, 130.81, 164.81, 196.0, 174.61]; // C3 E3 D3 C3 E3 G3 F3
    let noteIdx = 0;

    this.bgmInterval = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain || !this.isBgmPlaying) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.value = bassLine[noteIdx % bassLine.length];

      noteGain.gain.setValueAtTime(0.12 * this.volume, now);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(noteGain);
      noteGain.connect(this.bgmGain);

      osc.start(now);
      osc.stop(now + 0.18);

      noteIdx++;
    }, 220);
  }

  public stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = undefined;
    }
  }

  private playAudioFile(url: string) {
    try {
      const audio = new Audio(url);
      audio.volume = this.volume;
      audio.play().catch(() => {
        // Audio playback error / fallback
      });
    } catch {
      // Audio error
    }
  }
}

export const soundManager = new SoundManager();
