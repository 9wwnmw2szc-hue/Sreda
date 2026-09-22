UPDATE business_connection AS c
SET
  external_account_id = NULL,
  status = 'disconnected',
  updated_at = now()
FROM business AS b
WHERE c.business_id = b.id
  AND c.external_account_id IS NOT NULL
  AND (
    b.archived_at IS NOT NULL
    OR c.status = 'disconnected'
  );

UPDATE business_channel_admin AS a
SET status = 'revoked'
FROM business AS b
WHERE a.business_id = b.id
  AND b.archived_at IS NOT NULL
  AND a.status = 'active';
