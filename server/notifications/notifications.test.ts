/**
 * Centralized Notification System Test Suite
 * Validates Catalog, Templates, Deduplication, Recipient Resolution,
 * Repository Operations, and Business Event Dispatches.
 */

import {
  NOTIFICATION_CATALOG,
  interpolateNotificationTemplate,
  renderNotificationContent,
  NotificationType,
} from '../../src/lib/notifications/types.js';
import {
  NotificationDispatcher,
  dispatchNotificationEvent,
} from './dispatcher.js';
import {
  createNotification,
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../db/notifications.js';

// Enable local fallback for testing environment
process.env.ALLOW_LOCAL_FALLBACK = 'true';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('🧪 Starting Centralized Notification System Tests');
  console.log('======================================================\n');

  // -----------------------------------------------------------------
  // 1. Catalog Verification
  // -----------------------------------------------------------------
  console.log('--- Test Group 1: Notification Catalog Structure ---');
  const expectedTypes: NotificationType[] = [
    'welcome_credit_added',
    'payment_success',
    'payment_pending',
    'payment_failed',
    'event_created',
    'event_approaching',
    'event_live',
    'event_expiring',
    'event_expired',
    'event_payment_failed',
    'wallet_low_balance',
    'insufficient_balance',
    'theme_ready',
    'showcase_draft_created',
    'showcase_published',
    'showcase_unpublished',
    'showcase_updated',
    'org_invitation',
    'member_joined',
    'security_settings_changed',
  ];

  for (const type of expectedTypes) {
    const item = NOTIFICATION_CATALOG[type];
    assert(!!item, `Catalog item for "${type}" exists`);
    if (item) {
      assert(!!item.category, `"${type}" has valid category: ${item.category}`);
      assert(!!item.priority, `"${type}" has valid priority: ${item.priority}`);
      assert(typeof item.defaultTitle === 'string' && item.defaultTitle.length > 0, `"${type}" has valid title template`);
      assert(typeof item.defaultMessage === 'string' && item.defaultMessage.length > 0, `"${type}" has valid message template`);
      assert(typeof item.retentionDays === 'number' && item.retentionDays > 0, `"${type}" has positive retention days (${item.retentionDays})`);
    }
  }

  // -----------------------------------------------------------------
  // 2. Template Interpolation & Rendering
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 2: Template Interpolation & Fallbacks ---');
  {
    const template = 'Payment of {amount} for {subject} was completed.';
    const result = interpolateNotificationTemplate(template, { amount: 'RM1,400', subject: 'Corporate Gala' });
    assert(result === 'Payment of RM1,400 for Corporate Gala was completed.', 'Template variables correctly interpolated');

    // Missing keys should preserve placeholder safely without crashing
    const partialResult = interpolateNotificationTemplate('Hello {name}, balance is {balance}', { name: 'Alice' });
    assert(partialResult === 'Hello Alice, balance is {balance}', 'Missing variables preserved safely in output');

    // Full content rendering
    const rendered = renderNotificationContent('payment_success', { amount: 'RM2,800', subject: 'Mega Carnival' });
    assert(rendered.title === 'Payment Successful', 'Default catalog title rendered');
    assert(rendered.message === 'Payment of RM2,800 for Mega Carnival was completed successfully.', 'Message formatted with metadata');
    assert(rendered.priority === 'high', 'Priority matches catalog specification');
    assert(rendered.category === 'billing', 'Category matches catalog specification');
  }

  // -----------------------------------------------------------------
  // 3. Deduplication & Idempotency Rules
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 3: Deduplication & Idempotency Rules ---');
  {
    const dispatcher = NotificationDispatcher.getInstance();
    const mockEnv = { ALLOW_LOCAL_FALLBACK: 'true' };

    const testUserId = 'user-dedup-test-123';
    const testOrgId = 'org-dedup-test-456';
    const refId = `order_${Date.now()}`;

    // Dispatch same payment event twice
    const dispatch1 = await dispatcher.dispatch(
      {
        eventType: 'PAYMENT_SUCCESS',
        recipientUserId: testUserId,
        organizationId: testOrgId,
        referenceId: refId,
        amount: 1400,
        subject: 'Event Package',
      },
      mockEnv
    );

    assert(dispatch1.length === 1, 'First payment dispatch creates notification');
    const firstNotifId = dispatch1[0]?.id;

    const dispatch2 = await dispatcher.dispatch(
      {
        eventType: 'PAYMENT_SUCCESS',
        recipientUserId: testUserId,
        organizationId: testOrgId,
        referenceId: refId,
        amount: 1400,
        subject: 'Event Package',
      },
      mockEnv
    );

    assert(dispatch2.length === 0, 'Second payment dispatch with duplicate key is deduplicated (0 created)');

    // Verify deduplication key format
    assert(dispatch1[0]?.deduplication_key === `payment_success_${refId}_${testUserId}`, 'Deduplication key matches expected format');
  }

  // -----------------------------------------------------------------
  // 4. Showcase Lifecycle Owner Isolation
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 4: Showcase Recipient Isolation ---');
  {
    const dispatcher = NotificationDispatcher.getInstance();
    const mockEnv = { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' };

    const ownerId = `owner_${Date.now()}`;
    const orgId = `org_showcase_${Date.now()}`;

    // Dispatch showcase event with specific recipient
    const showcaseDispatch = await dispatcher.dispatch(
      {
        eventType: 'SHOWCASE_PUBLISHED',
        recipientUserId: ownerId,
        organizationId: orgId,
        eventId: 'event-789',
        eventName: 'Annual Launch Showcase',
        showcaseId: 'showcase-101',
      },
      mockEnv
    );

    assert(showcaseDispatch.length === 1, 'Showcase published notification created for owner');
    assert(showcaseDispatch[0]?.recipient_user_id === ownerId, 'Notification strictly addressed to the showcase owner');
    assert(showcaseDispatch[0]?.category === 'showcase', 'Category is showcase');
    assert(showcaseDispatch[0]?.action_url === '/events', 'Action URL directs to events management');
  }

  // -----------------------------------------------------------------
  // 5. Repository CRUD & State Mutations
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 5: Notification Repository Operations ---');
  {
    const testUser = `test_user_repo_${Date.now()}`;
    const testOrg = `test_org_repo_${Date.now()}`;

    // 1. Create notification
    const created = await createNotification({
      recipient_user_id: testUser,
      organization_id: testOrg,
      type: 'event_live',
      category: 'event',
      title: 'Your Event is Live!',
      message: 'Attendees can now play your game at the public link.',
      priority: 'high',
      action_url: '/events',
      entity_type: 'event',
      entity_id: 'ev-test-1',
      deduplication_key: `live_ev_${Date.now()}`,
    });

    assert(!!created && !!created.id, 'createNotification returns valid record');
    assert(created?.is_read === false, 'Newly created notification is unread by default');

    // 2. Unread count check
    const count1 = await getUnreadNotificationCount(testUser);
    assert(count1 >= 1, `Unread count reflects new item (count: ${count1})`);

    // 3. List notifications
    const list = await listNotifications({ userId: testUser });
    assert(list.notifications.some((n) => n.id === created!.id), 'listNotifications includes created notification');

    // 4. Mark single as read
    const readItem = await markNotificationAsRead(created!.id, testUser);
    assert(readItem?.is_read === true, 'markNotificationAsRead marks notification as read');
    assert(!!readItem?.read_at, 'read_at timestamp is populated');

    // 5. Create a second notification for mark all read test
    await createNotification({
      recipient_user_id: testUser,
      organization_id: testOrg,
      type: 'wallet_low_balance',
      category: 'wallet',
      title: 'Low Balance',
      message: 'Please top up.',
      priority: 'high',
    });

    const unreadCountBefore = await getUnreadNotificationCount(testUser);
    assert(unreadCountBefore >= 1, 'Second notification increments unread count');

    const markedRes = await markAllNotificationsAsRead(testUser);
    const markedCount = markedRes.marked_count;
    assert(markedCount >= 1, `markAllNotificationsAsRead returned marked count: ${markedCount}`);

    const unreadCountAfter = await getUnreadNotificationCount(testUser);
    assert(unreadCountAfter === 0, 'Unread count is 0 after markAllNotificationsAsRead');

    // 6. Delete notification
    const deleted = await deleteNotification(created!.id, testUser);
    assert(deleted === true, 'deleteNotification returns true');

    const listAfterDelete = await listNotifications({ userId: testUser });
    assert(!listAfterDelete.notifications.some((n) => n.id === created!.id), 'Deleted notification no longer in list');
  }

  // -----------------------------------------------------------------
  // 6. Business Event Types Coverage
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 6: Business Domain Events Coverage ---');
  {
    const testUser = `user_events_test_${Date.now()}`;
    const testOrg = `org_events_test_${Date.now()}`;

    // Welcome Credit
    const welcome = await dispatchNotificationEvent({
      eventType: 'WELCOME_CREDIT_ADDED',
      recipientUserId: testUser,
      organizationId: testOrg,
      amount: 200,
    });
    assert(welcome.length === 1 && welcome[0]?.type === 'welcome_credit_added', 'WELCOME_CREDIT_ADDED handled correctly');

    // Event Created
    const evCreated = await dispatchNotificationEvent({
      eventType: 'EVENT_CREATED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev-new-1',
      eventName: 'Summer Festival',
      gameName: 'Catch Brand',
    });
    assert(evCreated.length === 1 && evCreated[0]?.type === 'event_created', 'EVENT_CREATED handled correctly');

    // Event Expiring
    const evExpiring = await dispatchNotificationEvent({
      eventType: 'EVENT_EXPIRING',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev-new-1',
      eventName: 'Summer Festival',
      endDate: '2026-09-30',
      timeRemaining: '12 hours',
    });
    assert(evExpiring.length === 1 && evExpiring[0]?.type === 'event_expiring', 'EVENT_EXPIRING handled correctly');

    // Theme Ready
    const themeReady = await dispatchNotificationEvent({
      eventType: 'THEME_READY',
      recipientUserId: testUser,
      organizationId: testOrg,
      themeId: 'theme-custom-1',
      themeName: 'Cyber Neon',
      gameName: 'Reaction Tap',
    });
    assert(themeReady.length === 1 && themeReady[0]?.type === 'theme_ready', 'THEME_READY handled correctly');

    // Security Settings Changed
    const secAlert = await dispatchNotificationEvent({
      eventType: 'SECURITY_SETTINGS_CHANGED',
      recipientUserId: testUser,
      organizationId: testOrg,
      action: 'ROLE_CHANGED',
      details: 'Admin privileges assigned to user',
    });
    assert(secAlert.length === 1 && secAlert[0]?.type === 'security_settings_changed', 'SECURITY_SETTINGS_CHANGED handled correctly');
    assert(secAlert[0]?.priority === 'urgent', 'Security alert has urgent priority');

    // Payment Failed
    const payFailed = await dispatchNotificationEvent({
      eventType: 'PAYMENT_FAILED',
      recipientUserId: testUser,
      organizationId: testOrg,
      referenceId: 'ref_topup_fail_1',
      orderId: 'order_fail_1',
      amount: 500,
      currency: 'MYR',
      subject: 'Top-up Order ORDER_FA',
      reason: 'Card declined by issuing bank',
    });
    assert(payFailed.length === 1 && payFailed[0]?.type === 'payment_failed', 'PAYMENT_FAILED handled correctly');
    assert(payFailed[0]?.priority === 'urgent', 'PAYMENT_FAILED priority is urgent');
    assert(payFailed[0]?.title === 'Payment Failed', 'PAYMENT_FAILED default title matches catalog');
    assert(payFailed[0]?.message.includes('Top-up Order ORDER_FA'), 'PAYMENT_FAILED message contains subject');

    // Event Payment Failed
    const evPayFailed = await dispatchNotificationEvent({
      eventType: 'EVENT_PAYMENT_FAILED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_fail_1',
      eventName: 'Grand Expo 2026',
      amount: 1400,
      reason: 'Payment processor timeout',
    });
    assert(evPayFailed.length === 1 && evPayFailed[0]?.type === 'event_payment_failed', 'EVENT_PAYMENT_FAILED handled correctly');
    assert(evPayFailed[0]?.priority === 'urgent', 'EVENT_PAYMENT_FAILED priority is urgent');
    assert(evPayFailed[0]?.message.includes('Grand Expo 2026'), 'EVENT_PAYMENT_FAILED message includes event name');

    // Event Approaching
    const evApproaching = await dispatchNotificationEvent({
      eventType: 'EVENT_APPROACHING',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_appr_1',
      eventName: 'Winter Carnival',
      startDate: '2026-10-01',
    });
    assert(evApproaching.length === 1 && evApproaching[0]?.type === 'event_approaching', 'EVENT_APPROACHING handled correctly');
    assert(evApproaching[0]?.title === 'Your Event Starts Tomorrow', 'EVENT_APPROACHING title matches catalog');
    assert(evApproaching[0]?.message.includes('Winter Carnival') && evApproaching[0]?.message.includes('2026-10-01'), 'EVENT_APPROACHING message includes name and start date');

    // Insufficient Balance
    const insuffBal = await dispatchNotificationEvent({
      eventType: 'INSUFFICIENT_BALANCE',
      recipientUserId: testUser,
      organizationId: testOrg,
      currentBalance: 200,
      requiredAmount: 1400,
      eventId: 'ev_appr_1',
      eventName: 'Winter Carnival',
    });
    assert(insuffBal.length === 1 && insuffBal[0]?.type === 'insufficient_balance', 'INSUFFICIENT_BALANCE handled correctly');
    assert(insuffBal[0]?.priority === 'high', 'INSUFFICIENT_BALANCE priority is high');
    assert(insuffBal[0]?.message.includes('RM200') && insuffBal[0]?.message.includes('RM1,400'), 'INSUFFICIENT_BALANCE message formatted with balances');

    // Org Invitation
    const orgInvite = await dispatchNotificationEvent({
      eventType: 'ORG_INVITATION',
      recipientUserId: testUser,
      organizationId: testOrg,
      inviteeEmail: 'colleague@example.com',
      orgName: 'Acme Studio',
      role: 'admin',
      invitationId: 'inv_123',
    });
    assert(orgInvite.length === 1 && orgInvite[0]?.type === 'org_invitation', 'ORG_INVITATION handled correctly');
    assert(orgInvite[0]?.title === 'Team Workspace Invitation', 'ORG_INVITATION title matches catalog');
    assert(orgInvite[0]?.message.includes('Acme Studio') && orgInvite[0]?.message.includes('admin'), 'ORG_INVITATION message includes org name and role');

    // Member Joined
    const memberJoined = await dispatchNotificationEvent({
      eventType: 'MEMBER_JOINED',
      recipientUserId: testUser,
      organizationId: testOrg,
      memberUserId: 'usr_new_999',
      memberName: 'Sarah Connor',
      orgName: 'Acme Studio',
      role: 'member',
    });
    assert(memberJoined.length === 1 && memberJoined[0]?.type === 'member_joined', 'MEMBER_JOINED handled correctly');
    assert(memberJoined[0]?.title === 'New Team Member Joined', 'MEMBER_JOINED title matches catalog');
    assert(memberJoined[0]?.message.includes('Sarah Connor') && memberJoined[0]?.message.includes('Acme Studio'), 'MEMBER_JOINED message includes member name and org');
  }

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
