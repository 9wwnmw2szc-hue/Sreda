ALTER TABLE post ADD COLUMN deleted_at timestamptz;
CREATE INDEX post_visible_list ON post(business_id,created_at DESC) WHERE deleted_at IS NULL;
