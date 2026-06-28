-- created_by holds the actor's display name (like communications.created_by); the
-- structured author lives in author_name/author_type. Use text, not uuid.
alter table public.messages alter column created_by type text using created_by::text;
