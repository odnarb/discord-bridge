import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendProgressEvent, defaultProgressEventsPath } from "../src/progressEvents.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const runtimeDir = path.join(projectRoot, "runtime");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const event = appendProgressEvent(defaultProgressEventsPath(runtimeDir), {
  project: args.project || "",
  taskId: args.task || args.taskId || "",
  threadId: args.thread || args.threadId || "",
  scope: args.scope || "",
  status: args.status || "in_progress",
  level: args.level || "milestone",
  message: args.message || "",
});

console.log(JSON.stringify({ ok: true, event }, null, 2));
