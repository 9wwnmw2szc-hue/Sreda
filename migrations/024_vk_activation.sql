ALTER TABLE vk_runtime ADD COLUMN confirmation_code text;
ALTER TABLE vk_runtime ADD COLUMN server_id integer;
ALTER TABLE vk_runtime ADD COLUMN setup_lock_until timestamptz;
ALTER TABLE connection_secret ADD COLUMN encrypted_publish_token text;
