import fs from "node:fs";
import path from "node:path";

const REVIEW_STATUSES = ["pending", "approved", "hold", "denied"];

function queuePathFor(config) {
  return path.join(config.socialDeskRoot, "runtime", "review-queue.json");
}

function readQueue(config) {
  const queuePath = queuePathFor(config);
  if (!fs.existsSync(queuePath)) {
    throw new Error(
      `social-desk queue not found at ${queuePath}. Run \`npm run generate:queue\` in /home/brandon/social-desk first.`,
    );
  }

  try {
    return JSON.parse(fs.readFileSync(queuePath, "utf8"));
  } catch {
    throw new Error(`Could not parse social-desk queue at ${queuePath}.`);
  }
}

function writeQueue(config, queue) {
  fs.writeFileSync(queuePathFor(config), JSON.stringify(queue, null, 2));
}

function normalizeQueue(queue) {
  return {
    ...queue,
    queue: (queue.queue || []).map((item, index) => ({
      notes: "",
      reviewStatus: "pending",
      reviewRank: index,
      updatedAt: queue.generatedAt || new Date().toISOString(),
      ...item,
      reviewStatus: REVIEW_STATUSES.includes(item.reviewStatus)
        ? item.reviewStatus
        : "pending",
      reviewRank: index,
    })),
  };
}

function clip(text, maxLength = 140) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function titleFor(item) {
  if (item.kind === "reply") {
    return `@${item.sourcePost?.authorUsername || "unknown"}`;
  }

  return `wall:${item.topic}`;
}

function sourceTextFor(item) {
  if (item.kind === "reply") {
    return item.sourcePost?.text || "";
  }

  return item.draftText || "";
}

function countsFor(queue) {
  const counts = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0]));
  for (const item of queue.queue) {
    counts[item.reviewStatus] += 1;
  }
  return counts;
}

function findQueueItem(queue, itemId) {
  return queue.queue.find((item) => item.id === itemId) || null;
}

function updateQueueItem(queue, itemId, patch) {
  const normalized = normalizeQueue(queue);
  const item = findQueueItem(normalized, itemId);

  if (!item) {
    throw new Error(`Queue item not found: ${itemId}`);
  }

  const nextQueue = {
    ...normalized,
    queue: normalized.queue.map((entry) =>
      entry.id === itemId
        ? {
            ...entry,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : entry,
    ),
  };

  return normalizeQueue(nextQueue);
}

function formatQueueLine(item) {
  return [
    `- ${item.id}`,
    `[${item.reviewStatus}]`,
    item.topic,
    titleFor(item),
    `:: ${clip(sourceTextFor(item), 90)}`,
  ].join(" ");
}

export function handleSocialDeskCommand(content, config) {
  const text = String(content || "").trim();
  if (!/^x\b/i.test(text)) {
    return null;
  }

  const queue = normalizeQueue(readQueue(config));
  const match = text.match(/^x\s+(\w+)(?:\s+([^\s]+))?(?:\s+([\s\S]+))?$/i);
  const action = match?.[1]?.toLowerCase();
  const itemId = match?.[2] || "";
  const tail = (match?.[3] || "").trim();

  if (!action || action === "help") {
    return [
      "social-desk commands:",
      "`x queue`",
      "`x usage`",
      "`x approve <item-id>`",
      "`x reject <item-id>`",
      "`x hold <item-id>`",
      "`x revise <item-id> <instruction>`",
    ].join("\n");
  }

  if (action === "queue") {
    const counts = countsFor(queue);
    const pending = queue.queue
      .filter((item) => item.reviewStatus === "pending")
      .slice(0, 5);

    return [
      `social-desk queue from ${queuePathFor(config)}`,
      `Generated: ${queue.generatedAt || "unknown"}`,
      `Items: ${queue.queue.length}`,
      `Pending: ${counts.pending} | Approved: ${counts.approved} | Hold: ${counts.hold} | Denied: ${counts.denied}`,
      "",
      pending.length > 0 ? "Top pending items:" : "No pending items.",
      ...pending.map(formatQueueLine),
    ].join("\n");
  }

  if (action === "usage") {
    const counts = countsFor(queue);
    return [
      "social-desk usage snapshot:",
      `Monthly budget: $${queue.budget?.monthlyBudgetUsd ?? "unknown"}`,
      `Max reply approvals/day: ${queue.budget?.maxReplyApprovalsPerDay ?? "unknown"}`,
      `Max wall posts/day: ${queue.budget?.maxWallPostsPerDay ?? "unknown"}`,
      `Posting enabled: ${queue.postingEnabled ? "yes" : "no"}`,
      `Items: ${queue.queue.length}`,
      `Pending: ${counts.pending} | Approved: ${counts.approved} | Hold: ${counts.hold} | Denied: ${counts.denied}`,
    ].join("\n");
  }

  if (!itemId) {
    throw new Error(`Missing item id for \`x ${action}\`.`);
  }

  if (action === "approve" || action === "reject" || action === "hold") {
    const nextStatus =
      action === "approve" ? "approved" : action === "reject" ? "denied" : "hold";
    const nextQueue = updateQueueItem(queue, itemId, { reviewStatus: nextStatus });
    writeQueue(config, nextQueue);
    const item = findQueueItem(nextQueue, itemId);

    return [
      `Updated ${itemId} to ${nextStatus}.`,
      formatQueueLine(item),
    ].join("\n");
  }

  if (action === "revise") {
    if (!tail) {
      throw new Error("Missing revision instruction for `x revise`.");
    }

    const existing = findQueueItem(queue, itemId);
    if (!existing) {
      throw new Error(`Queue item not found: ${itemId}`);
    }

    const nextNotes = existing.notes
      ? `${existing.notes}\nDiscord revise: ${tail}`
      : `Discord revise: ${tail}`;
    const nextQueue = updateQueueItem(queue, itemId, {
      notes: nextNotes,
      reviewStatus: "pending",
    });
    writeQueue(config, nextQueue);
    const item = findQueueItem(nextQueue, itemId);

    return [
      `Revision note saved for ${itemId}.`,
      formatQueueLine(item),
      `Notes appended: ${clip(tail, 160)}`,
    ].join("\n");
  }

  throw new Error(`Unknown social-desk command: ${action}`);
}
