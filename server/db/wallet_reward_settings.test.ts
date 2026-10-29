import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getAllRewardSettings,
  getRewardSettingsByCountry,
  getRewardSettingsForOrganization,
  saveRewardSettings,
  getRewardSettingsHistory,
  calculateDynamicTopupCredit,
  DEFAULT_REWARD_COUNTRY,
  DEFAULT_REWARD_CURRENCY,
} from './rewardSettings.js';
import {
  getWalletBalance,
  calculateTopupCredit,
  validateWelcomeCreditUsage,
  validateShowcaseCreditUsage,
  calculateEventPayment,
} from './wallet.js';
import { WalletTopupTierRecord, UpdateWalletRewardSettingsInput } from './types.js';

describe('Centralized Wallet & Rewards Settings Test Suite', () => {
  beforeEach(async () => {
    // Ensure clean state with default seed records
  });

  describe('Multi-Currency Business Defaults & Resolution', () => {
    it('resolves default Malaysian (MY/MYR) reward settings with correct amounts and tiers', async () => {
      const mySettings = await getRewardSettingsByCountry('MY', 'MYR');
      expect(mySettings).not.toBeNull();
      expect(mySettings?.country_code).toBe('MY');
      expect(mySettings?.currency).toBe('MYR');
      expect(mySettings?.welcome_credit_amount).toBe(800.00);
      expect(mySettings?.showcase_credit_amount).toBe(300.00);
      expect(mySettings?.welcome_credit_enabled).toBe(true);
      expect(mySettings?.showcase_credit_enabled).toBe(true);
      expect(mySettings?.max_topup_credit_per_event_percent).toBe(0.20);

      // Verify Tier 1 (RM6,000 @ 5%) and Tier 2 (RM10,000 @ 7%)
      const tiers = mySettings?.tiers || [];
      expect(tiers.length).toBeGreaterThanOrEqual(2);
      expect(tiers[0].min_deposit).toBe(6000.00);
      expect(tiers[0].bonus_rate).toBe(0.05);
      expect(tiers[1].min_deposit).toBe(10000.00);
      expect(tiers[1].bonus_rate).toBe(0.07);
    });

    it('resolves Singapore (SG/SGD) reward settings with correct localized tiers', async () => {
      const sgSettings = await getRewardSettingsByCountry('SG', 'SGD');
      expect(sgSettings).not.toBeNull();
      expect(sgSettings?.country_code).toBe('SG');
      expect(sgSettings?.currency).toBe('SGD');
      expect(sgSettings?.welcome_credit_amount).toBe(300.00);
      expect(sgSettings?.showcase_credit_amount).toBe(100.00);

      const tiers = sgSettings?.tiers || [];
      expect(tiers.length).toBeGreaterThanOrEqual(2);
      expect(tiers[0].min_deposit).toBe(2000.00);
      expect(tiers[0].bonus_rate).toBe(0.05);
      expect(tiers[1].min_deposit).toBe(3500.00);
      expect(tiers[1].bonus_rate).toBe(0.07);
    });

    it('resolves United States (US/USD) reward settings with correct localized tiers', async () => {
      const usSettings = await getRewardSettingsByCountry('US', 'USD');
      expect(usSettings).not.toBeNull();
      expect(usSettings?.country_code).toBe('US');
      expect(usSettings?.currency).toBe('USD');
      expect(usSettings?.welcome_credit_amount).toBe(200.00);
      expect(usSettings?.showcase_credit_amount).toBe(75.00);

      const tiers = usSettings?.tiers || [];
      expect(tiers.length).toBeGreaterThanOrEqual(2);
      expect(tiers[0].min_deposit).toBe(1500.00);
      expect(tiers[0].bonus_rate).toBe(0.05);
      expect(tiers[1].min_deposit).toBe(2500.00);
      expect(tiers[1].bonus_rate).toBe(0.07);
    });
  });

  describe('Currency Resolution & Fail-Closed Guardrails', () => {
    it('fails closed when requested currency does not match country configuration', async () => {
      // Singapore is configured for SGD; asking for USD or MYR with country SG must return null
      const mismatched = await getRewardSettingsByCountry('SG', 'USD');
      expect(mismatched).toBeNull();

      const mismatched2 = await getRewardSettingsByCountry('US', 'SGD');
      expect(mismatched2).toBeNull();
    });

    it('fails closed for unconfigured country and currency combinations', async () => {
      const unsupported = await getRewardSettingsByCountry('XX', 'EUR');
      expect(unsupported).toBeNull();

      const unsupportedCountry = await getRewardSettingsByCountry('ZZ');
      expect(unsupportedCountry).toBeNull();
    });

    it('does not allow arbitrary cross-country configuration hijacking', async () => {
      // Indonesia (ID) is not configured; asking for USD should NOT return US settings
      const result = await getRewardSettingsByCountry('ID', 'USD');
      expect(result).toBeNull();
    });

    it('allows default MY/MYR fallback when country is unspecified or empty and currency is MYR', async () => {
      const defaultRes = await getRewardSettingsByCountry(undefined, 'MYR');
      expect(defaultRes).not.toBeNull();
      expect(defaultRes?.country_code).toBe('MY');
      expect(defaultRes?.currency).toBe('MYR');
    });
  });

  describe('Dynamic Top-Up Tier Bonus Calculations', () => {
    const testTiers: WalletTopupTierRecord[] = [
      {
        id: 'tier_test_1',
        reward_settings_id: 'rew_set_test',
        country_code: 'MY',
        currency: 'MYR',
        tier_name: 'Tier 1 (5%)',
        min_deposit: 6000.00,
        max_deposit: 9999.99,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.05,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'tier_test_2',
        reward_settings_id: 'rew_set_test',
        country_code: 'MY',
        currency: 'MYR',
        tier_name: 'Tier 2 (7%)',
        min_deposit: 10000.00,
        max_deposit: null,
        calculation_type: 'PERCENTAGE',
        bonus_rate: 0.07,
        bonus_fixed_amount: 0.00,
        max_bonus_amount: null,
        is_active: true,
        sort_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    it('awards 0% credit for deposit amounts below Tier 1 minimum', () => {
      const result = calculateDynamicTopupCredit(5999.99, testTiers, true);
      expect(result.promoCredit).toBe(0.00);
      expect(result.bonusPercentage).toBe(0);
      expect(result.matchedTier).toBeNull();
    });

    it('awards 5% credit for deposit amounts matching Tier 1', () => {
      const result = calculateDynamicTopupCredit(6000.00, testTiers, true);
      expect(result.promoCredit).toBe(300.00); // 5% of 6,000 = 300
      expect(result.bonusPercentage).toBe(5);
      expect(result.matchedTier?.tier_name).toBe('Tier 1 (5%)');

      const resultHigh = calculateDynamicTopupCredit(8000.00, testTiers, true);
      expect(resultHigh.promoCredit).toBe(400.00); // 5% of 8,000 = 400
    });

    it('awards 7% credit for deposit amounts matching Tier 2', () => {
      const result = calculateDynamicTopupCredit(10000.00, testTiers, true);
      expect(result.promoCredit).toBe(700.00); // 7% of 10,000 = 700
      expect(result.bonusPercentage).toBe(7);
      expect(result.matchedTier?.tier_name).toBe('Tier 2 (7%)');

      const resultHuge = calculateDynamicTopupCredit(50000.00, testTiers, true);
      expect(resultHuge.promoCredit).toBe(3500.00); // 7% of 50,000 = 3,500
    });

    it('respects bonus_fixed_amount when calculation_type is FIXED', () => {
      const fixedTiers: WalletTopupTierRecord[] = [
        {
          id: 'tier_fixed_1',
          reward_settings_id: 'rew_set_test',
          country_code: 'MY',
          currency: 'MYR',
          tier_name: 'Fixed Bonus 250',
          min_deposit: 5000.00,
          max_deposit: null,
          calculation_type: 'FIXED',
          bonus_rate: 0,
          bonus_fixed_amount: 250.00,
          max_bonus_amount: null,
          is_active: true,
          sort_order: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const res = calculateDynamicTopupCredit(5000.00, fixedTiers, true);
      expect(res.promoCredit).toBe(250.00);
      expect(res.matchedTier?.tier_name).toBe('Fixed Bonus 250');
    });

    it('enforces max_bonus_amount cap when configured', () => {
      const cappedTiers: WalletTopupTierRecord[] = [
        {
          id: 'tier_capped_1',
          reward_settings_id: 'rew_set_test',
          country_code: 'MY',
          currency: 'MYR',
          tier_name: 'Tier 10% capped at 500',
          min_deposit: 1000.00,
          max_deposit: null,
          calculation_type: 'PERCENTAGE',
          bonus_rate: 0.10,
          bonus_fixed_amount: 0,
          max_bonus_amount: 500.00,
          is_active: true,
          sort_order: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      // 10% of 10,000 is 1,000, but capped at 500
      const res = calculateDynamicTopupCredit(10000.00, cappedTiers, true);
      expect(res.promoCredit).toBe(500.00);
    });

    it('returns 0 credit when topup_bonus_enabled is false', () => {
      const res = calculateDynamicTopupCredit(10000.00, testTiers, false);
      expect(res.promoCredit).toBe(0.00);
      expect(res.bonusPercentage).toBe(0);
    });
  });

  describe('Developer Admin Settings Persistence & Audit Trail', () => {
    it('saves updated settings, increments version, and writes history snapshot', async () => {
      const input: UpdateWalletRewardSettingsInput = {
        country_code: 'MY',
        currency: 'MYR',
        welcome_credit_amount: 850.00,
        welcome_credit_enabled: true,
        showcase_credit_amount: 350.00,
        showcase_credit_enabled: true,
        topup_bonus_enabled: true,
        max_topup_credit_per_event_percent: 0.25,
        is_active: true,
        change_reason: 'Automated test updating Malaysian reward settings',
        tiers: [
          {
            tier_name: 'Tier 1 Updated',
            min_deposit: 5000.00,
            max_deposit: null,
            calculation_type: 'PERCENTAGE',
            bonus_rate: 0.06,
            bonus_fixed_amount: 0,
            max_bonus_amount: null,
            is_active: true,
            sort_order: 1,
          },
        ],
      };

      const updated = await saveRewardSettings(input, 'admin-user-123');
      expect(updated.welcome_credit_amount).toBe(850.00);
      expect(updated.showcase_credit_amount).toBe(350.00);
      expect(updated.max_topup_credit_per_event_percent).toBe(0.25);
      expect(updated.version).toBeGreaterThanOrEqual(2);

      // Verify that getRewardSettingsByCountry retrieves the updated version
      const reloaded = await getRewardSettingsByCountry('MY', 'MYR');
      expect(reloaded?.welcome_credit_amount).toBe(850.00);
      expect(reloaded?.tiers?.[0]?.bonus_rate).toBe(0.06);

      // Verify audit history record
      const history = await getRewardSettingsHistory('MY');
      expect(history.length).toBeGreaterThanOrEqual(1);
      const latestHistory = history[0];
      expect(latestHistory.country_code).toBe('MY');
      expect(latestHistory.change_reason).toBe('Automated test updating Malaysian reward settings');
    });

    it('rejects invalid inputs with descriptive error messages', async () => {
      // Invalid country code length
      await expect(
        saveRewardSettings({ country_code: 'MALAYSIA', currency: 'MYR' })
      ).rejects.toThrow('A valid 2-letter ISO country code is required.');

      // Negative welcome credit amount
      await expect(
        saveRewardSettings({ country_code: 'SG', currency: 'SGD', welcome_credit_amount: -50 })
      ).rejects.toThrow('Welcome credit amount must be a non-negative number.');

      // Percentage out of range
      await expect(
        saveRewardSettings({ country_code: 'SG', currency: 'SGD', max_topup_credit_per_event_percent: 1.5 })
      ).rejects.toThrow('Maximum top-up credit per event percent must be between 0 and 1');

      // Inverted min/max deposit on tier
      await expect(
        saveRewardSettings({
          country_code: 'SG',
          currency: 'SGD',
          tiers: [
            {
              tier_name: 'Bad Tier',
              min_deposit: 5000,
              max_deposit: 2000, // min > max!
              calculation_type: 'PERCENTAGE',
              bonus_rate: 0.05,
              bonus_fixed_amount: 0,
              max_bonus_amount: null,
              is_active: true,
              sort_order: 1,
            },
          ],
        })
      ).rejects.toThrow('Must be greater than or equal to minimum deposit');
    });
  });

  describe('Wallet Integration with Dynamic Settings', () => {
    it('applies configured top-up credit percentage cap in calculateEventPayment', async () => {
      // Event price: 1,400.00
      // Mock wallet with 500 topup_credit and 1,200 paid_balance
      const mockWallet = {
        organization_id: 'org-test-calc',
        currency: 'MYR',
        paid_balance: 1200.00,
        welcome_credit: 0.00,
        showcase_credit: 0.00,
        topup_credit: 500.00,
        outstanding_balance: 0.00,
        total_balance: 1700.00,
        total_credit: 500.00,
        welcome_credit_granted: false,
        showcase_credit_granted: false,
        can_use_welcome_credit: false,
        can_use_showcase_credit: false,
        updated_at: new Date().toISOString(),
      };

      // Calculate with TOPUP_CREDIT payment mode
      const result = await calculateEventPayment(
        1400.00,
        'TOPUP_CREDIT',
        'org-test-calc',
        { wallet: mockWallet }
      );

      // Max topup credit allowed: 25% (since MY was updated to 0.25 above) or 20%
      expect(result.topupCreditUsed).toBeGreaterThan(0);
      expect(result.totalDiscount).toBe(result.topupCreditUsed);
      expect(result.paidAmount).toBe(1400.00 - result.totalDiscount);
      expect(result.isPayable).toBe(true);
    });
  });
});
