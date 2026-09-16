ALTER TABLE business ADD COLUMN public_name text CHECK (length(public_name) BETWEEN 1 AND 100);
ALTER TABLE business ADD COLUMN greeting text NOT NULL DEFAULT '' CHECK (length(greeting)<=2000);
ALTER TABLE business ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description)<=4000);
ALTER TABLE business ADD COLUMN contact_info text NOT NULL DEFAULT '' CHECK (length(contact_info)<=2000);
CREATE TABLE client (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES business(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), phone text, email text,
 first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,id)
);
CREATE INDEX client_activity_order ON client(business_id,last_seen_at DESC,id);
CREATE TABLE client_identity (
 business_id uuid NOT NULL, client_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('telegram','vk','phone','email')), value text NOT NULL,
 username text, verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,kind,value),
 FOREIGN KEY(business_id,client_id) REFERENCES client(business_id,id)
);
CREATE TABLE client_activity (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, client_id uuid NOT NULL,
 type text NOT NULL, target_id text, actor_user_id uuid REFERENCES "user"(id), metadata jsonb NOT NULL DEFAULT '{}',
 event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,event_key), FOREIGN KEY(business_id,client_id) REFERENCES client(business_id,id)
);
CREATE INDEX client_activity_history ON client_activity(business_id,client_id,created_at DESC);
CREATE TABLE client_note (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, client_id uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES "user"(id), text text NOT NULL CHECK(length(text) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(business_id,client_id) REFERENCES client(business_id,id)
);
ALTER TABLE lead ADD COLUMN client_id uuid;
ALTER TABLE lead ADD CONSTRAINT lead_client_scope FOREIGN KEY(business_id,client_id) REFERENCES client(business_id,id);
ALTER TABLE communication_conversation ADD COLUMN client_id uuid;
ALTER TABLE communication_conversation ADD CONSTRAINT conversation_client_scope FOREIGN KEY(business_id,client_id) REFERENCES client(business_id,id);
CREATE TABLE notification (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES business(id), type text NOT NULL,
 title text NOT NULL, target_path text NOT NULL, event_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(business_id,event_key), UNIQUE(business_id,id)
);
CREATE TABLE notification_recipient (
 business_id uuid NOT NULL, notification_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES "user"(id),
 read_at timestamptz, PRIMARY KEY(notification_id,user_id),
 FOREIGN KEY(business_id,notification_id) REFERENCES notification(business_id,id),
 FOREIGN KEY(business_id,user_id) REFERENCES business_member(business_id,user_id)
);
