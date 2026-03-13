import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleSocialDeskCommand } from "../src/socialDesk.js";

function makeQueueFile(root) {
  const runtimeDir = path.join(root, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
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
            draftText: "Draft reply",
            notes: "",
            sourceMode: "fixtures",
            sourcePost: {
              authorUsername: "civic_watch",
              text: "Source text",
            },
          },
        ],
      },
      null,
      2,
    ),
  );
}

test("x queue summarizes the pending queue", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-desk-"));
  makeQueueFile(root);

  const reply = handleSocialDeskCommand("x queue", { socialDeskRoot: root });

  assert.match(reply, /Top pending items:/);
  assert.match(reply, /reply-1/);
  assert.match(reply, /citizenOS/);
});

test("x approve updates queue item status", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-desk-"));
  makeQueueFile(root);

  const reply = handleSocialDeskCommand("x approve reply-1", {
    socialDeskRoot: root,
  });
  const queue = JSON.parse(
    fs.readFileSync(path.join(root, "runtime", "review-queue.json"), "utf8"),
  );

  assert.match(reply, /Updated reply-1 to approved/);
  assert.equal(queue.queue[0].reviewStatus, "approved");
});

test("x revise appends a revision note and resets to pending", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-desk-"));
  makeQueueFile(root);

  const reply = handleSocialDeskCommand("x revise reply-1 make it shorter", {
    socialDeskRoot: root,
  });
  const queue = JSON.parse(
    fs.readFileSync(path.join(root, "runtime", "review-queue.json"), "utf8"),
  );

  assert.match(reply, /Revision note saved/);
  assert.match(queue.queue[0].notes, /Discord revise: make it shorter/);
  assert.equal(queue.queue[0].reviewStatus, "pending");
});
