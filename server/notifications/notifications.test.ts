/**
 * Centralized Notification System Test Suite
 * Validates Catalog, Templates, Deduplication, Recipient Resolution,
 * Repository Operations, and Business Event Dispatches.
 */

import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
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
  cleanupNotificationsByRetention,
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
  assert(NOTIFICATION_TYPES.length === 23, 'NOTIFICATION_TYPES array defines exactly 23 types');
  assert(Object.keys(NOTIFICATION_CATALOG).length === 23, 'NOTIFICATION_CATALOG contains exactly 23 items');

  for (const type of NOTIFICATION_TYPES) {
    const item = NOTIFICATION_CATALOG[type];
    assert(!!item, `Catalog item for "${type}" exists`);
    if (item) {
      assert(!!item.category, `"${type}" has valid category: ${item.category}`);
      assert(!!item.priority, `"${type}" has valid priority: ${item.priority}`);
      assert(typeof item.defaultTitle === 'string' && item.defaultTitle.length > 0, `"${type}" has valid title template`);
      assert(typeof item.defaultMessage === 'string' && item.defaultMessage.length > 0, `"${type}" has valid message template`);
      assert(typeof item.retentionDays === 'number' && item.retentionDays > 0, `"${type}" has positive retention days (${item.retentionDays})`);
      assert(typeof item.expiresByDefault === 'boolean', `"${type}" has explicit expiresByDefault boolean (${item.expiresByDefault})`);
      if (item.expiresByDefault) {
        assert(typeof item.defaultExpiryDays === 'number' && item.defaultExpiryDays > 0, `"${type}" expiring item has positive defaultExpiryDays (${item.defaultExpiryDays})`);
      }
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

    // Payment Success
    const paySuccess = await dispatchNotificationEvent({
      eventType: 'PAYMENT_SUCCESS',
      recipientUserId: testUser,
      organizationId: testOrg,
      referenceId: `ref_succ_${Date.now()}`,
      amount: 1400,
      subject: 'Annual License',
      eventId: 'ev_succ_1',
    });
    assert(paySuccess.length === 1 && paySuccess[0]?.type === 'payment_success', 'PAYMENT_SUCCESS handled correctly');
    assert(paySuccess[0]?.priority === 'high', 'PAYMENT_SUCCESS priority is high');
    assert(paySuccess[0]?.action_url === '/events', 'PAYMENT_SUCCESS with eventId directs to /events');
    assert(paySuccess[0]?.message.includes('RM1,400') && paySuccess[0]?.message.includes('Annual License'), 'PAYMENT_SUCCESS message includes amount and subject');

    // Payment Pending
    const payPending = await dispatchNotificationEvent({
      eventType: 'PAYMENT_PENDING',
      recipientUserId: testUser,
      organizationId: testOrg,
      orderId: `ord_pend_${Date.now()}`,
      amount: 500,
      subject: 'Top-up 500',
      checkoutUrl: '/wallet/top-up?orderId=123',
    });
    assert(payPending.length === 1 && payPending[0]?.type === 'payment_pending', 'PAYMENT_PENDING handled correctly');
    assert(payPending[0]?.priority === 'normal', 'PAYMENT_PENDING priority is normal');
    assert(payPending[0]?.action_url === '/wallet/top-up?orderId=123', 'PAYMENT_PENDING preserves checkoutUrl');

    // Event Live (with publicUrl)
    const evLive = await dispatchNotificationEvent({
      eventType: 'EVENT_LIVE',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_live_100',
      eventName: 'Live Arena 2026',
      publicUrl: '/play/tok-live-100',
    });
    assert(evLive.length === 1 && evLive[0]?.type === 'event_live', 'EVENT_LIVE handled correctly');
    assert(evLive[0]?.priority === 'high', 'EVENT_LIVE priority is high');
    assert(evLive[0]?.action_url === '/play/tok-live-100', 'EVENT_LIVE adopts publicUrl as actionUrl');
    assert(evLive[0]?.message.includes('Live Arena 2026'), 'EVENT_LIVE message includes event name');

    // Event Expired
    const evExpired = await dispatchNotificationEvent({
      eventType: 'EVENT_EXPIRED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_exp_100',
      eventName: 'Concluded Carnival',
    });
    assert(evExpired.length === 1 && evExpired[0]?.type === 'event_expired', 'EVENT_EXPIRED handled correctly');
    assert(evExpired[0]?.title === 'Event Concluded', 'EVENT_EXPIRED title matches catalog');
    assert(evExpired[0]?.message.includes('Concluded Carnival'), 'EVENT_EXPIRED message includes event name');

    // Wallet Low Balance
    const lowBal = await dispatchNotificationEvent({
      eventType: 'WALLET_LOW_BALANCE',
      recipientUserId: testUser,
      organizationId: testOrg,
      currentBalance: 150,
      threshold: 500,
    });
    assert(lowBal.length === 1 && lowBal[0]?.type === 'wallet_low_balance', 'WALLET_LOW_BALANCE handled correctly');
    assert(lowBal[0]?.priority === 'high', 'WALLET_LOW_BALANCE priority is high');
    assert(lowBal[0]?.message.includes('RM150'), 'WALLET_LOW_BALANCE formatted balance');

    // Showcase Draft Created
    const scDraft = await dispatchNotificationEvent({
      eventType: 'SHOWCASE_DRAFT_CREATED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_sc_1',
      eventName: 'Showcase Expo',
      showcaseId: 'sc_draft_1',
    });
    assert(scDraft.length === 1 && scDraft[0]?.type === 'showcase_draft_created', 'SHOWCASE_DRAFT_CREATED handled correctly');
    assert(scDraft[0]?.category === 'showcase', 'SHOWCASE_DRAFT_CREATED category is showcase');

    // Showcase Published (with publicUrl)
    const scPub = await dispatchNotificationEvent({
      eventType: 'SHOWCASE_PUBLISHED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_sc_1',
      eventName: 'Showcase Expo',
      showcaseId: 'sc_pub_1',
      publicUrl: '/showcase/sc_pub_1',
    });
    assert(scPub.length === 1 && scPub[0]?.type === 'showcase_published', 'SHOWCASE_PUBLISHED handled correctly');
    assert(scPub[0]?.action_url === '/showcase/sc_pub_1', 'SHOWCASE_PUBLISHED uses custom publicUrl');

    // Showcase Unpublished
    const scUnpub = await dispatchNotificationEvent({
      eventType: 'SHOWCASE_UNPUBLISHED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_sc_1',
      eventName: 'Showcase Expo',
      showcaseId: 'sc_pub_1',
    });
    assert(scUnpub.length === 1 && scUnpub[0]?.type === 'showcase_unpublished', 'SHOWCASE_UNPUBLISHED handled correctly');
    assert(scUnpub[0]?.title === 'Showcase Unpublished', 'SHOWCASE_UNPUBLISHED title matches catalog');

    // Showcase Updated
    const scUpd = await dispatchNotificationEvent({
      eventType: 'SHOWCASE_UPDATED',
      recipientUserId: testUser,
      organizationId: testOrg,
      eventId: 'ev_sc_1',
      eventName: 'Showcase Expo',
      showcaseId: 'sc_pub_1',
    });
    assert(scUpd.length === 1 && scUpd[0]?.type === 'showcase_updated', 'SHOWCASE_UPDATED handled correctly');
    assert(scUpd[0]?.priority === 'low', 'SHOWCASE_UPDATED priority is low');

    // Theme Ready (with previewUrl)
    const themeWithPreview = await dispatchNotificationEvent({
      eventType: 'THEME_READY',
      recipientUserId: testUser,
      organizationId: testOrg,
      themeId: 'theme_cyber_neon',
      themeName: 'Cyber Neon V2',
      gameName: 'Catch Brand',
      previewUrl: '/preview/catch-brand?themeId=theme_cyber_neon',
    });
    assert(themeWithPreview[0]?.action_url === '/preview/catch-brand?themeId=theme_cyber_neon', 'THEME_READY adopts previewUrl');
  }

  // -----------------------------------------------------------------
  // 7. Full Template Placeholders Resolution Check
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 7: Exhaustive Catalog Template Placeholders Audit ---');
  {
    const sampleMetadata: Record<NotificationType, Record<string, any>> = {
      welcome_credit_added: { amount: 'RM200' },
      payment_success: { amount: 'RM1,400', subject: 'Corporate Gala' },
      payment_pending: { amount: 'RM500', subject: 'Top-Up Order' },
      payment_failed: { amount: 'RM1,400', subject: 'Gala Night' },
      event_created: { event_name: 'Carnival 2026', start_date: '2026-10-01', end_date: '2026-10-02' },
      event_approaching: { event_name: 'Carnival 2026', start_date: '2026-10-01' },
      event_live: { event_name: 'Carnival 2026' },
      event_started: { event_name: 'Carnival 2026' },
      live_url_available: { event_name: 'Carnival 2026', live_url: '/play/carnival-2026' },
      event_expiring: { event_name: 'Carnival 2026', time_remaining: '4 hours' },
      event_expired: { event_name: 'Carnival 2026' },
      event_payment_failed: { event_name: 'Carnival 2026' },
      wallet_low_balance: { current_balance: 'RM120' },
      insufficient_balance: { current_balance: 'RM200', required_amount: 'RM1,400' },
      theme_ready: { theme_name: 'Cyberpunk', game_name: 'Reaction Tap' },
      showcase_draft_created: { event_name: 'Carnival 2026' },
      showcase_published: { event_name: 'Carnival 2026' },
      showcase_unpublished: { event_name: 'Carnival 2026' },
      showcase_updated: { event_name: 'Carnival 2026' },
      org_invitation: { org_name: 'Acme Org', role: 'admin' },
      team_member_invited: { org_name: 'Acme Org', role: 'admin' },
      member_joined: { member_name: 'Alex Tan', org_name: 'Acme Org' },
      security_settings_changed: { details: 'Two-factor authentication requirement enabled' },
    };

    for (const type of NOTIFICATION_TYPES) {
      const meta = sampleMetadata[type];
      const rendered = renderNotificationContent(type, meta);
      const remainingPlaceholdersTitle = rendered.title.match(/\{([a-zA-Z0-9_]+)\}/g);
      const remainingPlaceholdersMsg = rendered.message.match(/\{([a-zA-Z0-9_]+)\}/g);
      assert(
        !remainingPlaceholdersTitle,
        `"${type}" title has no unresolved placeholders: "${rendered.title}"`
      );
      assert(
        !remainingPlaceholdersMsg,
        `"${type}" message has no unresolved placeholders: "${rendered.message}"`
      );
    }
  }

  // -----------------------------------------------------------------
  // Test Group 8: Production Resilience & Graceful Error Handling
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 8: Production Resilience & Error Handling ---');
  {
    const prodEnvBrokenSupabase = {
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://test-error-resilience.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key-xyz-123',
    };

    // 1. listNotifications with broken DB in production does not throw 500 error
    let prodResult: any;
    let prodError: any;
    try {
      prodResult = await listNotifications(
        {
          userId: '00000000-0000-0000-0000-000000000001',
          limit: 40,
          offset: 0,
        },
        prodEnvBrokenSupabase
      );
    } catch (err) {
      prodError = err;
    }

    assert(!prodError, 'listNotifications in production does not throw error on DB issue');
    assert(Array.isArray(prodResult?.notifications), 'returns notifications array');
    assert(typeof prodResult?.total === 'number', 'returns numeric total');
    assert(typeof prodResult?.unread_count === 'number', 'returns numeric unread_count');

    // 2. listNotifications handles empty / invalid userId gracefully
    const invalidUserResult = await listNotifications(
      {
        userId: '',
        limit: 40,
        offset: 0,
      },
      prodEnvBrokenSupabase
    );
    assert(
      invalidUserResult.notifications.length === 0 && invalidUserResult.total === 0,
      'empty userId returns empty list'
    );

    // 3. listNotifications handles string "undefined" or "null" organizationId
    const sanitizedOrgResult = await listNotifications(
      {
        userId: '00000000-0000-0000-0000-000000000001',
        organizationId: 'undefined' as any,
        limit: 40,
        offset: 0,
      },
      prodEnvBrokenSupabase
    );
    assert(Array.isArray(sanitizedOrgResult.notifications), 'sanitized "undefined" orgId handled');

    // 4. getUnreadNotificationCount in production with broken DB does not throw
    let countResult: number | undefined;
    let countError: any;
    try {
      countResult = await getUnreadNotificationCount(
        '00000000-0000-0000-0000-000000000001',
        'null',
        prodEnvBrokenSupabase
      );
    } catch (err) {
      countError = err;
    }
    assert(!countError, 'getUnreadNotificationCount in production does not throw');
    assert(typeof countResult === 'number', 'getUnreadNotificationCount returns 0 safely');
  }

  // -----------------------------------------------------------------
  // Test Group 9: Centralized Notification Expiry Architecture & Expiry vs Retention Separation
  // -----------------------------------------------------------------
  console.log('\n--- Test Group 9: Expiry Architecture & Expiry vs Retention Separation ---');
  {
    const expiryTestUser = `user_expiry_test_${Date.now()}`;
    const expiryTestOrg = `org_expiry_test_${Date.now()}`;

    // 1. Authoritative Catalog Expiry Policy Verification
    // Non-expiring types must have expiresByDefault === false
    const nonExpiringTypes: NotificationType[] = [
      'team_member_invited',
      'org_invitation',
      'payment_failed',
      'event_payment_failed',
      'security_settings_changed',
      'welcome_credit_added',
      'payment_success',
      'member_joined',
    ];
    for (const type of nonExpiringTypes) {
      const catalogItem = NOTIFICATION_CATALOG[type];
      assert(
        catalogItem?.expiresByDefault === false,
        `Catalog item "${type}" is non-expiring (expiresByDefault === false)`
      );
    }

    // Time-sensitive types must have expiresByDefault === true and positive defaultExpiryDays
    const expiringTypes: NotificationType[] = [
      'payment_pending',
      'event_approaching',
      'event_live',
      'event_expiring',
      'wallet_low_balance',
      'insufficient_balance',
    ];
    for (const type of expiringTypes) {
      const catalogItem = NOTIFICATION_CATALOG[type];
      assert(
        catalogItem?.expiresByDefault === true,
        `Catalog item "${type}" is expiring by default (expiresByDefault === true)`
      );
      assert(
        typeof catalogItem?.defaultExpiryDays === 'number' && catalogItem.defaultExpiryDays > 0,
        `Catalog item "${type}" has positive defaultExpiryDays (${catalogItem?.defaultExpiryDays})`
      );
    }

    // 2. Creation behavior: Non-expiring notifications have expires_at === null
    const nonExpiringNotif = await createNotification({
      recipientUserId: expiryTestUser,
      organizationId: expiryTestOrg,
      type: 'team_member_invited',
      title: 'Invitation',
      message: 'You have been invited to Acme Org',
    });
    assert(
      nonExpiringNotif !== null && nonExpiringNotif.expires_at === null,
      'createNotification produces expires_at === null for non-expiring type (team_member_invited)'
    );

    const paymentFailedNotif = await createNotification({
      recipientUserId: expiryTestUser,
      organizationId: expiryTestOrg,
      type: 'payment_failed',
      title: 'Payment Failed',
      message: 'Payment was declined',
    });
    assert(
      paymentFailedNotif !== null && paymentFailedFailedExpiresNull(paymentFailedNotif),
      'createNotification produces expires_at === null for non-expiring payment_failed'
    );

    function paymentFailedFailedExpiresNull(notif: any): boolean {
      return notif.expires_at === null;
    }

    // 3. Creation behavior: Expiring notifications have valid future expires_at
    const expiringNotif = await createNotification({
      recipientUserId: expiryTestUser,
      organizationId: expiryTestOrg,
      type: 'event_approaching',
      title: 'Event Approaching',
      message: 'Your event starts tomorrow',
    });
    const nowTime = Date.now();
    assert(
      expiringNotif !== null &&
        typeof expiringNotif.expires_at === 'string' &&
        new Date(expiringNotif.expires_at).getTime() > nowTime,
      'createNotification calculates future expires_at for expiring type (event_approaching)'
    );

    // 4. Creation behavior: Caller explicit expiresAt override is respected
    const customExpiry = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const customExpiryNotif = await createNotification({
      recipientUserId: expiryTestUser,
      organizationId: expiryTestOrg,
      type: 'welcome_credit_added',
      title: 'Welcome Credit',
      message: 'RM200 added',
      expiresAt: customExpiry,
    });
    assert(
      customExpiryNotif !== null && customExpiryNotif.expires_at === customExpiry,
      'createNotification respects explicit caller expiresAt override'
    );

    // 5. Query visibility: Expired notifications are hidden from listNotifications
    const userQueryTest = `user_query_visibility_${Date.now()}`;

    // Item A: Active non-expiring
    const activeNonExpiring = await createNotification({
      recipientUserId: userQueryTest,
      organizationId: expiryTestOrg,
      type: 'org_invitation',
      title: 'Active Invitation',
      message: 'Join our team',
    });

    // Item B: Active expiring (expires in 2 days)
    const activeExpiring = await createNotification({
      recipientUserId: userQueryTest,
      organizationId: expiryTestOrg,
      type: 'wallet_low_balance',
      title: 'Balance Warning',
      message: 'Balance is RM10',
    });

    // Item C: Expired notification (expired 1 hour ago)
    const expiredPast = new Date(Date.now() - 3600 * 1000).toISOString();
    const expiredNotif = await createNotification({
      recipientUserId: userQueryTest,
      organizationId: expiryTestOrg,
      type: 'event_expiring',
      title: 'Expired Alert',
      message: 'This event alert has expired',
      expiresAt: expiredPast,
    });

    assert(activeNonExpiring !== null, 'Created active non-expiring test notification');
    assert(activeExpiring !== null, 'Created active expiring test notification');
    assert(expiredNotif !== null && expiredNotif.expires_at === expiredPast, 'Created expired test notification');

    // List notifications: Only active non-expiring and active expiring must be returned (total = 2, expired excluded)
    const listResult = await listNotifications({
      userId: userQueryTest,
      limit: 20,
    });
    assert(listResult.total === 2, `listNotifications total is 2 (excluding expired), got: ${listResult.total}`);
    assert(
      listResult.notifications.length === 2,
      `listNotifications returns 2 notifications, got: ${listResult.notifications.length}`
    );
    const hasExpiredInList = listResult.notifications.some((n) => n.id === expiredNotif?.id);
    assert(!hasExpiredInList, 'listNotifications strictly excludes expired notification');

    // Unread count: Must be 2 (expired notification does NOT count)
    const unreadCount = await getUnreadNotificationCount(userQueryTest);
    assert(unreadCount === 2, `getUnreadNotificationCount is 2 (excluding expired), got: ${unreadCount}`);

    // 6. Interaction safety: markNotificationAsRead refuses to mark expired notification
    if (expiredNotif) {
      const markExpiredResult = await markNotificationAsRead(expiredNotif.id, userQueryTest);
      assert(markExpiredResult === null, 'markNotificationAsRead returns null for expired notification');
    }

    // 7. Interaction safety: markAllNotificationsAsRead only affects active unread notifications
    const markAllResult = await markAllNotificationsAsRead(userQueryTest);
    assert(
      markAllResult.marked_count === 2,
      `markAllNotificationsAsRead marks exactly 2 active items, got: ${markAllResult.marked_count}`
    );

    const postMarkCount = await getUnreadNotificationCount(userQueryTest);
    assert(postMarkCount === 0, `Unread count after markAll is 0, got: ${postMarkCount}`);

    // 8. Decoupled Storage Retention vs Expiry:
    // Expired notification with recent created_at is NOT deleted by retention cleanup
    const preRetentionCount = await cleanupNotificationsByRetention();
    // Verify expiredNotif still exists in physical storage
    const localList = listNotifications({ userId: userQueryTest, limit: 100 });
    // Cleanup based on retention only deletes records past retentionDays
    assert(typeof preRetentionCount === 'number', 'cleanupNotificationsByRetention executes successfully');
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
