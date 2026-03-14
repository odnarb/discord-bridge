import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig } from "./env.js";
import { createOpenAiReply, hasOpenAi } from "./openai.js";
import { handleSocialDeskCommand } from "./socialDesk.js";
import { collectSocialDeskNotifications } from "./socialDeskNotify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const runtimeDir = path.join(projectRoot, "runtime");
const messagesLogPath = path.join(runtimeDir, "messages.jsonl");
const statePath = path.join(runtimeDir, "state.json");

const config = loadConfig(projectRoot);

let socket = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let socialDeskNotificationTimer = null;
let heartbeatIntervalMs = 0;
let lastSequence = null;
let sessionId = null;
let botUserId = null;
let socialDeskNotificationRunning = false;
const activeUsers = new Set();
let codexClientPromise = null;

ensureRuntime();

function ensureRuntime() {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function loadState() {
  if (!fs.existsSync(statePath)) {
    return { conversations: {} };
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return { conversations: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function appendLog(entry) {
  fs.appendFileSync(messagesLogPath, `${JSON.stringify(entry)}\n`);
}

function chunkMessage(text, maxLength = 1900) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let rest = text;
  while (rest.length > maxLength) {
    let splitAt = rest.lastIndexOf("\n", maxLength);
    if (splitAt < Math.floor(maxLength / 2)) {
      splitAt = maxLength;
    }
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) {
    chunks.push(rest);
  }
  return chunks;
}

function clip(text, maxLength = 220) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function describeEnvSource(envPath) {
  if (!envPath) {
    return "process env only";
  }

  return path.relative(projectRoot, envPath) || path.basename(envPath);
}

function describeCodexSdkSource() {
  return config.codexSdkModulePath ? "custom module path" : "package import";
}

async function getCodexClient() {
  if (!codexClientPromise) {
    const modulePromise = config.codexSdkModulePath
      ? import(pathToFileURL(path.resolve(config.codexSdkModulePath)).href)
      : import("@openai/codex-sdk").catch(() => {
          throw new Error(
            "Could not load @openai/codex-sdk. Run npm install or set CODEX_SDK_MODULE_PATH.",
          );
        });

    codexClientPromise = modulePromise
      .then((module) => {
        const Codex = module.Codex || module.default?.Codex || module.default;
        if (!Codex) {
          throw new Error(
            "Could not load a Codex SDK export from the configured module.",
          );
        }

        const options = {
          codexPathOverride: config.codexBin,
        };

        if (config.openAiApiKey) {
          options.apiKey = config.openAiApiKey;
        }

        return new Codex(options);
      });
  }

  return codexClientPromise;
}

function summarizeCodexItem(item, phase) {
  const prefix = phase.replace("item.", "");

  switch (item.type) {
    case "reasoning":
      return item.text ? `${prefix} reasoning: ${clip(item.text, 180)}` : null;
    case "agent_message":
      return item.text ? `${prefix} reply: ${clip(item.text, 180)}` : null;
    case "command_execution":
      return `${prefix} command: ${clip(item.command, 180)}`;
    case "mcp_tool_call":
      return `${prefix} MCP ${item.server}.${item.tool}`;
    case "web_search":
      return `${prefix} web search: ${clip(item.query, 180)}`;
    case "todo_list":
      return `${prefix} todo list updated`;
    case "file_change":
      return `${prefix} file changes: ${item.changes
        .map((change) => `${change.kind} ${change.path}`)
        .join(", ")}`;
    case "error":
      return `${prefix} error: ${clip(item.message, 180)}`;
    default:
      return null;
  }
}

function summarizeCodexThreadEvent(event) {
  switch (event.type) {
    case "thread.started":
      return `Thread started: ${event.thread_id}`;
    case "turn.started":
      return "Turn started.";
    case "turn.completed":
      return `Turn completed. Tokens out: ${event.usage?.output_tokens ?? 0}`;
    case "turn.failed":
      return `Turn failed: ${event.error?.message || "unknown error"}`;
    case "error":
      return `Stream error: ${event.message}`;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return summarizeCodexItem(event.item, event.type);
    default:
      return null;
  }
}

async function discordApi(pathname, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bot ${config.discordBotToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    const detail = payload?.message || response.statusText;
    throw new Error(`Discord API error (${response.status}): ${detail}`);
  }
  return payload;
}

async function sendDiscordMessage(channelId, content) {
  let lastPayload = null;
  for (const part of chunkMessage(content)) {
    lastPayload = await discordApi(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: part }),
    });
    appendLog({
      ts: new Date().toISOString(),
      direction: "out",
      channelId,
      content: part,
    });
  }
  return lastPayload;
}

async function sendDiscordDm(userId, content) {
  const channel = await discordApi("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: String(userId) }),
  });

  return sendDiscordMessage(channel.id, content);
}

async function editDiscordMessage(channelId, messageId, content) {
  const payload = await discordApi(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
  appendLog({
    ts: new Date().toISOString(),
    direction: "edit",
    channelId,
    messageId,
    content,
  });
  return payload;
}

function isAllowedUser(authorId) {
  return config.allowedUserIds.includes(String(authorId));
}

function hasCodexBackend() {
  return config.replyBackend === "codex";
}

function hasOpenAiBackend() {
  return config.replyBackend === "openai" && hasOpenAi(config);
}

async function createCodexReply(messageText, previousResponseId = null, progress = null) {
  const client = await getCodexClient();
  const controller = new AbortController();
  const streamLines = [];
  let reasoningText = "";
  let outputText = "";
  let lastProgressText = "";
  let progressScheduled = false;
  let threadId = previousResponseId;

  const flushProgress = async () => {
    progressScheduled = false;
    if (!progress) {
      return;
    }

    const body = [
      "Codex is working.",
      "",
      reasoningText ? `Reasoning:\n\`\`\`text\n${clip(reasoningText, 1200)}\n\`\`\`` : null,
      outputText ? `Draft reply:\n\`\`\`text\n${clip(outputText, 1200)}\n\`\`\`` : null,
      streamLines.length > 0
        ? ["Recent events:", "```text", ...streamLines.slice(-6), "```"].join("\n")
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    if (body && body !== lastProgressText) {
      lastProgressText = body;
      await progress(body);
    }
  };

  const scheduleProgress = () => {
    if (!config.codexStreamJson || !progress || progressScheduled) {
      return;
    }
    progressScheduled = true;
    setTimeout(() => {
      flushProgress().catch(() => {});
    }, 400);
  };

  const timeout =
    config.codexTimeoutMs > 0
      ? setTimeout(() => {
          controller.abort();
        }, config.codexTimeoutMs)
      : null;

  try {
    const thread = previousResponseId
      ? client.resumeThread(previousResponseId, {
          model: config.codexModel,
          sandboxMode: "workspace-write",
          networkAccessEnabled: config.codexNetworkAccessEnabled,
          workingDirectory: config.codexCwd,
          skipGitRepoCheck: true,
          modelReasoningEffort: config.codexReasoningEffort,
        })
      : client.startThread({
          model: config.codexModel,
          sandboxMode: "workspace-write",
          networkAccessEnabled: config.codexNetworkAccessEnabled,
          workingDirectory: config.codexCwd,
          skipGitRepoCheck: true,
          modelReasoningEffort: config.codexReasoningEffort,
        });

    const { events } = await thread.runStreamed(
      [
        { type: "text", text: config.openAiSystemPrompt },
        { type: "text", text: messageText },
      ],
      { signal: controller.signal },
    );

    for await (const event of events) {
      if (event.type === "thread.started") {
        threadId = event.thread_id;
      }

      if (event.type === "item.updated" || event.type === "item.completed") {
        if (event.item.type === "reasoning" && event.item.text) {
          reasoningText = event.item.text;
          scheduleProgress();
        }

        if (event.item.type === "agent_message" && event.item.text) {
          outputText = event.item.text;
          scheduleProgress();
        }
      }

      const summary = summarizeCodexThreadEvent(event);
      if (summary) {
        streamLines.push(summary);
        appendLog({
          ts: new Date().toISOString(),
          direction: "codex_stream",
          event: summary,
        });
        scheduleProgress();
      }
    }

    return {
      responseId: threadId || null,
      text: outputText.trim() || "No text response returned.",
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Codex SDK request timed out after ${config.codexTimeoutMs}ms.`,
      );
    }
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function buildReply(message) {
  const content = (message.content || "").trim();
  if (!content) {
    return "I received the DM, but there was no text content to process.";
  }

  if (/^ping$/i.test(content)) {
    return "pong";
  }

  if (/^status$/i.test(content)) {
    return [
      "Discord bridge is live.",
      `Env source: ${describeEnvSource(config.envPath)}`,
      `Allowed users configured: ${config.allowedUserIds.length}`,
      `Reply backend: ${config.replyBackend}`,
      `OpenAI API key configured: ${hasOpenAi(config) ? "yes" : "no"}`,
      `Codex model: ${config.codexModel}`,
      `Codex network access: ${config.codexNetworkAccessEnabled ? "enabled" : "disabled"}`,
      `Codex SDK source: ${describeCodexSdkSource()}`,
      `Timeout ms: ${config.codexTimeoutMs || 0}`,
      `social-desk root: ${config.socialDeskRoot}`,
    ].join("\n");
  }

  const socialDeskReply = await handleSocialDeskCommand(
    content,
    config,
    `discord:${message.author.id}`,
  );
  if (socialDeskReply) {
    return socialDeskReply;
  }

  if (hasCodexBackend()) {
    const state = loadState();
    const previousResponseId =
      state.conversations?.[message.author.id]?.previousResponseId || null;
    let progressMessageId = null;
    let pendingProgress = Promise.resolve();

    const pushProgress = async (text) => {
      pendingProgress = pendingProgress.then(async () => {
        if (!progressMessageId) {
          const created = await sendDiscordMessage(message.channel_id, text);
          progressMessageId = created?.id || null;
          return;
        }
        await editDiscordMessage(message.channel_id, progressMessageId, text);
      });

      return pendingProgress;
    };

    const result = await createCodexReply(
      content,
      previousResponseId,
      config.codexStreamJson ? pushProgress : null,
    );

    state.conversations[message.author.id] = {
      previousResponseId: result.responseId,
      updatedAt: new Date().toISOString(),
    };
    saveState(state);

    await pendingProgress;
    return result.text;
  }

  if (hasOpenAiBackend()) {
    const state = loadState();
    const previousResponseId =
      state.conversations?.[message.author.id]?.previousResponseId || null;

    const result = await createOpenAiReply({
      config,
      messageText: content,
      previousResponseId,
    });

    state.conversations[message.author.id] = {
      previousResponseId: result.responseId,
      updatedAt: new Date().toISOString(),
    };
    saveState(state);

    return result.text;
  }

  return [
    "Discord bridge is live.",
    "No AI backend is configured yet.",
    "Set DISCORD_REPLY_BACKEND to codex or configure OPENAI_API_KEY for openai replies.",
  ].join("\n");
}

async function handleIncomingMessage(message) {
  if (!message || message.author?.bot) {
    return;
  }
  if (message.guild_id) {
    return;
  }
  if (!isAllowedUser(message.author.id)) {
    appendLog({
      ts: new Date().toISOString(),
      direction: "ignored",
      reason: "unauthorized-user",
      authorId: message.author.id,
      channelId: message.channel_id,
    });
    return;
  }

  if (activeUsers.has(message.author.id)) {
    await sendDiscordMessage(
      message.channel_id,
      "Still working on your previous message.",
    );
    return;
  }

  activeUsers.add(message.author.id);

  appendLog({
    ts: new Date().toISOString(),
    direction: "in",
    authorId: message.author.id,
    channelId: message.channel_id,
    messageId: message.id,
    content: message.content || "",
  });

  try {
    const reply = await buildReply(message);
    await sendDiscordMessage(message.channel_id, reply);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    appendLog({
      ts: new Date().toISOString(),
      direction: "error",
      authorId: message.author.id,
      channelId: message.channel_id,
      error: detail,
    });
    await sendDiscordMessage(message.channel_id, `Bridge error: ${detail}`);
  }
  finally {
    activeUsers.delete(message.author.id);
  }
}

async function runSocialDeskNotifications() {
  if (!config.socialDeskNotifyEnabled || socialDeskNotificationRunning) {
    return;
  }

  socialDeskNotificationRunning = true;

  try {
    const state = loadState();
    const currentState = state.socialDeskNotifications || {};
    const { messages, nextState } = await collectSocialDeskNotifications(
      config,
      currentState,
      new Date(),
    );

    if (messages.length > 0) {
      for (const userId of config.allowedUserIds) {
        for (const message of messages) {
          await sendDiscordDm(userId, message);
        }
      }
    }

    state.socialDeskNotifications = nextState;
    saveState(state);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    appendLog({
      ts: new Date().toISOString(),
      direction: "error",
      scope: "social-desk-notify",
      error: detail,
    });
  } finally {
    socialDeskNotificationRunning = false;
  }
}

function startSocialDeskNotifications() {
  if (!config.socialDeskNotifyEnabled) {
    return;
  }

  runSocialDeskNotifications().catch(() => {});
  socialDeskNotificationTimer = setInterval(() => {
    runSocialDeskNotifications().catch(() => {});
  }, config.socialDeskNotifyIntervalMs);
}

function clearGatewayTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearTimers() {
  clearGatewayTimers();
  if (socialDeskNotificationTimer) {
    clearInterval(socialDeskNotificationTimer);
    socialDeskNotificationTimer = null;
  }
}

function scheduleReconnect(delayMs = 5000) {
  clearGatewayTimers();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().catch((error) => {
      console.error("Reconnect failed:", error);
      scheduleReconnect(10000);
    });
  }, delayMs);
}

function sendGateway(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function startHeartbeat(intervalMs) {
  heartbeatIntervalMs = intervalMs;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  heartbeatTimer = setInterval(() => {
    sendGateway({ op: 1, d: lastSequence });
  }, heartbeatIntervalMs);
}

function identify() {
  sendGateway({
    op: 2,
    d: {
      token: config.discordBotToken,
      intents: 4096,
      properties: {
        os: process.platform,
        browser: "discord-bridge",
        device: "discord-bridge",
      },
    },
  });
}

function resume() {
  if (!sessionId) {
    identify();
    return;
  }

  sendGateway({
    op: 6,
    d: {
      token: config.discordBotToken,
      session_id: sessionId,
      seq: lastSequence,
    },
  });
}

async function onGatewayPayload(payload) {
  if (typeof payload.s === "number") {
    lastSequence = payload.s;
  }

  switch (payload.op) {
    case 10:
      startHeartbeat(payload.d.heartbeat_interval);
      if (sessionId) {
        resume();
      } else {
        identify();
      }
      return;
    case 7:
      socket?.close();
      return;
    case 9:
      sessionId = null;
      setTimeout(() => identify(), 1000);
      return;
    default:
      break;
  }

  if (payload.t === "READY") {
    sessionId = payload.d.session_id;
    botUserId = payload.d.user?.id || null;
    console.log(
      `Discord bridge ready as ${payload.d.user?.username || "unknown"} ` +
        `using ${describeEnvSource(config.envPath)}`,
    );
    return;
  }

  if (payload.t === "RESUMED") {
    console.log("Discord session resumed.");
    return;
  }

  if (payload.t === "MESSAGE_CREATE") {
    await handleIncomingMessage(payload.d);
  }
}

async function connect() {
  clearGatewayTimers();

  const gatewayInfo = await discordApi("/gateway/bot");
  const gatewayUrl = `${gatewayInfo.url}?v=10&encoding=json`;

  if (typeof WebSocket !== "function") {
    throw new Error("Global WebSocket is unavailable in this Node runtime.");
  }

  socket = new WebSocket(gatewayUrl);

  socket.addEventListener("message", async (event) => {
    try {
      const payload = JSON.parse(event.data);
      await onGatewayPayload(payload);
    } catch (error) {
      console.error("Gateway message handling failed:", error);
    }
  });

  socket.addEventListener("close", () => {
    botUserId = null;
    scheduleReconnect();
  });

  socket.addEventListener("error", (error) => {
    console.error("Discord gateway error:", error.message || error);
  });
}

process.on("SIGINT", () => {
  clearTimers();
  socket?.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearTimers();
  socket?.close();
  process.exit(0);
});

appendLog({
  ts: new Date().toISOString(),
  direction: "system",
  event: "startup",
  envSource: describeEnvSource(config.envPath),
  allowedUsers: config.allowedUserIds.length,
  replyBackend: config.replyBackend,
  codexNetworkAccessEnabled: config.codexNetworkAccessEnabled,
  openAiConfigured: hasOpenAi(config),
});

startSocialDeskNotifications();
connect().catch((error) => {
  console.error("Failed to start Discord bridge:", error);
  process.exitCode = 1;
});
