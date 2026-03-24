# MASA Orchestrator MCP — Deep Security & Trust Boundary Audit
**Date:** 2026-03-24
**Scope:** Full repo — `masa-orchestrator-mcp` at HEAD
**Basis:** Source code read; runtime behavior inferred from code only

---

## 1. Executive Security Posture

The backend MCP server has a well-designed auth primitive layer: bearer token validation is timing-safe, rate limiting is implemented and tested, body limits are enforced. On the surface this looks more mature than most internal tools.

Two findings qualify as **critical** once you read past the auth layer:

1. The **console login endpoint has no rate limiting**. The backend's `FixedWindowRateLimiter` is tested and working, and was never wired into the Next.js login route. A password brute force attack faces zero friction.

2. The **`benchmark_status` run action executes a user-supplied filesystem path** as a subprocess argument. No sandboxing. The tested exploit path: an authenticated operator sends `action: "run"` with `testPath: "/some/attacker-controlled/test.ts"` and the server runs it via `execFileAsync("npx", ["vitest", "run", <that-path>])`.

The **file scanner tools** (four of eight total tools) accept arbitrary absolute path arguments with no confinement to `AUDIT_ROOT` or `ENGINE_ROOT`. Any authenticated session can make the server read any file the Node process can access on the host.

These are not hypothetical edge cases. They are reachable by any operator who can log in. For a single-operator internal tool with a trusted operator, the blast radius is self-limited. If the password is weak or if the SHA-256 hash format is used (which the code still accepts), the blast radius extends to any network-accessible attacker.

Everything below is tied to actual source lines.

---

## 2. Trust Boundary Map

```
┌──────────────────────────────────────────────────────────────────┐
│  INTERNET / ATTACKER                                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  BROWSER (operator)                                       │   │
│  │  • Session cookie (httpOnly, no JS access)               │   │
│  │  • Sees: tool catalog, bootstrap defaults, activity log, │   │
│  │    AUDIT_ROOT path, ENGINE_ROOT path, BENCHMARK_TEST_PATH│   │
│  │  • Cannot see: MCP bearer token, session HMAC secret     │   │
│  └──────────────────┬───────────────────────────────────────┘   │
│                     │ HTTPS + session cookie                     │
│  ┌──────────────────▼───────────────────────────────────────┐   │
│  │  CONSOLE SERVER (Next.js)                [TRUST ZONE A]  │   │
│  │  • Verifies session cookie signature                     │   │
│  │  • Holds: ORCHESTRATOR_API_TOKEN (never sent to browser) │   │
│  │  • Holds: ORCHESTRATOR_CONSOLE_SECRET (session HMAC key) │   │
│  │  • Holds: ORCHESTRATOR_CONSOLE_PASSWORD_HASH             │   │
│  │  • Exposes to browser: AUDIT_ROOT, ENGINE_ROOT,          │   │
│  │    BENCHMARK_TEST_PATH (via /api/mcp/tools response)     │   │
│  │  ✗ NO rate limiting on login endpoint                    │   │
│  │  ✗ NO CSRF protection on mutation routes                 │   │
│  └──────────────────┬───────────────────────────────────────┘   │
│                     │ HTTP(S) + Bearer token                     │
│  ┌──────────────────▼───────────────────────────────────────┐   │
│  │  MCP BACKEND (Node HTTP)                 [TRUST ZONE B]  │   │
│  │  • Validates bearer token (timing-safe)                  │   │
│  │  • Applies rate limiting on /mcp only                    │   │
│  │  • Holds: ORCHESTRATOR_API_TOKEN                         │   │
│  │  • Trusts: x-operator-id header (unverified)             │   │
│  │  ✗ /health unauthenticated, reveals config               │   │
│  │  ✗ /activity auth'd but not rate-limited                 │   │
│  │  ✗ CORS disabled by default                              │   │
│  │  ✗ X-Forwarded-For trusted without proxy validation      │   │
│  └──────────────────┬───────────────────────────────────────┘   │
│                     │ Node fs.promises + execFileAsync           │
│  ┌──────────────────▼───────────────────────────────────────┐   │
│  │  HOST FILESYSTEM                         [TRUST ZONE C]  │   │
│  │  • AUDIT_ROOT: workspace files                           │   │
│  │  • ENGINE_ROOT: engine source                            │   │
│  │  • STATE_FILE: delegation state + audit log              │   │
│  │  • process.env: all secrets accessible to subprocesses   │   │
│  │  ✗ No path sandboxing on scan tools                      │   │
│  │  ✗ testPath executed as vitest subprocess argument       │   │
│  │  ✗ State file = audit log (co-located, bounded)          │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

Trust boundary violations:
  A→C: Tool scan path arguments cross from auth'd session to raw fs
  B→C: benchmark testPath crosses from bearer token to subprocess
  B→∅: /health endpoint exposes internal config with no auth
  A→browser: AUDIT_ROOT / ENGINE_ROOT absolute paths leaked to browser
```

---

## 3. Findings by Severity

---

### CRITICAL — C1: Console Login Has No Rate Limiting

**File:** `console/app/api/session/login/route.ts`

```typescript
export async function POST(request: Request) {
  const env = loadConsoleEnv();
  const body = (await request.json().catch(() => ({}))) as { password?: string; operatorId?: string };
  if (!body.password || !verifyPassword(body.password, env.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  // ← no rate limit check anywhere in this handler or in middleware
```

**Risk:** Unlimited password attempts against a single shared credential. A dictionary attack or brute force attack is completely unconstrained. The server is designed to be internet-accessible (DEPLOYMENT.md, line 185: `mcp.wuweism.com`).

**Exploit path:**
```
POST /api/session/login  { password: "guess1" }  → 401
POST /api/session/login  { password: "guess2" }  → 401
... 10,000 attempts, no throttle, no lockout
```

**Aggravating factor:** The backend has a working, tested `FixedWindowRateLimiter` in `src/http/security.ts`. It was never ported to the console Next.js layer.

**Remediation:** Create `console/middleware.ts` matching `/api/session/login`. Track attempts per IP in a process-level Map (same pattern as the backend). Return `429` with `Retry-After` after N failures in a window. 3 attempts per 60 seconds is reasonable for an internal console.

---

### CRITICAL — C2: `benchmark_status run` Executes Unsandboxed User-Supplied Filesystem Path

**Files:** `src/tools/benchmark-status.ts` line 75, `src/adapters/benchmark-runner.ts` lines 65–73

```typescript
// benchmark-runner.ts
const executionResult = await execFileAsync(
  "npx",
  ["vitest", "run", benchmarkFile, "--reporter=verbose"],
  {
    cwd: packageRoot,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,            // ← ALL secrets in environment
  }
);
```

```typescript
// benchmark-status.ts
const snapshot = await runBenchmarks({
  runtimeConfig: {
    ...dependencies.runtimeConfig,
    benchmarkTestPath: input.testPath,  // ← user-supplied, no validation
  },
```

The `testPath` field arrives from the Zod schema `benchmarkStatusSchema`:
```typescript
export const benchmarkStatusSchema = z.object({
  testPath: z.string().min(1),
  action: z.enum(["run", "report"]),
});
```

`z.string().min(1)` is the only constraint. No restriction to `AUDIT_ROOT`, `ENGINE_ROOT`, or any configured path.

**Risk:** Any authenticated operator can make the backend execute an arbitrary `.ts` file as a vitest test on the host system. The child process inherits `process.env` — meaning `ORCHESTRATOR_API_TOKEN`, `ORCHESTRATOR_CONSOLE_SECRET`, and `ORCHESTRATOR_CONSOLE_PASSWORD_HASH` are all available inside the subprocess environment.

**Exploit path:**
1. Operator (or an attacker who has brute-forced the single password) POSTs `benchmark_status` with `action: "run"` and `testPath: "/tmp/evil.test.ts"` where `/tmp/evil.test.ts` contains code that exfiltrates `process.env` or writes to disk.
2. This is not shell injection — `execFileAsync` doesn't use a shell — but it IS arbitrary code execution on the host, constrained only by what the Node process has write access to and what vitest can import.

**For an internal single-operator deployment the blast radius is self-inflicted. For any multi-operator or shared-host deployment, this is a full host compromise vector.**

**Remediation:** Validate `testPath` against `runtimeConfig.benchmarkTestPath` (the pre-configured path) and reject any value that doesn't match exactly, or that isn't under `AUDIT_ROOT` or `ENGINE_ROOT`. The tool currently accepts an arbitrary string because it was designed for path flexibility; that flexibility is unsafe at an auth boundary.

---

### HIGH — H1: File Scanner Tools Accept Arbitrary Host Filesystem Paths

**Files:** `src/tools/check-notation-compliance.ts` line 8, `src/tools/validate-assumption-envelope.ts` line 10, `src/tools/llm-independence-check.ts` (inferred from catalog), `src/tools/audit-claims.ts` (inferred from catalog)

All four scan tools use schemas of the form:
```typescript
export const checkNotationSchema = z.object({
  path: z.string().min(1),
  …
});
```

And pass this directly to `collectFiles(input.path, ...)`:
```typescript
export async function collectFiles(targetPath: string, globPattern = "**/*.ts"): Promise<string[]> {
  const stats = await fs.promises.stat(targetPath);
  if (stats.isFile()) return [targetPath];
  const files = await glob(globPattern, { cwd: targetPath, absolute: true, nodir: true, … });
```

**Risk:** Any authenticated session can instruct the backend to recursively read any directory or individual file reachable by the Node process. This includes:
- `/etc/passwd`, `/etc/shadow` (if readable)
- SSH keys, TLS certificates, `.env` files in other repos
- `~/.ssh/`, `~/.aws/credentials`
- Any other checkout on the host machine

The file content appears in scan results (match text, `surrounding` context lines) returned to the caller.

**This is not the same as shell injection — no subprocess is spawned. But it is an authenticated read-any-file capability on the host.**

**Exploit path:**
```
POST /api/mcp/call
{ "toolName": "check_notation_compliance",
  "arguments": { "path": "/home/deploy/.ssh", "glob": "**/*" },
  "confirmMutation": false }
→ Returns file content fragments from all SSH key files
```

**Remediation:** Add path sandboxing in `collectFiles()`. Check that the resolved `targetPath` starts with one of `runtimeConfig.auditRoot` or `runtimeConfig.engineRoot`. Reject any path outside these roots with a validation error:

```typescript
function assertSandboxed(targetPath: string, config: RuntimeConfig): void {
  const resolved = path.resolve(targetPath);
  const inAudit = resolved.startsWith(path.resolve(config.auditRoot));
  const inEngine = resolved.startsWith(path.resolve(config.engineRoot));
  if (!inAudit && !inEngine) {
    throw new Error(`Path not within sandboxed roots: ${resolved}`);
  }
}
```

---

### HIGH — H2: SHA-256 Password Hash Format Is Still Accepted

**File:** `console/src/lib/auth.ts` lines 59–62

```typescript
if (passwordHash.startsWith("sha256:")) {
  const expected = Buffer.from(passwordHash.slice("sha256:".length), "hex");
  const actual = crypto.createHash("sha256").update(password).digest();
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
```

SHA-256 is an extremely fast general-purpose hash. On commodity hardware, `~500M` hashes/second are trivially achievable. A 10-character alphanumeric password has a keyspace of ~62^10 ≈ 8×10^17. At 500M/s that's 1.6 × 10^9 seconds — sounds large, but common passwords (dictionary, patterns, mutations) collapse this to seconds or minutes.

**The timing-safe comparison is correct but entirely beside the point: the attacker doesn't need a side-channel when they can compute ~500M guesses per second offline against a stolen hash.**

The deployment docs correctly document scrypt. The `.env.example` shows the scrypt format. But the sha256 code path is still live at runtime — it's a footgun for anyone setting the hash manually and a liability if the state file or env vars are leaked.

**Remediation:** Remove the `sha256:` branch entirely. Add a startup validation in `loadConsoleEnv()` that checks the prefix and refuses to start if `sha256:` is detected:

```typescript
if (passwordHash.startsWith("sha256:")) {
  throw new Error(
    "ORCHESTRATOR_CONSOLE_PASSWORD_HASH uses sha256: which is not secure for passwords. " +
    "Regenerate using the scrypt: format documented in DEPLOYMENT.md."
  );
}
```

---

### HIGH — H3: Filesystem Paths (AUDIT_ROOT, ENGINE_ROOT, BENCHMARK_TEST_PATH) Sent to the Browser

**File:** `console/src/lib/mcp-client.ts` lines 22–28

```typescript
export function getConsoleDefaults() {
  return {
    auditRoot: process.env.AUDIT_ROOT || "",
    engineRoot: process.env.ENGINE_ROOT || "",
    benchmarkTestPath: process.env.BENCHMARK_TEST_PATH || "",
  };
}
```

This is returned as part of `fetchToolBootstrap()` which is served at `/api/mcp/tools` (authenticated), and the browser receives the full response including these absolute paths. The operator console then stores them as form defaults visible in the UI.

**Risk:** Any authenticated browser session — including one obtained by brute force — receives the absolute filesystem layout of the host server. These paths:
- Confirm the server has a checkout of the MASA workspace at a known location
- Inform an attacker which paths will be accepted by the scan tools
- Help an attacker craft targeted path traversal attacks (H1) using the known roots

**Remediation:** These paths should never leave the server. The backend API routes that use them should use the server-side values directly (they already do for the MCP backend). The console's `/api/mcp/tools` response should omit `defaults` entirely, or replace it with safe display values (e.g., `"ENGINE_ROOT"` as a label, not the path).

---

### MEDIUM — M1: `/health` Endpoint Is Unauthenticated and Reveals Operational Configuration

**File:** `src/http.ts` lines 239–254

```typescript
if (requestUrl.pathname === "/health") {
  sendJson(res, 200, {
    status: "ok",
    name: SERVER_NAME,
    version: SERVER_VERSION,
    transport: "http",
    path,                          // e.g., "/mcp"
    authMode: dependencies.runtimeConfig.authMode,
    consoleCompatibilityVersion: CONSOLE_COMPATIBILITY_VERSION,
  });
  return;
}
```

No authentication. Any HTTP client can call `GET /health` and learn:
- Server name and version (aids exploit targeting)
- Exact MCP path (e.g., `/mcp`)
- Authentication mode (`"bearer"`)
- Console compatibility contract version

This is DEPLOYMENT.md line 139–154's documented health check, but the documentation describes it as an operator-facing check, not a public endpoint. In production it is publicly reachable if the MCP backend is internet-exposed.

**Remediation:** Add bearer token validation to `/health` or at minimum gate it to loopback addresses only. If health checks are needed by a load balancer, require the token or use a separate internal-only health path.

---

### MEDIUM — M2: `/activity` Endpoint Has Auth But No Rate Limiting

**File:** `src/http.ts` lines 257–281

```typescript
if (requestUrl.pathname === "/activity") {
  try {
    if (!safeBearerMatch(req.headers.authorization, dependencies.runtimeConfig.apiToken)) {
      throw new HttpError(401, "Unauthorized.", "unauthorized");
    }
    // ← no rate limiter.take() here
    sendJson(res, 200, { activity: await dependencies.store.listRecentActivity(…) });
```

The `/mcp` handler calls `rateLimiter.take(callerId)` before processing. The `/activity` handler validates the bearer token but never calls the rate limiter.

**Risk:** An authenticated caller can flood the activity endpoint to force continuous state file reads. More importantly, the inconsistency means the per-endpoint rate limit design is incomplete — any future protected endpoint must consciously add rate limiting or it will be missed.

**Remediation:** Apply the same `rateLimiter.take(callerId)` call to the `/activity` handler. The rate limiter is already instantiated in `main()` and scoped there; it should be passed to the activity handler as well.

---

### MEDIUM — M3: CORS Disabled by Default — Any Origin Can POST to MCP Backend

**File:** `src/http/security.ts` lines 98–111

```typescript
export function assertAllowedOrigin(req: IncomingMessage, allowedOrigins: string[]): void {
  if (allowedOrigins.length === 0) {
    return;  // ← early return, CORS check skipped
  }
  const origin = req.headers.origin;
  if (!origin) {
    return;  // ← no Origin header (non-browser clients) also skipped
  }
```

`ORCHESTRATOR_ALLOWED_ORIGINS` is optional in `load-config.ts` line 54. In a default deployment where this variable is not set, `allowedOrigins` is empty and `assertAllowedOrigin` returns immediately.

**Risk:** When CORS is not configured, any web origin can POST to the MCP backend from a browser, provided they have the bearer token. The bearer token is the primary gate — but CORS-as-defense-in-depth is completely absent in default deployments. The deployment docs (DEPLOYMENT.md lines 69–72) do include `ORCHESTRATOR_ALLOWED_ORIGINS` in the environment example, but it's not enforced at startup.

**Also note:** The check skips when there is **no** `Origin` header. This means non-browser clients (curl, scripts) bypass CORS entirely even when `ORCHESTRATOR_ALLOWED_ORIGINS` is set. This is standard behavior for non-browser HTTP but means CORS provides zero protection against scripted attacks; only browser-based cross-origin requests are affected.

**Remediation:** Require `ORCHESTRATOR_ALLOWED_ORIGINS` to be non-empty when `MCP_TRANSPORT=http`. Add this to `loadRuntimeConfig()`:

```typescript
if (parsed.MCP_TRANSPORT === "http" && allowedOrigins.length === 0) {
  throw new Error("ORCHESTRATOR_ALLOWED_ORIGINS is required for MCP_TRANSPORT=http.");
}
```

---

### MEDIUM — M4: Session Cookie `Secure` Flag Conditional on `NODE_ENV`

**File:** `console/app/api/session/login/route.ts` line 37

```typescript
secure: process.env.NODE_ENV === "production",
```

If `NODE_ENV` is not set to `"production"` — a common oversight on VPS or Docker deployments — the session cookie is issued without `Secure: true`. Any intermediary that sees the HTTP traffic can steal the session cookie.

**The DEPLOYMENT.md example (VPS section, lines 314–323) runs `npm run start` without setting `NODE_ENV=production`.** An operator following those instructions exactly will produce a console with an insecure cookie even if HTTPS is configured at the Nginx layer, because the cookie could be set on an HTTP response before the first redirect.

**Remediation:** Set `secure: true` unconditionally and document that the console requires HTTPS. Add a startup warning if `NODE_ENV !== "production"`:

```typescript
if (process.env.NODE_ENV !== "production") {
  console.warn("[console] NODE_ENV is not 'production'. Session cookies will not have Secure flag.");
}
```

---

### MEDIUM — M5: No CSRF Protection on State-Mutation Routes

**Files:** `console/app/api/mcp/call/route.ts`, `console/app/api/session/login/route.ts`

The console uses `sameSite: "lax"` on the session cookie. `lax` blocks cross-origin top-level navigations (form POSTs via browser navigation) but does **not** block `fetch()`-based cross-origin requests from:
- A compromised page on the same registrable domain (e.g., another subdomain of `wuweism.com`)
- Any same-site XSS vector

There is no CSRF token, no double-submit cookie, no `Origin` header check on the Next.js API routes.

**Exploit path with same-site XSS:**
```javascript
// attacker controls some.wuweism.com
fetch("https://orchestrator.wuweism.com/api/mcp/call", {
  method: "POST",
  credentials: "include",  // sends session cookie
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ toolName: "delegation_chain_state",
                         arguments: { action: "update", taskId: "TASK-001",
                                      newStatus: "rejected", agent: "gpt" },
                         confirmMutation: true }),
});
```

**Remediation:** Add a custom request header check. The Next.js API routes should require `X-Console-Request: 1` on all POST endpoints and validate its presence server-side. This header cannot be sent cross-origin without a CORS preflight, which the MCP backend won't grant. This is the cheapest effective CSRF mitigation.

---

### MEDIUM — M6: X-Forwarded-For Trusted Without Proxy Validation — Rate Limit Bypass

**File:** `src/http/security.ts` lines 80–87

```typescript
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress || "unknown";
}
```

`getCallerId()` falls back to `ip:<getClientIp()>` when no `x-operator-id` header is present. Rate limiting is keyed on this caller ID. A client that sets `X-Forwarded-For: 1.2.3.4` spoofs their apparent IP and can rotate to unlimited effective IPs, bypassing the fixed-window limiter.

**The Nginx config in DEPLOYMENT.md (lines 341, 349, 357) sets `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` which appends the real IP. But the backend trusts the first value of the header — if a client behind that proxy also sets their own `X-Forwarded-For`, the proxy appends it and the backend reads the spoofed value as the first entry.**

**Remediation:** Accept `X-Forwarded-For` only if `req.socket.remoteAddress` matches a configured trusted proxy list (`ORCHESTRATOR_TRUSTED_PROXIES`). When no trusted proxies are configured (direct binding), use `req.socket.remoteAddress` directly.

---

### MEDIUM — M7: Operator ID Is Self-Reported — Audit Trail Attribution Is Forged

**Files:** `console/src/lib/mcp-client.ts` lines 35–36, `src/http/security.ts` lines 89–96

```typescript
// mcp-client.ts — console sends whatever the session says
headers: {
  Authorization: `Bearer ${env.apiToken}`,
  "x-operator-id": session.operatorId,
}
```

```typescript
// security.ts — backend trusts the header
export function getCallerId(req: IncomingMessage): string {
  const operatorId = req.headers["x-operator-id"];
  if (typeof operatorId === "string" && operatorId.trim()) {
    return operatorId.trim();
  }
  return `ip:${getClientIp(req)}`;
}
```

The backend records `callerId` in every activity log entry. `callerId` comes from `x-operator-id`. Any bearer token holder — including the console itself — can set `x-operator-id` to any string and that string appears in the audit log as the operator identity.

**Risk:** The audit log can be falsely attributed. A single shared-password system where all operators share the same token means the audit log's `callerId` field is not forensically reliable. An operator can claim to be "internal-operator" while causing mutations, or claim to be a different operator.

**Remediation:** For this product's trust model (single operator, internal use), this is low-consequence. If multi-operator audit integrity is needed: the backend must verify operator ID independently (e.g., signed claim from the console, or a per-operator token registry). At minimum, document this limitation explicitly.

---

### LOW — L1: In-Memory Rate Limiter State Lost on Restart

**File:** `src/http/security.ts` lines 16–54, `src/http.ts` lines 216–219

```typescript
const rateLimiter = new FixedWindowRateLimiter(
  dependencies.runtimeConfig.rateLimitMaxRequests,
  dependencies.runtimeConfig.rateLimitWindowMs
);
```

The `FixedWindowRateLimiter` uses an in-memory `Map`. On process restart, all state is cleared. An attacker who can trigger a restart (e.g., by triggering an unhandled error) resets their rate limit window.

**Risk:** Moderate for this deployment model. Documented, not a showstopper, but rate limit bypass via restart is a known technique.

---

### LOW — L2: Session Has No Revocation Mechanism

**File:** `console/src/lib/auth.ts` lines 72–108

Session tokens are HMAC-signed JWTs without a `jti` (JWT ID) or server-side session store. The only invalidation mechanism is TTL expiry (12 hours). There is no way to revoke a single session after a suspected compromise without rotating `ORCHESTRATOR_CONSOLE_SECRET`, which invalidates all sessions.

**Remediation for low-trust scenarios:** Add a server-side session store (even an in-memory Set of issued token hashes) with an explicit revocation endpoint at `/api/session/logout`. Currently logout just clears the cookie client-side — the token remains valid until TTL expires.

---

### LOW — L3: Audit Log Co-Located With Operational State — Bounded Rolling Buffer

**File:** `src/state/delegation-store.ts` lines 155–158

```typescript
async appendActivity(entry: ActivityLogEntry): Promise<void> {
  const state = await this.read();
  state.activityLog = [entry, ...state.activityLog].slice(0, ACTIVITY_LOG_LIMIT);
  await this.write(state);
}
```

Two issues:
1. **Not append-only:** The audit log is prepend-and-slice rewritten on every append. A true audit log must be append-only. This implementation can be trivially modified by anyone with write access to the state file.
2. **250-entry cap:** `ACTIVITY_LOG_LIMIT = 250` (from `constants.ts`). After 250 requests, older audit entries are silently discarded. For compliance or forensic purposes, a rolling buffer is not an audit log.

---

### LOW — L4: `process.env` Inherited by Vitest Subprocess

**File:** `src/adapters/benchmark-runner.ts` line 70

```typescript
env: process.env,
```

The vitest subprocess spawned by `benchmark_status run` inherits the full `process.env`. This includes:
- `ORCHESTRATOR_API_TOKEN`
- `ORCHESTRATOR_CONSOLE_SECRET` (if set in the backend's env — unlikely but possible)
- `AUDIT_ROOT`, `ENGINE_ROOT`, `STATE_FILE`

If the test file being executed (see C2) is attacker-controlled, all these values are accessible inside the subprocess.

**Remediation:** Pass a filtered environment to `execFileAsync`:

```typescript
const safeEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV };
```

---

### LOW — L5: `/activity` Endpoint `limit` Parameter Is Not Validated

**File:** `src/http.ts` lines 269–271

```typescript
sendJson(res, 200, {
  activity: await dependencies.store.listRecentActivity(
    Number(requestUrl.searchParams.get("limit") || "25")
  ),
});
```

`Number(requestUrl.searchParams.get("limit") || "25")` — if `limit` is `"abc"`, `Number("abc")` is `NaN`. `DelegationStore.listRecentActivity(NaN)` calls `state.activityLog.slice(0, NaN)` which returns an empty array (JavaScript silently handles NaN in slice). If `limit` is `"999999"`, it reads the full activity log into memory. No maximum is enforced.

**Remediation:** Validate and cap: `Math.min(Math.max(1, Number(limit) || 25), 250)`.

---

### LOW — L6: New Task Creation Bypasses Status Graph Validation

**File:** `src/state/delegation-store.ts` lines 85–102

```typescript
if (!existing) {
  const created: DelegationTask = {
    taskId: input.taskId,
    taskType: input.taskType || "unspecified",
    currentStatus: input.newStatus,  // ← no enum validation
```

When a task doesn't already exist, it is created with whatever `newStatus` string is passed. The `allowedTransitions` graph is only checked for existing tasks. A task can be created with `currentStatus: "consolidated"` (skipping the entire workflow) or with an arbitrary unrecognized string that will cause all transition lookups to return `[]` (permanent deadlock).

---

### LOW — L7: Deployment Documentation Is Missing Firewall Guidance

**File:** `DEPLOYMENT.md`

The VPS section (lines 280–306) instructs operators to:
1. Set `MCP_HOST=0.0.0.0` — binds to all interfaces
2. Set `MCP_PORT=3100`
3. "put Nginx or Caddy in front for HTTPS"

There is no instruction to firewall port 3100 from the internet. A VPS deployment following these instructions exactly will have the MCP backend directly internet-accessible on port 3100 (no TLS, only bearer token auth) until Nginx is configured.

**Risk window:** Between process start and Nginx setup, the backend is plaintext-accessible over the internet.

**Remediation:** Add an explicit firewall step before the start command:

```bash
# Block direct access to backend port from internet
ufw deny 3100
# Allow only loopback
# Or: bind to 127.0.0.1 until Nginx is configured
```

---

## 4. Likely Abuse Scenarios

### Scenario A: Password Brute Force → Full Host Read

**Preconditions:** Console is internet-accessible. Password is dictionary-based or short.

1. Attacker submits `POST /api/session/login` with password dictionary — no rate limiting, no lockout.
2. After N attempts, password is guessed. Session cookie obtained.
3. Attacker calls `/api/mcp/call` with `check_notation_compliance` or `validate_assumption_envelope`, `path: "/home/deploy/.ssh"`.
4. Server recursively reads all files in `/home/deploy/.ssh` and returns match fragments including key content.

**Depends on:** C1 (no login rate limiting), H1 (unsandboxed path traversal).

---

### Scenario B: Authenticated Operator → Arbitrary Code Execution

**Preconditions:** Operator is authenticated and has write access to a path on the host (e.g., `/tmp`).

1. Operator writes `/tmp/exfil.test.ts`:
   ```typescript
   import fs from 'fs';
   import https from 'https';
   const env = JSON.stringify(process.env);
   // write to a file or POST to external endpoint
   ```
2. Operator calls `benchmark_status` with `action: "run"`, `testPath: "/tmp/exfil.test.ts"`.
3. Server executes the file via `execFileAsync("npx", ["vitest", "run", "/tmp/exfil.test.ts"])` with full `process.env`.
4. Subprocess reads and exfiltrates all secrets.

**Depends on:** C2 (unsandboxed subprocess execution), L4 (full env inheritance).

**Note:** This requires the operator to have write access to a path the server can execute. In a shared-host scenario, this may be easily achievable.

---

### Scenario C: Stale Session After Password Change

**Preconditions:** Operator suspects compromise and rotates password (changes `ORCHESTRATOR_CONSOLE_PASSWORD_HASH`).

1. New hash is set. All new logins require the new password.
2. Attacker who holds an old session token — valid for 12 hours — continues to authenticate successfully.
3. No revocation mechanism exists. Operator must also rotate `ORCHESTRATOR_CONSOLE_SECRET` to invalidate all existing tokens.

**Depends on:** L2 (no session revocation).

**Rotating `ORCHESTRATOR_CONSOLE_SECRET` invalidates all sessions simultaneously, including legitimate ones. There is no way to invalidate a specific session.**

---

### Scenario D: CORS Bypass from Same-Domain XSS

**Preconditions:** Another app on `wuweism.com` (or any registered subdomain) has an XSS vulnerability.

1. Attacker injects script into a page at `xss.wuweism.com` that the operator visits.
2. Script calls `fetch("https://orchestrator.wuweism.com/api/mcp/call", { credentials: "include", … })` with a delegation state mutation and `confirmMutation: true`.
3. No CSRF token blocks this. `sameSite=lax` only blocks top-level navigations.
4. The mutation is applied and attributed to the legitimate operator in the audit log.

**Depends on:** M5 (no CSRF protection), M7 (self-reported operator ID).

---

### Scenario E: Rate Limit Reset via Restart Signal

**Preconditions:** Attacker can trigger a process restart (e.g., via an unhandled error on the MCP path, or by deploying a new version).

1. Attacker submits requests up to the rate limit.
2. Triggers a process restart (or waits for a scheduled deployment).
3. Rate limit state is cleared — fresh window starts.
4. Attacker resumes at full allowed rate.

**Depends on:** L1 (in-memory rate limiter).

---

## 5. Hardening Recommendations

Listed by implementation priority.

**P1 — Login rate limiting (1 day)**

Add `console/middleware.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX = 5; const WINDOW = 60_000;

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/session/login" && req.method === "POST") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip") ?? "unknown";
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX) {
        return NextResponse.json({ error: "Too many login attempts." }, { status: 429 });
      }
      entry.count++;
    } else {
      loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW });
    }
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/session/login"] };
```

**P2 — Sandbox file scan paths (1 day)**

Add `assertSandboxed(path, runtimeConfig)` in `file-scanner.ts` `collectFiles()`. Validate resolved path starts with `runtimeConfig.auditRoot` or `runtimeConfig.engineRoot`.

**P3 — Sandbox benchmark testPath (2 hours)**

In `benchmark-status.ts`, replace:
```typescript
benchmarkTestPath: input.testPath,
```
with:
```typescript
benchmarkTestPath: (() => {
  const resolved = path.resolve(input.testPath);
  const expected = dependencies.runtimeConfig.benchmarkTestPath;
  if (!expected || resolved !== path.resolve(expected)) {
    throw new Error("testPath must match the configured BENCHMARK_TEST_PATH.");
  }
  return resolved;
})(),
```

**P4 — Remove sha256 hash support (1 hour)**

Delete lines 59–63 from `auth.ts`. Add startup guard.

**P5 — Strip sensitive env before subprocess (30 min)**

In `benchmark-runner.ts`, replace `env: process.env` with:
```typescript
env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: process.env.NODE_ENV }
```

**P6 — Require CORS in HTTP mode (30 min)**

In `loadRuntimeConfig()`, throw if `MCP_TRANSPORT === "http"` and `allowedOrigins.length === 0`.

**P7 — Remove filesystem paths from browser response (1 hour)**

In `fetchToolBootstrap()`, replace `defaults: getConsoleDefaults()` with `defaults: { auditRoot: "", engineRoot: "", benchmarkTestPath: "" }` (or remove the field). Use server-side path resolution for all defaults.

**P8 — Always set `Secure` on session cookie (15 min)**

Change `secure: process.env.NODE_ENV === "production"` to `secure: true`. Add HTTPS requirement to DEPLOYMENT.md.

**P9 — Add CSRF header check (2 hours)**

Require `X-Console-Request: 1` on all `POST /api/*` routes. Validate in middleware. Return 403 without this header.

**P10 — Apply rate limiter to `/activity` (30 min)**

Pass `rateLimiter` to the activity handler and call `rateLimiter.take(callerId)` before serving.

---

## 6. Deployment Security Checklist

The following items are **not** currently covered by the deployment documentation or are actively misconfigured in the provided examples. This checklist supplements `DEPLOYMENT.md`.

```
[ ] Firewall port 3100 from internet BEFORE starting the MCP backend
    → ufw deny 3100 && ufw allow from 127.0.0.1 to any port 3100

[ ] Set NODE_ENV=production on the console process
    → Required for Secure cookie flag

[ ] Set ORCHESTRATOR_ALLOWED_ORIGINS to the exact console URL
    → Example: ORCHESTRATOR_ALLOWED_ORIGINS=https://orchestrator.wuweism.com
    → Never leave empty in internet-facing deployments

[ ] Use only scrypt: format for ORCHESTRATOR_CONSOLE_PASSWORD_HASH
    → Verify no sha256: prefix before deploying

[ ] Choose a strong console password (16+ characters, not dictionary-based)
    → No rate limiting exists yet; password strength is the only brute-force defense

[ ] Generate ORCHESTRATOR_CONSOLE_SECRET as 64+ random bytes
    → openssl rand -hex 64

[ ] Generate ORCHESTRATOR_API_TOKEN as 32+ random bytes
    → openssl rand -hex 32

[ ] BENCHMARK_TEST_PATH must point to the exact canonical test file
    → Any other path passed by an operator should be rejected

[ ] Verify AUDIT_ROOT and ENGINE_ROOT are owned by the deploy user
    → Process should not run as root

[ ] Persist the state file on a durable volume (Fly.io, Railway)
    → Without persistence, audit log is lost on restart

[ ] Put HTTPS reverse proxy in front of BOTH the console and MCP backend
    → Nginx/Caddy must be configured with valid TLS certificates
    → Verify HTTPS is active BEFORE starting Node processes

[ ] Do NOT expose the MCP backend URL publicly as an MCP endpoint
    → Browser clients should never call /mcp directly
    → The console proxies all tool calls server-side

[ ] Rotate ORCHESTRATOR_CONSOLE_SECRET and ORCHESTRATOR_API_TOKEN
    → On any suspected compromise
    → At minimum every 90 days
    → Rotation invalidates all active sessions (no per-session revocation exists)

[ ] Monitor the /activity endpoint for unexpected operators or IP addresses
    → callerId in log entries is self-reported; treat with skepticism

[ ] Do NOT log raw process.env anywhere
    → Verify no console.log(process.env) in startup scripts or debug code
```

---

## Appendix: Files Referenced

| File | Key concern |
|------|------------|
| `console/app/api/session/login/route.ts` | No rate limiting (C1) |
| `console/src/lib/auth.ts` | SHA-256 hash path (H2), session token creation |
| `src/adapters/benchmark-runner.ts` | Subprocess execution with user path (C2), full env inheritance (L4) |
| `src/tools/benchmark-status.ts` | testPath passthrough (C2) |
| `src/tools/check-notation-compliance.ts` | Unsandboxed path scan (H1) |
| `src/tools/validate-assumption-envelope.ts` | Unsandboxed path scan (H1) |
| `src/adapters/file-scanner.ts` | collectFiles accepts any path (H1) |
| `console/src/lib/mcp-client.ts` | Filesystem paths exposed to browser (H3) |
| `src/http.ts` | /health unauthenticated (M1), /activity no rate limit (M2) |
| `src/http/security.ts` | CORS default open (M3), X-Forwarded-For (M6), callerId (M7) |
| `console/app/api/session/login/route.ts` | Secure flag conditional (M4) |
| `console/app/api/mcp/call/route.ts` | No CSRF (M5) |
| `src/config/load-config.ts` | CORS optional config (M3) |
| `src/state/delegation-store.ts` | Audit log co-located/bounded (L3), new task status bypass (L6) |
| `DEPLOYMENT.md` | Missing firewall step (L7), NODE_ENV not set in VPS example (M4) |

---

*All findings are grounded in code read directly. No inferred behaviors are presented as facts.*
