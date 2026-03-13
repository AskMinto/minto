-- 006_chat_messages_chat_id.sql
-- Adds chat_id FK column to chat_messages if it was created without it.

ALTER TABLE public.chat_messages
    ADD COLUMN IF NOT EXISTS chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE;
