import test from "node:test";
import assert from "node:assert/strict";
import { aiSourceOf } from "../src/lib/ai-referral";

test("ChatGPT is read from utm_source or its referrer", () => {
  assert.equal(aiSourceOf("", "chatgpt.com"), "chatgpt");
  assert.equal(aiSourceOf("https://chatgpt.com/", null), "chatgpt");
});
test("other assistants are read from the referrer", () => {
  assert.equal(aiSourceOf("https://www.perplexity.ai/search/x", null), "perplexity");
  assert.equal(aiSourceOf("https://claude.ai/", null), "claude");
  assert.equal(aiSourceOf("https://gemini.google.com/app", null), "gemini");
  assert.equal(aiSourceOf("https://copilot.microsoft.com/", null), "copilot");
});
test("search engines, social and direct are not AI", () => {
  assert.equal(aiSourceOf("https://www.google.com/", null), null);
  assert.equal(aiSourceOf("https://www.reddit.com/r/x", null), null);
  assert.equal(aiSourceOf("", null), null);
  assert.equal(aiSourceOf("not a url", "newsletter"), null);
});
