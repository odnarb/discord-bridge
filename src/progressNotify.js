import fs from "node:fs";

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function clip(text, maxLength = 240) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatProgressMessage(event) {
  return [
    `${event.project || "unknown"} progress [${event.level || "milestone"}]`,
    event.taskId ? `Task: ${event.taskId}` : null,
    event.scope ? `Scope: ${event.scope}` : null,
    event.status ? `Status: ${event.status}` : null,
    clip(event.message || "", 500),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function collectProgressNotifications(config, state, now = new Date()) {
  const lines = readJsonLines(config.progressEventsPath);
  const processedLines = Number(state.processedLines || 0);
  const startIndex = processedLines > lines.length ? 0 : processedLines;
  const newEvents = lines.slice(startIndex);
  const allowedLevels = new Set(config.progressNotifyLevels || []);
  const messages = [];

  for (const event of newEvents) {
    if (allowedLevels.size > 0 && !allowedLevels.has(event.level)) {
      continue;
    }
    messages.push(formatProgressMessage(event));
  }

  return {
    messages,
    nextState: {
      ...state,
      processedLines: lines.length,
      lastCheckedAt: now.toISOString(),
    },
  };
}
