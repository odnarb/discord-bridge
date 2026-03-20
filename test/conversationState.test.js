import test from "node:test";
import assert from "node:assert/strict";
import {
  createCodexConversation,
  createEmptyState,
  createOpenAiConversation,
  getLocalDayKey,
  getReusableConversation,
  normalizeState,
} from "../src/conversationState.js";

test("normalizeState preserves extra state and repairs missing conversations", () => {
  assert.deepEqual(normalizeState(null), createEmptyState());
  assert.deepEqual(
    normalizeState({ socialDeskNotifications: { sent: true } }),
    {
      conversations: {},
      socialDeskNotifications: { sent: true },
    },
  );

  const state = normalizeState({
    conversations: { "123": { kind: "codex", threadId: "thread-1", dayKey: "2026-03-19" } },
    socialDeskNotifications: { sent: true },
  });

  assert.deepEqual(state.socialDeskNotifications, { sent: true });
  assert.equal(state.conversations["123"].threadId, "thread-1");
});

test("getLocalDayKey uses local calendar dates", () => {
  const sample = new Date(2026, 2, 19, 23, 59, 59);
  assert.equal(getLocalDayKey(sample), "2026-03-19");
});

test("getReusableConversation only returns same-kind same-day memory", () => {
  const state = {
    conversations: {
      codex: createCodexConversation("thread-1", "2026-03-19", "2026-03-19T10:00:00.000Z"),
      openai: createOpenAiConversation("resp-1", "2026-03-19", "2026-03-19T10:00:00.000Z"),
      stale: createCodexConversation("thread-old", "2026-03-18", "2026-03-18T10:00:00.000Z"),
    },
  };

  assert.equal(
    getReusableConversation(state, "codex", "codex", "2026-03-19")?.threadId,
    "thread-1",
  );
  assert.equal(
    getReusableConversation(state, "openai", "openai", "2026-03-19")?.previousResponseId,
    "resp-1",
  );
  assert.equal(getReusableConversation(state, "stale", "codex", "2026-03-19"), null);
  assert.equal(getReusableConversation(state, "codex", "openai", "2026-03-19"), null);
});
