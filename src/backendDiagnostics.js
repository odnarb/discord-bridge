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
  return config.codexBin
    ? `Codex-managed local/session auth via ${config.codexBin}`
    : "Codex-managed local/session auth";
}

export function buildBackendStatusLines(config) {
  return [
    "Reply path: Codex SDK",
    `Codex auth source: ${describeCodexAuthSource(config)}`,
    `Codex model: ${config.codexModel}`,
    `Codex network access: ${config.codexNetworkAccessEnabled ? "enabled" : "disabled"}`,
    `Codex SDK source: ${config.codexSdkModulePath ? "custom module path" : "package import"}`,
    "Conversation memory: persisted per user and reused until the local day rolls over",
  ];
}

export function formatBackendError(config, error) {
  const detail = normalizeErrorDetail(error);

  if (isQuotaError(detail)) {
    return [
      detail,
      "The bridge is using the Codex SDK path, so this quota error is coming from the active Codex credentials/session rather than a direct OpenAI Responses API client in the bridge.",
    ].join(" ");
  }

  return detail;
}
