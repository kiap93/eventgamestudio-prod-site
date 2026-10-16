-- Migration: 20261017000000_separate_sales_partner_applicant_and_admin_notes.sql
-- Description: Separate applicant-submitted details (agency_name, application_notes)
--              from private administrator notes (admin_notes) in sales_partner_profiles.

-- 1. Add dedicated columns for applicant identity and details
ALTER TABLE public.sales_partner_profiles
  ADD COLUMN IF NOT EXISTS agency_name TEXT,
  ADD COLUMN IF NOT EXISTS application_notes TEXT;

-- 2. Safe migration path: Extract applicant information from legacy combined admin_notes if present
UPDATE public.sales_partner_profiles
SET
  agency_name = CASE
    WHEN agency_name IS NULL AND admin_notes LIKE '%Agency / Organization:%' THEN
      substring(admin_notes FROM 'Agency / Organization:\s*([^|]+)')
    ELSE agency_name
  END,
  application_notes = CASE
    WHEN application_notes IS NULL AND admin_notes LIKE '%Applicant Notes:%' THEN
      substring(admin_notes FROM 'Applicant Notes:\s*(.*)')
    ELSE application_notes
  END
WHERE admin_notes IS NOT NULL AND (agency_name IS NULL OR application_notes IS NULL);

-- 3. Comments for documentation and schema clarity
COMMENT ON COLUMN public.sales_partner_profiles.agency_name IS 'Trading name, agency, or event company submitted by the applicant';
COMMENT ON COLUMN public.sales_partner_profiles.application_notes IS 'Experience, target event clients, or proposal details submitted by the applicant';
COMMENT ON COLUMN public.sales_partner_profiles.admin_notes IS 'Private internal administrator notes visible only to platform developer admins';
