import test from "node:test";
import assert from "node:assert/strict";
import { formatProgressBody } from "../src/discordProgress.js";

test("formatProgressBody trims progress content to fit a safe Discord edit size", () => {
  const reasoningText = "reason ".repeat(400);
  const outputText = "draft ".repeat(400);
  const streamLines = Array.from({ length: 8 }, (_, index) => `event ${index + 1} ${"x".repeat(160)}`);

  const body = formatProgressBody({
    reasoningText,
    outputText,
    streamLines,
    maxLength: 1800,
  });

  assert.ok(body.length <= 1800);
  assert.match(body, /Draft reply:/);
  assert.doesNotMatch(body, /event 1 /);
});

test("formatProgressBody drops reasoning before it drops the draft reply", () => {
  const body = formatProgressBody({
    reasoningText: "reason ".repeat(200),
    outputText: "draft ".repeat(250),
    streamLines: Array.from({ length: 6 }, (_, index) => `event ${index + 1} ${"x".repeat(120)}`),
    maxLength: 900,
  });

  assert.ok(body.length <= 900);
  assert.match(body, /Draft reply:/);
  assert.doesNotMatch(body, /Reasoning:/);
});
