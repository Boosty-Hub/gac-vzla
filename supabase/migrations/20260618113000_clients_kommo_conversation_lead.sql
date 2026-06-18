-- Track the per-client Post Venta "En conversación Cliente/Empresa" lead so the
-- client migration (kommo-api action `migrate_clients`) is idempotent and never
-- creates duplicate conversation leads on re-run.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS kommo_conversation_lead_id bigint;
