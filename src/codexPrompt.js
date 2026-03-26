import path from "node:path";

export function buildCodexInputItems(
  systemPrompt,
  messageText,
  isNewThread,
  topLevelRoot,
) {
  const items = [];

  if (isNewThread) {
    const agentsMdPath = path.join(topLevelRoot, "AGENTS.md");
    items.push({
      type: "text",
      text: [
        `Before doing any other work in this thread, read ${agentsMdPath}.`,
        `Treat it as top-level instructions for work rooted at ${topLevelRoot}.`,
      ].join(" "),
    });
  }

  items.push({ type: "text", text: systemPrompt });
  items.push({ type: "text", text: messageText });

  return items;
}
