function normalizeErrorDetail(error) {
  if (error instanceof Error) {
    return error.message || String(error);
  }

  return String(error || "");
}

function isQuotaError(detail) {
  const normalized = detail.toLowerCase();

  return (
    normalized.includes("quota exceeded") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("billing details")
  );
}

export function describeCodexAuthSource(config) {
  if (config.replyBackend !== "codex") {
    return "not using Codex";
  }

  if (config.codexUseOpenAiApiKey && config.openAiApiKey) {
    return "OPENAI_API_KEY";
  }

  return "local Codex auth/session";
}

export function buildBackendStatusLines(config) {
  return [
    `Reply backend: ${config.replyBackend}`,
    `OpenAI API key configured: ${config.openAiApiKey ? "yes" : "no"}`,
    `Codex auth source: ${describeCodexAuthSource(config)}`,
    `Codex model: ${config.codexModel}`,
    `Codex network access: ${config.codexNetworkAccessEnabled ? "enabled" : "disabled"}`,
    `Codex SDK source: ${config.codexSdkModulePath ? "custom module path" : "package import"}`,
    "Conversation memory: persisted per user and reused until the local day rolls over",
  ];
}

export function formatBackendError(config, error) {
  const detail = normalizeErrorDetail(error);

  if (config.replyBackend === "codex" && isQuotaError(detail)) {
    if (config.codexUseOpenAiApiKey && config.openAiApiKey) {
      return [
        detail,
        "Codex is configured to authenticate with OPENAI_API_KEY, so this quota error is likely coming from OpenAI API billing/project limits rather than local Codex session allowance.",
      ].join(" ");
    }

    return [
      detail,
      "Codex is using local/session auth here, so this quota error is coming from the Codex-side account/session rather than the direct OpenAI API reply backend.",
    ].join(" ");
  }

  if (config.replyBackend === "openai" && isQuotaError(detail)) {
    return [
      detail,
      "The bridge is using the direct OpenAI API reply backend, so this quota error is coming from the configured OPENAI_API_KEY project or billing limits.",
    ].join(" ");
  }

  return detail;
}
