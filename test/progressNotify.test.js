import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectProgressNotifications } from "../src/progressNotify.js";

function makeRuntime() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "discord-progress-"));
}

test("collectProgressNotifications emits only configured levels and only once", async () => {
  const runtimeDir = makeRuntime();
  const eventsPath = path.join(runtimeDir, "progress-events.jsonl");

  fs.writeFileSync(
    eventsPath,
    [
      JSON.stringify({
        project: "carapace",
        taskId: "steering",
        level: "milestone",
        status: "completed",
        message: "Seeded steering repo.",
      }),
      JSON.stringify({
        project: "churchOS",
        taskId: "schema",
        level: "started",
        status: "in_progress",
        message: "Started schema pass.",
      }),
      JSON.stringify({
        project: "carapace",
        taskId: "org-create",
        level: "blocker",
        status: "blocked",
        message: "Blocked on GitHub org creation.",
      }),
    ].join("\n") + "\n",
  );

  const config = {
    progressEventsPath: eventsPath,
    progressNotifyLevels: ["milestone", "blocker", "complete"],
  };

  const first = await collectProgressNotifications(config, {}, new Date("2026-03-14T16:00:00.000Z"));
  const second = await collectProgressNotifications(
    config,
    first.nextState,
    new Date("2026-03-14T16:01:00.000Z"),
  );

  assert.equal(first.messages.length, 2);
  assert.match(first.messages[0], /carapace progress \[milestone\]/);
  assert.match(first.messages[0], /Seeded steering repo/);
  assert.match(first.messages[1], /carapace progress \[blocker\]/);
  assert.equal(first.nextState.processedLines, 3);
  assert.deepEqual(second.messages, []);
});

test("collectProgressNotifications resets safely when the event file is truncated", async () => {
  const runtimeDir = makeRuntime();
  const eventsPath = path.join(runtimeDir, "progress-events.jsonl");

  fs.writeFileSync(
    eventsPath,
    `${JSON.stringify({
      project: "carapace",
      taskId: "seed",
      level: "complete",
      status: "completed",
      message: "Finished.",
    })}\n`,
  );

  const config = {
    progressEventsPath: eventsPath,
    progressNotifyLevels: ["complete"],
  };

  const first = await collectProgressNotifications(config, { processedLines: 10 });

  assert.equal(first.messages.length, 1);
  assert.equal(first.nextState.processedLines, 1);
});
