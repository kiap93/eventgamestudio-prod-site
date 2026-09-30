import assert from 'node:assert';
import { parseRoute } from '../src/hooks/useRouteContext.js';
import { getPageSeo } from '../src/lib/seo.js';
import { en } from '../src/locales/en.js';
import { msMY } from '../src/locales/ms-MY.js';
import { zhCN } from '../src/locales/zh-CN.js';
import worker from '../worker.js';

const workerEnv = {
  JWT_SECRET: 'test-jwt-secret-key-at-least-32-chars-long!!',
  NODE_ENV: 'test',
  PLATFORM_BUSINESS_TIMEZONE: 'Asia/Singapore',
};

async function runContactPageTestSuite() {
  console.log('========================================================');
  console.log('--- STARTING CONTACT PAGE & ROUTING TEST SUITE ---');
  console.log('========================================================');

  // 1. Verify Route Resolution
  const route1 = parseRoute('/contact');
  assert.strictEqual(route1.mode, 'contact', '/contact must parse to contact mode');
  assert.strictEqual(route1.isDeveloperAdminRoute, false);
  assert.strictEqual(route1.isStudioRoute, false);

  const route2 = parseRoute('/contact/');
  assert.strictEqual(route2.mode, 'contact', '/contact/ must parse to contact mode');

  const route3 = parseRoute('/contact?source=header');
  assert.strictEqual(route3.mode, 'contact', '/contact with query params must parse to contact mode');

  console.log('✓ 1. Route resolution: /contact correctly maps to presentation mode "contact"');

  // 2. Verify SEO Configuration
  const seo = getPageSeo('/contact');
  assert.ok(seo.title.includes('Catch The Brand') || seo.title.includes('Event Game Studio'), 'SEO title must be branded');
  assert.ok(seo.description.length > 50, 'SEO description must be descriptive');
  assert.strictEqual(seo.canonical, 'https://eventgamestudio.com/contact', 'Canonical URL must point to /contact');
  assert.strictEqual(seo.h1, "Let's Make Your Event Playable.", 'SEO H1 must match hero title');
  assert.ok(Array.isArray(seo.breadcrumbs), 'SEO must include breadcrumbs');
  assert.strictEqual(seo.breadcrumbs[1].item, '/contact', 'Breadcrumb item must point to /contact');

  console.log('✓ 2. SEO configuration: title, description, canonical, and breadcrumbs verified');

  // 3. Verify Localization Completeness Across English, Bahasa Melayu & Chinese
  const requiredKeys = [
    'heroTitle',
    'heroSubtitle',
    'badge',
    'whatsappCardTitle',
    'startWhatsapp',
    'createEventCtaTitle',
    'createEventBtn',
    'formTitle',
    'categoryLabel',
    'fullName',
    'workEmail',
    'phone',
    'company',
    'message',
    'submitEnquiry',
    'successTitle',
    'quickHelpTitle',
    'linkPricing',
    'linkGames',
    'linkSolutions',
    'linkCreateEvent',
    'errNameRequired',
    'errEmailRequired',
    'errMessageRequired',
  ];

  for (const key of requiredKeys) {
    assert.ok(
      (enTranslations.contact as any)?.[key],
      `English translation must have contact.${key}`
    );
    assert.ok(
      (msTranslations.contact as any)?.[key],
      `Bahasa Melayu translation must have contact.${key}`
    );
    assert.ok(
      (zhTranslations.contact as any)?.[key],
      `Simplified Chinese translation must have contact.${key}`
    );
  }

  // Hero title check across languages
  assert.strictEqual((enTranslations.contact as any).heroTitle, "Let's Make Your Event Playable.");
  assert.strictEqual((msTranslations.contact as any).heroTitle, 'Mari Jadikan Acara Anda Boleh Dimainkan.');
  assert.strictEqual((zhTranslations.contact as any).heroTitle, '让您的下一场活动充满互动与乐趣。');

  console.log('✓ 3. Localization: All Contact page keys exist in en.ts, ms-MY.ts, and zh-CN.ts');

  // 4. Verify Contact Form Submission via Cloudflare Worker
  const testIdempotencyKey = `test-contact-${Date.now()}-${Math.random()}`;
  const validPayload = {
    fullName: 'Sara Lee',
    email: 'sara@eventagency.example',
    phone: '+60 12-345 6789',
    company: 'Apex Event Agency',
    category: 'Event booking / activation',
    message: 'We are organizing an annual dinner for 500 guests and want Catch the Brand with custom logos.',
    idempotencyKey: testIdempotencyKey,
  };

  const req = new Request('https://api.eventgamestudio.local/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });

  const res = await worker.fetch(req, workerEnv, {} as any);
  assert.strictEqual(res.status, 200, 'POST /api/contact must succeed with 200');
  const data: any = await res.json();
  assert.strictEqual(data.success, true, 'Response must indicate success: true');
  assert.ok(data.ticketId, 'Response must return ticketId reference');

  console.log(`✓ 4. Backend enquiry submission succeeded with ticket ID: ${data.ticketId}`);

  // 5. Verify Idempotency on Duplicate Submission
  const dupReq = new Request('https://api.eventgamestudio.local/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });

  const dupRes = await worker.fetch(dupReq, workerEnv, {} as any);
  assert.strictEqual(dupRes.status, 200, 'Duplicate submission must be handled cleanly');
  const dupData: any = await dupRes.json();
  assert.strictEqual(dupData.success, true);
  assert.strictEqual(dupData.ticketId, data.ticketId, 'Idempotency returns same ticket ID');

  console.log('✓ 5. Idempotent enquiry deduplication verified');

  console.log('========================================================');
  console.log('ALL CONTACT PAGE TESTS PASSED (100%)');
  console.log('========================================================');
}

runContactPageTestSuite().catch((err) => {
  console.error('Contact page test suite failed:', err);
  process.exit(1);
});
