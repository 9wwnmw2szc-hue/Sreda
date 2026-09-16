export type ConfigurationCheck = { name: string; ok: boolean; message: string };
/** Safe diagnostics: return variable names and remedies, never their values. */
export function stagingConfiguration(
  env: Record<string, string | undefined>,
): ConfigurationCheck[] {
  const checks: ConfigurationCheck[] = [];
  const add = (name: string, ok: boolean, message: string) =>
    checks.push({ name, ok, message: ok ? "configured" : message });
  const validUrl = (
    value: string | undefined,
    protocols: string[],
    originOnly = false,
  ) => {
    try {
      const url = new URL(value ?? "");
      return (
        protocols.includes(url.protocol) &&
        (!originOnly || url.origin === value) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  };
  add(
    "APP_URL",
    validUrl(env.APP_URL, ["https:"], true),
    "Set the public HTTPS origin without a path or trailing slash.",
  );
  let database = false;
  try {
    database = ["postgres:", "postgresql:"].includes(
      new URL(env.DATABASE_URL ?? "").protocol,
    );
  } catch {}
  add(
    "DATABASE_URL",
    database,
    "Set the staging PostgreSQL connection string.",
  );
  add(
    "BETTER_AUTH_SECRET",
    (env.BETTER_AUTH_SECRET?.length ?? 0) >= 32,
    "Use the same secret of at least 32 characters in web and workers.",
  );
  add(
    "NEXT_PUBLIC_DATA_SOURCE",
    env.NEXT_PUBLIC_DATA_SOURCE === "api",
    "Build in api mode.",
  );
  for (const flag of ["TELEGRAM_WEBHOOKS_ENABLED", "VK_WEBHOOKS_ENABLED"])
    add(
      flag,
      env[flag] === "true",
      "Enable in isolated staging and run the corresponding worker.",
    );
  add(
    "ATTACHMENT_STORAGE",
    env.ATTACHMENT_STORAGE === "s3",
    "Use a shared private S3 bucket for real staging.",
  );
  add(
    "S3_ENDPOINT",
    validUrl(env.S3_ENDPOINT, ["https:"]),
    "Set an HTTPS S3 endpoint.",
  );
  for (const key of [
    "S3_REGION",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "AI_API_TOKEN",
    "AI_MODEL",
  ])
    add(
      key,
      !!env[key]?.trim(),
      "Required for the complete real integration E2E.",
    );
  return checks;
}
