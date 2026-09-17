CREATE TABLE notification_binding (
 business_id uuid NOT NULL REFERENCES business(id),user_id uuid NOT NULL REFERENCES "user"(id),connection_id uuid NOT NULL,
 chat_id text,code_hash text,expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,user_id),UNIQUE(connection_id,chat_id),
 FOREIGN KEY(business_id,connection_id) REFERENCES business_connection(business_id,id)
);
CREATE TABLE notification_preference (
 business_id uuid NOT NULL REFERENCES business(id),user_id uuid NOT NULL REFERENCES "user"(id),
 type text NOT NULL CHECK(type IN ('lead.created','message.received','booking.created','booking.cancelled','booking.rescheduled','post.failed')),
 enabled boolean NOT NULL DEFAULT true,PRIMARY KEY(business_id,user_id,type)
);
ALTER TABLE notification_recipient ADD COLUMN telegram_queued boolean NOT NULL DEFAULT false;
ALTER TABLE telegram_outbox ADD COLUMN notification_id uuid REFERENCES notification(id);
ALTER TABLE telegram_outbox ADD COLUMN notification_user_id uuid REFERENCES "user"(id);
ALTER TABLE telegram_outbox ADD CONSTRAINT notification_delivery_unique UNIQUE(notification_id,notification_user_id);
