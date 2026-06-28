-- The audit_logs append-only trigger blocks the ON DELETE SET NULL cascade from
-- transactions, which made deleting any transaction fail. An immutable audit log
-- should retain the historical transaction_id even after the deal is deleted, so
-- drop the FK and keep it as a plain value (no referential mutation on delete).
alter table public.audit_logs drop constraint if exists audit_logs_transaction_id_fkey;
-- Same reasoning for the document reference on audit_logs (if present).
alter table public.audit_logs drop constraint if exists audit_logs_document_id_fkey;
