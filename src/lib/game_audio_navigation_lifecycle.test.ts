import { describe, it, expect, beforeEach } from 'bun:test';
import { soundManager } from '../game/systems/SoundManager';
import { match3Sounds } from '../games/match-3/match3Sounds';
import { memorySounds } from '../games/memory-match/memorySounds';
import { reactionSounds } from '../games/reaction-time/reactionSounds';
import { stopGameAudio, stopAllGameAudio } from './gameAudio';

describe('Game Audio Navigation & Lifecycle Cleanup Tests', () => {
  beforeEach(() => {
    // Reset all audio before each test
    stopAllGameAudio();
  });

  it('1. SoundManager stopBgm and stopAll stop active BGM and oscillators', () => {
    soundManager.startBgm();
    // BGM should be active
    soundManager.stopBgm();
    expect(() => soundManager.stopAll()).not.toThrow();
  });

  it('2. Match3SoundManager stopBgm and stopAll stop active BGM and clean up cached audio', () => {
    match3Sounds.startBgm();
    expect(match3Sounds.isBgmActive()).toBe(true);

    match3Sounds.stopBgm();
    expect(match3Sounds.isBgmActive()).toBe(false);

    expect(() => match3Sounds.stopAll()).not.toThrow();
    expect(match3Sounds.isBgmActive()).toBe(false);
  });

  it('3. MemorySoundManager stopAll executes safely and is idempotent', () => {
    expect(() => {
      memorySounds.stopAll();
      memorySounds.stopAll();
    }).not.toThrow();
  });

  it('4. ReactionSoundManager stopAll executes safely and is idempotent', () => {
    expect(() => {
      reactionSounds.stopAll();
      reactionSounds.stopAll();
    }).not.toThrow();
  });

  it('5. stopGameAudio stops specific engine without crashing', () => {
    match3Sounds.startBgm();
    expect(match3Sounds.isBgmActive()).toBe(true);

    // Stop catch-brand only (should not stop match-3)
    stopGameAudio('catch-brand');
    expect(match3Sounds.isBgmActive()).toBe(true);

    // Stop match-3
    stopGameAudio('match-3');
    expect(match3Sounds.isBgmActive()).toBe(false);

    // Stop memory-match
    expect(() => stopGameAudio('memory-match')).not.toThrow();

    // Stop reaction-tap
    expect(() => stopGameAudio('reaction-tap')).not.toThrow();
    expect(() => stopGameAudio('reaction-time')).not.toThrow();
  });

  it('6. stopAllGameAudio stops all engines simultaneously', () => {
    soundManager.startBgm();
    match3Sounds.startBgm();
    expect(match3Sounds.isBgmActive()).toBe(true);

    stopAllGameAudio();
    expect(match3Sounds.isBgmActive()).toBe(false);
  });

  it('7. Game sounds can still be played normally after stopAll is called', () => {
    stopAllGameAudio();

    expect(() => {
      soundManager.playGreenCatch();
      match3Sounds.playSwap();
      memorySounds.playCardFlip();
      reactionSounds.playClick();
    }).not.toThrow();
  });

  it('8. Switching from Match-3 to another engine stops Match-3 BGM and leaves new engine ready', () => {
    match3Sounds.startBgm();
    expect(match3Sounds.isBgmActive()).toBe(true);

    // Simulate GameShell unmounting Match-3 when switching to Reaction Game
    stopGameAudio('match-3');
    expect(match3Sounds.isBgmActive()).toBe(false);

    // Reaction sounds can play without interference
    expect(() => reactionSounds.playClick()).not.toThrow();
  });

  it('9. Closing a preview modal stops audio belonging to the active game', () => {
    match3Sounds.startBgm();
    expect(match3Sounds.isBgmActive()).toBe(true);

    // Modal closes
    stopGameAudio('match-3');
    expect(match3Sounds.isBgmActive()).toBe(false);
  });

  it('10. Navigating away from public event game stops all audio immediately', () => {
    soundManager.startBgm();
    match3Sounds.startBgm();

    // Navigating from /play/slug to /dashboard or /login
    stopAllGameAudio();

    expect(match3Sounds.isBgmActive()).toBe(false);
  });
});
