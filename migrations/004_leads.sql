CREATE TABLE "lead" (
  "id" uuid PRIMARY KEY,
  "business_id" uuid NOT NULL REFERENCES "business"("id") ON DELETE CASCADE,
  "source" text NOT NULL CHECK ("source" IN ('telegram', 'vk', 'max')),
  "name" text NOT NULL,
  "phone" text,
  "message" text,
  "status" text NOT NULL DEFAULT 'new' CHECK ("status" IN ('new', 'processing', 'closed')),
  "external_event_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_external_event_unique UNIQUE (business_id, source, external_event_id)
);
CREATE INDEX lead_business_created_idx ON "lead" (business_id, created_at DESC);
CREATE INDEX lead_business_status_idx ON "lead" (business_id, status);
