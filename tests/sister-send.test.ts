import test from "node:test";
import assert from "node:assert/strict";

import { sendSisterMail, DEX_FROM_DEFAULT } from "../src/lib/sister-alerts/send";

const extras = { text: "t", headers: { "List-Unsubscribe": "<x>" }, from: "DexCompare alerts <noreply@riftcompare.com>" };

function capture(t: test.TestContext, respond: (url: string) => Response) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const orig = global.fetch;
  global.fetch = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return respond(url);
  }) as typeof fetch;
  t.after(() => {
    global.fetch = orig;
  });
  return calls;
}

test("a Dex mail goes through Dex's own Brevo account from alerts@dexcompare.app", async (t) => {
  const calls = capture(t, () => new Response("{}", { status: 201 }));
  const ok = await sendSisterMail("dex", "a@b.com", "s", "<p>h</p>", extras, { DEX_BREVO_API_KEY: "dex-key" });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /api\.brevo\.com/);
  assert.equal(calls[0]!.headers["api-key"], "dex-key");
  assert.equal(calls[0]!.body.sender.email, "alerts@dexcompare.app");
  assert.equal(DEX_FROM_DEFAULT.includes("alerts@dexcompare.app"), true);
});

test("a failed Dex Brevo send falls back to the shared Resend sender", async (t) => {
  const calls = capture(t, (url) => (url.includes("brevo") ? new Response("{}", { status: 400 }) : new Response("{}", { status: 200 })));
  const prev = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  t.after(() => {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  });
  const ok = await sendSisterMail("dex", "a@b.com", "s", "<p>h</p>", extras, { DEX_BREVO_API_KEY: "dex-key" });
  assert.equal(ok, true);
  assert.deepEqual(calls.map((c) => new URL(c.url).hostname), ["api.brevo.com", "api.resend.com"]);
});

test("without the key, or for another site, nothing touches Brevo", async (t) => {
  const calls = capture(t, () => new Response("{}", { status: 200 }));
  const prev = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test";
  t.after(() => {
    if (prev === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev;
  });
  await sendSisterMail("dex", "a@b.com", "s", "h", extras, {});
  await sendSisterMail("mtg", "a@b.com", "s", "h", extras, { DEX_BREVO_API_KEY: "dex-key" });
  assert.ok(calls.every((c) => !c.url.includes("brevo")));
});
