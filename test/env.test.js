import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findEnvFile, loadConfig, parseEnvFile, splitCsv } from "../src/env.js";

function withIsolatedEnv(run) {
  const previousEnv = process.env;
  process.env = {};

  try {
    return run();
  } finally {
    process.env = previousEnv;
  }
}

test("parseEnvFile parses key value pairs", () => {
  const parsed = parseEnvFile(`
# comment
DISCORD_BOT_TOKEN=abc123
DISCORD_ALLOWED_USER_IDS=1, 2 ,3
OPENAI_MODEL="gpt-5"
`);

  assert.equal(parsed.DISCORD_BOT_TOKEN, "abc123");
  assert.equal(parsed.DISCORD_ALLOWED_USER_IDS, "1, 2 ,3");
  assert.equal(parsed.OPENAI_MODEL, "gpt-5");
});

test("splitCsv trims empty values", () => {
  assert.deepEqual(splitCsv("1, 2, ,3"), ["1", "2", "3"]);
});

test("findEnvFile prefers project .env before docs .env", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bridge-"));
  const docsDir = path.join(path.dirname(tmpRoot), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, ".env"), "DISCORD_BOT_TOKEN=docs\n");
  fs.writeFileSync(path.join(tmpRoot, ".env"), "DISCORD_BOT_TOKEN=project\n");

  assert.equal(findEnvFile(tmpRoot), path.join(tmpRoot, ".env"));
});

test("loadConfig loads required Discord values", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bridge-"));
  fs.writeFileSync(
    path.join(tmpRoot, ".env"),
    [
      "DISCORD_BOT_TOKEN=token",
      "DISCORD_APPLICATION_ID=app",
      "DISCORD_ALLOWED_USER_IDS=12345",
    ].join("\n"),
  );

  const config = withIsolatedEnv(() => loadConfig(tmpRoot));

  assert.equal(config.discordBotToken, "token");
  assert.equal(config.discordApplicationId, "app");
  assert.deepEqual(config.allowedUserIds, ["12345"]);
  assert.equal(config.codexUseOpenAiApiKey, false);
});

test("loadConfig only opts Codex into OPENAI_API_KEY when explicitly enabled", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "discord-bridge-"));
  fs.writeFileSync(
    path.join(tmpRoot, ".env"),
    [
      "DISCORD_BOT_TOKEN=token",
      "DISCORD_APPLICATION_ID=app",
      "DISCORD_ALLOWED_USER_IDS=12345",
      "OPENAI_API_KEY=test-key",
      "CODEX_USE_OPENAI_API_KEY=true",
    ].join("\n"),
  );

  const config = withIsolatedEnv(() => loadConfig(tmpRoot));

  assert.equal(config.openAiApiKey, "test-key");
  assert.equal(config.codexUseOpenAiApiKey, true);
});
