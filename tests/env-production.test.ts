import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// .env.production IS COMMITTED. NOTHING SECRET MAY EVER BE ADDED TO IT.
// ─────────────────────────────────────────────────────────────────────────────
// Unlike `.env` and `.env*.local` (both gitignored), `.env.production` is
// checked in: `next build` loads it, and `npm test` loads it through
// `node --env-file=.env.production` (see tests/ads-txt.test.ts for why). Its
// own header ends "Nothing secret may ever be added here", and so far that has
// held only by convention. The easy way to break it is also the natural one:
// copying a block out of `.env.example`, whose commented-out examples are
// exactly the secrets that must never land here (`RM3="postgresql://…"`,
// `STRIPE_SECRET_KEY="sk_live_…"`, `RESEND_API_KEY="re_…"`), to "make the
// build work" or to point `npm test` at a database (DECISIONS.md, Phase 1,
// 2026-08-17: the local test recipe exports DATABASE_URL in the shell for
// exactly this reason, rather than adding it here).
//
// Two rules, pinned 2026-09-23:
//   1. Every non-blank, non-comment line is `NEXT_PUBLIC_[A-Z0-9_]+=…`. Next
//      inlines NEXT_PUBLIC_* values into the browser bundle, so a key with the
//      prefix is public by construction, and a key WITHOUT it is a server-side
//      setting, which is the kind that holds credentials.
//   2. No value, and no token in a comment, looks like a credential: a known
//      secret-key prefix, a database URL, or a URL carrying user:password@.
//
// Failure messages name the KEY (or, for a comment or a line that is not an
// assignment, only the line number). They never echo the value: a real secret
// that trips this test must not then be printed into CI logs.

const ROOT = process.cwd();
const FILE = ".env.production";

/** Tokens that begin with one of these are credentials. Case-sensitive. */
const SECRET_PREFIXES: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ["sk_", "Stripe secret key"],
  ["rk_", "Stripe restricted key"],
  ["whsec_", "Stripe webhook signing secret"],
  // Resend keys START with re_. Anchored to the token start on purpose: a bare
  // "contains re_" would flag ordinary values such as "store_first".
  ["re_", "Resend API key"],
  ["sk-", "Anthropic/OpenAI-style API key"],
  ["xkeysib-", "Brevo API key"],
  ["xsmtpsib-", "Brevo SMTP key"],
  ["AIza", "Google API key"],
  ["ghp_", "GitHub token"],
  ["gho_", "GitHub token"],
  ["ghs_", "GitHub token"],
  ["github_pat_", "GitHub token"],
  ["xoxb-", "Slack token"],
  ["xoxp-", "Slack token"],
  ["npm_", "npm token"],
  ["AKIA", "AWS access key id"],
  ["-----BEGIN", "PEM private key"],
];

/** Matched anywhere in the text. */
const SECRET_PATTERNS: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/postgres(?:ql)?:\/\//i, "Postgres connection string"],
  [/(?:mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\//i, "database/queue connection string"],
  [/:\/\/[^\s/:@]+:[^\s/@]+@/, "URL with embedded credentials"],
];

/** Key names that announce a secret even behind NEXT_PUBLIC_. */
const SECRET_KEY_NAME = /SECRET|PASSWORD|PRIVATE_KEY/;

/** Returns a label for the first credential-like thing in `text`, or null. Never returns the text itself. */
function secretKind(text: string): string | null {
  for (const [pattern, label] of SECRET_PATTERNS) if (pattern.test(text)) return label;
  for (const token of text.split(/[\s"'`=(),;:<>[\]{}]+/)) {
    for (const [prefix, label] of SECRET_PREFIXES) if (token.startsWith(prefix)) return label;
  }
  return null;
}

/** The value of `KEY=value`, with surrounding quotes or a trailing ` # comment` removed. */
function valueOf(rhs: string): string {
  const raw = rhs.trim();
  const quote = raw[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    const end = raw.indexOf(quote, 1);
    return end === -1 ? raw.slice(1) : raw.slice(1, end);
  }
  return raw.replace(/\s+#.*$/, "");
}

/**
 * Every problem in an env file's text, as messages safe to print: each names
 * a key or a line number, never a value. `keys` is every well-formed key found.
 */
function auditEnvFile(text: string): { problems: string[]; keys: string[] } {
  const problems: string[] = [];
  const keys: string[] = [];
  text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const n = i + 1;
      const trimmed = line.trim();
      if (trimmed === "") return;
      if (trimmed.startsWith("#")) {
        const kind = secretKind(trimmed);
        if (kind) problems.push(`line ${n} (a comment) contains what looks like a ${kind}`);
        return;
      }
      const m = /^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(trimmed);
      if (!m) {
        // Name the key only when the line really is an assignment; a bare
        // pasted token on its own line may itself be the secret.
        const key = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]/.exec(trimmed)?.[1];
        problems.push(
          key
            ? `line ${n}: ${key} is not a NEXT_PUBLIC_* key; server-side settings belong in the Vercel dashboard, not this committed file`
            : `line ${n} is not a NEXT_PUBLIC_*=value assignment`,
        );
        return;
      }
      const [, key, rhs] = m;
      keys.push(key);
      if (SECRET_KEY_NAME.test(key)) {
        problems.push(`${key}: the key name says it holds a secret, and NEXT_PUBLIC_* values ship to every browser`);
      }
      const kind = secretKind(valueOf(rhs));
      if (kind) problems.push(`${key}: value looks like a ${kind}`);
    });
  return { problems, keys };
}

test(".env.production holds only public NEXT_PUBLIC_* values and nothing that looks like a secret", () => {
  const { problems, keys } = auditEnvFile(readFileSync(join(ROOT, FILE), "utf8"));
  // Guards against a vacuous pass: if the parser ever stops recognising the
  // file's lines (say, an encoding change), "no problems" would mean nothing.
  assert.ok(keys.length > 0, `${FILE} parsed to zero assignments`);
  assert.equal(problems.length, 0, `${FILE} must stay non-secret:\n  ${problems.join("\n  ")}`);
});

// The detector itself, so the test above cannot silently go blind. Fake
// credentials are assembled from pieces so this file never contains a
// literal that a secret scanner would (rightly) flag.
const FAKE = "x".repeat(24);

test("the detector flags each credential shape the rule names", () => {
  const samples: Array<[string, string]> = [
    ["sk" + "_live_" + FAKE, "Stripe secret key"],
    ["rk" + "_live_" + FAKE, "Stripe restricted key"],
    ["whsec" + "_" + FAKE, "Stripe webhook signing secret"],
    ["re" + "_" + FAKE, "Resend API key"],
    ["sk" + "-ant-api03-" + FAKE, "Anthropic/OpenAI-style API key"],
    ["xkeysib" + "-" + FAKE, "Brevo API key"],
    ["postgresql" + "://user:" + FAKE + "@ep-example.neon.tech/db", "Postgres connection string"],
    ["postgres" + "://ep-example.neon.tech/db", "Postgres connection string"],
    ["https://user:" + FAKE + "@example.com/hook", "URL with embedded credentials"],
    ["-----BEGIN" + " PRIVATE KEY-----", "PEM private key"],
  ];
  for (const [value, label] of samples) assert.equal(secretKind(value), label, `expected a ${label} to be flagged`);
});

test("the detector passes the public values this file is meant for", () => {
  for (const value of [
    "ca-pub-6842128782879909",
    "auto",
    "true",
    "store_first",
    "AW-1234567890/AbCdE",
    "ca-app-pub-1234567890123456/1234567890",
    "$9.99",
    "https://cal.com/riftcompare/consult",
  ]) {
    assert.equal(secretKind(value), null, `a public value was flagged: ${value}`);
  }
});

test("an audit names the offending key or line, and never prints the value", () => {
  const secret = "sk" + "_live_" + FAKE;
  const dbUrl = "postgresql" + "://user:" + FAKE + "@ep-example.neon.tech/db";
  const { problems, keys } = auditEnvFile(
    [
      "# header",
      'NEXT_PUBLIC_ADSENSE_CLIENT_ID="ca-pub-6842128782879909"',
      `STRIPE_SECRET_KEY="${secret}"`,
      `NEXT_PUBLIC_STRIPE_KEY=${secret} # pasted`,
      `NEXT_PUBLIC_API_SECRET="public-looking"`,
      `# RM3="${dbUrl}"`,
      secret,
      "",
    ].join("\r\n"),
  );
  assert.deepEqual(keys, ["NEXT_PUBLIC_ADSENSE_CLIENT_ID", "NEXT_PUBLIC_STRIPE_KEY", "NEXT_PUBLIC_API_SECRET"]);
  assert.equal(problems.length, 5);
  assert.ok(problems[0].startsWith("line 3: STRIPE_SECRET_KEY is not a NEXT_PUBLIC_* key"));
  assert.equal(problems[1], "NEXT_PUBLIC_STRIPE_KEY: value looks like a Stripe secret key");
  assert.ok(problems[2].startsWith("NEXT_PUBLIC_API_SECRET: the key name says it holds a secret"));
  assert.equal(problems[3], "line 6 (a comment) contains what looks like a Postgres connection string");
  assert.equal(problems[4], "line 7 is not a NEXT_PUBLIC_*=value assignment");
  for (const p of problems) {
    assert.ok(!p.includes(FAKE), "an audit message echoed a value");
  }
});
