import { describe, it, expect } from 'bun:test';
import { match3Sounds } from './match3Sounds';

describe('Match-3 Audio Engine Tests', () => {
  it('correctly sets and retrieves master and sfx volume', () => {
    match3Sounds.setVolume(0.7);
    match3Sounds.setSfxVolume(0.5);
    expect(match3Sounds.getVolume()).toBe(0.7);
    expect(match3Sounds.getSfxVolume()).toBe(0.5);
    expect(Math.round(match3Sounds.getEffectiveSfxVolume() * 100) / 100).toBe(0.35);
  });

  it('correctly sets and retrieves mute state', () => {
    match3Sounds.setMuted(true);
    expect(match3Sounds.getMuted()).toBe(true);
    match3Sounds.setMuted(false);
    expect(match3Sounds.getMuted()).toBe(false);
  });

  it('loads theme sounds configuration with custom URLs and volumes', () => {
    match3Sounds.loadThemeSounds({
      soundVolume: 0.6,
      sfxVolume: 0.8,
      bgmVolume: 0.4,
      soundEnabled: true,
      bgmEnabled: true,
      swapUrl: 'https://cdn.example.com/custom-swap.mp3',
      matchUrl: 'https://cdn.example.com/custom-match.mp3',
      bombUrl: 'https://cdn.example.com/custom-bomb.mp3',
    });

    expect(match3Sounds.getVolume()).toBe(0.6);
    expect(match3Sounds.getSfxVolume()).toBe(0.8);
    expect(match3Sounds.getBgmVolume()).toBe(0.4);

    const urls = match3Sounds.getCustomAudioUrls();
    expect(urls['m3_swap']).toBe('https://cdn.example.com/custom-swap.mp3');
    expect(urls['m3_match']).toBe('https://cdn.example.com/custom-match.mp3');
    expect(urls['m3_bomb']).toBe('https://cdn.example.com/custom-bomb.mp3');
  });

  it('synthesizers run without throwing when muted or unmuted', () => {
    expect(() => {
      match3Sounds.playSwap();
      match3Sounds.playMatch(1);
      match3Sounds.playBomb();
      match3Sounds.playRocket();
      match3Sounds.playColorBomb();
      match3Sounds.playHazardClear();
      match3Sounds.playGameOver();
      match3Sounds.playShuffle();
      match3Sounds.playInvalid();
    }).not.toThrow();
  });
});
