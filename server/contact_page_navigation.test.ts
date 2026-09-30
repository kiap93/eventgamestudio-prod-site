import assert from 'node:assert';
import { parseRoute } from '../src/hooks/useRouteContext.js';
import { getPageSeo } from '../src/lib/seo.js';
import { en } from '../src/locales/en.js';
import { msMY } from '../src/locales/ms-MY.js';
import { zhCN } from '../src/locales/zh-CN.js';
import worker from '../worker.js';

const enTranslations = en;
const msTranslations = msMY;
const zhTranslations = zhCN;

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

  // 6. Verify Server Validation Rejection on Invalid Inputs
  const invalidNameReq = new Request('https://api.eventgamestudio.local/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validPayload, fullName: 'X' }),
  });
  const invalidNameRes = await worker.fetch(invalidNameReq, workerEnv, {} as any);
  assert.strictEqual(invalidNameRes.status, 400, 'Short name must return 400');

  const invalidEmailReq = new Request('https://api.eventgamestudio.local/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validPayload, email: 'not-an-email' }),
  });
  const invalidEmailRes = await worker.fetch(invalidEmailReq, workerEnv, {} as any);
  assert.strictEqual(invalidEmailRes.status, 400, 'Invalid email must return 400');

  const invalidMsgReq = new Request('https://api.eventgamestudio.local/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validPayload, message: 'Too short' }),
  });
  const invalidMsgRes = await worker.fetch(invalidMsgReq, workerEnv, {} as any);
  assert.strictEqual(invalidMsgRes.status, 400, 'Message under 10 chars must return 400');

  console.log('✓ 6. Server-side validation cleanly rejects invalid payloads');

  // 7. Verify Anti-Bot Honeypot Protection
  const botReq = new Request('https://api.eventgamestudio.local/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validPayload, website: 'http://spam-link.example' }),
  });
  const botRes = await worker.fetch(botReq, workerEnv, {} as any);
  assert.strictEqual(botRes.status, 200, 'Bot honeypot returns silent 200');
  const botData: any = await botRes.json();
  assert.strictEqual(botData.ticketId, 'EGS-BOTPREVENTED', 'Honeypot marks ticket as bot prevented');

  console.log('✓ 7. Honeypot anti-spam protection verified');

  // 8. Verify Platform Contact Settings Endpoint
  const settingsReq = new Request('https://api.eventgamestudio.local/api/platform/contact-settings', {
    method: 'GET',
  });
  const settingsRes = await worker.fetch(settingsReq, workerEnv, {} as any);
  assert.strictEqual(settingsRes.status, 200, 'GET /api/platform/contact-settings must return 200');
  const settingsData: any = await settingsRes.json();
  assert.ok(settingsData.whatsapp_display || settingsData.settings?.whatsapp_display, 'Contact settings must return whatsapp_display');

  console.log('✓ 8. Public contact settings endpoint verified');

  // 9. Verify Landing Page Header and Footer Contact Navigation Links
  const fs = await import('node:fs');
  const headerContent = fs.readFileSync('src/components/landing/LandingHeader.tsx', 'utf-8');
  assert.ok(
    headerContent.includes('href="/contact"') || headerContent.includes('to="/contact"'),
    'LandingHeader must contain link to /contact'
  );

  const footerContent = fs.readFileSync('src/components/landing/LandingFooter.tsx', 'utf-8');
  assert.ok(
    footerContent.includes('href="/contact"') || footerContent.includes('to="/contact"'),
    'LandingFooter must contain link to /contact'
  );

  const internalLinkContent = fs.readFileSync('src/components/common/InternalLink.tsx', 'utf-8');
  assert.ok(
    internalLinkContent.includes('to || href') || internalLinkContent.includes('href || to'),
    'InternalLink must support both to and href props interchangeably'
  );

  console.log('✓ 9. Header and Footer /contact links and InternalLink prop parity verified');

  console.log('========================================================');
  console.log('ALL CONTACT PAGE TESTS PASSED (100%)');
  console.log('========================================================');
}

runContactPageTestSuite().catch((err) => {
  console.error('Contact page test suite failed:', err);
  process.exit(1);
});
