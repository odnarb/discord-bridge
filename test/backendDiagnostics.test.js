import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBackendStatusLines,
  describeCodexAuthSource,
  formatBackendError,
} from "../src/backendDiagnostics.js";

function makeConfig(overrides = {}) {
  return {
    replyBackend: "codex",
    codexModel: "gpt-5.4",
    codexNetworkAccessEnabled: true,
    codexSdkModulePath: "",
    codexUseOpenAiApiKey: false,
    openAiApiKey: "",
    ...overrides,
  };
}

test("describeCodexAuthSource defaults to local/session auth", () => {
  assert.equal(describeCodexAuthSource(makeConfig()), "local Codex auth/session");
});

test("describeCodexAuthSource reports OPENAI_API_KEY when explicitly enabled", () => {
  assert.equal(
    describeCodexAuthSource(
      makeConfig({
        codexUseOpenAiApiKey: true,
        openAiApiKey: "test-key",
      }),
    ),
    "OPENAI_API_KEY",
  );
});

test("buildBackendStatusLines includes effective auth source", () => {
  const lines = buildBackendStatusLines(
    makeConfig({
      codexUseOpenAiApiKey: true,
      openAiApiKey: "test-key",
    }),
  );

  assert.ok(lines.includes("Codex auth source: OPENAI_API_KEY"));
  assert.ok(
    lines.includes(
      "Conversation memory: persisted per user and reused until the local day rolls over",
    ),
  );
});

test("formatBackendError explains quota failures for Codex using OPENAI_API_KEY", () => {
  const detail = formatBackendError(
    makeConfig({
      codexUseOpenAiApiKey: true,
      openAiApiKey: "test-key",
    }),
    new Error("Quota exceeded. Check your plan and billing details."),
  );

  assert.match(detail, /OpenAI API billing\/project limits/);
});

test("formatBackendError explains quota failures for direct OpenAI backend", () => {
  const detail = formatBackendError(
    makeConfig({
      replyBackend: "openai",
      openAiApiKey: "test-key",
    }),
    new Error("Quota exceeded. Check your plan and billing details."),
  );

  assert.match(detail, /direct OpenAI API reply backend/);
});
