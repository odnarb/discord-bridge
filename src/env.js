import fs from "node:fs";
import path from "node:path";

const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_CODEX_MODEL = "gpt-5.4";

export function parseEnvFile(raw) {
  const result = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function findEnvFile(projectRoot) {
  const explicit = process.env.DISCORD_ENV_FILE;
  const candidates = [
    explicit,
    path.join(projectRoot, ".env"),
    path.join(projectRoot, ".env.local"),
    path.resolve(projectRoot, "..", "docs", ".env"),
    path.resolve(projectRoot, "..", "docs", ".env.local"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function loadConfig(projectRoot) {
  const envPath = findEnvFile(projectRoot);
  const fileEnv = envPath
    ? parseEnvFile(fs.readFileSync(envPath, "utf8"))
    : {};
  const merged = {
    ...fileEnv,
    ...process.env,
  };

  const allowedUserIds = splitCsv(
    merged.DISCORD_ALLOWED_USER_IDS || merged.DISCORD_USER_ID,
  );

  const config = {
    envPath,
    discordBotToken: merged.DISCORD_BOT_TOKEN || "",
    discordApplicationId: merged.DISCORD_APPLICATION_ID || "",
    discordPublicKey: merged.DISCORD_PUBLIC_KEY || "",
    discordChannelId: merged.DISCORD_CHANNEL_ID || "",
    allowedUserIds,
    replyBackend: merged.DISCORD_REPLY_BACKEND || "codex",
    codexBin: merged.CODEX_BIN || "codex",
    codexCwd: merged.CODEX_CWD || path.resolve(projectRoot, ".."),
    codexModel: merged.CODEX_MODEL || DEFAULT_CODEX_MODEL,
    codexTimeoutMs: Number(merged.CODEX_TIMEOUT_MS || 0),
    codexStreamJson: parseBoolean(merged.CODEX_STREAM_JSON, true),
    codexReasoningEffort: merged.CODEX_REASONING_EFFORT || "low",
    codexNetworkAccessEnabled: parseBoolean(
      merged.CODEX_NETWORK_ACCESS_ENABLED,
      true,
    ),
    codexSdkModulePath: merged.CODEX_SDK_MODULE_PATH || "",
    openAiApiKey: merged.OPENAI_API_KEY || "",
    openAiModel: merged.OPENAI_MODEL || DEFAULT_MODEL,
    openAiSystemPrompt:
      merged.OPENAI_SYSTEM_PROMPT ||
      [
        "You are Forge, a private AI operations assistant.",
        "Be direct, pragmatic, and concise.",
        "Do not reveal private identities, addresses, or other sensitive details.",
        "Help with software, automation, product strategy, social strategy, and operations.",
      ].join(" "),
    socialDeskRoot:
      merged.SOCIAL_DESK_ROOT || path.resolve(projectRoot, "..", "social-desk"),
    socialDeskNotifyEnabled: parseBoolean(merged.SOCIAL_DESK_NOTIFY_ENABLED, false),
    socialDeskNotifyIntervalMs: Number(
      merged.SOCIAL_DESK_NOTIFY_INTERVAL_MS || 5 * 60 * 1000,
    ),
    socialDeskDailySummaryHourUtc:
      merged.SOCIAL_DESK_DAILY_SUMMARY_HOUR_UTC || "",
  };

  if (!config.discordBotToken) {
    throw new Error("Missing DISCORD_BOT_TOKEN.");
  }
  if (!config.discordApplicationId) {
    throw new Error("Missing DISCORD_APPLICATION_ID.");
  }
  if (config.allowedUserIds.length === 0) {
    throw new Error("Missing DISCORD_ALLOWED_USER_IDS or DISCORD_USER_ID.");
  }

  return config;
}
