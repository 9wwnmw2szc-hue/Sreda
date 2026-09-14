CREATE TABLE lead_setup (
 business_id uuid PRIMARY KEY REFERENCES business(id) ON DELETE CASCADE,
 draft text NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE telegram_runtime (
 connection_id uuid PRIMARY KEY REFERENCES business_connection(id) ON DELETE CASCADE,
 generation uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','ready','error')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE telegram_dialog (
 connection_id uuid NOT NULL REFERENCES telegram_runtime(connection_id) ON DELETE CASCADE,
 chat_id text NOT NULL,
 fields text NOT NULL,
 answers text NOT NULL,
 position integer NOT NULL,
 last_update_id bigint NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id, chat_id)
);
CREATE TABLE telegram_update (
 connection_id uuid NOT NULL REFERENCES telegram_runtime(connection_id) ON DELETE CASCADE,
 update_id bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,update_id)
);
CREATE TABLE telegram_outbox (
 id bigserial PRIMARY KEY,
 connection_id uuid NOT NULL REFERENCES telegram_runtime(connection_id) ON DELETE CASCADE,
 chat_id text NOT NULL,
 message text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_outbox_pending ON telegram_outbox(connection_id,chat_id,id) WHERE delivered_at IS NULL;
CREATE TABLE worker_heartbeat (name text PRIMARY KEY, seen_at timestamptz NOT NULL);
