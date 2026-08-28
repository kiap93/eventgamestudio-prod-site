import assert from 'node:assert';
import {
  createEvent,
  getEventById,
  getEventsByOrgId,
  getEventByPublicToken,
  getAllAdminEvents,
  localEventsCache,
  updateEventPrice,
} from './events.js';
import { createOrganization } from './organizations.js';
import { createTheme } from './themes.js';
import { ensureDefaultGame } from './games.js';
import {
  calculateEventPayment,
  processEventPayment,
  getWalletBalance,
  createTopupOrder,
  processTopupOrderStatus,
} from './wallet.js';

async function runEventPricingSyncTests() {
  console.log('--- STARTING EVENT PRICING SYNCHRONIZATION TESTS ---');

  const org = await createOrganization({
    name: 'Sync Pricing Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });
  const testOrgId = org.id;

  const game = await ensureDefaultGame(testOrgId, 'Test Game');
  const theme = await createTheme({
    organization_id: testOrgId,
    game_id: game.id,
    name: 'Sync Test Theme',
  });
  const gameThemeId = theme.id;

  // 1. Create an event with initial price 1400
  const event = await createEvent({
    organization_id: testOrgId,
    game_theme_id: gameThemeId,
    name: 'Sync Price Test Event',
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    expires_at: new Date(Date.now() + 172800000).toISOString(),
    event_price: 1400,
  });

  console.log('1. Created event with initial price 1400:', event.id);

  // 2. Simulate stale cache: localEventsCache has 1400
  localEventsCache.set(event.id, {
    ...event,
    event_price: 1400,
  });

  // 3. Developer Admin updates event price in DB to 1000
  await updateEventPrice(event.id, 1000);
  console.log('2. Updated event price to 1000 via updateEventPrice');

  // 4. Verify getEventById returns 1000
  const fetchedEvent = await getEventById(event.id);
  if (!fetchedEvent || fetchedEvent.event_price !== 1000) {
    throw new Error(`getEventById failed: expected event_price 1000, got ${fetchedEvent?.event_price}`);
  }
  console.log('3. getEventById returns authoritative price:', fetchedEvent.event_price);

  // 5. Verify getEventsByOrgId returns 1000
  const orgEvents = await getEventsByOrgId(testOrgId);
  const orgEvent = orgEvents.find((e) => e.id === event.id);
  if (!orgEvent || orgEvent.event_price !== 1000) {
    throw new Error(`getEventsByOrgId failed: expected event_price 1000, got ${orgEvent?.event_price}`);
  }
  console.log('4. getEventsByOrgId returns authoritative price:', orgEvent.event_price);

  // 6. Verify getEventByPublicToken returns 1000
  const publicEvent = await getEventByPublicToken(event.public_token, undefined, { allowUnpaid: true });
  if (!publicEvent || publicEvent.event_price !== 1000) {
    throw new Error(`getEventByPublicToken failed: expected event_price 1000, got ${publicEvent?.event_price}`);
  }
  console.log('5. getEventByPublicToken returns authoritative price:', publicEvent.event_price);

  // 7. Verify getAllAdminEvents returns 1000
  const adminEvents = await getAllAdminEvents();
  const adminEvent = adminEvents.find((e) => e.id === event.id);
  if (!adminEvent || adminEvent.event_price !== 1000) {
    throw new Error(`getAllAdminEvents failed: expected event_price 1000, got ${adminEvent?.event_price}`);
  }
  console.log('6. getAllAdminEvents returns authoritative price:', adminEvent.event_price);

  // 8. Verify calculation / quote with event_price = 1000
  const calc = await calculateEventPayment(1000, 'FULL_PAID', testOrgId);
  if (calc.eventPrice !== 1000) {
    throw new Error(`calculateEventPayment quote failed: expected eventPrice 1000, got ${calc.eventPrice}`);
  }
  console.log('7. calculateEventPayment quote uses price:', calc.eventPrice);

  // 9. Fund wallet and process payment with event.event_price (1000)
  const topupOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
    amount: 1000,
    paymentMethod: 'manual_transfer',
  });
  await processTopupOrderStatus({
    orderId: topupOrder.id,
    newStatus: 'PAID',
    isTrustedSettlement: true,
    paymentReference: 'test_sync_funded',
    reason: 'Test sync paid',
  });

  const payResult = await processEventPayment({
    organizationId: testOrgId,
    eventId: event.id,
    paymentMode: 'FULL_PAID',
    eventPrice: fetchedEvent.event_price,
  });

  if (payResult.paymentCalculation?.eventPrice !== 1000) {
    throw new Error(`processEventPayment failed: expected eventPrice 1000, got ${payResult.paymentCalculation?.eventPrice}`);
  }
  console.log('8. processEventPayment successfully charged with price:', payResult.paymentCalculation?.eventPrice);

  // 10. Verify event post-payment record maintains 1000
  const paidEvent = await getEventById(event.id);
  if (!paidEvent || paidEvent.event_price !== 1000 || paidEvent.paid_amount !== 1000) {
    throw new Error(`Paid event price check failed: price=${paidEvent?.event_price}, paid=${paidEvent?.paid_amount}`);
  }
  console.log('9. Paid event record maintains 1000 without reverting to 1400.');

  console.log('--- ALL EVENT PRICING SYNCHRONIZATION TESTS PASSED! ---');
}

runEventPricingSyncTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
