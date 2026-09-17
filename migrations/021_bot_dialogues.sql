ALTER TABLE telegram_dialog ADD COLUMN mode text NOT NULL DEFAULT 'leads';
ALTER TABLE telegram_dialog ADD COLUMN config text NOT NULL DEFAULT '{}';
ALTER TABLE telegram_outbox ADD COLUMN buttons jsonb NOT NULL DEFAULT '[]';
ALTER TABLE vk_outbox ADD COLUMN buttons jsonb NOT NULL DEFAULT '[]';
CREATE TABLE vk_dialog (
 connection_id uuid NOT NULL REFERENCES vk_runtime(connection_id) ON DELETE CASCADE,
 chat_id text NOT NULL, fields text NOT NULL, answers text NOT NULL, position integer NOT NULL,
 last_update_id text NOT NULL, mode text NOT NULL DEFAULT 'menu',config text NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,chat_id)
);
