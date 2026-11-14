---
covers:
  - packages/dms/src/mcp/**
  - packages/dms/src/utils/owner-only-file.ts
docs:
  - packages/dms/docs/08.ai-and-claude-code/10.mcp-server.md
---

# MCP server

The MCP server the DMS serves in development, so a coding agent started in the project, such as Claude Code or Codex, gets the builder, database and page tools of the dashboard assistant. The agent reaches `POST /dms/mcp` through the stdio bridge `node_modules/.cache/dms/mcp-bridge.cjs`, which the project's `.mcp.json` launches. The playground's `docs` environment turns the server on, as `ajs project dev` does.

## Sub-features

- `bridge-initializes-and-lists-tools`: the bridge answers `initialize` with the `dms` server, and `tools/list` serves the read, builder and project tools of the full scope, with the read tools marked read-only.
- `bridge-calls-a-read-tool`: `tools/call` through the bridge runs `builder_catalog` and answers the block types, the DataTypes and the reserved field names as text.
- `bridge-refuses-unknown-tool-and-method`: error path: an unknown tool answers JSON-RPC `-32602` and an unknown method `-32601`.
- `route-refuses-uncredentialled-callers`: Exposure: `POST /dms/mcp` answers 401 to a caller with no credential and to one with a wrong credential.
- `page-verify-reports-a-page`: `page_verify` signs a headless Chromium in as the owner through the session handoff, opens the playground's users table, and reports every block present, the table's data loaded, the New entry form validating an empty submit and the screenshot written under `.antelope/page-verify/`; a route no page serves fails with its own line.
- `page-verify-member-against-mockup`: Access: on a development backend, `page_verify` with `role` and `mockup` signs the users table in as an invited member holding only that role, and draws the mockup comparison in the `/mockup` viewer through the owner's session: the report names the member, its mockup table pairs with the page's table and the mockup screenshot is written, while the member gets 403 on the mockup the viewer reads.
- `bridge-files-published`: the backend writes the credential to `node_modules/.cache/dms/mcp.json` with mode `0600`, on Windows with an ACL that grants the current user alone, and adds the `dms` server to the project's `.mcp.json`.

## How to get to it (user POV)

- Run `claude` in the project root and approve the `dms` server, or declare the bridge in Codex's `config.toml`. The tools read `mcp__dms__builder_catalog` and the like.

## Driving it with dms-control

```bash
dms-control journey "$RUN" mcp-server [journey-id...]
```

The journeys start the bridge from the run's playground, as a coding agent does, and speak JSON-RPC lines to it. Evidence is under `$RUN/evidence/mcp-server/<journey>/`.

## Gotchas

- The run's backend starts with `ajs project start`, which is not development mode, so the playground's `docs` environment sets `mcp.enabled` and `builder.enabled`. The development-mode default is not driven. `page-verify-member-against-mockup` sets `backend: "dev"`, since the mockup engine and its `/mockup` viewer exist only there, and writes its spec to the run's `mockups/page-verify-member/`.
- The playground's `apiBaseUrl` is the dashboard's address, which adds `X-Forwarded-For`, so the published URL would be refused with 403. The journeys run the project's launcher from a private copy whose credential file holds the run's API URL and the token of the serving backend. Every backend of a run, the standby of the next journey included, publishes into the same project folder, so the helper `mcp-bridge.mjs` pings the route with the published token and restarts the backend when another backend's token is there.
- Run the `page_verify` journeys on `up --dev-frontend`, the dashboard `ajs project dev` serves. On the built dashboard the tool's block probe misses the users table, which the page draws, so `page-verify-reports-a-page` fails and the mockup preview reads as drawing no block.
- Safe mode (`mcp.access: "safe"`) is not driven: the playground serves the full scope.
- The route accepts only a caller on the backend's machine that came straight to it. The journeys call through the run's forwarder, which adds no forwarding header, so the 403 for a forwarded call is not driven.
