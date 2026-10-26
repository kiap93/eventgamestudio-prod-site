import { soundManager } from '../game/systems/SoundManager';
import { match3Sounds } from '../games/match-3/match3Sounds';
import { memorySounds } from '../games/memory-match/memorySounds';
import { reactionSounds } from '../games/reaction-time/reactionSounds';
import { GameTypeId } from '../games/types';

/**
 * Stops all audio for a specific game engine.
 * Safely handles unmounts, engine switches, and exits without affecting other games.
 */
export function stopGameAudio(gameType?: GameTypeId | string | null): void {
  if (!gameType) {
    stopAllGameAudio();
    return;
  }
  const normalized = gameType.toLowerCase().trim();
  if (normalized === 'catch-brand') {
    try {
      soundManager.stopAll();
    } catch {}
  } else if (normalized === 'match-3') {
    try {
      match3Sounds.stopAll();
    } catch {}
  } else if (normalized === 'memory-match') {
    try {
      memorySounds.stopAll();
    } catch {}
  } else if (normalized === 'reaction-tap' || normalized === 'reaction-time') {
    try {
      reactionSounds.stopAll();
    } catch {}
  } else {
    // If unrecognized game identifier, stop all to be completely safe
    stopAllGameAudio();
  }
}

/**
 * Stops all audio across all platform game engines immediately.
 * Used when navigating away from game views, closing modals, or leaving the app.
 */
export function stopAllGameAudio(): void {
  try {
    soundManager.stopAll();
  } catch {}
  try {
    match3Sounds.stopAll();
  } catch {}
  try {
    memorySounds.stopAll();
  } catch {}
  try {
    reactionSounds.stopAll();
  } catch {}
}
