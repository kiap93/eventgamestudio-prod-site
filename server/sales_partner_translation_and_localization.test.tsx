import { test, expect, describe, beforeEach } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { en } from '../src/locales/en';
import { zhCN } from '../src/locales/zh-CN';
import { msMY } from '../src/locales/ms-MY';
import { SUPPORTED_LANGUAGES, normalizeLanguageCode, isSupportedLanguage } from '../src/lib/i18n/languages';
import { CANONICAL_PROTECTED_TERMS, getNeverTranslateTerms, getProtectedTermsForPrompt } from '../src/lib/i18n/glossary';
import { MockTranslationProvider } from './translation/mockProvider';
import { GeminiTranslationProvider } from './translation/geminiProvider';
import { TranslationService, translationService } from './translation/service';
import {
  createTranslationJob,
  getTranslationJob,
  localTranslationJobsCache,
} from './db/translations';
import { signAppToken } from './auth';
import worker from '../worker';
import { SalesNavbar } from '../src/components/sales/SalesNavbar';
import { SalesPartnerTranslationModal } from '../src/components/sales/SalesPartnerTranslationModal';
import { AuthContext } from '../src/context/AuthContext';
import { LocalizationProvider } from '../src/context/LocalizationContext';

describe('Sales Partner Translation & Localization Engine Test Suite', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-sales-translation-testing-32b',
    NODE_ENV: 'test',
  };

  const userA = {
    id: 'user-sales-alice-01',
    email: 'alice@partneragency.com',
    name: 'Alice Partner',
    is_developer: false,
  };

  const userB = {
    id: 'user-sales-bob-02',
    email: 'bob@competitoragency.com',
    name: 'Bob Competitor',
    is_developer: false,
  };

  const developerAdmin = {
    id: 'user-dev-admin-01',
    email: 'admin@eventgamestudio.com',
    name: 'Admin Developer',
    is_developer: true,
  };

  let tokenUserA: string;
  let tokenUserB: string;
  let tokenDevAdmin: string;

  beforeEach(() => {
    translationService.setDefaultProviderId('mock');
    tokenUserA = signAppToken({ ...userA, organization_id: 'org-sales-alice' }, testEnv.JWT_SECRET);
    tokenUserB = signAppToken({ ...userB, organization_id: 'org-sales-bob' }, testEnv.JWT_SECRET);
    tokenDevAdmin = signAppToken({ ...developerAdmin, organization_id: 'org-platform' }, testEnv.JWT_SECRET);
  });

  // 1. LOCALE DICTIONARY SYMMETRY & COMPLETENESS
  describe('1. Locale Dictionary Symmetry & Completeness', () => {
    function getAllKeys(obj: any, prefix = ''): string[] {
      let keys: string[] = [];
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          keys = keys.concat(getAllKeys(value, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    test('1.1 Supported languages configuration contains en, zh-CN, ms-MY', () => {
      const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(codes).toContain('en');
      expect(codes).toContain('zh-CN');
      expect(codes).toContain('ms-MY');

      expect(isSupportedLanguage('en')).toBe(true);
      expect(isSupportedLanguage('zh-CN')).toBe(true);
      expect(isSupportedLanguage('ms-MY')).toBe(true);
      expect(isSupportedLanguage('fr-FR')).toBe(false);
      expect(isSupportedLanguage(null as any)).toBe(false);

      expect(normalizeLanguageCode('zh')).toBe('zh-CN');
      expect(normalizeLanguageCode('ms')).toBe('ms-MY');
      expect(normalizeLanguageCode('EN-us')).toBe('en');
    });

    test('1.2 sales namespace in en, zh-CN, and ms-MY has 100% key parity', () => {
      const enSalesKeys = getAllKeys(en.sales).sort();
      const zhSalesKeys = getAllKeys(zhCN.sales).sort();
      const msSalesKeys = getAllKeys(msMY.sales).sort();

      expect(enSalesKeys.length).toBeGreaterThan(50);
      expect(zhSalesKeys.length).toBe(enSalesKeys.length);
      expect(msSalesKeys.length).toBe(enSalesKeys.length);

      const missingInZh = enSalesKeys.filter((k) => !zhSalesKeys.includes(k));
      const missingInMs = enSalesKeys.filter((k) => !msSalesKeys.includes(k));
      const extraInZh = zhSalesKeys.filter((k) => !enSalesKeys.includes(k));
      const extraInMs = msSalesKeys.filter((k) => !enSalesKeys.includes(k));

      expect(missingInZh).toEqual([]);
      expect(missingInMs).toEqual([]);
      expect(extraInZh).toEqual([]);
      expect(extraInMs).toEqual([]);
    });

    test('1.3 No sales strings are empty or undefined in any language', () => {
      const checkNonEmpty = (obj: any, path = '') => {
        for (const [key, val] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof val === 'object' && val !== null) {
            checkNonEmpty(val, currentPath);
          } else {
            expect(typeof val).toBe('string');
            expect((val as string).trim().length).toBeGreaterThan(0);
          }
        }
      };

      checkNonEmpty(en.sales, 'en.sales');
      checkNonEmpty(zhCN.sales, 'zhCN.sales');
      checkNonEmpty(msMY.sales, 'msMY.sales');
    });

    test('1.4 Protected glossary terms include platform and game titles', () => {
      const protectedTerms = getNeverTranslateTerms();
      expect(protectedTerms).toContain('Event Game Studio');
      expect(protectedTerms).toContain('RM');
      expect(protectedTerms).toContain('MYR');

      const promptText = getProtectedTermsForPrompt();
      expect(promptText).toContain('Event Game Studio');
      expect(promptText).toContain('Catch The Brand');
      expect(promptText).toContain('Formula Reaction Lights');
    });

    test('1.5 All locale dictionaries (en, zh-CN, ms-MY) display 10% first-order and 5% repeat-order commission rates with zero stale 15% strings', () => {
      // English
      expect(en.sales.customers.firstOrderRate).toBe('First Order (10%)');
      expect(en.sales.customers.repeatOrderRate).toBe('Repeat Orders (5%)');
      expect(en.sales.referrals.step3Desc).toContain('10%');
      expect(en.sales.referrals.step3Desc).toContain('5%');
      expect(en.sales.referrals.step3Desc).not.toContain('15%');
      expect(en.sales.apply.benefit1Title).toContain('10%');
      expect(en.sales.apply.benefit1Desc).toContain('10%');
      expect(en.sales.apply.benefit2Title).toContain('5%');
      expect(en.sales.apply.benefit2Desc).toContain('5%');

      // Bahasa Melayu
      expect(msMY.sales.customers.firstOrderRate).toBe('Pesanan Pertama (10%)');
      expect(msMY.sales.customers.repeatOrderRate).toBe('Pesanan Ulangan (5%)');
      expect(msMY.sales.referrals.step3Desc).toContain('10%');
      expect(msMY.sales.referrals.step3Desc).toContain('5%');
      expect(msMY.sales.referrals.step3Desc).not.toContain('15%');
      expect(msMY.sales.apply.benefit1Title).toContain('10%');
      expect(msMY.sales.apply.benefit1Desc).toContain('10%');
      expect(msMY.sales.apply.benefit2Title).toContain('5%');
      expect(msMY.sales.apply.benefit2Desc).toContain('5%');

      // Simplified Chinese
      expect(zhCN.sales.customers.firstOrderRate).toBe('首单返佣 (10%)');
      expect(zhCN.sales.customers.repeatOrderRate).toBe('续单返佣 (5%)');
      expect(zhCN.sales.referrals.step3Desc).toContain('10%');
      expect(zhCN.sales.referrals.step3Desc).toContain('5%');
      expect(zhCN.sales.referrals.step3Desc).not.toContain('15%');
      expect(zhCN.sales.apply.benefit1Title).toContain('10%');
      expect(zhCN.sales.apply.benefit1Desc).toContain('10%');
      expect(zhCN.sales.apply.benefit2Title).toContain('5%');
      expect(zhCN.sales.apply.benefit2Desc).toContain('5%');

      // Ensure no string anywhere in en.sales, msMY.sales, or zhCN.sales contains stale '15%'
      expect(JSON.stringify(en.sales)).not.toContain('15%');
      expect(JSON.stringify(msMY.sales)).not.toContain('15%');
      expect(JSON.stringify(zhCN.sales)).not.toContain('15%');
    });
  });

  // 2. BACKEND TRANSLATION PROVIDERS & SERVICE
  describe('2. Backend Translation Providers & Service', () => {
    test('2.1 MockTranslationProvider marks results with isMock: true and translates known terms', async () => {
      const mock = new MockTranslationProvider();
      const res = await mock.translate({
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        text: 'Dashboard overview for Event Game Studio',
      });

      expect(res.isMock).toBe(true);
      expect(res.translatedText).toBeDefined();
      expect(res.translatedText.length).toBeGreaterThan(0);
    });

    test('2.2 MockTranslationProvider rejects execution in production environment', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const mock = new MockTranslationProvider();
        await expect(
          mock.translate({
            sourceLanguage: 'en',
            targetLanguage: 'zh-CN',
            text: 'Hello world',
          })
        ).rejects.toThrow('Mock translation provider is strictly disabled in production');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    test('2.3 GeminiTranslationProvider validates source & target languages before invoking LLM', async () => {
      const provider = new GeminiTranslationProvider();

      // Unsupported target language
      await expect(
        provider.translate({
          sourceLanguage: 'en',
          targetLanguage: 'invalid-lang' as any,
          text: 'Hello',
        })
      ).rejects.toThrow('Unsupported target language');

      // Empty text
      await expect(
        provider.translate({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          text: '   ',
        })
      ).rejects.toThrow('No content provided for translation');
    });

    test('2.4 TranslationService translates single text and multi-field payloads', async () => {
      const mockProvider = new MockTranslationProvider();
      const service = new TranslationService(mockProvider);

      // Single text
      const singleRes = await service.translate({
        sourceLanguage: 'en',
        targetLanguage: 'ms-MY',
        text: 'Interactive mini-game activations for live events',
        tone: 'persuasive',
      });
      expect(singleRes.translatedText).toBeDefined();

      // Multi-field
      const multiRes = await service.translate({
        sourceLanguage: 'en',
        targetLanguage: 'zh-CN',
        fields: {
          title: 'Catch The Brand',
          subtitle: 'Exciting live arcade challenge for trade shows',
        },
      });
      expect(multiRes.translatedFields).toBeDefined();
      expect(multiRes.translatedFields?.title).toBeDefined();
      expect(multiRes.translatedFields?.subtitle).toBeDefined();
    });

    test('2.5 TranslationService queueTranslationJob creates and tracks job with user_id', async () => {
      const mockProvider = new MockTranslationProvider();
      const service = new TranslationService(mockProvider);

      const job = await service.queueTranslationJob({
        entity_type: 'sales_pitch',
        entity_id: 'pitch-game-001',
        user_id: userA.id,
        organization_id: 'org-sales-alice',
        source_language: 'en',
        target_language: 'zh-CN',
        fields: {
          pitchHeadline: 'Increase attendee booth engagement by 300%',
        },
      });

      expect(job.id).toBeDefined();
      expect(job.user_id).toBe(userA.id);
      expect(job.status).toBe('completed');
      expect(job.target_fields?.pitchHeadline).toBeDefined();

      const retrieved = await getTranslationJob(job.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(job.id);
      expect(retrieved?.user_id).toBe(userA.id);
    });
  });

  // 3. API ENDPOINTS & WORKER INTEGRATION (Parity, Validation & Multi-Tenant Isolation)
  describe('3. API Endpoints & Multi-Tenant Authorization Isolation', () => {
    test('3.1 POST /api/translations/translate requires authentication (401)', async () => {
      const req = new Request('https://studio.example.com/api/translations/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          text: 'Hello test',
        }),
      });

      const res = await worker.fetch(req, testEnv as any);
      expect(res.status).toBe(401);
    });

    test('3.2 POST /api/translations/translate rejects missing targetLanguage (400)', async () => {
      const req = new Request('https://studio.example.com/api/translations/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({
          sourceLanguage: 'en',
          text: 'Hello test',
        }),
      });

      const res = await worker.fetch(req, testEnv as any);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('targetLanguage is required');
    });

    test('3.3 POST /api/translations/translate rejects empty text and empty fields (400)', async () => {
      const req = new Request('https://studio.example.com/api/translations/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          text: '',
        }),
      });

      const res = await worker.fetch(req, testEnv as any);
      expect(res.status).toBe(400);
    });

    test('3.4 POST /api/translations/translate succeeds with valid input', async () => {
      const req = new Request('https://studio.example.com/api/translations/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({
          sourceLanguage: 'en',
          targetLanguage: 'zh-CN',
          text: 'Welcome to Event Game Studio',
          tone: 'persuasive',
        }),
      });

      const res = await worker.fetch(req, testEnv as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.translatedText).toBeDefined();
    });

    test('3.5 POST /api/translations/jobs creates a job and sets user_id', async () => {
      const req = new Request('https://studio.example.com/api/translations/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenUserA}`,
        },
        body: JSON.stringify({
          entity_type: 'sales_opportunity',
          entity_id: 'opp-101',
          source_language: 'en',
          target_language: 'ms-MY',
          fields: {
            notes: 'Brand activation with custom Durian catcher theme',
          },
        }),
      });

      const res = await worker.fetch(req, testEnv as any);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.job).toBeDefined();
      expect(data.job.user_id).toBe(userA.id);
      expect(data.job.target_fields?.notes).toBeDefined();
    });

    test('3.6 GET /api/translations/jobs/:jobId enforces multi-tenant ownership: User B gets 403 on User A job', async () => {
      // 1. User A creates a job
      const jobA = await createTranslationJob({
        entity_type: 'pitch_kit',
        entity_id: 'pitch-confidential-01',
        user_id: userA.id,
        organization_id: 'org-sales-alice',
        source_language: 'en',
        target_language: 'zh-CN',
        fields: {
          secretProposal: 'Confidential client pricing proposal RM50,000',
        },
      });

      // 2. User A fetches own job -> 200 OK
      const reqOwner = new Request(`https://studio.example.com/api/translations/jobs/${jobA.id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      const resOwner = await worker.fetch(reqOwner, testEnv as any);
      expect(resOwner.status).toBe(200);

      // 3. User B tries to fetch User A's job -> 403 Forbidden!
      const reqUserB = new Request(`https://studio.example.com/api/translations/jobs/${jobA.id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenUserB}` },
      });
      const resUserB = await worker.fetch(reqUserB, testEnv as any);
      expect(resUserB.status).toBe(403);
      const dataB = await resUserB.json();
      expect(dataB.error).toContain('Forbidden');

      // 4. Developer Admin fetches the job -> 200 OK (developer authorization override)
      const reqAdmin = new Request(`https://studio.example.com/api/translations/jobs/${jobA.id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenDevAdmin}` },
      });
      const resAdmin = await worker.fetch(reqAdmin, testEnv as any);
      expect(resAdmin.status).toBe(200);
    });

    test('3.7 GET /api/translations/jobs/:jobId returns 404 for nonexistent job', async () => {
      const req = new Request('https://studio.example.com/api/translations/jobs/nonexistent-job-uuid', {
        method: 'GET',
        headers: { Authorization: `Bearer ${tokenUserA}` },
      });
      const res = await worker.fetch(req, testEnv as any);
      expect(res.status).toBe(404);
    });
  });

  // 4. UI LOCALIZATION & COMPONENT INTEGRATION
  describe('4. Sales Partner UI Localization & Component Integration', () => {
    const mockAuthValue: any = {
      currentUser: userA,
      currentOrganization: {
        id: 'org-sales-alice',
        name: 'Alice Partner Agency',
        slug: 'alice-partner',
        role: 'owner',
      },
      organizations: [],
      salesPartner: {
        id: 'sp-alice-01',
        status: 'active',
        applied_at: '2026-09-01T00:00:00Z',
        activated_at: '2026-09-01T00:00:00Z',
      },
      isSalesPartner: true,
      salesPartnerStatus: 'active',
      isAuthenticated: true,
      isLoading: false,
      token: 'mock-token',
      logout: () => {},
    };

    test('4.1 SalesNavbar renders localized navigation, compact LanguageSelector without header AI Translator button', () => {
      const html = renderToString(
        <LocalizationProvider>
          <AuthContext.Provider value={mockAuthValue}>
            <SalesNavbar activeSection="commissions" />
          </AuthContext.Provider>
        </LocalizationProvider>
      );

      // Verify Brand & Badge
      expect(html).toContain('Event Game Studio');
      expect(html).toContain('Partner');

      // Verify all 5 navigation tabs rendered
      expect(html).toContain('Dashboard');
      expect(html).toContain('Customers');
      expect(html).toContain('Referrals');
      expect(html).toContain('Commissions');
      expect(html).toContain('Game Catalogue');

      // Verify AI Translator button is removed from header
      expect(html).not.toContain('AI Translator');

      // Verify Language Selector exists with English / flag
      expect(html).toContain('English');

      // Verify user email pill rendered safely
      expect(html).toContain('alice@partneragency.com');
    });

    test('4.2 SalesPartnerTranslationModal renders all required controls when open', () => {
      const html = renderToString(
        <LocalizationProvider>
          <SalesPartnerTranslationModal
            isOpen={true}
            onClose={() => {}}
            initialText="Interactive arcade mini-games for trade shows"
          />
        </LocalizationProvider>
      );

      // Modal Title & Subtitle
      expect(html).toContain('Sales Partner AI Translator');
      expect(html).toContain('Source Language');
      expect(html).toContain('Target Language');
      expect(html).toContain('Communication Tone');

      // Tones
      expect(html).toContain('Persuasive');
      expect(html).toContain('Professional');
      expect(html).toContain('Casual');

      // Initial text preserved
      expect(html).toContain('Interactive arcade mini-games for trade shows');

      // Protected terms notice
      expect(html).toContain('Event Game Studio');
      expect(html).toContain('Catch The Brand');

      // Action button
      expect(html).toContain('Translate with AI');
    });

    test('4.3 SalesPartnerTranslationModal returns null when isOpen is false', () => {
      const html = renderToString(
        <LocalizationProvider>
          <SalesPartnerTranslationModal
            isOpen={false}
            onClose={() => {}}
          />
        </LocalizationProvider>
      );

      expect(html).toBe('');
    });
  });
});
