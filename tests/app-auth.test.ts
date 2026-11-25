import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  APP_SCHEME,
  appFailUrl,
  appReturnUrl,
  challengeOf,
  isAppChallenge,
  isAppUserAgent,
  readAppState,
  signAppState,
} from "../src/lib/app-auth";

// Sign-in inside the Android app (lib/app-auth.ts, DECISIONS.md 2026-11-19).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const verifier = "x".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");

test("the challenge is base64url SHA-256 of the verifier, and only that shape is accepted", () => {
  assert.equal(challengeOf(verifier), challenge);
  assert.ok(isAppChallenge(challenge));
  assert.ok(!isAppChallenge("abc"));
  assert.ok(!isAppChallenge(`${challenge}=`));
  assert.ok(!isAppChallenge(null));
});

test("the signed state round-trips, and is refused for another provider, a plain web state or a tampered one", async () => {
  const s = await signAppState({ provider: "google", challenge, next: "/cards/x" });
  assert.deepEqual(await readAppState(s, "google"), { provider: "google", challenge, next: "/cards/x" });
  assert.equal(await readAppState(s, "discord"), null);
  assert.equal(await readAppState("0123456789abcdef0123456789abcdef", "google"), null, "a web flow's hex state is not an app state");
  const [h, p, sig] = s.split(".");
  // Tamper with the signature for real: a fixed "AA" ending was a no-op whenever the signature already ended in it.
  const tail = sig.slice(-2) === "AA" ? "BB" : "AA";
  assert.equal(await readAppState(`${h}.${p}.${sig.slice(0, -2)}${tail}`, "google"), null);
  // A next that is not a safe internal path is dropped, not followed.
  const evil = await signAppState({ provider: "google", challenge, next: "//evil.example" });
  assert.equal((await readAppState(evil, "google"))?.next, null);
});

test("a finished app sign-in goes to the app's scheme from Chrome and to the exchange page inside the app", () => {
  assert.equal(appReturnUrl("abc", "/watching", false, "https://riftcompare.com/x"), `${APP_SCHEME}://auth?code=abc&n=%2Fwatching`);
  assert.equal(appReturnUrl("abc", null, true, "https://riftcompare.com/x"), "https://riftcompare.com/login/app?code=abc");
  assert.equal(appFailUrl("oauth_state", false, "https://riftcompare.com"), `${APP_SCHEME}://auth?error=oauth_state`);
  assert.equal(appFailUrl("oauth_state", true, "https://riftcompare.com"), "https://riftcompare.com/login?error=oauth_state");
  assert.ok(isAppUserAgent("Mozilla/5.0 (Linux; Android 15) ... RiftCompareApp RCAdMob…"));
  assert.ok(!isAppUserAgent("Mozilla/5.0 (Linux; Android 15) Chrome/140"));
});

test("the callback: an app state skips the cookie, a web state still needs it, and the app gets a code, never a session there", () => {
  const src = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  assert.match(src, /\(!app && \(!saved \|\| state !== saved\)\)/);
  const fin = src.slice(src.indexOf("async function finishAppSignIn"));
  assert.ok(fin.length > 0);
  const body = fin.slice(0, fin.indexOf("\n}\n"));
  assert.match(body, /upsertOAuthUser\(/, "same verified-address rules as the web");
  assert.match(body, /mintAppCode\(/);
  assert.doesNotMatch(body, /createSession\(/, "the session is made by the exchange, in the app's own jar");
});

test("the code is redeemed only with the verifier, once, same-origin", () => {
  const lib = read("src/lib/app-auth.ts");
  assert.match(lib, /const token = `\$\{challengeOf\(verifier\)\}\.\$\{code\}`/);
  assert.match(lib, /prisma\.authToken\.delete/);
  const route = read("src/app/api/auth/app-exchange/route.ts");
  assert.match(route, /redeemAppCode\(body\?\.code, body\?\.verifier\)/);
  assert.match(route, /origin !== new URL\(req\.url\)\.origin/);
  assert.match(route, /rateLimit\(/);
});

test("Premium cannot be bought from inside the app (Play payments policy; owner, 2026-11-19)", () => {
  for (const r of ["checkout", "upgrade", "switch-to-annual"]) {
    const src = read(`src/app/api/premium/${r}/route.ts`);
    const post = src.indexOf("export async function POST(");
    const gate = src.indexOf("if (isAppUserAgent(req.headers.get(\"user-agent\")))");
    assert.ok(post > 0 && gate > post && gate < src.indexOf("\n}\n", post), `${r} refuses the app first`);
  }
  assert.match(read("src/app/globals.css"), /html\.capacitor-native a\[href\^="\/premium\/start"\]/);
  assert.match(read("src/app/premium/page.tsx"), /<AppPremiumNotice \/>/);
  assert.match(read("src/app/premium/start/page.tsx"), /<AppPremiumNotice \/>/);
});

test("the app's App Links file names the Play signing key and keeps /api out of the app", () => {
  const links = JSON.parse(read("public/.well-known/assetlinks.json"));
  assert.equal(links[0].target.package_name, "com.riftcompare.app");
  assert.match(links[0].target.sha256_cert_fingerprints[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  const dyn = links[0].relation_extensions["delegate_permission/common.handle_all_urls"].dynamic_app_link_components;
  assert.deepEqual(dyn[0], { "/": "/api/*", exclude: true });
});

test("the website never bundles Capacitor plugin code: the installed app's own runtime is used", () => {
  for (const f of ["src/components/NativeShell.tsx", "src/components/OutboundLink.tsx", "src/lib/native.ts"]) {
    assert.doesNotMatch(read(f).replace(/\/\/.*$/gm, ""), /import\(["']@capacitor|from ["']@capacitor/, f);
  }
});
