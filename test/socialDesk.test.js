import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleSocialDeskCommand } from "../src/socialDesk.js";

function makeSocialDeskRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "social-desk-"));
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
    ["X_POSTING_ENABLED=true", "X_WRITE_TOKEN=test-write-token"].join("\n"),
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
        postingEnabled: true,
        queue: [
          {
            id: "reply-1",
            kind: "reply",
            topic: "citizenOS",
            reviewStatus: "pending",
            draftText: "Draft reply",
            notes: "",
            sourceMode: "fixtures",
            xAction: {
              method: "POST",
              endpoint: "/2/tweets",
              body: {
                text: "Draft reply",
                reply: {
                  in_reply_to_tweet_id: "tweet-1",
                },
              },
            },
            sourcePost: {
              authorUsername: "civic_watch",
              sourceUrl: "https://x.com/civic_watch/status/1",
              text: "Source text",
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  return root;
}

test("x queue summarizes the pending queue", async () => {
  const root = makeSocialDeskRoot();

  const reply = await handleSocialDeskCommand(
    "x queue",
    { socialDeskRoot: root },
    "discord:123",
  );

  assert.match(reply, /Top pending items:/);
  assert.match(reply, /reply-1/);
  assert.match(reply, /citizenOS/);
});

test("x show prints queue item detail", async () => {
  const root = makeSocialDeskRoot();

  const reply = await handleSocialDeskCommand(
    "x show reply-1",
    { socialDeskRoot: root },
    "discord:123",
  );

  assert.match(reply, /Topic: citizenOS/);
  assert.match(reply, /Source URL: https:\/\/x.com\/civic_watch\/status\/1/);
});

test("x approve updates queue item status", async () => {
  const root = makeSocialDeskRoot();

  const reply = await handleSocialDeskCommand(
    "x approve reply-1",
    { socialDeskRoot: root },
    "discord:123",
  );
  const queue = JSON.parse(
    fs.readFileSync(path.join(root, "runtime", "review-queue.json"), "utf8"),
  );

  assert.match(reply, /Updated reply-1 to approved/);
  assert.equal(queue.queue[0].reviewStatus, "approved");
  assert.equal(queue.queue[0].approvedBy, "discord:123");
});

test("x revise appends a revision note and resets to pending", async () => {
  const root = makeSocialDeskRoot();

  const reply = await handleSocialDeskCommand(
    "x revise reply-1 make it shorter",
    { socialDeskRoot: root },
    "discord:123",
  );
  const queue = JSON.parse(
    fs.readFileSync(path.join(root, "runtime", "review-queue.json"), "utf8"),
  );

  assert.match(reply, /Revision note saved/);
  assert.match(queue.queue[0].notes, /Discord revise: discord:123: make it shorter/);
  assert.equal(queue.queue[0].reviewStatus, "pending");
});

test("x post publishes an approved item and records the posted tweet id", async () => {
  const root = makeSocialDeskRoot();
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        id: "posted-123",
      },
    }),
  });

  await handleSocialDeskCommand(
    "x approve reply-1",
    { socialDeskRoot: root },
    "discord:123",
  );
  const reply = await handleSocialDeskCommand(
    "x post reply-1",
    { socialDeskRoot: root },
    "discord:123",
  );
  const queue = JSON.parse(
    fs.readFileSync(path.join(root, "runtime", "review-queue.json"), "utf8"),
  );

  assert.match(reply, /Posted reply-1/);
  assert.equal(queue.queue[0].postedReplyId, "posted-123");
  assert.equal(queue.queue[0].postedBy, "discord:123");
});
