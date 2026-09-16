CREATE TABLE post_target (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES business(id),connection_id uuid NOT NULL REFERENCES business_connection(id),platform text NOT NULL CHECK(platform IN ('telegram','vk')),
 external_id text NOT NULL,title text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,platform,external_id),UNIQUE(business_id,id)
);
CREATE TABLE post (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES business(id),text text NOT NULL CHECK(length(text)<=4096),buttons jsonb NOT NULL DEFAULT '[]',
 status text NOT NULL CHECK(status IN ('draft','scheduled','publishing','published','partial','failed','cancelled')),scheduled_at timestamptz,
 revision integer NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES "user"(id),request_key text NOT NULL,request_hash text NOT NULL,
 template_id uuid REFERENCES post(id),occurrence_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,request_key),UNIQUE(business_id,id),UNIQUE(template_id,occurrence_at)
);
CREATE TABLE post_delivery (
 id uuid PRIMARY KEY,business_id uuid NOT NULL,post_id uuid NOT NULL,target_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','publishing','published','failed','uncertain','cancelled')),external_message_id text,last_error text,
 UNIQUE(post_id,target_id),FOREIGN KEY(business_id,post_id) REFERENCES post(business_id,id),FOREIGN KEY(business_id,target_id) REFERENCES post_target(business_id,id)
);
CREATE TABLE post_schedule (
 post_id uuid PRIMARY KEY REFERENCES post(id),business_id uuid NOT NULL REFERENCES business(id),rule jsonb NOT NULL,active boolean NOT NULL DEFAULT true,next_at timestamptz,
 revision integer NOT NULL DEFAULT 1,FOREIGN KEY(business_id,post_id) REFERENCES post(business_id,id)
);
ALTER TABLE telegram_outbox ADD COLUMN post_delivery_id uuid UNIQUE REFERENCES post_delivery(id);
ALTER TABLE telegram_outbox ADD COLUMN api_payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE vk_outbox ADD COLUMN post_delivery_id uuid UNIQUE REFERENCES post_delivery(id);
ALTER TABLE vk_outbox ADD COLUMN api_payload jsonb NOT NULL DEFAULT '{}';
