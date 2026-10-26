/**
 * Authoritative Game Launch Context and Header Visibility Rules
 *
 * Rules:
 * 1. Theme Editor / Theme Preview Fullscreen Preview:
 *    - Header remains VISIBLE in fullscreen so the user can navigate back to editor,
 *      restart, view theme title, and exit fullscreen.
 *    - The game viewport adjusts to available viewport height minus header height (no overlap/scroll).
 *
 * 2. Public Live Event URL (Paid Event):
 *    - In fullscreen mode, header is completely HIDDEN so the game occupies 100% of viewport.
 *    - No space is reserved for the hidden header.
 *    - In windowed mode, header banner is visible.
 *
 * 3. Public Live Event URL (Unpaid / unverified):
 *    - Existing payment restrictions and access control remain strictly enforced.
 *    - Unpaid events never go live and cannot be played.
 *
 * 4. Event Preview (Organizer Test Route /events/:id/preview):
 *    - Permanent preview/testing overlay header remains visible in fullscreen.
 */

export type GameLaunchContext =
  | 'theme_editor_preview'
  | 'public_live_event'
  | 'event_preview'
  | 'developer_playtest';

export interface HeaderVisibilityOptions {
  /** Explicit launch context */
  context: GameLaunchContext;
  /** Whether the game is currently displayed in fullscreen */
  isFullscreen: boolean;
  /** Authoritative event payment status from backend ('PAID', 'UNPAID', etc.) */
  paymentStatus?: string | null;
}

/**
 * Shared, centralized rule for game header visibility.
 */
export function shouldShowGameHeader(options: HeaderVisibilityOptions): boolean {
  const { context, isFullscreen } = options;

  switch (context) {
    case 'theme_editor_preview':
      // Theme editor / preview fullscreen: header is always visible
      return true;

    case 'public_live_event':
      // Public live event: hide header completely in fullscreen, show only in windowed mode
      if (isFullscreen) {
        return false;
      }
      return true;

    case 'event_preview':
      // Event preview (admin/testing): permanent testing banner remains visible
      return true;

    case 'developer_playtest':
      // Developer test runner: header remains visible
      return true;

    default:
      return !isFullscreen;
  }
}
