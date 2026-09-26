import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseContactMessage } from "../src/lib/contact-message";

// 2026-09-26: /admin/messages read ContactMessage but nothing wrote it.
test("a valid contact message parses into a ContactMessage row", () => {
  const r = parseContactMessage({ name: " Sam ", email: "sam@example.com", subject: "", message: "The Jinx price looks off." });
  assert.deepEqual(r, {
    ok: true,
    spam: false,
    data: { name: "Sam", email: "sam@example.com", subject: null, message: "The Jinx price looks off." },
  });
});

test("contact form rejects missing name, bad email and too-short messages", () => {
  assert.equal(parseContactMessage({ email: "a@b.co", message: "long enough text" }).ok, false);
  assert.equal(parseContactMessage({ name: "A", email: "nope", message: "long enough text" }).ok, false);
  assert.equal(parseContactMessage({ name: "A", email: "a@b.co", message: "short" }).ok, false);
  assert.equal(parseContactMessage(null).ok, false);
});

test("a filled honeypot is accepted and dropped", () => {
  assert.deepEqual(parseContactMessage({ website: "spam.biz", name: "x", email: "a@b.co", message: "long enough text" }), {
    ok: true,
    spam: true,
  });
});

test("the /contact page renders a form that posts to /api/contact, which writes ContactMessage", () => {
  assert.match(readFileSync("src/app/contact/page.tsx", "utf8"), /<ContactForm \/>/);
  assert.match(readFileSync("src/components/ContactForm.tsx", "utf8"), /fetch\("\/api\/contact"/);
  assert.match(readFileSync("src/app/api/contact/route.ts", "utf8"), /prisma\.contactMessage\.create/);
});

test("feedback honeypots are display:none, never a rendered opacity-0 field autofill can fill", () => {
  for (const f of ["src/components/FeedbackForm.tsx", "src/components/FeedbackWidget.tsx", "src/components/ContactForm.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /pointer-events-none absolute h-0 w-0 opacity-0/, f);
    assert.match(s, /name="website"[\s\S]{0,400}className="hidden"/, f);
  }
});
