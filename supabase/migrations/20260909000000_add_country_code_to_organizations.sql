-- Migration: Add country_code to public.organizations
-- Date: 2026-09-09
-- Purpose: Collect organization country (ISO 3166-1 alpha-2) as business/account information.
-- Existing organizations retain NULL country_code and remain valid.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);

-- Ensure format constraint if provided (2 uppercase letters or NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_country_code_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_country_code_check
      CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

-- Index for regional lookups or filtering
CREATE INDEX IF NOT EXISTS idx_organizations_country_code ON public.organizations (country_code);
