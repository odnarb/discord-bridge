# Discord Bridge

Minimal Discord DM bridge for a small trusted operator set.

## Overview

- Connects to the Discord gateway with a bot token
- Accepts direct messages only
- Restricts access to an allowlist of Discord user IDs
- Logs local runtime activity to `runtime/messages.jsonl`
- Replies with built-in status output, Codex-backed output, or OpenAI-backed output
- Can stream Codex progress into a live DM status message while work is running

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

## Configuration

By default, the bridge looks for env files in this order:

1. `DISCORD_ENV_FILE` if set
2. `./.env`
3. `./.env.local`
4. `../docs/.env`
5. `../docs/.env.local`

Required:

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_ALLOWED_USER_IDS`
  Comma-separated list of Discord user IDs allowed to DM the bot.

Optional:

- `DISCORD_REPLY_BACKEND`
  `codex` or `openai`
- `CODEX_BIN`
- `CODEX_CWD`
- `CODEX_MODEL`
- `CODEX_TIMEOUT_MS` (`0` disables the timeout)
- `CODEX_STREAM_JSON`
- `CODEX_REASONING_EFFORT`
- `CODEX_NETWORK_ACCESS_ENABLED`
- `CODEX_SDK_MODULE_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_SYSTEM_PROMPT`

If `@openai/codex-sdk` is not installed in the project, set `CODEX_SDK_MODULE_PATH` to a valid module file instead.

`CODEX_NETWORK_ACCESS_ENABLED` defaults to `true` for Codex-backed replies.

## Example Env

Copy `.env.example` to `.env` or `.env.local` and fill in real values.

## Commands

- `ping`: returns `pong`
- `status`: returns bridge status and whether AI replies are enabled

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

It will:

- create a short "working" DM message
- update that message with recent reasoning/output progress while the request runs
- send the final response as a normal Discord message

Set `CODEX_STREAM_JSON=false` to disable the live progress stream.
