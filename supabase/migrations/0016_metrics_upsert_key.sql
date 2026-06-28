-- Make ai_extracted_metrics upsertable per (transaction, metric_key, period) so the
-- KPI extractor (sharepoint function `extractMetrics`) is idempotent across slices and
-- re-runs. period defaults to '' so the unique key never collides on NULLs.
update public.ai_extracted_metrics set period = '' where period is null;
alter table public.ai_extracted_metrics alter column period set default '';
alter table public.ai_extracted_metrics alter column period set not null;
create unique index if not exists ai_extracted_metrics_tx_key_period_uq
  on public.ai_extracted_metrics (transaction_id, metric_key, period);
