import { randomUUID } from "node:crypto";
import { attachmentStorage } from "../src/server/attachments/storage.ts";

const storage = attachmentStorage();
const key = `${randomUUID()}/${randomUUID()}`;
const expected = Buffer.from("sreda-staging-s3-smoke", "utf8");
let created = false;

try {
  await storage.put(key, expected, "text/plain");
  created = true;
  const actual = Buffer.from(await storage.get(key));
  if (!actual.equals(expected)) throw new Error("S3 smoke read mismatch");
  console.log("S3_SMOKE_WRITE=OK");
  console.log("S3_SMOKE_READ=OK");
} finally {
  if (created) {
    await storage.remove(key);
    console.log("S3_SMOKE_DELETE=OK");
  }
}
