# Discord Bridge

Minimal Discord DM bridge for a single authorized operator.

## What It Does

- connects to the Discord gateway with a bot token
- accepts direct messages only
- filters messages by allowed user ID
- logs inbound and outbound messages to `runtime/messages.jsonl`
- replies with:
  - a built-in status response
  - a Codex SDK response when the backend is set to `codex`
  - an OpenAI-backed response when the backend is set to `openai`
- when using the Codex backend, it can stream SDK response events into a live DM status message

## Publish Hygiene

- runtime data stays local and should not be committed
- secrets stay in env files and should not be committed
- no user-specific filesystem paths are required by default

## Environment

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

Optional:

- `DISCORD_REPLY_BACKEND`
- `CODEX_BIN`
- `CODEX_CWD`
- `CODEX_MODEL`
- `CODEX_TIMEOUT_MS`
- `CODEX_STREAM_JSON`
- `CODEX_REASONING_EFFORT`
- `CODEX_NETWORK_ACCESS_ENABLED`
- `CODEX_SDK_MODULE_PATH`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_SYSTEM_PROMPT`

## Run

```bash
npm install
npm start
```

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

## Codex SDK Stream

When `DISCORD_REPLY_BACKEND=codex`, the bridge uses `@openai/codex-sdk` and streams structured thread events.

It will:

- create a short "working" DM message
- update that message with recent reasoning/output progress while the request runs
- send the final response as a normal Discord message

Set `CODEX_STREAM_JSON=false` to disable the live progress stream.
