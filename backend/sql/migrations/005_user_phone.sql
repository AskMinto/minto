-- 005_user_phone.sql
-- Adds phone_number to the users table for WhatsApp alert delivery.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_number text;
