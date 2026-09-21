-- Staff Telegram/VK notification destinations must be verified provider identities.
-- Clear unbound or polluted chat destinations so customers never receive business ops notices.
-- Rows stay in place. Members reconnect notifications from their own account.

UPDATE notification_binding AS nb
SET
  chat_id = NULL,
  code_hash = NULL,
  expires_at = NULL
WHERE nb.chat_id IS NOT NULL
  AND nb.platform IN ('telegram', 'vk')
  AND NOT EXISTS (
    SELECT 1
    FROM provider_identity AS pi
    WHERE pi.user_id = nb.user_id
      AND pi.platform = nb.platform
      AND pi.external_user_id = nb.chat_id
      AND pi.revoked_at IS NULL
  )
