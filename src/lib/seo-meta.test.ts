import { describe, it, expect } from "vitest";
import { TITLE_MAX, DESCRIPTION_MAX, clampText, buildDescription, buildTitle, buildTemplatedTitle } from "./seo-meta";

// Real-world-shaped fixtures — a short name, a long legend name, and an
// absurdly long one — so the caps are proven against the actual failure mode
// (long card/champion names), not just short happy-path strings.
const SHORT = "Jinx";
const LONG = "Vayne, Night Hunter (Alt EN)";
const ABSURD = "The Wandering Storm-Caller of the Eternal Rift Between Worlds";

function candidateLadder(name: string) {
  return [
    `${name} — Riftbound SFD 223/221 | Card Text & Live Prices`,
    `${name} — Riftbound SFD 223/221 | Live Prices`,
    `${name} — Riftbound SFD 223/221`,
    `${name} — Riftbound SFD`,
  ];
}

describe("clampText", () => {
  it("leaves short text untouched", () => {
    expect(clampText("A short sentence.", 50)).toBe("A short sentence.");
  });

  it("never exceeds max, and breaks on a word boundary", () => {
    const long = "The quick brown fox jumps over the lazy dog again and again and again";
    const out = clampText(long, 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/); // no trailing space before the ellipsis
  });

  it("falls back to a hard cut when no space exists before the 60% mark", () => {
    const out = clampText("a".repeat(100), 10);
    expect(out.length).toBeLessThanOrEqual(10);
  });
});

describe("buildDescription", () => {
  it("picks the richest candidate that fits", () => {
    const out = buildDescription(["short one", "a much, much longer candidate sentence that still fits comfortably"]);
    expect(out).toBe("short one");
  });

  it("never exceeds DESCRIPTION_MAX even when every candidate overflows", () => {
    const candidates = [
      "A".repeat(300),
      "B".repeat(250),
      "C".repeat(200),
    ];
    const out = buildDescription(candidates);
    expect(out.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("respects a custom max", () => {
    const out = buildDescription(["exactly ten", "short"], 5);
    expect(out.length).toBeLessThanOrEqual(5);
  });
});

describe("buildTitle (guides/blog/sets/champions — always { absolute })", () => {
  it("includes the suffix when content+suffix fits", () => {
    const result = buildTitle(["Jinx Riftbound Cards"], " | RiftCompare");
    expect(result).toEqual({ absolute: "Jinx Riftbound Cards | RiftCompare" });
    expect(result.absolute.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("drops the suffix and falls back to bare content when it would overflow", () => {
    const candidates = candidateLadder(ABSURD);
    const result = buildTitle(candidates, " | RiftCompare");
    expect(result.absolute).not.toContain("RiftCompare");
    expect(result.absolute.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("never exceeds TITLE_MAX across a spread of real-world-shaped names", () => {
    for (const name of [SHORT, LONG, ABSURD]) {
      const result = buildTitle(candidateLadder(name), " | RiftCompare");
      expect(result.absolute.length).toBeLessThanOrEqual(TITLE_MAX);
    }
  });
});

describe("buildTemplatedTitle (/card/[id] — root layout appends the suffix)", () => {
  it("returns a bare string (for the template to suffix) when it fits", () => {
    const result = buildTemplatedTitle(["Jinx — Riftbound VEN"], " — RiftCompare");
    expect(typeof result).toBe("string");
    if (typeof result === "string") {
      expect(result.length + " — RiftCompare".length).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it("returns { absolute } (skipping the template) when even bare content is long", () => {
    const candidates = candidateLadder(ABSURD);
    const result = buildTemplatedTitle(candidates, " — RiftCompare");
    expect(typeof result).toBe("object");
    if (typeof result !== "string") {
      expect(result.absolute.length).toBeLessThanOrEqual(TITLE_MAX);
    }
  });

  it("the FINAL rendered title (content + auto-suffix, when a string is returned) never exceeds TITLE_MAX", () => {
    // This is the exact bug this function exists to prevent: a bare content
    // string that individually fit some earlier, looser check, but overflowed
    // once the root layout's title.template silently appended its own suffix.
    for (const name of [SHORT, LONG, ABSURD]) {
      const result = buildTemplatedTitle(candidateLadder(name), " — RiftCompare");
      const rendered = typeof result === "string" ? `${result} — RiftCompare` : result.absolute;
      expect(rendered.length).toBeLessThanOrEqual(TITLE_MAX);
    }
  });
});
