import path from "node:path";
import { pathToFileURL } from "node:url";

function clip(text, maxLength = 160) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trim()}...`;
}

const moduleCache = new Map();

async function getSocialDeskModule(projectRoot) {
  const modulePath = path.join(projectRoot, "src", "queueActions.js");
  if (!moduleCache.has(modulePath)) {
    moduleCache.set(modulePath, import(pathToFileURL(modulePath).href));
  }

  try {
    return await moduleCache.get(modulePath);
  } catch (error) {
    moduleCache.delete(modulePath);
    throw new Error(
      `Could not load social-desk queue module at ${modulePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function formatQueueLine(item) {
  return [
    `- ${item.id}`,
    `[${item.reviewStatus}]`,
    item.topic,
    item.title,
    `:: ${item.preview}`,
  ].join(" ");
}

function formatItemDetail(item) {
  const lines = [
    `${item.id} [${item.reviewStatus}]`,
    `Topic: ${item.topic}`,
    `Kind: ${item.kind}`,
  ];

  if (item.sourcePost?.authorUsername) {
    lines.push(`Author: @${item.sourcePost.authorUsername}`);
  }
  if (item.sourcePost?.sourceUrl) {
    lines.push(`Source URL: ${item.sourcePost.sourceUrl}`);
  }
  if (item.approvedAt) {
    lines.push(`Approved: ${item.approvedAt} by ${item.approvedBy || "unknown"}`);
  }
  if (item.postedAt) {
    lines.push(`Posted: ${item.postedAt} by ${item.postedBy || "unknown"}`);
  }
  if (item.postedReplyId) {
    lines.push(`Posted tweet id: ${item.postedReplyId}`);
  }
  if (item.postError) {
    lines.push(`Post error: ${item.postError}`);
  }

  lines.push("");
  lines.push(`Draft: ${clip(item.draftText, 320)}`);
  if (item.notes) {
    lines.push(`Notes: ${clip(item.notes, 320)}`);
  }
  if (item.sourcePost?.text) {
    lines.push(`Source: ${clip(item.sourcePost.text, 320)}`);
  }

  return lines.join("\n");
}

export async function handleSocialDeskCommand(content, config, actor = "discord") {
  const text = String(content || "").trim();
  if (!/^x\b/i.test(text)) {
    return null;
  }

  const socialDesk = await getSocialDeskModule(config.socialDeskRoot);
  const match = text.match(/^x\s+(\w+)(?:\s+([^\s]+))?(?:\s+([\s\S]+))?$/i);
  const action = match?.[1]?.toLowerCase();
  const itemId = match?.[2] || "";
  const tail = (match?.[3] || "").trim();

  if (!action || action === "help") {
    return [
      "social-desk commands:",
      "`x queue`",
      "`x usage`",
      "`x show <item-id>`",
      "`x approve <item-id>`",
      "`x reject <item-id>`",
      "`x hold <item-id>`",
      "`x revise <item-id> <instruction>`",
      "`x post <item-id>`",
    ].join("\n");
  }

  if (action === "queue") {
    const summary = socialDesk.getQueueSummary(config.socialDeskRoot);
    return [
      `social-desk queue from ${summary.queuePath}`,
      `Generated: ${summary.generatedAt || "unknown"}`,
      `Items: ${summary.queueCount}`,
      `Pending: ${summary.counts.pending} | Approved: ${summary.counts.approved} | Hold: ${summary.counts.hold} | Denied: ${summary.counts.denied}`,
      "",
      summary.pendingItems.length > 0 ? "Top pending items:" : "No pending items.",
      ...summary.pendingItems.map(formatQueueLine),
    ].join("\n");
  }

  if (action === "usage") {
    const summary = socialDesk.getUsageSummary(config.socialDeskRoot);
    return [
      "social-desk usage snapshot:",
      `Monthly budget: $${summary.monthlyBudgetUsd ?? "unknown"}`,
      `Max reply approvals/day: ${summary.maxReplyApprovalsPerDay ?? "unknown"}`,
      `Max wall posts/day: ${summary.maxWallPostsPerDay ?? "unknown"}`,
      `Posted replies today: ${summary.postedRepliesToday}`,
      `Posted wall posts today: ${summary.postedWallsToday}`,
      `Posting enabled: ${summary.postingEnabled ? "yes" : "no"}`,
      `Items: ${summary.queueCount}`,
    ].join("\n");
  }

  if (!itemId) {
    throw new Error(`Missing item id for \`x ${action}\`.`);
  }

  if (action === "show") {
    const item = socialDesk.getQueueItemDetails(config.socialDeskRoot, itemId);
    return formatItemDetail(item);
  }

  if (action === "approve" || action === "reject" || action === "hold") {
    const status =
      action === "approve" ? "approved" : action === "reject" ? "denied" : "hold";
    const item = socialDesk.reviewQueueItem(config.socialDeskRoot, itemId, {
      status,
      actor,
    });

    return [
      `Updated ${itemId} to ${status}.`,
      formatQueueLine(socialDesk.summarizeQueueItem(item)),
    ].join("\n");
  }

  if (action === "revise") {
    const item = socialDesk.reviseQueueItem(config.socialDeskRoot, itemId, {
      actor,
      instruction: tail,
    });

    return [
      `Revision note saved for ${itemId}.`,
      formatQueueLine(socialDesk.summarizeQueueItem(item)),
      `Notes appended: ${clip(tail, 160)}`,
    ].join("\n");
  }

  if (action === "post") {
    const item = await socialDesk.publishQueueItem(config.socialDeskRoot, itemId, {
      actor,
    });

    return [
      `Posted ${itemId}.`,
      `Tweet id: ${item.postedReplyId || "unknown"}`,
      `Posted at: ${item.postedAt}`,
    ].join("\n");
  }

  throw new Error(`Unknown social-desk command: ${action}`);
}
