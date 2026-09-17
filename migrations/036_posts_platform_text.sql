-- Platform-specific post text variants (Telegram / VK); MAX reserved for future.
ALTER TABLE post
  ADD COLUMN text_telegram text CHECK (text_telegram IS NULL OR length(text_telegram) <= 4096),
  ADD COLUMN text_vk text CHECK (text_vk IS NULL OR length(text_vk) <= 4096);
