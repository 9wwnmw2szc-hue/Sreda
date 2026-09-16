import test from "node:test";
import assert from "node:assert/strict";
import {
  newLeadSetupDraft,
  parseLeadSetupDraft,
  leadSetupStorageKey,
} from "../src/lib/leadSetupDraft.ts";
test("broken and unsupported drafts recover safely", () => {
  for (const raw of [
    "{",
    "null",
    "[]",
    '{"version":2}',
    '{"version":1,"channels":"telegram","fields":[]}',
  ]) {
    assert.deepEqual(parseLeadSetupDraft(raw), newLeadSetupDraft());
  }
});
test("a draft cannot skip channel selection or remove the required name", () => {
  const d = parseLeadSetupDraft(
    JSON.stringify({
      version: 1,
      step: 3,
      channels: ["max", "unknown"],
      fields: [],
    }),
  );
  assert.equal(d.step, 0);
  assert.deepEqual(d.channels, []);
  assert.deepEqual(d.fields, ["name"]);
});
test("a valid draft resumes and strips unknown properties", () => {
  const d = parseLeadSetupDraft(
    JSON.stringify({
      version: 1,
      step: 2,
      channels: ["vk", "telegram", "vk"],
      fields: ["comment", "name", "unknown"],
      credential: "must-not-survive",
    }),
  );
  assert.equal(d.step, 2);
  assert.deepEqual(d.channels, ["telegram", "vk"]);
  assert.deepEqual(d.fields, ["name", "comment"]);
  assert.equal("credential" in d, false);
});
test("workspace keys do not share setup drafts", () => {
  assert.notEqual(
    leadSetupStorageKey("biz_zerno"),
    leadSetupStorageKey("biz_boroda"),
  );
});
test("out-of-range and fractional steps restart at the first step", () => {
  for (const step of [-1, 4, 1.5, "2"])
    assert.equal(
      parseLeadSetupDraft(
        JSON.stringify({
          version: 1,
          step,
          channels: ["telegram"],
          fields: ["name"],
        }),
      ).step,
      0,
    );
});
test("editable greeting, confirmation and question settings survive draft restoration", () => {
  const d = parseLeadSetupDraft(
    JSON.stringify({
      version: 1,
      step: 2,
      channels: ["telegram"],
      fields: ["name", "phone"],
      title: "Обратный звонок",
      greeting: "Здравствуйте!",
      finalMessage: "Спасибо!",
      fieldOptions: {
        name: { label: "Ваше имя", required: false },
        phone: { label: "Номер телефона", required: true },
      },
    }),
  );
  assert.equal(d.title, "Обратный звонок");
  assert.equal(d.finalMessage, "Спасибо!");
  assert.equal(d.fieldOptions.name.required, true);
  assert.equal(d.fieldOptions.phone.required, true);
});
