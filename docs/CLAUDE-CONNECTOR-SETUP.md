# Claude Custom Connector Setup

This document covers how to connect Claude to the MASA Orchestrator MCP server using a Claude custom connector.

## What This Does

The Claude custom connector lets Claude call MASA Orchestrator tools directly as a remote MCP server over HTTPS. Authentication uses OAuth 2.0 with PKCE and Dynamic Client Registration — Claude handles the full auth flow automatically. No manual OAuth credentials are required.

## Architecture

```
Claude (browser/app)
  │
  ├── discovers auth via WWW-Authenticate header
  │     └── https://mcp.wuweism.com/.well-known/oauth-protected-resource
  │           → points to https://orchestrator.wuweism.com
  │
  ├── reads OAuth authorization server metadata
  │     └── https://orchestrator.wuweism.com/.well-known/oauth-authorization-server
  │
  ├── registers itself as a public PKCE client (Dynamic Client Registration)
  │     └── POST https://orchestrator.wuweism.com/api/oauth/register
  │
  ├── completes authorization code + PKCE flow
  │     └── https://orchestrator.wuweism.com/api/oauth/authorize
  │     └── https://orchestrator.wuweism.com/api/oauth/token
  │
  └── calls MCP tools with a bearer token
        └── POST https://mcp.wuweism.com/mcp
```

Two separate services handle two separate roles:

| Service | Host | Role |
|---------|------|------|
| MCP backend | `https://mcp.wuweism.com` | serves MCP tools, enforces bearer auth |
| Operator console | `https://orchestrator.wuweism.com` | OAuth authorization server, operator UI |

## Connector Values

In Claude, add a new custom connector with these exact values:

| Field | Value |
|-------|-------|
| **Name** | `Masa Orchestrator` |
| **Remote MCP server URL** | `https://mcp.wuweism.com/mcp` |
| **OAuth Client ID** | *(leave blank)* |
| **OAuth Client Secret** | *(leave blank)* |

Leave the OAuth fields blank. The server advertises `registration_endpoint` in its authorization server metadata, so Claude uses Dynamic Client Registration to create its own client credentials automatically.

## Verification Commands

Run these to confirm each layer is working before connecting.

### 1 — Authorization server metadata

```bash
curl -s https://orchestrator.wuweism.com/.well-known/oauth-authorization-server | jq .
```

Expected: a JSON object with public URLs for `issuer`, `authorization_endpoint`, `token_endpoint`, and `registration_endpoint`. All URLs must start with `https://orchestrator.wuweism.com`, not `http://localhost`.

### 2 — Protected resource metadata

```bash
curl -s https://mcp.wuweism.com/.well-known/oauth-protected-resource | jq .
```

Expected: a JSON object with `resource` pointing to `https://mcp.wuweism.com/mcp` and `authorization_servers` listing `https://orchestrator.wuweism.com`.

### 3 — Dynamic Client Registration

```bash
curl -s -X POST https://orchestrator.wuweism.com/api/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://claude.ai/oauth/callback"]}' | jq .
```

Expected: a `201` response with `client_id`, `redirect_uris`, `grant_types: ["authorization_code"]`, and `token_endpoint_auth_method: "none"`.

### 4 — Unauthenticated MCP challenge

```bash
curl -si -X POST https://mcp.wuweism.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{}' | head -20
```

Expected: HTTP `401` with a `WWW-Authenticate: Bearer resource_metadata="https://mcp.wuweism.com/.well-known/oauth-protected-resource"` header. This is the signal that triggers the connector's auth flow.

## Troubleshooting

### Metadata shows localhost URLs

**Symptom:** `authorization_endpoint` or `token_endpoint` in the metadata contains `http://localhost:3200` instead of `https://orchestrator.wuweism.com`.

**Cause:** The Next.js route handler is reading `new URL(request.url).origin` and the reverse proxy is not forwarding the public host headers.

**Fix:** Ensure the nginx config for `orchestrator.wuweism.com` includes:

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

### Registration endpoint returns 404

**Symptom:** `POST /api/oauth/register` returns 404.

**Cause:** The deployment is running an older build that predates the registration endpoint.

**Fix:** Pull the latest `main`, rebuild the console (`npm run build`), and restart the console process.

### Connector says "Couldn't reach the MCP server"

Possible causes:

1. **MCP backend not running** — check `https://mcp.wuweism.com/health` returns `{"status":"ok"}`.
2. **nginx not forwarding** — verify the nginx config routes `POST /mcp` to `http://127.0.0.1:3100/mcp` with `proxy_http_version 1.1` and a sufficient `proxy_read_timeout`.
3. **OAuth flow failing silently** — re-run the four verification commands above in sequence to identify which layer is broken.
4. **Token mismatch** — the `ORCHESTRATOR_API_TOKEN` used by the console and the MCP backend must be the same value.
