import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexInputItems } from "../src/codexPrompt.js";

test("buildCodexInputItems prepends AGENTS.md read instruction for new threads", () => {
  const items = buildCodexInputItems(
    "system prompt",
    "user message",
    true,
    "/workspace/root",
  );

  assert.equal(items.length, 3);
  assert.match(items[0].text, /read \/workspace\/root\/AGENTS\.md/i);
  assert.match(items[0].text, /work rooted at \/workspace\/root/i);
  assert.equal(items[1].text, "system prompt");
  assert.equal(items[2].text, "user message");
});

test("buildCodexInputItems does not repeat AGENTS.md instruction on resumed threads", () => {
  const items = buildCodexInputItems(
    "system prompt",
    "user message",
    false,
    "/workspace/root",
  );

  assert.deepEqual(items, [
    { type: "text", text: "system prompt" },
    { type: "text", text: "user message" },
  ]);
});
