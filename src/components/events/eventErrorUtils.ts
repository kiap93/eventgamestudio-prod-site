/**
 * Event Error Utilities
 *
 * Translates server-side and client-side error codes and messages into
 * human-readable, actionable guidance for EventGameStudio users.
 */

export function formatEventErrorMessage(errData: any, statusCode?: number): string {
  if (!errData && !statusCode) {
    return 'An unexpected error occurred. Please check your inputs and try again.';
  }

  const code = String(errData?.code || '').toUpperCase();
  const rawMsg = String(errData?.error || errData?.message || '').trim();
  const lowerMsg = rawMsg.toLowerCase();

  // 1. No Pricing Tier Configured for Duration
  if (
    code === 'NO_PRICING_TIER' ||
    code === 'UNSUPPORTED_DURATION' ||
    code === 'DURATION_NOT_SUPPORTED' ||
    lowerMsg.includes('no pricing tier') ||
    lowerMsg.includes('unsupported duration')
  ) {
    return rawMsg || "No pricing is configured for this duration for the selected game. Please select a duration supported by the game's pricing tiers or contact the administrator.";
  }

  // 2. Invalid Date Range (End date earlier than start date)
  if (
    code === 'INVALID_DATE_RANGE' ||
    lowerMsg.includes('earlier than start date') ||
    lowerMsg.includes('cannot be earlier than start date') ||
    lowerMsg.includes('invalid date range')
  ) {
    return 'The event end date cannot be earlier than the start date. Please select a valid date range.';
  }

  // 3. Event Date Passed
  if (
    code === 'EVENT_DATE_PASSED' ||
    lowerMsg.includes('event date has already passed') ||
    lowerMsg.includes('date has already passed')
  ) {
    return 'This event date has already passed. Please select a current or future event date.';
  }

  // 4. Missing or Unconfigured Game Pricing
  if (
    code === 'NO_ACTIVE_GAME_PRICING' ||
    code === 'INVALID_GAME_PRICING' ||
    code === 'MISSING_GAME_PRICING' ||
    lowerMsg.includes('no active pricing') ||
    lowerMsg.includes('pricing tiers configured') ||
    lowerMsg.includes('pricing service temporarily unavailable') ||
    lowerMsg.includes('unable to resolve a valid authoritative price')
  ) {
    return 'Pricing is not currently configured for this game. Please contact support or select another game.';
  }

  // 5. Unavailable / Inactive Game
  if (
    code === 'GAME_INACTIVE' ||
    code === 'GAME_NOT_ACTIVE' ||
    lowerMsg.includes('game is currently inactive') ||
    lowerMsg.includes('game is inactive')
  ) {
    return 'This game is currently inactive or unavailable. Please choose another game.';
  }

  if (
    code === 'GAME_NOT_FOUND' ||
    lowerMsg.includes('game was not found') ||
    lowerMsg.includes('game not found')
  ) {
    return 'The selected game could not be found. Please refresh and select an active game.';
  }

  // 7. Theme Setup Required
  if (
    code === 'THEME_SETUP_REQUIRED' ||
    errData?.theme_setup_required === true ||
    lowerMsg.includes('theme setup is required') ||
    lowerMsg.includes('theme setup required')
  ) {
    return 'THEME_SETUP_REQUIRED: Theme setup is required before creating an event. Please customize and save your organization theme first.';
  }

  // 8. Theme Mismatch
  if (
    code === 'THEME_GAME_MISMATCH' ||
    lowerMsg.includes('does not belong to the chosen game') ||
    lowerMsg.includes('theme game mismatch')
  ) {
    return 'The chosen theme does not match the selected game engine. Please reselect your theme.';
  }

  // 9. Theme Permission / System Theme Restriction
  if (
    code === 'THEME_FORBIDDEN' ||
    code === 'SYSTEM_THEME_NOT_ALLOWED' ||
    lowerMsg.includes('only organization themes') ||
    lowerMsg.includes('theme belongs to another organization')
  ) {
    return 'Only custom themes created by your organization can be used for events. System themes cannot be used directly.';
  }

  if (
    code === 'THEME_NOT_FOUND' ||
    lowerMsg.includes('theme not found') ||
    lowerMsg.includes('theme was not found')
  ) {
    return 'The selected theme was not found. Please choose another theme.';
  }

  // 10. Pending Event Limit (max 2 unpaid events)
  if (
    code === 'PENDING_EVENT_LIMIT_REACHED' ||
    lowerMsg.includes('maximum 2 pending') ||
    lowerMsg.includes('pending payment events reached')
  ) {
    return 'You have reached the maximum allowed limit of 2 unpaid events. Please pay for or delete an existing pending event before creating a new one.';
  }

  // 11. Insufficient Wallet Balance
  if (
    code === 'INSUFFICIENT_BALANCE' ||
    code === 'INSUFFICIENT_FUNDS' ||
    statusCode === 402 ||
    lowerMsg.includes('insufficient balance') ||
    lowerMsg.includes('insufficient funds')
  ) {
    return 'Your wallet balance is insufficient to complete this payment. Please top up your wallet or adjust applied credits.';
  }

  // 12. Organization / Event Permission Errors
  if (
    statusCode === 403 ||
    code === 'FORBIDDEN' ||
    code === 'PERMISSION_DENIED' ||
    lowerMsg.includes('permission denied') ||
    lowerMsg.includes('only owners and admins')
  ) {
    return 'Permission denied: Only organization owners and admins can create or pay for events.';
  }

  // 13. Rate Limiting
  if (statusCode === 429 || code === 'RATE_LIMIT_EXCEEDED' || lowerMsg.includes('too many')) {
    return 'Too many event creation attempts. Please wait a few minutes before trying again.';
  }

  // 14. Organization Not Selected / Not Found
  if (code === 'ORGANIZATION_NOT_FOUND' || lowerMsg.includes('no active organization')) {
    return 'No active organization selected. Please refresh the page and verify your active organization.';
  }

  // 15. Clean fallback if rawMsg is human-readable (not a database error or code snippet)
  if (
    rawMsg &&
    !rawMsg.startsWith('{') &&
    !rawMsg.includes('SQL') &&
    !rawMsg.includes('Postgres') &&
    !rawMsg.includes('relation') &&
    !rawMsg.includes('column') &&
    !rawMsg.includes('constraint') &&
    !rawMsg.includes('stack') &&
    !rawMsg.includes('TypeError') &&
    !rawMsg.includes('undefined')
  ) {
    return rawMsg;
  }

  return 'Failed to create event. Please check your inputs and try again.';
}
