-- Lets document sync upsert by SharePoint item id (multiple NULLs allowed for
-- non-SharePoint/manual rows, since NULLs are distinct in a unique index).
create unique index if not exists documents_sharepoint_file_id_key
  on public.documents (sharepoint_file_id);
