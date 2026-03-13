const API_URL = "https://api.openai.com/v1/responses";

function extractTextParts(value, parts = []) {
  if (!value) {
    return parts;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
    return parts;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractTextParts(item, parts);
    }
    return parts;
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") {
      extractTextParts(value.text, parts);
    }
    if (typeof value.output_text === "string") {
      extractTextParts(value.output_text, parts);
    }
    if (value.content) {
      extractTextParts(value.content, parts);
    }
    if (value.output) {
      extractTextParts(value.output, parts);
    }
  }

  return parts;
}

export function hasOpenAi(config) {
  return Boolean(config.openAiApiKey);
}

export async function createOpenAiReply({
  config,
  messageText,
  previousResponseId,
}) {
  const body = {
    model: config.openAiModel,
    instructions: config.openAiSystemPrompt,
    input: messageText,
  };

  if (previousResponseId) {
    body.previous_response_id = previousResponseId;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    const detail = payload?.error?.message || response.statusText;
    throw new Error(`OpenAI request failed: ${detail}`);
  }

  const text = extractTextParts(payload).join("\n").trim();

  return {
    responseId: payload.id || null,
    text: text || "No text response returned.",
  };
}
