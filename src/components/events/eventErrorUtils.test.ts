import assert from 'node:assert';
import { formatEventErrorMessage } from './eventErrorUtils';

// 1. 30-day maximum duration rule error from code
{
  const msg = formatEventErrorMessage({ code: 'MAX_DURATION_EXCEEDED' }, 422);
  assert.strictEqual(
    msg,
    'Maximum event duration is 30 days. Please select an end date within 30 days of the start date.'
  );
}

// 2. 30-day maximum duration rule error from message string
{
  const msg = formatEventErrorMessage({ error: 'Selected event duration exceeds 30 days' }, 400);
  assert.strictEqual(
    msg,
    'Maximum event duration is 30 days. Please select an end date within 30 days of the start date.'
  );
}

// 3. Invalid date range error
{
  const msg = formatEventErrorMessage({ code: 'INVALID_DATE_RANGE' }, 422);
  assert.strictEqual(
    msg,
    'The event end date cannot be earlier than the start date. Please select a valid date range.'
  );
}

// 4. Missing game pricing error
{
  const msg = formatEventErrorMessage({ code: 'NO_ACTIVE_GAME_PRICING' }, 503);
  assert.strictEqual(
    msg,
    'Pricing is not currently configured for this game. Please contact support or select another game.'
  );
}

// 5. Unsupported duration error
{
  const msg = formatEventErrorMessage({ code: 'UNSUPPORTED_DURATION' }, 422);
  assert.strictEqual(
    msg,
    'The selected duration is not supported for this game. Please choose a duration within 30 days.'
  );
}

// 6. Inactive game error
{
  const msg = formatEventErrorMessage({ code: 'GAME_INACTIVE' }, 422);
  assert.strictEqual(
    msg,
    'This game is currently inactive or unavailable. Please choose another game.'
  );
}

// 7. Insufficient wallet balance error
{
  const msg = formatEventErrorMessage({ code: 'INSUFFICIENT_BALANCE' }, 402);
  assert.strictEqual(
    msg,
    'Your wallet balance is insufficient to complete this payment. Please top up your wallet or adjust applied credits.'
  );
}

// 8. Permission error
{
  const msg = formatEventErrorMessage({ code: 'FORBIDDEN' }, 403);
  assert.strictEqual(
    msg,
    'Permission denied: Only organization owners and admins can create or pay for events.'
  );
}

// 9. Theme setup required error
{
  const msg = formatEventErrorMessage({ code: 'THEME_SETUP_REQUIRED' }, 422);
  assert.ok(msg.includes('THEME_SETUP_REQUIRED:'));
}

// 10. Pending event limit reached error
{
  const msg = formatEventErrorMessage({ code: 'PENDING_EVENT_LIMIT_REACHED' }, 422);
  assert.strictEqual(
    msg,
    'You have reached the maximum allowed limit of 2 unpaid events. Please pay for or delete an existing pending event before creating a new one.'
  );
}

console.log('All eventErrorUtils tests passed successfully!');
