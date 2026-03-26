const DEFAULT_PROGRESS_MAX_LENGTH = 1800;

function clip(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildProgressBody({
  reasoningText = "",
  outputText = "",
  streamLines = [],
  reasoningLimit = 1200,
  outputLimit = 1200,
  eventLineLimit = 6,
  includeReasoning = true,
}) {
  return [
    includeReasoning && reasoningText
      ? `Reasoning:\n\`\`\`text\n${clip(reasoningText, reasoningLimit)}\n\`\`\``
      : null,
    outputText
      ? `Draft reply:\n\`\`\`text\n${clip(outputText, outputLimit)}\n\`\`\``
      : null,
    streamLines.length > 0
      ? ["Recent events:", "```text", ...streamLines.slice(-eventLineLimit), "```"].join("\n")
      : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export function formatProgressBody({
  reasoningText = "",
  outputText = "",
  streamLines = [],
  maxLength = DEFAULT_PROGRESS_MAX_LENGTH,
}) {
  const variants = [
    { reasoningLimit: 1200, outputLimit: 1200, eventLineLimit: 6, includeReasoning: true },
    { reasoningLimit: 900, outputLimit: 1000, eventLineLimit: 3, includeReasoning: true },
    { reasoningLimit: 600, outputLimit: 900, eventLineLimit: 3, includeReasoning: false },
    { reasoningLimit: 0, outputLimit: 700, eventLineLimit: 2, includeReasoning: false },
  ];

  for (const variant of variants) {
    const body = buildProgressBody({
      reasoningText,
      outputText,
      streamLines,
      ...variant,
    });
    if (body.length <= maxLength) {
      return body;
    }
  }

  return clip(
    buildProgressBody({
      reasoningText: "",
      outputText: clip(outputText, Math.max(200, maxLength - 80)),
      streamLines: streamLines.slice(-2),
      reasoningLimit: 0,
      outputLimit: Math.max(200, maxLength - 80),
      eventLineLimit: 2,
      includeReasoning: false,
    }),
    maxLength,
  );
}

