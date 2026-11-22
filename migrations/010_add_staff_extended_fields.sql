-- =========================================================================
-- Migration 010: Add Extended Staff Non-Mandatory Fields
-- CWP Detailers & Motors Staff Management
--
-- Fields added:
-- - email (Email ID)
-- - date_of_joining (Date of Joining)
-- - aadhar_number (Aadhar Card Number)
-- - aadhar_front_url (Aadhar Card Front Image URL)
-- - aadhar_back_url (Aadhar Card Back Image URL)
-- - bank_passbook_url (Bank Passbook Image URL)
-- - pan_number (PAN Card Number)
-- - pan_card_url (PAN Card Image URL)
-- - driving_license_number (Driving Licence Number)
-- - driving_license_url (Driving Licence Image URL)
-- - salary (Monthly Salary in INR)
-- - weekly_off (Weekly Off Day)
-- =========================================================================

ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS date_of_joining DATE NULL,
ADD COLUMN IF NOT EXISTS aadhar_number VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS aadhar_front_url TEXT NULL,
ADD COLUMN IF NOT EXISTS aadhar_back_url TEXT NULL,
ADD COLUMN IF NOT EXISTS bank_passbook_url TEXT NULL,
ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS pan_card_url TEXT NULL,
ADD COLUMN IF NOT EXISTS driving_license_number VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS driving_license_url TEXT NULL,
ADD COLUMN IF NOT EXISTS salary NUMERIC(10, 2) NULL,
ADD COLUMN IF NOT EXISTS weekly_off VARCHAR(20) NULL;

CREATE INDEX IF NOT EXISTS idx_staff_email ON public.staff (email) WHERE deleted_at IS NULL AND email IS NOT NULL;
