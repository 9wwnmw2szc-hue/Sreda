/**
 * Isolated Next.js app for PR UI gates (disposable Postgres + HTTPS proxy).
 *
 *   node scripts/ci-ui-app.mjs start   # foreground; background in CI
 *   node scripts/ci-ui-app.mjs stop
 *
 * State: artifacts/ci-ui-app.json  → { origin, pid, ... }
 * Requires: TEST_DATABASE_URL (local *test* Postgres), openssl, prior `npm run build`.
 */
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { migrate } from "../src/server/db/migrate.ts";

const STATE_PATH = "artifacts/ci-ui-app.json";
const cmd = process.argv[2] || "start";

async function waitHttp(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          (res.statusCode ?? 500) < 500
            ? resolve()
            : reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(3000, () => req.destroy(new Error("timeout")));
      });
      return;
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`App not ready at ${url}: ${lastErr}`);
}

function killPid(pid, signal) {
  if (!pid) return;
  try {
    process.kill(pid, signal);
  } catch {
    /* gone */
  }
}

async function stop() {
  let state;
  try {
    state = JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    console.log(JSON.stringify({ ok: true, stopped: false, reason: "no-state" }));
    return;
  }
  killPid(state.pid, "SIGTERM");
  killPid(state.keeperPid, "SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
  killPid(state.pid, "SIGKILL");
  killPid(state.keeperPid, "SIGKILL");

  if (state.databaseName && state.adminUrl) {
    const admin = new Pool({ connectionString: state.adminUrl, max: 1 });
    try {
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [state.databaseName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${state.databaseName}"`);
    } catch (error) {
      console.warn(
        "db cleanup:",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await admin.end().catch(() => {});
    }
  }
  for (const dir of [state.certificateDir, state.attachDir]) {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  await rm(STATE_PATH, { force: true }).catch(() => {});
  console.log(JSON.stringify({ ok: true, stopped: true }));
}

async function start() {
  const sourceHref = process.env.TEST_DATABASE_URL;
  if (!sourceHref) throw new Error("TEST_DATABASE_URL is required");
  const source = new URL(sourceHref);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname)) {
    throw new Error("Only local test PostgreSQL is allowed");
  }
  if (!/test/i.test(source.pathname)) {
    throw new Error("Source database name must include 'test'");
  }

  await mkdir("artifacts", { recursive: true });
  await stop().catch(() => {});

  const databaseName = `sreda_ui_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: source.href, max: 1 });
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const dbUrl = new URL(source.href);
  dbUrl.pathname = `/${databaseName}`;
  const databaseUrl = dbUrl.href;

  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl, max: 2 }),
    }),
  });
  const migrations = new URL("../migrations", import.meta.url).pathname;
  await migrate(db, migrations);
  await migrate(db, migrations);
  await db.destroy();
  await admin.end();

  const certificateDir = await mkdtemp(join(tmpdir(), "sreda-ui-"));
  const attachDir = await mkdtemp(join(tmpdir(), "sreda-att-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(certificateDir, "key.pem"),
      "-out",
      join(certificateDir, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
    ],
    { stdio: "ignore" },
  );
  const key = await readFile(join(certificateDir, "key.pem"));
  const cert = await readFile(join(certificateDir, "cert.pem"));

  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const httpPort = /** @type {import('net').AddressInfo} */ (probe.address()).port;
  await new Promise((resolve) => probe.close(resolve));

  const proxyProbe = https.createServer({ key, cert }, () => {});
  await new Promise((resolve) => proxyProbe.listen(0, "127.0.0.1", resolve));
  const proxyPort = /** @type {import('net').AddressInfo} */ (
    proxyProbe.address()
  ).port;
  await new Promise((resolve) => proxyProbe.close(resolve));
  const origin = `https://127.0.0.1:${proxyPort}`;
  const secret = randomBytes(48).toString("base64url");

  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(httpPort),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_DATA_SOURCE: "api",
        APP_URL: origin,
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: secret,
        NEXT_TELEMETRY_DISABLED: "1",
        TELEGRAM_WEBHOOKS_ENABLED: "false",
        VK_WEBHOOKS_ENABLED: "false",
        META_WEBHOOKS_ENABLED: "false",
        WHATSAPP_WEBHOOKS_ENABLED: "false",
        INSTAGRAM_WEBHOOKS_ENABLED: "false",
        ATTACHMENT_STORAGE: "filesystem",
        ATTACHMENT_STORAGE_PATH: attachDir,
        // Ephemeral CI app only — avoid self-induced 429 during UI/visual audits
        CI_RELAX_RATE_LIMITS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    },
  );

  let bootLog = "";
  child.stdout?.on("data", (c) => {
    bootLog += c.toString();
  });
  child.stderr?.on("data", (c) => {
    bootLog += c.toString();
  });

  try {
    await waitHttp(`http://127.0.0.1:${httpPort}/login`);
  } catch (error) {
    console.error(bootLog.slice(-6000));
    child.kill("SIGKILL");
    throw error;
  }

  let backendOk = true;
  child.on("exit", () => {
    backendOk = false;
  });

  const proxy = https.createServer({ key, cert }, (req, res) => {
    if (!backendOk) {
      res.writeHead(502);
      res.end("backend down");
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: httpPort,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-proto": "https",
          "x-forwarded-host": req.headers.host,
        },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  await new Promise((resolve) => proxy.listen(proxyPort, "127.0.0.1", resolve));

  await new Promise((resolve, reject) => {
    const req = https.get(
      `${origin}/login`,
      { rejectUnauthorized: false },
      (res) => {
        res.resume();
        (res.statusCode ?? 500) < 500
          ? resolve()
          : reject(new Error(`HTTPS ${res.statusCode}`));
      },
    );
    req.on("error", reject);
  });

  // adminUrl is job-local only (needed by stop to DROP DATABASE). Workflows scrub it before upload.
  const state = {
    origin,
    httpPort,
    proxyPort,
    databaseName,
    adminUrl: source.href,
    pid: child.pid,
    keeperPid: process.pid,
    certificateDir,
    attachDir,
    checkedSha: process.env.GITHUB_SHA || null,
  };
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(
    JSON.stringify(
      {
        ok: true,
        origin,
        pid: child.pid,
        checkedSha: state.checkedSha,
      },
      null,
      2,
    ),
  );

  const shutdown = async () => {
    proxy.close();
    killPid(child.pid, "SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    killPid(child.pid, "SIGKILL");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  await new Promise(() => {});
}

if (cmd === "stop") {
  await stop();
} else if (cmd === "start") {
  await start();
} else {
  throw new Error(`Unknown command: ${cmd}`);
}
