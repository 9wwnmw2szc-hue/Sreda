CREATE TABLE booking_service (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES business(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),description text NOT NULL DEFAULT '',
 price numeric(12,2) CHECK(price>=0),currency text NOT NULL DEFAULT 'RUB',duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 1440),
 buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_before_minutes BETWEEN 0 AND 720),buffer_after_minutes integer NOT NULL DEFAULT 0 CHECK(buffer_after_minutes BETWEEN 0 AND 720),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,id)
);
CREATE TABLE booking_specialist (
 id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES business(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),description text NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,id)
);
CREATE TABLE booking_service_specialist (
 business_id uuid NOT NULL,service_id uuid NOT NULL,specialist_id uuid NOT NULL,PRIMARY KEY(service_id,specialist_id),
 FOREIGN KEY(business_id,service_id) REFERENCES booking_service(business_id,id),FOREIGN KEY(business_id,specialist_id) REFERENCES booking_specialist(business_id,id)
);
CREATE TABLE booking_settings (
 business_id uuid PRIMARY KEY REFERENCES business(id),minimum_booking_notice integer NOT NULL DEFAULT 120 CHECK(minimum_booking_notice BETWEEN 0 AND 10080),
 maximum_booking_horizon integer NOT NULL DEFAULT 60 CHECK(maximum_booking_horizon BETWEEN 1 AND 365),slot_interval integer NOT NULL DEFAULT 15 CHECK(slot_interval BETWEEN 5 AND 240)
);
CREATE TABLE booking_schedule (
 business_id uuid NOT NULL,specialist_id uuid NOT NULL,weekday integer NOT NULL CHECK(weekday BETWEEN 0 AND 6),intervals jsonb NOT NULL,
 PRIMARY KEY(specialist_id,weekday),FOREIGN KEY(business_id,specialist_id) REFERENCES booking_specialist(business_id,id)
);
CREATE TABLE booking_schedule_exception (
 business_id uuid NOT NULL,specialist_id uuid NOT NULL,date date NOT NULL,intervals jsonb NOT NULL,reason text NOT NULL DEFAULT '',
 PRIMARY KEY(specialist_id,date),FOREIGN KEY(business_id,specialist_id) REFERENCES booking_specialist(business_id,id)
);
CREATE TABLE booking (
 id uuid PRIMARY KEY,business_id uuid NOT NULL,client_id uuid NOT NULL,service_id uuid NOT NULL,specialist_id uuid NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,occupied_from timestamptz NOT NULL,occupied_until timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','confirmed','completed','cancelled','no_show')),revision integer NOT NULL DEFAULT 1,
 source text NOT NULL CHECK(source IN ('manual','telegram','vk')),request_key text NOT NULL,request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(business_id,request_key),UNIQUE(business_id,id),
 CHECK(occupied_from<=starts_at AND starts_at<ends_at AND ends_at<=occupied_until),
 FOREIGN KEY(business_id,client_id) REFERENCES client(business_id,id),FOREIGN KEY(business_id,service_id) REFERENCES booking_service(business_id,id),FOREIGN KEY(business_id,specialist_id) REFERENCES booking_specialist(business_id,id)
);
CREATE INDEX booking_resource_overlap ON booking(business_id,specialist_id,occupied_from,occupied_until) WHERE status IN ('pending','confirmed');
CREATE TABLE booking_history (
 id uuid PRIMARY KEY,business_id uuid NOT NULL,booking_id uuid NOT NULL,action text NOT NULL,actor_user_id uuid REFERENCES "user"(id),
 previous_start timestamptz,new_start timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(business_id,booking_id) REFERENCES booking(business_id,id)
);
CREATE TABLE booking_reminder (
 id uuid PRIMARY KEY,business_id uuid NOT NULL,booking_id uuid NOT NULL,revision integer NOT NULL,kind text NOT NULL CHECK(kind IN ('confirmation','24h','2h')),
 due_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','sent','cancelled','failed','uncertain')),
 last_error text,UNIQUE(booking_id,revision,kind),FOREIGN KEY(business_id,booking_id) REFERENCES booking(business_id,id)
);
ALTER TABLE telegram_outbox ADD COLUMN booking_reminder_id uuid UNIQUE REFERENCES booking_reminder(id);
ALTER TABLE vk_outbox ADD COLUMN booking_reminder_id uuid UNIQUE REFERENCES booking_reminder(id);
