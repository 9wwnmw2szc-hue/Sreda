ALTER TABLE business_connection ADD CONSTRAINT connection_business_unique UNIQUE(business_id,id);
CREATE TABLE attachment (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES business(id),type text NOT NULL CHECK(type IN ('image','video','document','voice')),
 provider text NOT NULL CHECK(provider IN ('storage','telegram','vk')),storage_key text,connection_id uuid,
 external jsonb NOT NULL DEFAULT '{}',filename text NOT NULL,mime_type text NOT NULL,size_bytes bigint CHECK(size_bytes BETWEEN 0 AND 52428800),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,id),FOREIGN KEY(business_id,connection_id) REFERENCES business_connection(business_id,id)
);
ALTER TABLE communication_message ADD CONSTRAINT message_business_unique UNIQUE(business_id,id);
CREATE TABLE communication_attachment (
 business_id uuid NOT NULL,message_id uuid NOT NULL,attachment_id uuid NOT NULL,PRIMARY KEY(message_id,attachment_id),
 FOREIGN KEY(business_id,message_id) REFERENCES communication_message(business_id,id),FOREIGN KEY(business_id,attachment_id) REFERENCES attachment(business_id,id)
);
CREATE TABLE post_attachment (
 business_id uuid NOT NULL,post_id uuid NOT NULL,attachment_id uuid NOT NULL,position integer NOT NULL,PRIMARY KEY(post_id,attachment_id),
 FOREIGN KEY(business_id,post_id) REFERENCES post(business_id,id),FOREIGN KEY(business_id,attachment_id) REFERENCES attachment(business_id,id)
);
ALTER TABLE telegram_outbox ADD COLUMN attachment_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE vk_outbox ADD COLUMN attachment_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE telegram_outbox DROP CONSTRAINT telegram_outbox_post_delivery_id_key;
ALTER TABLE vk_outbox DROP CONSTRAINT vk_outbox_post_delivery_id_key;
ALTER TABLE telegram_outbox ADD COLUMN post_step integer NOT NULL DEFAULT 0;
ALTER TABLE vk_outbox ADD COLUMN post_step integer NOT NULL DEFAULT 0;
ALTER TABLE telegram_outbox ADD CONSTRAINT telegram_post_step_unique UNIQUE(post_delivery_id,post_step);
ALTER TABLE vk_outbox ADD CONSTRAINT vk_post_step_unique UNIQUE(post_delivery_id,post_step);
