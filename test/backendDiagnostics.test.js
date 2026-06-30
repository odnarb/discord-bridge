import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBackendStatusLines,
  describeCodexAuthSource,
  formatBackendError,
} from "../src/backendDiagnostics.js";

function makeConfig(overrides = {}) {
  return {
    codexBin: "codex",
    codexModel: "gpt-5.4",
    codexNetworkAccessEnabled: true,
    codexSdkModulePath: "",
    ...overrides,
  };
}

test("describeCodexAuthSource reports Codex-managed auth", () => {
  assert.equal(
    describeCodexAuthSource(makeConfig()),
    "Codex-managed local/session auth via codex",
  );
});

test("buildBackendStatusLines includes effective auth source", () => {
  const lines = buildBackendStatusLines(makeConfig());

  assert.ok(lines.includes("Reply path: Codex SDK"));
  assert.ok(lines.includes("Codex auth source: Codex-managed local/session auth via codex"));
  assert.ok(
    lines.includes(
      "Conversation memory: persisted per user and reused until the local day rolls over",
    ),
  );
});

test("formatBackendError explains quota failures for Codex SDK", () => {
  const detail = formatBackendError(
    makeConfig(),
    new Error("Quota exceeded. Check your plan and billing details."),
  );

  assert.match(detail, /Codex SDK path/);
  assert.match(detail, /active Codex credentials\/session/);
});
