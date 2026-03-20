# Discord Bridge

Minimal Discord DM bridge for a small trusted operator set.

## Overview

- Connects to the Discord gateway with a bot token
- Accepts direct messages only
- Restricts access to an allowlist of Discord user IDs
- Logs local runtime activity to `runtime/messages.jsonl`
- Replies with built-in status output, Codex-backed output, or OpenAI-backed output
- Can stream Codex progress into a live DM status message while work is running
- Can watch `runtime/progress-events.jsonl` and DM milestone/blocker/completion updates

## Intended Use

- Personal operator bot
- Small internal automation bridge
- Private support or operations assistant

This project is intentionally narrow:

- DM only
- No slash commands
- No multi-tenant auth model
- No dashboard or hosted control plane

## Requirements

- Node.js 22 or newer
- A Discord bot token and application ID
- At least one allowed Discord user ID
- An OpenAI API key if you want OpenAI-backed replies

## Quick Start

```bash
npm install
cp .env.example .env
npm start
```

Fill in `.env` with real values before starting the bridge.

For local bridge development with auto-reload:

```bash
npm run dev
```

This starts the bridge under PM2 in watch mode, but only watches `src/`.
Generated files like `runtime/messages.jsonl` are excluded so the bridge does not restart on its own logs.
Stop that dev process with:

```bash
npm run dev:stop
```

## Configuration

By default, the bridge looks for env files in this order:

1. `DISCORD_ENV_FILE` if set
2. `./.env.local`
3. `./.env`
4. `../docs/.env.local`
5. `../docs/.env`

Required:

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_ALLOWED_USER_IDS`
  Comma-separated list of Discord user IDs allowed to DM the bot.

Optional:

- `DISCORD_REPLY_BACKEND`
  `codex` or `openai`
- `SOCIAL_DESK_ROOT`
  Path to the `social-desk` repo. Defaults to `../social-desk`.
- `SOCIAL_DESK_NOTIFY_ENABLED`
  Enables periodic `social-desk` DM notifications to allowed operators.
- `SOCIAL_DESK_NOTIFY_INTERVAL_MS`
  Poll interval for `social-desk` notifications. Defaults to `300000`.
- `SOCIAL_DESK_DAILY_SUMMARY_HOUR_UTC`
  Optional UTC hour (`0-23`) for a once-daily queue summary DM.
- `DISCORD_PROGRESS_NOTIFY_ENABLED`
  Enables polling of `runtime/progress-events.jsonl` for task updates.
- `DISCORD_PROGRESS_NOTIFY_INTERVAL_MS`
  Poll interval for progress-event notifications. Defaults to `15000`.
- `DISCORD_PROGRESS_NOTIFY_LEVELS`
  Comma-separated levels to DM. Defaults to `milestone,blocker,complete`.
- `DISCORD_PROGRESS_EVENTS_PATH`
  Optional override for the watched progress JSONL file.
- `CODEX_BIN`
- `CODEX_CWD`
- `CODEX_MODEL`
- `CODEX_STREAM_JSON`
- `CODEX_REASONING_EFFORT`
- `CODEX_NETWORK_ACCESS_ENABLED`
- `CODEX_USE_OPENAI_API_KEY`
- `CODEX_SDK_MODULE_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_SYSTEM_PROMPT`

If `@openai/codex-sdk` is not installed in the project, set `CODEX_SDK_MODULE_PATH` to a valid module file instead.

`CODEX_NETWORK_ACCESS_ENABLED` defaults to `true` for Codex-backed replies.

Codex thread behavior:

- Codex-backed Discord messages reuse the saved thread for the same user while the local day is unchanged
- the saved per-user conversation state survives bridge restarts via `runtime/state.json`
- a new local calendar day starts a fresh thread automatically
- the bridge no longer applies a local Codex timeout cutoff

OpenAI response chaining follows the same daily reset rule.

Auth behavior:

- when `DISCORD_REPLY_BACKEND=codex`, the bridge uses local Codex/session auth by default
- `OPENAI_API_KEY` is only injected into the Codex SDK when `CODEX_USE_OPENAI_API_KEY=true`
- when `DISCORD_REPLY_BACKEND=openai`, replies always use the direct OpenAI API path
- the `status` command reports the effective Codex auth source so quota failures are easier to interpret

## Example Env

Copy `.env.example` to `.env` or `.env.local` and fill in real values.

## Commands

- `ping`: returns `pong`
- `status`: returns bridge status and whether AI replies are enabled
- `x cmds`: shows the built-in `social-desk` bridge commands
- `x queue`: shows queue counts and top pending items from `social-desk`
- `x usage`: shows `social-desk` budget and queue status
- `x approve <item-id>`: marks an item approved
- `x reject <item-id>`: marks an item denied
- `x hold <item-id>`: marks an item hold
- `x show <item-id>`: shows item detail, notes, and audit state
- `x post <item-id>`: publishes an approved item through `social-desk`
- `x revise <item-id> <instruction>`: appends a revision note and resets the item to pending

Any other DM:

- uses `@openai/codex-sdk` when `DISCORD_REPLY_BACKEND=codex`
- uses the OpenAI reply path when `DISCORD_REPLY_BACKEND=openai`
- otherwise returns a bridge-live acknowledgement

## Security Notes

- Do not commit `.env`, `.env.local`, or runtime logs
- Treat `runtime/messages.jsonl` and `runtime/state.json` as sensitive local data
- Keep `DISCORD_ALLOWED_USER_IDS` restricted to trusted operators

## Codex SDK Stream

When `DISCORD_REPLY_BACKEND=codex`, the bridge uses `@openai/codex-sdk` and streams structured thread events.

If you want the Codex SDK to authenticate with `OPENAI_API_KEY`, set `CODEX_USE_OPENAI_API_KEY=true`; otherwise the bridge relies on local/session-backed Codex auth.

It will:

- create a short "working" DM message
- update that message with recent reasoning/output progress while the request runs
- send the final response as a normal Discord message

Set `CODEX_STREAM_JSON=false` to disable the live progress stream.

## social-desk Notifications

When `SOCIAL_DESK_NOTIFY_ENABLED=true`, the bridge polls `social-desk` and sends DM alerts to every allowed user for:

- newly pending queue items
- optional daily queue summaries when `SOCIAL_DESK_DAILY_SUMMARY_HOUR_UTC` is set

This is meant to pair with `social-desk` queue regeneration, for example by running `npm run schedule:queue` in the `social-desk` repo.

## Progress Event Notifications

When `DISCORD_PROGRESS_NOTIFY_ENABLED=true`, the bridge polls `runtime/progress-events.jsonl` and DMs allowed users for selected levels such as:

- `milestone`
- `blocker`
- `complete`
- `question`

Recommended event shape:

- `taskId`
- `threadId`
- `project`
- `scope`
- `status`
- `message`
- `ts`
- `level`
- `meta`

Emoji mapping:

- `milestone` or `started`: `🔄`
- `blocker` or `warning`: `⚠️`
- `complete`: `✅`
- `question` or `approval`: `❓`
- `failed` or `error`: `❌`

You can emit a test event locally with:

```bash
npm run emit:progress -- --project carapace --task steering --level milestone --status completed --message "Seeded local steering repo."
```
