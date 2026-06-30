# High-Level Architecture

`discord-bridge` is a small Node.js connector that turns trusted Discord DMs
into local automation requests. The process owns the Discord gateway
connection, checks each incoming DM against a local allowlist, and routes the
message to built-in commands, `social-desk` queue actions, or Codex SDK-backed
replies.

The project is intentionally narrow:

- one long-running Node.js process
- Discord DMs only
- a small trusted operator allowlist
- local JSON/JSONL state instead of a database
- optional integrations with Codex and a sibling `social-desk` repo

## Runtime Shape

```text
Allowed Discord user
        |
        v
Discord Gateway WebSocket
        |
        v
src/index.js
  - gateway session, heartbeat, reconnect
  - DM filtering and allowlist enforcement
  - request routing
  - local runtime logs and state
        |
        +--> built-in commands
        |
        +--> src/socialDesk.js
        |       |
        |       v
        |   sibling social-desk/src/queueActions.js
        |
        +--> @openai/codex-sdk
                |
                v
            local Codex runtime/session
```

`src/index.js` is the application shell. It loads configuration, creates the
runtime directory, opens the Discord gateway, handles gateway lifecycle events,
and dispatches allowed direct messages. It also starts the optional polling
loops that send proactive DM notifications.

## Configuration

Configuration is loaded by `src/env.js`. File-based values are merged with the
process environment, with process environment variables taking precedence.

Env files are discovered in this order:

1. `DISCORD_ENV_FILE`
2. `.env.local`
3. `.env`
4. `../docs/.env.local`
5. `../docs/.env`

The required values are the Discord bot token, Discord application ID, and at
least one allowed Discord user ID. Most behavior is controlled by optional env
vars, especially:

- `DISCORD_PROGRESS_NOTIFY_ENABLED`
- `SOCIAL_DESK_NOTIFY_ENABLED`
- `SOCIAL_DESK_ROOT`
- `CODEX_*` settings for Codex execution

## Message Handling Flow

1. Discord sends `MESSAGE_CREATE` events through the gateway.
2. `src/index.js` ignores bot messages, guild messages, and unauthorized users.
3. A per-user in-memory lock prevents concurrent work for the same operator.
4. The inbound message is appended to `runtime/messages.jsonl`.
5. The trimmed DM content is routed in this order:
   - `ping`
   - `status`
   - `x ...` `social-desk` commands
   - Codex SDK replies
6. Replies are chunked below Discord message limits and sent through the
   Discord REST API.
7. Errors are formatted with Codex-aware diagnostics, logged locally, and
   returned to the operator as a bridge error DM.

## Built-In Commands

Built-in commands are handled directly in `src/index.js`:

- `ping` returns `pong`
- `status` reports bridge health, env source, allowlist size, Codex SDK status,
  Codex auth source, and the configured `social-desk` root

These commands avoid Codex SDK calls and are useful for checking whether the
gateway process is alive and configured as expected.

## Codex Reply Path

`src/index.js` lazily imports `@openai/codex-sdk` or a module configured by
`CODEX_SDK_MODULE_PATH`.

For each allowed DM:

1. The bridge loads the per-user conversation state from `runtime/state.json`.
2. If the same user already has a Codex thread for the current local day, the
   bridge resumes it. Otherwise it starts a new thread.
3. `src/codexPrompt.js` builds the input items. New threads first instruct
   Codex to read the top-level `AGENTS.md`, then include the configured system
   prompt and the Discord message.
4. Codex runs in `workspace-write` sandbox mode from `CODEX_CWD`.
5. Streamed Codex events are summarized into local logs.
6. When streaming is enabled, the bridge creates or edits a temporary Discord
   progress message using `src/discordProgress.js`.
7. The final assistant text is sent as a normal Discord DM.
8. The Codex thread ID is persisted for reuse until the local day rolls over.

Codex auth defaults to the local Codex/session auth. The bridge only passes
Codex execution options into the SDK; it does not maintain a separate direct
OpenAI Responses API client.

## social-desk Integration

`src/socialDesk.js` handles Discord commands prefixed with `x`. It imports
`src/queueActions.js` from the sibling `social-desk` repo configured by
`SOCIAL_DESK_ROOT`.

The bridge does not own the `social-desk` data model. It delegates queue reads,
review actions, revisions, usage summaries, and publishing to that repo's
`queueActions.js` module, then formats the returned data for Discord.

Supported command groups include:

- queue and usage summaries
- item detail display
- approve, reject, hold, and revise review actions
- publishing approved queue items

## Background Notifications

The bridge can send proactive DMs without an inbound Discord message.

### social-desk notifications

When `SOCIAL_DESK_NOTIFY_ENABLED=true`, `src/socialDeskNotify.js` periodically
polls the `social-desk` queue. It sends allowed users a DM for newly pending
items and, when configured, a once-daily UTC summary.

Notification bookkeeping is stored inside `runtime/state.json` under the
`socialDeskNotifications` key.

### Progress event notifications

When `DISCORD_PROGRESS_NOTIFY_ENABLED=true`, `src/progressNotify.js` polls a
JSONL event file. By default, that file is `runtime/progress-events.jsonl`.

Each event is normalized by `src/progressEvents.js` when emitted through
`scripts/emit-progress.js`. The notification poller filters by configured event
levels, formats matching events, and DMs every allowed user.

Progress notification cursor state is stored in
`runtime/progress-state.json`.

## Local State and Logs

The bridge uses the `runtime/` directory for local mutable data:

- `messages.jsonl`: inbound messages, outbound messages, edits, startup events,
  Codex stream summaries, and errors
- `state.json`: per-user conversation state and `social-desk` notification
  state
- `progress-events.jsonl`: append-only progress events consumed by the progress
  notification poller
- `progress-state.json`: number of progress event lines already processed

These files are operational data and may contain private content. They should
not be committed.

## Reliability Boundaries

The bridge is designed for a small trusted operator set, not broad public use.
Important boundaries:

- Discord gateway reconnect and resume are handled in process.
- Discord REST failures during normal replies surface to the operator as bridge
  errors.
- Progress-message update failures are logged but do not fail the final Codex
  response.
- A single in-memory per-user lock prevents overlapping work from the same
  operator, but there is no distributed locking across multiple bridge
  processes.
- Local JSON writes are serialized for conversation and `social-desk`
  notification state updates inside one process.
- Runtime state is local to the machine running the bridge.

## Extension Points

The main extension points are deliberately simple:

- add small built-in DM commands in `buildReply` in `src/index.js`
- add new `x ...` commands in `src/socialDesk.js`
- add or change proactive event formatting in `src/progressNotify.js`
- add new progress event producers by appending JSONL events through
  `src/progressEvents.js`
- change AI behavior through env-driven Codex configuration before adding new
  code paths

For larger changes, keep the current separation intact: `src/index.js` should
own Discord process orchestration and routing, while integration-specific
modules should own formatting and calls into external systems.
