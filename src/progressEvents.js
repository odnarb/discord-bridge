import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function defaultProgressEventsPath(runtimeDir) {
  return path.join(runtimeDir, "progress-events.jsonl");
}

export function normalizeProgressEvent(event) {
  return {
    eventId: event.eventId || crypto.randomUUID(),
    ts: event.ts || new Date().toISOString(),
    project: String(event.project || "").trim(),
    taskId: String(event.taskId || "").trim(),
    threadId: String(event.threadId || "").trim(),
    scope: String(event.scope || "").trim(),
    status: String(event.status || "in_progress").trim(),
    level: String(event.level || "milestone").trim(),
    message: String(event.message || "").trim(),
    meta: event.meta && typeof event.meta === "object" ? event.meta : {},
  };
}

export function appendProgressEvent(eventsPath, event) {
  const normalized = normalizeProgressEvent(event);
  if (!normalized.message) {
    throw new Error("Progress events require a non-empty message.");
  }

  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.appendFileSync(eventsPath, `${JSON.stringify(normalized)}\n`);
  return normalized;
}
