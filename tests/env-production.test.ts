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
//   1. Every non-blank, non-comment line is `NEXT_PUBLIC_[A-Z0-9_]+=…`, written
//      exactly so (no `export`, no spaces around `=`). Next inlines
//      NEXT_PUBLIC_* values into the browser bundle, so a key with the prefix
//      is public by construction, and a key WITHOUT it is a server-side
//      setting, which is the kind that holds credentials. A COMMENTED-OUT
//      assignment to such a key is refused too: it is a block copied from
//      .env.example, and its value may be the real one in a shape rule 2
//      cannot recognise (`# AUTH_SECRET="…"`, `# CRON_SECRET="…"` are random
//      strings with no prefix).
//   2. Nothing on any line looks like a credential: a known secret-key prefix,
//      a database URL, a URL carrying user:password@, a Discord webhook URL,
//      or an npm token. "Any line" means the whole line, not a parsed value:
//      text after a closing quote, a trailing ` # comment` and a whole-line
//      comment are all places a paste lands (2026-09-23 review: scanning only
//      the parsed value let `NEXT_PUBLIC_A=ok # old: sk_live_…` through).
//
// Failure messages name the line number and, when the line is an env-style
// assignment, its KEY (see ASSIGNMENT_KEY for what counts). They never echo
// the value: a real secret that trips this test must not then be printed into
// CI logs.

const ROOT = process.cwd();
const FILE = ".env.production";

/**
 * Tokens that begin with one of these are credentials. Case-sensitive. Each
 * label carries its own article, so messages read "an AWS access key id".
 */
const SECRET_PREFIXES: ReadonlyArray<readonly [prefix: string, label: string]> = [
  ["sk_", "a Stripe secret key"],
  ["rk_", "a Stripe restricted key"],
  ["whsec_", "a Stripe webhook signing secret"],
  // Resend keys START with re_. Anchored to the token start on purpose: a bare
  // "contains re_" would flag ordinary values such as "store_first".
  ["re_", "a Resend API key"],
  ["sk-", "an Anthropic/OpenAI-style API key"],
  ["xkeysib-", "a Brevo API key"],
  ["xsmtpsib-", "a Brevo SMTP key"],
  ["AIza", "a Google API key"],
  // GOOGLE_CLIENT_SECRET in .env.example (Google sign-in).
  ["GOCSPX-", "a Google OAuth client secret"],
  ["ghp_", "a GitHub token"],
  ["gho_", "a GitHub token"],
  ["ghs_", "a GitHub token"],
  ["github_pat_", "a GitHub token"],
  ["xoxb-", "a Slack token"],
  ["xoxp-", "a Slack token"],
  ["AKIA", "an AWS access key id"],
  ["-----BEGIN", "a PEM private key"],
];

/** Matched anywhere in the text. */
const SECRET_PATTERNS: ReadonlyArray<readonly [pattern: RegExp, label: string]> = [
  [/postgres(?:ql)?:\/\//i, "a Postgres connection string"],
  [/(?:mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\//i, "a database/queue connection string"],
  [/:\/\/[^\s/:@]+:[^\s/@]+@/, "a URL with embedded credentials"],
  // DISCORD_WEBHOOK_URL in .env.example: the token is a path segment, not
  // user:password@, so the pattern above misses it. Needs the id and a token,
  // so the documented placeholder ".../api/webhooks/..." still passes.
  [/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i, "a Discord webhook URL"],
  // An npm token is npm_ plus 36 alphanumerics. Not a bare "npm_" prefix: this
  // file is loaded by `npm test`, and a comment naming an ordinary variable
  // such as npm_package_version or npm_config_registry must not fail it.
  [/\bnpm_[A-Za-z0-9]{36}\b/, "an npm token"],
];

/** Key names that announce a secret even behind NEXT_PUBLIC_. */
const SECRET_KEY_NAME = /SECRET|PASSWORD|PRIVATE_KEY/;

/**
 * The KEY of an env-style assignment, the only part of a line a message may
 * print: upper-case, then `=` and a non-empty value. Deliberately narrower
 * than what dotenv accepts (2026-09-23 review): the first version took
 * `[A-Za-z_][A-Za-z0-9_.-]*` before any `=` or `:`, and a bare base64 secret on
 * its own line (`openssl rand -base64` output, ending in `=` padding) matched
 * whole and was printed as its own "key". Mixed-case base64 cannot match
 * `[A-Z0-9_]*`; `=(?!=)\s*\S` rejects the padding of an upper-case base32 one
 * (`MZXW6YTBOI======`). Anything else is reported by line number alone.
 */
const ASSIGNMENT_KEY = /^(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=(?!=)\s*\S/;

/** Returns a label for the first credential-like thing in `text`, or null. Never returns the text itself. */
function secretKind(text: string): string | null {
  for (const [pattern, label] of SECRET_PATTERNS) if (pattern.test(text)) return label;
  for (const token of text.split(/[\s"'`=(),;:<>[\]{}]+/)) {
    for (const [prefix, label] of SECRET_PREFIXES) if (token.startsWith(prefix)) return label;
  }
  return null;
}

/**
 * Every problem in an env file's text, as messages safe to print: each names
 * a line number and at most a key, never a value. `keys` is every well-formed
 * key found.
 */
function auditEnvFile(text: string): { problems: string[]; keys: string[] } {
  const problems: string[] = [];
  const keys: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    // trim() also strips a leading byte-order mark: ECMAScript counts U+FEFF
    // as whitespace, so a BOM-prefixed first line still parses.
    const trimmed = line.trim();
    if (trimmed === "") return;
    const isComment = trimmed.startsWith("#");
    const m = isComment ? null : /^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$/.exec(trimmed);

    // Rule 2, over the whole line.
    const kind = secretKind(trimmed);
    if (kind) {
      const where = isComment ? " (a comment)" : m ? ` (${m[1]})` : "";
      problems.push(`line ${n}${where} contains what looks like ${kind}`);
    }

    // Rule 1.
    if (isComment) {
      const key = ASSIGNMENT_KEY.exec(trimmed.replace(/^#+\s*/, ""))?.[1];
      if (key && !key.startsWith("NEXT_PUBLIC_")) {
        problems.push(
          `line ${n} (a comment) is a commented-out ${key} assignment; server-side settings belong in the Vercel dashboard, not this committed file`,
        );
      }
      return;
    }
    if (!m) {
      const key = ASSIGNMENT_KEY.exec(trimmed)?.[1];
      problems.push(
        !key
          ? `line ${n} is not a NEXT_PUBLIC_*=value assignment`
          : key.startsWith("NEXT_PUBLIC_")
            ? `line ${n}: write ${key} exactly as ${key}=value, with no \`export\` and no spaces around "="`
            : `line ${n}: ${key} is not a NEXT_PUBLIC_* key; server-side settings belong in the Vercel dashboard, not this committed file`,
      );
      return;
    }
    const key = m[1];
    keys.push(key);
    if (SECRET_KEY_NAME.test(key)) {
      problems.push(
        `line ${n} (${key}): the key name says it holds a secret, and NEXT_PUBLIC_* values ship to every browser`,
      );
    }
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
    ["sk" + "_live_" + FAKE, "a Stripe secret key"],
    ["rk" + "_live_" + FAKE, "a Stripe restricted key"],
    ["whsec" + "_" + FAKE, "a Stripe webhook signing secret"],
    ["re" + "_" + FAKE, "a Resend API key"],
    ["sk" + "-ant-api03-" + FAKE, "an Anthropic/OpenAI-style API key"],
    ["xkeysib" + "-" + FAKE, "a Brevo API key"],
    ["GOCSPX" + "-" + FAKE, "a Google OAuth client secret"],
    ["npm" + "_" + FAKE + "abcdefghijkl", "an npm token"],
    ["postgresql" + "://user:" + FAKE + "@ep-example.neon.tech/db", "a Postgres connection string"],
    ["postgres" + "://ep-example.neon.tech/db", "a Postgres connection string"],
    ["https://user:" + FAKE + "@example.com/hook", "a URL with embedded credentials"],
    ["https://discord.com/api/web" + "hooks/123456789012345678/" + FAKE, "a Discord webhook URL"],
    ["-----BEGIN" + " PRIVATE KEY-----", "a PEM private key"],
  ];
  for (const [value, label] of samples) assert.equal(secretKind(value), label, `expected ${label} to be flagged`);
});

test("the detector passes the public values this file is meant for", () => {
  for (const value of [
    // SPLIT, like the "sk" + "_live_" and PEM literals above and below. The
    // guard in scripts/adsense-guard.ts forbids a ca-pub- literal anywhere in
    // the source tree, and it is the FIRST step of `npm run build`, so a whole
    // one here fails the production build — which it did.
    "ca-" + "pub-6842128782879909",
    "auto",
    "true",
    "store_first",
    "AW-1234567890/AbCdE",
    "ca-app-pub-1234567890123456/1234567890",
    "$9.99",
    "https://cal.com/riftcompare/consult",
    // npm_* environment variable names are not npm tokens.
    "# npm test exposes npm_package_version to scripts",
    "# see npm_config_registry",
    // .env.example's placeholder: documents the shape, carries no token.
    "https://discord.com/api/webhooks/...",
  ]) {
    assert.equal(secretKind(value), null, `a public value was flagged: ${value}`);
  }
});

test("an audit names the offending key or line, and never prints the value", () => {
  const secret = "sk" + "_live_" + FAKE;
  const dbUrl = "postgresql" + "://user:" + FAKE + "@ep-example.neon.tech/db";
  // Bare secrets pasted on a line of their own, each ending in "=" padding.
  // The first version printed the base64 ones whole as a "key".
  const base64Pad1 = Buffer.from(FAKE + "12").toString("base64"); // "…MTI="
  const base64Pad2 = Buffer.from(FAKE + "1").toString("base64"); // "…MQ=="
  const base32 = "MZXW6YTBOI======"; // upper-case: only the padding rule stops it
  const { problems, keys } = auditEnvFile(
    [
      "# header",
      `NEXT_PUBLIC_ADSENSE_CLIENT_ID="${"ca-" + "pub-6842128782879909"}"`,
      `STRIPE_SECRET_KEY="${secret}"`,
      `NEXT_PUBLIC_STRIPE_KEY=${secret} # pasted`,
      `NEXT_PUBLIC_API_SECRET="public-looking"`,
      `# RM3="${dbUrl}"`,
      secret,
      `NEXT_PUBLIC_OK_A=ok # old: ${secret}`,
      `NEXT_PUBLIC_OK_B="ok" ${secret}`,
      `# AUTH_SECRET="${FAKE}"`,
      `# NEXT_PUBLIC_AD_STRATEGY="auto"`,
      base64Pad1,
      base64Pad2,
      base32,
      "NEXT_PUBLIC_SPACED = v",
      "export NEXT_PUBLIC_EXPORTED=v",
      "",
    ].join("\r\n"),
  );
  assert.deepEqual(keys, [
    "NEXT_PUBLIC_ADSENSE_CLIENT_ID",
    "NEXT_PUBLIC_STRIPE_KEY",
    "NEXT_PUBLIC_API_SECRET",
    "NEXT_PUBLIC_OK_A",
    "NEXT_PUBLIC_OK_B",
  ]);
  const expected = [
    "line 3 contains what looks like a Stripe secret key",
    "line 3: STRIPE_SECRET_KEY is not a NEXT_PUBLIC_* key",
    "line 4 (NEXT_PUBLIC_STRIPE_KEY) contains what looks like a Stripe secret key",
    "line 5 (NEXT_PUBLIC_API_SECRET): the key name says it holds a secret",
    "line 6 (a comment) contains what looks like a Postgres connection string",
    "line 6 (a comment) is a commented-out RM3 assignment",
    "line 7 contains what looks like a Stripe secret key",
    "line 7 is not a NEXT_PUBLIC_*=value assignment",
    // A trailing comment and text after the closing quote are scanned too.
    "line 8 (NEXT_PUBLIC_OK_A) contains what looks like a Stripe secret key",
    "line 9 (NEXT_PUBLIC_OK_B) contains what looks like a Stripe secret key",
    // No recognisable shape, so only rule 1's commented-out check catches it.
    "line 10 (a comment) is a commented-out AUTH_SECRET assignment",
    // Line 11, a commented-out NEXT_PUBLIC_* setting, is allowed.
    "line 12 is not a NEXT_PUBLIC_*=value assignment",
    "line 13 is not a NEXT_PUBLIC_*=value assignment",
    "line 14 is not a NEXT_PUBLIC_*=value assignment",
    // A NEXT_PUBLIC_* key in the wrong format is told the format, not that
    // it is a server-side key.
    'line 15: write NEXT_PUBLIC_SPACED exactly as NEXT_PUBLIC_SPACED=value, with no `export` and no spaces around "="',
    'line 16: write NEXT_PUBLIC_EXPORTED exactly as NEXT_PUBLIC_EXPORTED=value, with no `export` and no spaces around "="',
  ];
  assert.equal(problems.length, expected.length, `got:\n  ${problems.join("\n  ")}`);
  expected.forEach((prefix, i) => assert.ok(problems[i].startsWith(prefix), `problem ${i}: ${problems[i]}`));
  // Padding stripped, so a message that printed the body without its "="
  // still fails.
  const values = [FAKE, base64Pad1, base64Pad2, base32].map((v) => v.replace(/=+$/, ""));
  for (const p of problems) {
    for (const v of values) assert.ok(!p.includes(v), `an audit message echoed a value: ${p}`);
  }
});

// The first version stripped the BOM with a regex holding the literal,
// invisible U+FEFF (2026-09-23 review), which an editor can silently delete;
// trim() already handles it (see auditEnvFile). The escape below keeps this
// file free of invisible characters.
test("a leading byte-order mark does not break the first line's key", () => {
  assert.deepEqual(auditEnvFile('\uFEFFNEXT_PUBLIC_X="v"\n'), { problems: [], keys: ["NEXT_PUBLIC_X"] });
});
