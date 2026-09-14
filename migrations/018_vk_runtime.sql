CREATE TABLE vk_runtime (
  connection_id uuid PRIMARY KEY REFERENCES business_connection(id) ON DELETE CASCADE,
  generation uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'error')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vk_update (
  connection_id uuid NOT NULL REFERENCES vk_runtime(connection_id) ON DELETE CASCADE,
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, event_id)
);

CREATE TABLE vk_outbox (
  id bigserial PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES vk_runtime(connection_id) ON DELETE CASCADE,
  peer_id text NOT NULL,
  message text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vk_outbox_pending ON vk_outbox(connection_id, peer_id, id) WHERE delivered_at IS NULL;
