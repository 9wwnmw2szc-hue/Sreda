/**
 * Имитация сетевой задержки для будущего HTTP API.
 * На этапе 1 можно держать низкой.
 */
export function delay(ms = 0): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
