import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSocialDeskNotifications } from "../src/socialDeskNotify.js";

function makeSocialDeskRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-desk-notify-"));
  const runtimeDir = path.join(root, "runtime");
  const srcDir = path.join(root, "src");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(srcDir, { recursive: true });

  for (const file of [
    "env.js",
    "store.js",
    "queueStore.js",
    "xClient.js",
    "queueActions.js",
  ]) {
    fs.copyFileSync(
      path.join("/home/brandon/social-desk/src", file),
      path.join(srcDir, file),
    );
  }

  fs.writeFileSync(
    path.join(root, ".env"),
    ["X_POSTING_ENABLED=false", "X_MONTHLY_BUDGET_USD=5"].join("\n"),
  );

  fs.writeFileSync(
    path.join(runtimeDir, "review-queue.json"),
    JSON.stringify(
      {
        generatedAt: "2026-03-14T00:00:00.000Z",
        budget: {
          monthlyBudgetUsd: 5,
          maxReplyApprovalsPerDay: 2,
          maxWallPostsPerDay: 1,
        },
        postingEnabled: false,
        queue: [
          {
            id: "reply-1",
            kind: "reply",
            topic: "citizenOS",
            reviewStatus: "pending",
            draftText: "Draft reply 1",
            sourcePost: {
              authorUsername: "civic_watch",
              text: "Where is the money going?",
            },
          },
          {
            id: "reply-2",
            kind: "reply",
            topic: "churchOS",
            reviewStatus: "pending",
            draftText: "Draft reply 2",
            sourcePost: {
              authorUsername: "bible_ops",
              text: "Church tooling needs better workflows.",
            },
          },
          {
            id: "wall-1",
            kind: "wall_post",
            topic: "carapace",
            reviewStatus: "approved",
            draftText: "Wall draft",
          },
        ],
      },
      null,
      2,
    ),
  );

  return root;
}

test("collectSocialDeskNotifications reports newly pending items once", async () => {
  const root = makeSocialDeskRoot();
  const config = {
    socialDeskRoot: root,
    socialDeskDailySummaryHourUtc: "",
  };

  const first = await collectSocialDeskNotifications(config, {}, new Date("2026-03-14T10:00:00.000Z"));
  const second = await collectSocialDeskNotifications(
    config,
    first.nextState,
    new Date("2026-03-14T10:05:00.000Z"),
  );

  assert.equal(first.messages.length, 1);
  assert.match(first.messages[0], /social-desk: new pending items/);
  assert.match(first.messages[0], /reply-1/);
  assert.match(first.messages[0], /reply-2/);
  assert.deepEqual(first.nextState.lastPendingNotificationIds, ["reply-1", "reply-2"]);
  assert.deepEqual(second.messages, []);
});

test("collectSocialDeskNotifications emits a daily summary at the configured UTC hour", async () => {
  const root = makeSocialDeskRoot();
  const config = {
    socialDeskRoot: root,
    socialDeskDailySummaryHourUtc: "12",
  };

  const result = await collectSocialDeskNotifications(
    config,
    { lastPendingNotificationIds: ["reply-1", "reply-2"] },
    new Date("2026-03-14T12:30:00.000Z"),
  );

  assert.equal(result.messages.length, 1);
  assert.match(result.messages[0], /social-desk daily summary \(2026-03-14 UTC\)/);
  assert.match(result.messages[0], /Pending: 2 \| Approved: 1 \| Hold: 0 \| Denied: 0/);
  assert.match(result.messages[0], /Posting enabled: no/);
  assert.equal(result.nextState.dailySummarySentDate, "2026-03-14");
});
