ALTER TABLE "user" ADD COLUMN "public_id" text;
ALTER TABLE "user" ALTER COLUMN "public_id" SET DEFAULT ('usr_' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 20));
UPDATE "user" SET "public_id" = 'usr_' || substring(md5(random()::text || clock_timestamp()::text || id::text) from 1 for 20) WHERE "public_id" IS NULL;
ALTER TABLE "user" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "user" ADD CONSTRAINT user_public_id_unique UNIQUE ("public_id");

ALTER TABLE "business" ADD COLUMN "public_id" text;
ALTER TABLE "business" ALTER COLUMN "public_id" SET DEFAULT ('biz_' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 20));
UPDATE "business" SET "public_id" = 'biz_' || substring(md5(random()::text || clock_timestamp()::text || id::text) from 1 for 20) WHERE "public_id" IS NULL;
ALTER TABLE "business" ALTER COLUMN "public_id" SET NOT NULL;
ALTER TABLE "business" ADD CONSTRAINT business_public_id_unique UNIQUE ("public_id");
