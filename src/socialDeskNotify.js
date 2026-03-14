import path from "node:path";
import { pathToFileURL } from "node:url";

const moduleCache = new Map();

async function getSocialDeskModule(projectRoot) {
  const modulePath = path.join(projectRoot, "src", "queueActions.js");
  if (!moduleCache.has(modulePath)) {
    moduleCache.set(modulePath, import(pathToFileURL(modulePath).href));
  }

  return moduleCache.get(modulePath);
}

function utcDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function utcHour(date) {
  return date.getUTCHours();
}

function clip(text, maxLength = 120) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trim()}...`;
}

export async function collectSocialDeskNotifications(config, state, now = new Date()) {
  const socialDesk = await getSocialDeskModule(config.socialDeskRoot);
  const summary = socialDesk.getQueueSummary(config.socialDeskRoot);
  const usage = socialDesk.getUsageSummary(config.socialDeskRoot);
  const previousIds = new Set(state.lastPendingNotificationIds || []);
  const currentPendingIds = summary.pendingItemIds || summary.pendingItems.map((item) => item.id);
  const newPendingItems = summary.pendingItems.filter((item) => !previousIds.has(item.id));
  const messages = [];

  if (newPendingItems.length > 0) {
    messages.push(
      [
        "social-desk: new pending items",
        ...newPendingItems.map(
          (item) =>
            `- ${item.id} [${item.topic}] ${item.title} :: ${clip(item.preview, 90)}`,
        ),
        currentPendingIds.length > summary.pendingItems.length
          ? `Total pending items: ${currentPendingIds.length}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  let dailySummarySentDate = state.dailySummarySentDate || "";
  const summaryHourRaw = config.socialDeskDailySummaryHourUtc;
  const summaryHour =
    summaryHourRaw === "" ? null : Number.parseInt(summaryHourRaw, 10);

  if (
    Number.isInteger(summaryHour) &&
    summaryHour >= 0 &&
    summaryHour <= 23 &&
    utcHour(now) >= summaryHour &&
    dailySummarySentDate !== utcDateKey(now)
  ) {
    messages.push(
      [
        `social-desk daily summary (${utcDateKey(now)} UTC)`,
        `Pending: ${summary.counts.pending} | Approved: ${summary.counts.approved} | Hold: ${summary.counts.hold} | Denied: ${summary.counts.denied}`,
        `Posted replies today: ${usage.postedRepliesToday}`,
        `Posted wall posts today: ${usage.postedWallsToday}`,
        `Posting enabled: ${usage.postingEnabled ? "yes" : "no"}`,
      ].join("\n"),
    );
    dailySummarySentDate = utcDateKey(now);
  }

  return {
    messages,
    nextState: {
      ...state,
      lastPendingNotificationIds: currentPendingIds,
      dailySummarySentDate,
      lastCheckedAt: now.toISOString(),
    },
  };
}
