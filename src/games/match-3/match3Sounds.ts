/**
 * Sound Manager for Match-3 using Web Audio API synthesis.
 * Zero external audio dependencies, zero latency, works across all browsers.
 */
class Match3SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.8;
  private sfxVolume: number = 1.0;
  private bgmVolume: number = 0.8;
  private isMuted: boolean = false;
  private customAudioUrls: Record<string, string | null> = {};
  private customAudioCache: Map<string, HTMLAudioElement> = new Map();
  private currentCustomBgm: HTMLAudioElement | null = null;

  private initCtx() {
    if (typeof window === 'undefined') return;
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
    if (this.currentCustomBgm && !this.isMuted) {
      this.currentCustomBgm.volume = Math.max(0, Math.min(1, this.volume * this.bgmVolume));
    }
  }

  public setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setBgmVolume(vol: number) {
    this.bgmVolume = Math.max(0, Math.min(1, vol));
    if (this.currentCustomBgm && !this.isMuted) {
      this.currentCustomBgm.volume = Math.max(0, Math.min(1, this.volume * this.bgmVolume));
    }
    if (this.bgmGain && !this.isMuted) {
      this.bgmGain.gain.value = 0.09 * this.volume * this.bgmVolume;
    }
  }

  public getBgmVolume(): number {
    return this.bgmVolume;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx?.currentTime || 0);
    }
    if (this.currentCustomBgm) {
      if (muted) {
        this.currentCustomBgm.pause();
      } else if (this.isBgmPlaying) {
        this.currentCustomBgm.volume = Math.max(0, Math.min(1, this.volume * this.bgmVolume));
        this.currentCustomBgm.play().catch(() => {});
      }
    }
    if (muted && this.isBgmPlaying) {
      this.stopBgm();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public isBgmActive(): boolean {
    return this.isBgmPlaying;
  }

  public getEffectiveSfxVolume(): number {
    return this.volume * this.sfxVolume;
  }

  public getCustomAudioUrls(): Record<string, string | null> {
    return { ...this.customAudioUrls };
  }

  public loadThemeSounds(soundsConfig?: any) {
    if (!soundsConfig) return;
    if (soundsConfig.soundVolume !== undefined) {
      this.setVolume(Number(soundsConfig.soundVolume));
    }
    if (soundsConfig.sfxVolume !== undefined) {
      this.setSfxVolume(Number(soundsConfig.sfxVolume));
    }
    if (soundsConfig.bgmVolume !== undefined) {
      this.setBgmVolume(Number(soundsConfig.bgmVolume));
    }
    if (soundsConfig.soundEnabled !== undefined) {
      this.setMuted(!soundsConfig.soundEnabled);
    }
    if (soundsConfig.bgmEnabled === false && this.isBgmPlaying) {
      this.stopBgm();
    }

    const cleanUrl = (val: any) => (typeof val === 'string' && val.trim() !== '' ? val.trim() : null);

    this.customAudioUrls = {
      bgmUrl: cleanUrl(soundsConfig.bgmUrl) || cleanUrl(soundsConfig.m3_bgm) || null,
      swapUrl: cleanUrl(soundsConfig.swapUrl) || cleanUrl(soundsConfig.m3_swap) || null,
      matchUrl: cleanUrl(soundsConfig.matchUrl) || cleanUrl(soundsConfig.m3_match) || null,
      bombUrl: cleanUrl(soundsConfig.bombUrl) || cleanUrl(soundsConfig.m3_bomb) || null,
      specialUrl: cleanUrl(soundsConfig.specialUrl) || cleanUrl(soundsConfig.m3_special) || null,
      hazardClearUrl: cleanUrl(soundsConfig.hazardClearUrl) || cleanUrl(soundsConfig.m3_hazard) || null,
      gameOverUrl: cleanUrl(soundsConfig.gameOverUrl) || cleanUrl(soundsConfig.m3_gameover) || null,
      m3_bgm: cleanUrl(soundsConfig.bgmUrl) || cleanUrl(soundsConfig.m3_bgm) || null,
      m3_swap: cleanUrl(soundsConfig.swapUrl) || cleanUrl(soundsConfig.m3_swap) || null,
      m3_match: cleanUrl(soundsConfig.matchUrl) || cleanUrl(soundsConfig.m3_match) || null,
      m3_bomb: cleanUrl(soundsConfig.bombUrl) || cleanUrl(soundsConfig.m3_bomb) || null,
      m3_special: cleanUrl(soundsConfig.specialUrl) || cleanUrl(soundsConfig.m3_special) || null,
      m3_hazard: cleanUrl(soundsConfig.hazardClearUrl) || cleanUrl(soundsConfig.m3_hazard) || null,
      m3_gameover: cleanUrl(soundsConfig.gameOverUrl) || cleanUrl(soundsConfig.m3_gameover) || null,
    };
  }

  public setCustomSoundUrl(key: string, url: string | null) {
    this.customAudioUrls[key] = url;
  }

  private playCustomAudio(url: string, volumeScale: number = 1.0): boolean {
    if (this.isMuted || typeof window === 'undefined' || !url) return false;
    try {
      let audio = this.customAudioCache.get(url);
      if (!audio) {
        audio = new Audio(url);
        this.customAudioCache.set(url, audio);
      }
      audio.volume = Math.max(0, Math.min(1, this.volume * this.sfxVolume * volumeScale));
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  public playSwap() {
    if (this.isMuted) return;
    if (this.customAudioUrls.swapUrl && this.playCustomAudio(this.customAudioUrls.swapUrl, 0.9)) {
      return;
    }
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.08);

    gain.gain.setValueAtTime(0.2 * effVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playInvalid() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.setValueAtTime(140, now + 0.06);

    gain.gain.setValueAtTime(0.25 * effVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playMatch(combo: number = 1) {
    if (this.isMuted) return;
    if (this.customAudioUrls.matchUrl && this.playCustomAudio(this.customAudioUrls.matchUrl, 1.0)) {
      return;
    }
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const baseFreq = 480 + Math.min(8, combo) * 60;

    [baseFreq, baseFreq * 1.25, baseFreq * 1.5].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);

      gain.gain.setValueAtTime((0.15 / (idx + 1)) * effVol, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + idx * 0.03);
      osc.stop(now + idx * 0.03 + 0.18);
    });
  }

  public playRocket() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.22);

    gain.gain.setValueAtTime(0.2 * effVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playBomb() {
    if (this.isMuted) return;
    if (this.customAudioUrls.bombUrl && this.playCustomAudio(this.customAudioUrls.bombUrl, 1.0)) {
      return;
    }
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

    gain.gain.setValueAtTime(0.4 * effVol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playRocketBombWindUp() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.28);

    gain.gain.setValueAtTime(0.18 * effVol, now);
    gain.gain.linearRampToValueAtTime(0.38 * effVol, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  public playRocketBombDetonation() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    // 1. Deep sub-bass explosive punch
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(180, now);
    subOsc.frequency.exponentialRampToValueAtTime(35, now + 0.45);
    subGain.gain.setValueAtTime(0.55 * effVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.45);

    // 2. High soaring rocket sweep
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(260, now);
    sweepOsc.frequency.exponentialRampToValueAtTime(1600, now + 0.35);
    sweepGain.gain.setValueAtTime(0.3 * effVol, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(this.masterGain);
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.35);

    // 3. Mid punch crack
    const midOsc = this.ctx.createOscillator();
    const midGain = this.ctx.createGain();
    midOsc.type = 'square';
    midOsc.frequency.setValueAtTime(360, now);
    midOsc.frequency.exponentialRampToValueAtTime(80, now + 0.22);
    midGain.gain.setValueAtTime(0.25 * effVol, now);
    midGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    midOsc.connect(midGain);
    midGain.connect(this.masterGain);
    midOsc.start(now);
    midOsc.stop(now + 0.22);
  }

  public playDoubleBombWindUp() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.26);

    gain.gain.setValueAtTime(0.2 * effVol, now);
    gain.gain.linearRampToValueAtTime(0.42 * effVol, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playDoubleBombDetonation() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    // 1. Deep rumble explosion punch
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(220, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.55);
    subGain.gain.setValueAtTime(0.65 * effVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.55);

    // 2. Fiery explosive crack
    const crackOsc = this.ctx.createOscillator();
    const crackGain = this.ctx.createGain();
    crackOsc.type = 'sawtooth';
    crackOsc.frequency.setValueAtTime(420, now);
    crackOsc.frequency.exponentialRampToValueAtTime(60, now + 0.28);
    crackGain.gain.setValueAtTime(0.35 * effVol, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    crackOsc.connect(crackGain);
    crackGain.connect(this.masterGain);
    crackOsc.start(now);
    crackOsc.stop(now + 0.28);
  }

  public playDoubleRocketWindUp() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(960, now + 0.24);

    gain.gain.setValueAtTime(0.18 * effVol, now);
    gain.gain.linearRampToValueAtTime(0.35 * effVol, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playDoubleRocketFire() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    // Dual soaring rocket streams (low-to-high sweep)
    [300, 360].forEach((startFreq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startFreq, now + idx * 0.03);
      osc.frequency.exponentialRampToValueAtTime(1800, now + idx * 0.03 + 0.38);

      gain.gain.setValueAtTime(0.3 * effVol, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.38);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + idx * 0.03);
      osc.stop(now + idx * 0.03 + 0.38);
    });

    // Cross impact snap
    const impactOsc = this.ctx.createOscillator();
    const impactGain = this.ctx.createGain();
    impactOsc.type = 'triangle';
    impactOsc.frequency.setValueAtTime(450, now);
    impactOsc.frequency.exponentialRampToValueAtTime(70, now + 0.2);
    impactGain.gain.setValueAtTime(0.3 * effVol, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    impactOsc.connect(impactGain);
    impactGain.connect(this.masterGain);
    impactOsc.start(now);
    impactOsc.stop(now + 0.2);
  }

  public playColorBomb() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C major chord

    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + idx * 0.04 + 0.3);

      gain.gain.setValueAtTime(0.12 * this.volume, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.3);
    });
  }

  public playColorBombCharge() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    const rainbowFreqs = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];
    rainbowFreqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.03);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.8, now + idx * 0.03 + 0.22);

      gain.gain.setValueAtTime(0.08 * effVol, now + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.03 + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.03);
      osc.stop(now + idx * 0.03 + 0.22);
    });
  }

  public playColorBombTransform() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    const chord = [880.0, 1108.73, 1318.51, 1760.0];
    chord.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.1, now + idx * 0.02 + 0.24);

      gain.gain.setValueAtTime(0.12 * effVol, now + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.02 + 0.24);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.02);
      osc.stop(now + idx * 0.02 + 0.24);
    });
  }

  public playRainbowRocketDetonation() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    [220, 280, 340, 420].forEach((baseFreq, idx) => {
      const delay = idx * 0.06;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(1600, now + delay + 0.3);

      gain.gain.setValueAtTime(0.22 * effVol, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + delay);
      osc.stop(now + delay + 0.3);
    });

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(180, now);
    subOsc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
    subGain.gain.setValueAtTime(0.4 * effVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.35);
  }

  public playVerticalLaserStorm() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    [600, 750, 900, 1100].forEach((freq, idx) => {
      const delay = idx * 0.05;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + delay);
      osc.frequency.exponentialRampToValueAtTime(80, now + delay + 0.28);

      gain.gain.setValueAtTime(0.25 * effVol, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.28);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + delay);
      osc.stop(now + delay + 0.28);
    });

    const rumbleOsc = this.ctx.createOscillator();
    const rumbleGain = this.ctx.createGain();
    rumbleOsc.type = 'triangle';
    rumbleOsc.frequency.setValueAtTime(160, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(30, now + 0.45);
    rumbleGain.gain.setValueAtTime(0.45 * effVol, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    rumbleOsc.start(now);
    rumbleOsc.stop(now + 0.45);
  }

  public playMegaBombWindUp() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    // Prismatic gravitational buildup sweep
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.32);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35 * effVol, now + 0.28);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playMegaBombDetonation() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;

    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(260, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.65);
    subGain.gain.setValueAtTime(0.75 * effVol, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 0.65);

    [520, 380, 240].forEach((startFreq, idx) => {
      const delay = idx * 0.04;
      const crackOsc = this.ctx!.createOscillator();
      const crackGain = this.ctx!.createGain();

      crackOsc.type = 'sawtooth';
      crackOsc.frequency.setValueAtTime(startFreq, now + delay);
      crackOsc.frequency.exponentialRampToValueAtTime(40, now + delay + 0.35);

      crackGain.gain.setValueAtTime(0.35 * effVol, now + delay);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.35);

      crackOsc.connect(crackGain);
      crackGain.connect(this.masterGain!);
      crackOsc.start(now + delay);
      crackOsc.stop(now + delay + 0.35);
    });
  }

  public playShuffle() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300 + i * 80, now + i * 0.05);

      gain.gain.setValueAtTime(0.1 * this.volume, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.06);
    }
  }

  // Synthesized Match-3 BGM (Chilled Pentatonic Arpeggiator)
  private isBgmPlaying: boolean = false;
  private bgmInterval?: number;
  private bgmGain: GainNode | null = null;

  public startBgm() {
    if (this.isMuted) return;
    if (this.isBgmPlaying) return;

    this.isBgmPlaying = true;

    // Custom BGM audio track if configured
    if (this.customAudioUrls.bgmUrl && typeof window !== 'undefined') {
      try {
        const targetUrl = this.customAudioUrls.bgmUrl;
        if (!this.currentCustomBgm || this.currentCustomBgm.src !== targetUrl) {
          if (this.currentCustomBgm) {
            try { this.currentCustomBgm.pause(); } catch {}
          }
          this.currentCustomBgm = new Audio(targetUrl);
          this.currentCustomBgm.loop = true;
        }
        this.currentCustomBgm.volume = Math.max(0, Math.min(1, this.volume * this.bgmVolume));
        const playPromise = this.currentCustomBgm.play();
        if (playPromise) {
          playPromise.catch(() => {
            // Fallback to synthesized BGM if autoplay fails, ONLY if bgm is still supposed to be playing
            if (this.isBgmPlaying) {
              this.startSynthesizedBgm();
            }
          });
        }
        return;
      } catch {
        if (this.isBgmPlaying) {
          this.startSynthesizedBgm();
        }
      }
    } else if (this.currentCustomBgm) {
      try {
        this.currentCustomBgm.pause();
        this.currentCustomBgm.currentTime = 0;
      } catch {}
      this.currentCustomBgm = null;
    }

    this.startSynthesizedBgm();
  }

  private startSynthesizedBgm() {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.09 * this.volume * this.bgmVolume;
    this.bgmGain.connect(this.masterGain);

    // Pentatonic calm arcade progression (C4, D4, E4, G4, A4, C5, A4, G4)
    const melody = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0];
    let step = 0;

    this.bgmInterval = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain || !this.isBgmPlaying) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(melody[step % melody.length], now);

      noteGain.gain.setValueAtTime(0.08 * this.volume * this.bgmVolume, now);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(noteGain);
      noteGain.connect(this.bgmGain);

      osc.start(now);
      osc.stop(now + 0.16);

      step++;
    }, 240);
  }

  public stopBgm() {
    this.isBgmPlaying = false;
    if (this.currentCustomBgm) {
      try {
        this.currentCustomBgm.pause();
        this.currentCustomBgm.currentTime = 0;
      } catch {}
    }
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = undefined;
    }
    if (this.bgmGain) {
      try {
        this.bgmGain.disconnect();
      } catch {}
      this.bgmGain = null;
    }
  }

  public stopAll() {
    this.stopBgm();
    if (this.currentCustomBgm) {
      try {
        this.currentCustomBgm.pause();
        this.currentCustomBgm.currentTime = 0;
      } catch {}
      this.currentCustomBgm = null;
    }
    this.customAudioCache.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    });
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  public playHazardClear() {
    if (this.isMuted) return;
    if (this.customAudioUrls.hazardClearUrl && this.playCustomAudio(this.customAudioUrls.hazardClearUrl, 1.0)) {
      return;
    }
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(320, now + 0.14);

    gain.gain.setValueAtTime(0.18 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playCountdown(num: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freq = num === 0 ? 880 : 440;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.25 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (num === 0 ? 0.3 : 0.15));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + (num === 0 ? 0.3 : 0.15));
  }

  public playGameOver() {
    if (this.isMuted) return;
    if (this.customAudioUrls.gameOverUrl && this.playCustomAudio(this.customAudioUrls.gameOverUrl, 1.0)) {
      return;
    }
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const effVol = this.volume * this.sfxVolume;
    const now = this.ctx.currentTime;
    const notes = [330, 294, 262, 220]; // Descending notes
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.2 * effVol, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.25);
    });
  }
}

export const match3Sounds = new Match3SoundManager();
