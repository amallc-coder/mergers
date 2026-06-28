-- Add the per-transaction `messages` thread to the snapshot so the Inbox, the
-- transaction Messages panel, and the AI assistant/summary can all read it.
create or replace function public.app_snapshot()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'org', (select jsonb_build_object('id', id, 'name', name, 'acquiringEntity', acquiring_entity)
            from organizations order by created_at limit 1),
    'pipelineStages', coalesce((select jsonb_agg(jsonb_build_object(
        'key', ps.key, 'label', ps.label, 'sortOrder', ps.sort_order,
        'isTerminal', ps.is_terminal, 'automations', ps.automations) order by ps.sort_order)
      from pipeline_stages ps), '[]'::jsonb),
    'alertRouting', coalesce((select jsonb_agg(jsonb_build_object('category', ar.category, 'roles', to_jsonb(ar.roles)))
      from alert_routing ar), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
        'id', u.id, 'organizationId', u.organization_id, 'name', u.name, 'email', u.email,
        'role', u.role, 'title', u.title,
        'scopedTransactionIds', coalesce((select jsonb_agg(s.transaction_id)
            from transaction_user_scopes s where s.user_id = u.id), '[]'::jsonb)
      ) order by u.created_at) from users u), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'type', c.type, 'name', c.name, 'email', c.email, 'phone', c.phone,
        'title', c.title, 'functionalRoles', to_jsonb(c.functional_roles), 'createdAt', c.created_at)
      order by c.name) from contacts c), '[]'::jsonb),
    'contactLinks', coalesce((select jsonb_agg(jsonb_build_object(
        'contactId', cl.contact_id, 'transactionId', cl.transaction_id,
        'isPrimary', cl.is_primary, 'roleOnDeal', cl.role_on_deal)) from contact_links cl), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'organizationId', t.organization_id, 'name', t.name, 'practiceName', t.practice_name,
        'specialty', t.specialty, 'state', t.state, 'locationsCount', t.locations_count,
        'providersCount', t.providers_count, 'stage', t.stage,
        'stageEnteredAt', (select max(ts.entered_at) from transaction_stages ts
                           where ts.transaction_id = t.id and ts.stage = t.stage),
        'assignedCoordinatorId', t.assigned_coordinator_id, 'internalDealOwnerId', t.internal_deal_owner_id,
        'externalPrimaryContactId', t.external_primary_contact_id, 'sharePointFolderUrl', t.sharepoint_folder_url,
        'lastActivityDate', t.last_activity_date, 'riskLevel', t.risk_level, 'templateId', t.template_id,
        'stageHistory', coalesce((select jsonb_agg(jsonb_build_object(
            'stage', ts.stage, 'ownerId', ts.owner_id, 'dueDate', ts.due_date,
            'enteredAt', ts.entered_at, 'notes', ts.notes) order by ts.entered_at)
          from transaction_stages ts where ts.transaction_id = t.id), '[]'::jsonb),
        'createdAt', t.created_at
      ) order by t.last_activity_date desc) from transactions t), '[]'::jsonb),
    'contacts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'transactionId', cl.transaction_id, 'type', c.type, 'name', c.name,
        'email', c.email, 'phone', c.phone, 'role', cl.role_on_deal, 'primary', cl.is_primary))
      from contact_links cl join contacts c on c.id = cl.contact_id), '[]'::jsonb),
    'requestItems', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'transactionId', r.transaction_id, 'templateItemKey', r.template_item_key,
        'category', r.category, 'name', r.name, 'neededTimeline', r.needed_timeline,
        'sensitive', r.sensitive, 'criticalPreSigning', r.critical_pre_signing, 'status', r.status,
        'internalReviewStatus', r.internal_review_status,
        'assignedExternalContactId', r.assigned_external_contact_id,
        'assignedInternalReviewerId', r.assigned_internal_reviewer_id, 'dueDate', r.due_date,
        'documents', '[]'::jsonb, 'internalNotes', '[]'::jsonb, 'sellerFacingNotes', '[]'::jsonb,
        'aiClassification', r.ai_classification, 'aiConfidence', r.ai_confidence,
        'humanReviewRequired', r.human_review_required, 'lastUpdated', r.last_updated))
      from diligence_request_items r), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'transactionId', d.transaction_id, 'requestItemId', d.request_item_id,
        'category', d.category, 'fileName', d.file_name, 'mimeType', d.mime_type, 'sizeBytes', d.size_bytes,
        'version', d.version, 'uploadedBy', d.uploaded_by, 'uploadedByType', d.uploaded_by_type,
        'uploadedAt', d.uploaded_at, 'sharePointFileId', d.sharepoint_file_id, 'sharePointUrl', d.sharepoint_url,
        'sharePointSyncStatus', d.sharepoint_sync_status, 'reviewStatus', d.review_status))
      from documents d), '[]'::jsonb),
    'metrics', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'transactionId', m.transaction_id, 'metricKey', m.metric_key, 'metricName', m.metric_name,
        'category', m.category,
        'metricValue', coalesce(to_jsonb(m.metric_value_numeric), to_jsonb(m.metric_value_text)),
        'metricUnit', m.metric_unit, 'period', m.period, 'sourceDocumentId', m.source_document_id,
        'sourceDocumentName', m.source_document_name, 'sourcePage', m.source_page,
        'confidenceScore', m.confidence_score, 'requiresHumanReview', m.requires_human_review,
        'source', m.source, 'lastUpdated', m.last_updated))
      from ai_extracted_metrics m), '[]'::jsonb),
    'riskFlags', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rf.id, 'transactionId', rf.transaction_id, 'category', rf.category, 'severity', rf.severity,
        'title', rf.title, 'detail', rf.detail, 'sourceMetricKeys', to_jsonb(rf.source_metric_keys),
        'createdAt', rf.created_at)) from risk_flags rf), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
        'id', tk.id, 'transactionId', tk.transaction_id, 'title', tk.title, 'description', tk.description,
        'status', tk.status, 'assigneeId', tk.assignee_id, 'dueDate', tk.due_date, 'category', tk.category,
        'createdAt', tk.created_at)) from tasks tk), '[]'::jsonb),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', mt.id, 'transactionId', mt.transaction_id, 'type', mt.type, 'title', mt.title,
        'start', mt.starts_at, 'end', mt.ends_at, 'attendeeContactIds', to_jsonb(mt.attendee_contact_ids),
        'agenda', mt.agenda, 'outlookEventId', mt.outlook_event_id, 'location', mt.location,
        'onlineMeetingUrl', mt.online_meeting_url)) from meetings mt), '[]'::jsonb),
    'comments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', cm.id, 'transactionId', cm.transaction_id, 'requestItemId', cm.request_item_id,
        'authorId', cm.author_id, 'authorName', cm.author_name, 'authorType', cm.author_type,
        'visibility', cm.visibility, 'body', cm.body, 'createdAt', cm.created_at))
      from comments cm), '[]'::jsonb),
    'communications', coalesce((select jsonb_agg(jsonb_build_object(
        'id', co.id, 'transactionId', co.transaction_id, 'contactId', co.contact_id,
        'toEmail', co.to_email, 'toName', co.to_name, 'subject', co.subject, 'templateKey', co.template_key,
        'status', co.status, 'error', co.error, 'sentAt', co.sent_at, 'createdBy', co.created_by,
        'createdAt', co.created_at) order by co.created_at desc) from communications co), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
        'id', mg.id, 'transactionId', mg.transaction_id, 'direction', mg.direction,
        'subject', mg.subject, 'body', mg.body, 'relatedMetricKey', mg.related_metric_key,
        'relatedTaskId', mg.related_task_id, 'authorId', mg.author_id, 'authorName', mg.author_name,
        'authorType', mg.author_type, 'status', mg.status, 'readAt', mg.read_at,
        'createdBy', mg.created_by, 'createdAt', mg.created_at) order by mg.created_at)
      from messages mg), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'transactionId', a.transaction_id, 'type', a.type, 'actorId', a.actor_id,
        'actorName', a.actor_name, 'summary', a.summary, 'detail', a.detail, 'category', a.category,
        'createdAt', a.created_at) order by a.created_at desc) from activity_events a), '[]'::jsonb),
    'sellerPortalUsers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', sp.id, 'transactionId', sp.transaction_id, 'contactId', sp.contact_id, 'email', sp.email,
        'name', sp.name, 'accessToken', sp.access_token, 'active', sp.active,
        'expiresAt', sp.expires_at, 'lastAccessAt', sp.last_access_at))
      from seller_portal_users sp), '[]'::jsonb)
  );
$$;
revoke all on function public.app_snapshot() from public, anon, authenticated;
grant execute on function public.app_snapshot() to service_role;
