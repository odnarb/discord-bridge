export function createEmptyState() {
  return { conversations: {} };
}

export function getLocalDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeState(state) {
  const conversations = state?.conversations;
  const normalizedConversations =
    conversations && typeof conversations === "object" && !Array.isArray(conversations)
      ? conversations
      : {};

  return {
    ...state,
    conversations: normalizedConversations,
  };
}

export function getReusableConversation(state, userId, kind, dayKey) {
  const conversation = state?.conversations?.[userId];

  if (!conversation || conversation.kind !== kind || conversation.dayKey !== dayKey) {
    return null;
  }

  return conversation;
}

export function createCodexConversation(threadId, dayKey, updatedAt = new Date().toISOString()) {
  return {
    kind: "codex",
    threadId: threadId || null,
    dayKey,
    updatedAt,
  };
}

export function createOpenAiConversation(
  responseId,
  dayKey,
  updatedAt = new Date().toISOString(),
) {
  return {
    kind: "openai",
    previousResponseId: responseId || null,
    dayKey,
    updatedAt,
  };
}
