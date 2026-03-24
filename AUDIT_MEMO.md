# MASA Orchestrator MCP — Comprehensive Audit Memo
**Date:** 2026-03-24
**Reviewer:** Senior Product Engineer / Design Systems Lead / Security Reviewer
**Scope:** Full repo audit — `/masa-orchestrator-mcp` at HEAD
**Basis:** Source code read, not runtime observation

---

## 1. Executive Assessment

This is a well-intentioned internal operator tool with a clear product identity. The backend MCP server is the stronger half: auth primitives are sound, the rule engine is purposeful, and the state machine is explicit. The console frontend has the right visual instincts but fails to close the gap between aesthetic intention and operational quality.

The three critical gaps are:

1. **Raw JSON as the primary result surface.** `<pre>{JSON.stringify(...)}</pre>` appears in six distinct panels across the operator console. This is a prototype pattern left in production code. No operator reads raw JSON to understand benchmark posture or delegation state. This single pattern undermines the entire console's utility.

2. **No login rate limiting on the console.** The backend has a `FixedWindowRateLimiter` that is tested and working. The console `POST /api/session/login` route applies none of it. This is a direct credential brute-force surface.

3. **`operator-console.tsx` is an 800-line monolith** with no view-model layer, 10+ `useState` hooks, and a brittle hardcoded mutation check that diverges from the catalog's own `mutatesState` flag. Maintainability will degrade as tools are added.

Everything below is grounded in the actual source. Where behavior is inferred rather than directly observed, it is marked.

---

## 2. UI/UX Strengths

**Token vocabulary is coherent and distinctive.**
`console/app/globals.css` lines 1–22. The warm dark palette (`--bg: #0f0f10`, `--accent: #d97345`, `--text: #f5efe5`) is well-calibrated. The radial gradient background (`lines 32–37`) adds depth without performance cost. The semantic split between `--text`, `--muted`, and `--meta` is correct in principle. The serif (`Newsreader`) / mono (`Geist Mono`) font combination creates editorial gravity that fits the control-room intent.

**Three-column shell structure is the right information architecture.**
`globals.css` lines 199–211. Nav at 280px, workspace fluid, rail at 360px. This mirrors how operators actually work: stable navigation context, wide working surface, persistent audit/context strip. The responsive collapse at 1180px and 820px is implemented correctly.

**Meta-chip pattern is effective.**
Used consistently for context signals (`MASA / operator console`, `Compliance / evidence-aware`, `risk high`). Rendered in monospace uppercase with pill border — communicates system identity rather than UI decoration. Correct use.

**Tool risk signals are surfaced.**
`tool-catalog.ts` embeds `riskLevel: "low" | "medium" | "high"` and `mutatesState: boolean` per tool. These values reach the console via the bootstrap response. The `meta-chip` in tool-runner renders both. This is correct operator information.

**State mutation requires explicit confirmation.**
`operator-console.tsx` lines 684–693, `api/mcp/call/route.ts` lines 8–9 and 34–39. Mutation check is enforced at both client and server. The server-side enforcement (`requiresConfirmation()` in `route.ts`) is the correct trust boundary — the client confirmation is UX only, and the server won't accept a mutation without `confirmMutation: true` regardless.

**Backend bearer auth is well-implemented.**
`src/http/security.ts` lines 57–78. `timingSafeEqual` on constant-length buffers. Correct length check before comparison. Session token signature verification in `auth.ts` lines 88–93 uses the same pattern. These are textbook correct.

**Activity log concept is right.**
Rail-mounted audit log with `toolName`, `outcome`, and timestamp is the correct affordance for an operator console. The backend produces structured entries per request with `requestId`, `durationMs`, `callerId`, and `transport`.

---

## 3. UI/UX Weaknesses

### 3.1 Raw JSON as primary result surface — CRITICAL UX FAILURE
**Files:** `operator-console.tsx` lines 400, 410, 463, 588, 617, 713

Six panels render `<pre>{JSON.stringify(..., null, 2)}</pre>` as their primary content. Examples:
- Dashboard benchmark posture panel: raw JSON dump
- Dashboard delegation queues panel: raw JSON dump
- Compliance "Latest result" panel: raw JSON dump
- Consolidation result panel: raw JSON dump
- Tool runner result panel: raw JSON dump
- Delegation blockers panel: raw JSON dump

This is prototype scaffolding. An operator reviewing benchmark posture should see a structured table: B1–B6, status, expected value, actual value, pass/fail indicator. Instead they get the full JSON response with keys like `notImplemented`, `honestCapabilityStatement`, nested in a 12px monospace wall.

**Priority: HIGH. This should be the first UX work.**

Fix direction: Each data shape has a known schema. The benchmark response has `benchmarks`, `passing`, `honestCapabilityStatement`, `consolidationEligible`. The delegation response has `tasks[]`, `pipeline`, `blockers[]`. These should become typed, rendered components — not serialized to string.

---

### 3.2 Hero card is marketing copy on an operator dashboard
**File:** `operator-console.tsx` lines 353–365

```tsx
<h2>MASA orchestration remains a trust-first instrument.</h2>
<p>Remote HTTP is authenticated, the MCP backend stays authoritative…</p>
```

This occupies prime workspace real estate on every dashboard load and communicates nothing actionable. An operator already knows the system is trust-first — that's why they're logging in. The space should hold live operational signal: system health, MCP backend reachability, last benchmark run timestamp, last consolidation cycle, active blocker count.

**Priority: MEDIUM.**

---

### 3.3 Delegation view renders task status as an unstyled string
**File:** `operator-console.tsx` lines 443–452

Tasks render as `<strong>{taskId}</strong>` and `<span>{currentStatus}</span>`. Status values like `delegated`, `in_review`, `approved`, `blocked`, `consolidated` carry semantic weight that maps to color. None of that is encoded. A blocked task looks identical to a verified task. The history field (array of transitions) is not rendered at all.

**Priority: HIGH.** The delegation view is the most operationally dense surface and it's the least interpreted.

---

### 3.4 Trust Rail sidebar is static decoration
**File:** `operator-console.tsx` lines 788–794

```tsx
<ul className="signal-list">
  <li>Browser traffic never carries the MCP bearer token.</li>
  <li>State mutations require explicit confirmation.</li>
  …
</ul>
```

Four bullet points that never change and don't reflect live system state. This occupies the bottom third of the rail on every page. It should be replaced with live provenance signals: last tool execution timestamp, current operator ID, session age, backend health status, MCP server version.

**Priority: MEDIUM.**

---

### 3.5 Activity rail disappears below 1180px
**File:** `globals.css` lines 419–432

```css
@media (max-width: 1180px) {
  .console-rail {
    display: none;
  }
}
```

The rail containing the audit log and trust rail is hard-hidden at 1180px with no fallback. On a 13" laptop (common for internal tooling), the operator loses the audit log entirely. This should collapse into a drawer or tab, not disappear.

**Priority: MEDIUM.**

---

### 3.6 `isMutation()` is hardcoded and diverges from the catalog
**File:** `operator-console.tsx` lines 129–131

```typescript
function isMutation(toolName: string, payload: Record<string, unknown>): boolean {
  return toolName === "delegation_chain_state" && payload.action === "update";
}
```

The tool catalog already encodes `mutatesState: true` for `delegation_chain_state`. This function ignores that field and reimplements the check with a hardcoded string. If a second mutation tool is added to the catalog, this function silently misses it. The catalog's `mutatesState` flag is the right source of truth; this function should derive from it.

**Priority: HIGH (maintainability and correctness).**

---

### 3.7 `loadBootstrap()` called after every tool run
**File:** `operator-console.tsx` lines 332–333

```typescript
await runTool(selectedTool.name, payload, true, confirmMutation);
await loadBootstrap();
```

`loadBootstrap()` re-fetches the tool catalog, re-fetches the activity log, and then calls `loadDashboard()` which fires two additional tool calls (`benchmark_status` and `delegation_chain_state`). This means every tool execution triggers four HTTP requests. The tool catalog doesn't change at runtime. Activity and dashboard should refresh selectively.

**Priority: MEDIUM.**

---

### 3.8 `generate_consolidation` hardcodes cycle 1
**File:** `operator-console.tsx` line 605

```tsx
onClick={() => void runTool("generate_consolidation", { cycleNumber: 1 })}
```

The consolidation view's primary action button hardcodes `cycleNumber: 1`. There is no affordance for incrementing the cycle. An operator on cycle 3 must navigate to the Tool Runner to change this value. This is an incomplete workflow.

**Priority: LOW-MEDIUM.**

---

### 3.9 No loading skeleton states
**File:** `operator-console.tsx` line 143 (`const [loading, setLoading] = useState(false)`)

Loading state is a single boolean. No skeleton UI exists. On initial load, the dashboard panels render empty JSON (`{}`) for a perceptible moment before data arrives. This is jarring in a console that is supposed to communicate system state at a glance.

**Priority: LOW.**

---

### 3.10 Metric card value text is too large for density
**File:** `globals.css` line 316

```css
.metric-card strong {
  font-size: 1.6rem;
  line-height: 1;
}
```

At 1.6rem with a 4-column metric grid, this pushes the card height up significantly. The dashboard benchmark metric shows "— passing" and "— not implemented" in large type when no snapshot exists. For an operator console, 1.1–1.25rem with a tighter grid would pack more signal into the same vertical space. Marketing dashboards use large numbers; operator consoles need density.

**Priority: LOW.**

---

## 4. Security Findings

### 4.1 Console login endpoint has no rate limiting — CRITICAL
**File:** `console/app/api/session/login/route.ts`

The `POST /api/session/login` handler verifies the password and issues a session cookie. There is no rate limiting applied. An attacker with network access to the console can submit unlimited password attempts.

The backend has a working `FixedWindowRateLimiter` (`src/http/security.ts` lines 16–55) and uses it on the `/mcp` endpoint. The console's Next.js API layer has no equivalent.

**Severity: HIGH.** The password is a shared credential. Brute force is fully unconstrained.

**Fix:** Add a per-IP fixed-window rate limiter at the `login` route. A simple in-memory map (mirroring the backend pattern) or Next.js middleware applying headers. Alternatively, add a `console:rate-limit` middleware file that wraps mutation routes.

---

### 4.2 SHA-256 password hash is accepted as a valid credential format
**File:** `console/src/lib/auth.ts` lines 59–62

```typescript
if (passwordHash.startsWith("sha256:")) {
  const expected = Buffer.from(passwordHash.slice("sha256:".length), "hex");
  const actual = crypto.createHash("sha256").update(password).digest();
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
```

SHA-256 is a general-purpose hash function. It is extremely fast (~500 MB/s on commodity hardware), making it unsuitable for password storage. An attacker with the state file or a leaked hash can run a dictionary attack in seconds.

The deployment instructions document scrypt as the recommended format, and the example `.env.example` shows the scrypt generation command. But the `sha256:` path is still accepted at runtime — a footgun for anyone who sets a hash manually.

**Severity: HIGH.** The sha256 path should be removed. If backward compatibility is needed, document a migration path and add a startup warning if the hash prefix is `sha256:`.

---

### 4.3 Session cookie `Secure` flag only set in production
**File:** `console/app/api/session/login/route.ts` line 37

```typescript
secure: process.env.NODE_ENV === "production",
```

If the console is deployed without `NODE_ENV=production` set (a common oversight on VPS deployments or when using `npm run start` directly), the session cookie will be transmitted over plaintext HTTP even if the server is behind HTTPS. This is a well-known Next.js deployment footgun.

**Severity: MEDIUM.** The deployment doc (`DEPLOYMENT.md`) instructs operators to use a reverse proxy for HTTPS but does not flag this environment variable requirement.

**Fix:** Either always set `secure: true` and require HTTPS for all deployments, or add a startup check that warns when `NODE_ENV !== "production"` and the MCP URL is not localhost.

---

### 4.4 No CSRF protection on state-mutation routes
**File:** `console/app/api/mcp/call/route.ts`

The `POST /api/mcp/call` and `POST /api/session/login` routes rely entirely on the `sameSite: "lax"` cookie attribute for cross-origin protection. `sameSite=lax` blocks cross-origin form POST navigations but **does not block `fetch()`-based cross-origin requests from same-site origins** in all browser configurations.

In a multi-origin deployment (e.g., `orchestrator.wuweism.com` and any other app on `wuweism.com` with XSS), a forged request with credentials can reach these routes.

**Severity: MEDIUM** (requires same-site XSS or specific deployment topology to exploit, but the protection is weaker than widely assumed).

**Fix:** Add a CSRF double-submit cookie or custom request header check (e.g., require `X-Console-Request: true` on all API calls from the frontend, and validate it server-side). This is simple to implement in Next.js middleware.

---

### 4.5 X-Forwarded-For trusted without validation for rate limiting
**File:** `src/http/security.ts` lines 80–86

```typescript
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.socket.remoteAddress || "unknown";
}
```

`getClientIp()` extracts the first IP from `X-Forwarded-For` without validating that the request came through a trusted proxy. A client can spoof this header to bypass IP-based rate limiting. The rate limiter buckets calls by `getCallerId()`, which falls back to this IP when no `x-operator-id` header is present.

**Severity: MEDIUM** (only matters if the MCP server is directly internet-facing, not behind a trusted proxy).

**Fix:** Accept `X-Forwarded-For` only if the request arrived from a known proxy IP (configurable via `ORCHESTRATOR_TRUSTED_PROXIES`). Document that direct-internet deployments should set this.

---

### 4.6 Audit log co-located with operational state — single file, bounded buffer
**File:** `src/state/delegation-store.ts` lines 155–158

```typescript
async appendActivity(entry: ActivityLogEntry): Promise<void> {
  const state = await this.read();
  state.activityLog = [entry, ...state.activityLog].slice(0, ACTIVITY_LOG_LIMIT);
  await this.write(state);
}
```

The activity log is a rolling buffer (max 250 entries by default) stored in the same JSON file as operational delegation state. Two problems:

1. **Loss risk**: A corrupted state file (partial write mid-rename, disk full) can take the audit log with it. Atomic rename (`write temp → rename`) mitigates but doesn't eliminate this.
2. **Not append-only**: The log is rewritten on every append. True audit logs must be append-only, not rolling rewrite. An operator cannot reconstruct history beyond 250 entries.

**Severity: MEDIUM** for single-operator internal use; would be HIGH for any compliance-gated deployment.

---

### 4.7 No cryptographic binding between operator session and backend tool call
**File:** `console/src/lib/mcp-client.ts` (inferred; not read directly)

The console proxies tool calls to the backend using the shared API token. The operator's session identity (`operatorId`) is passed as metadata but is not cryptographically bound to the request — the backend trusts whatever `x-operator-id` the console sends. This means the backend audit log can show any operator ID the console claims, without verification.

**Severity: LOW** for a single-password, single-operator system. Becomes MEDIUM if per-operator identity is required for audit compliance.

---

### 4.8 CORS not enforced by default on backend MCP server
**File:** `src/http/security.ts` lines 98–110

```typescript
export function assertAllowedOrigin(req: IncomingMessage, allowedOrigins: string[]): void {
  if (allowedOrigins.length === 0) {
    return;  // ← CORS disabled if ORCHESTRATOR_ALLOWED_ORIGINS is not set
  }
```

`ORCHESTRATOR_ALLOWED_ORIGINS` is optional in `load-config.ts`. In default deployment, any origin can POST to the MCP backend. Bearer token auth prevents unauthorized tool execution, but CORS should be locked to the console's origin in production.

**Severity: LOW** (bearer auth is the primary gate). The default-open posture is a misconfiguration risk.

**Fix:** Require `ORCHESTRATOR_ALLOWED_ORIGINS` to be set when `MCP_TRANSPORT=http`, or default to the value of `ORCHESTRATOR_MCP_URL`'s origin if not set.

---

## 5. Architecture / Maintainability Findings

### 5.1 `operator-console.tsx` is an 800-line monolith
**File:** `console/src/components/operator-console.tsx`

The entire frontend — six view panels, ten `useState` hooks, all fetch logic, all form normalization, all result rendering — lives in one component. The file contains: bootstrap loading, dashboard loading, tool execution, form submission, field normalization, value persistence, and inline render functions for six different views.

This is acceptable as a prototype. It is not acceptable as a shipped operator tool. Adding a seventh view, a new data shape, or a new loading state requires understanding the full file.

**Specific symptoms:**
- `currentFormValues()` (line 289–298) is called both in `renderToolRunner()` and `submitSelectedTool()` without memoization.
- `loadBootstrap()` encodes dashboard hydration logic inline — it's both a catalog loader and a data refresher.
- The `dashboard` state is `DashboardSnapshot` typed with all fields as `Record<string, unknown>`, meaning every access requires `as` casts or `String()` coercions.

**Priority: HIGH.** Should be split into view components with typed props, a separate data layer, and a proper view-model.

---

### 5.2 New task can be created with any arbitrary status string
**File:** `src/state/delegation-store.ts` lines 85–103

```typescript
if (!existing) {
  const created: DelegationTask = {
    taskId: input.taskId,
    taskType: input.taskType || "unspecified",
    currentStatus: input.newStatus,  // ← no validation of newStatus
    currentAgent: input.agent,
    …
  };
  state.tasks.push(created);
```

When creating a new task (task not found in existing state), `updateTask()` skips the `allowedTransitions` check. The new task is created with whatever `newStatus` string is passed. A task can be created with `currentStatus: "invalid_garbage"` and the store will accept it. The transition guard only applies to existing tasks.

The schema in `delegationStateSchema` (`delegation-chain-state.ts` line 9) allows `newStatus: z.string().optional()` with no enum constraint.

**Priority: HIGH.** Add a `KNOWN_STATUSES` set and validate `newStatus` for both new and existing tasks.

---

### 5.3 `recentResults` written to localStorage without size guard
**File:** `operator-console.tsx` lines 165–171

```typescript
window.localStorage.setItem(RECENT_RESULTS_KEY, JSON.stringify(recentResults));
```

`recentResults` accumulates one entry per tool name. Notation compliance scans on a large codebase return potentially large violation arrays. localStorage has a ~5MB limit per origin. If `recentResults` approaches this limit, `setItem()` will throw a `QuotaExceededError`, which is not caught anywhere in the component. The operator's session will appear to work normally until the next refresh, at which point the form values may also fail to persist.

**Priority: MEDIUM.**

---

### 5.4 Frontend test coverage is a single smoke test
**File:** `console/tests/operator-console.test.tsx`

One test exists: render the component, click "Tool Runner", verify the tool name appears. This tests nothing about:
- Mutation confirmation flow
- Login rate limiting (N/A — no middleware to test, but the absence is the problem)
- Error state rendering
- View transitions and state isolation
- Form field normalization (`normalizeFieldValue`)
- localStorage parse failure handling
- `loadBootstrap` failure path
- Delegation status rendering

The backend has substantially better coverage: `http-security.test.ts`, `delegation-store.test.ts`, `server-e2e.test.ts`. The frontend coverage gap is significant.

**Priority: HIGH** for any console changes going forward.

---

### 5.5 `delegationChainState` duplicates pipeline computation
**File:** `src/tools/delegation-chain-state.ts` lines 23–28 and 44–50

The three `filter/map` chains computing `thinkQueue`, `actQueue`, and `verifyQueue` are copy-pasted verbatim in both the `get` and `update` branches. If the queue logic changes, it must be updated in two places. Extract into a `buildPipeline(tasks: DelegationTask[])` function.

**Priority: LOW.** No bug risk, but indicates copy-paste hygiene.

---

### 5.6 No middleware protecting Next.js routes against unauthenticated access
**File:** `console/app/api/*`

Each API route independently calls `loadConsoleEnv()` and `parseSessionToken()`. There is no Next.js `middleware.ts` file enforcing authentication at the edge. This means a new route can be added and accidentally left unprotected. The current routes are all protected, but the pattern requires discipline from every future author.

**Priority: MEDIUM.** A `middleware.ts` that validates the session cookie for all `/api/mcp/*` and `/api/activity` routes would centralize this concern.

---

## 6. High-Priority Recommendations

Ordered by combined severity and implementation effort.

**1. Add login rate limiting immediately**
The absence of rate limiting on `POST /api/session/login` is the only finding in this audit that is exploitable with zero preconditions. Implement a per-IP `FixedWindowRateLimiter` in a Next.js `middleware.ts` or inline at the route handler. Mirror the backend's existing implementation. Estimated: 2 hours.

**2. Remove the sha256 password hash path**
Add a check on `loadConsoleEnv()` startup: if the hash prefix is `sha256:`, log a loud startup error and refuse to start. Document the migration to scrypt. Estimated: 1 hour.

**3. Replace raw JSON panels with structured result renderers**
Start with the two dashboard panels (benchmark posture + delegation queues) and the delegation view. Define TypeScript types for the known response shapes and render them as tables, status chips, and structured lists. The JSON `<pre>` can remain as a "raw" toggle for debugging. Estimated: 1–2 days.

**4. Split `operator-console.tsx` into view components**
Extract a data layer (`useDashboardData`, `useToolExecution`), typed view-model types for each backend response, and separate components per view (`DashboardView`, `DelegationView`, `BenchmarksView`, etc.). The monolith is the root cause of items 3.7, 5.1, 5.3, and 3.6. Estimated: 3–5 days for a clean split.

**5. Validate `newStatus` against known statuses on task creation**
Add a `KNOWN_STATUSES` constant to `delegation-store.ts` and validate both new-task creation and existing-task transitions against it. This is a 10-line change that closes a data integrity gap. Estimated: 30 minutes.

**6. Add a Next.js middleware for session enforcement**
Create `console/middleware.ts` matching `/api/mcp/(.*)` and `/api/activity` to validate the session cookie before route handlers run. This centralizes auth enforcement and prevents accidental exposure of new routes. Estimated: 2 hours.

**7. Fix the `isMutation()` function to use the catalog's `mutatesState` flag**
Change `isMutation()` to look up the tool in the catalog and return `tool.mutatesState && payload.action !== "get"` rather than a hardcoded string comparison. This eliminates a maintenance trap. Estimated: 30 minutes.

---

## 7. Design System Direction

**Semantic status tokens are missing.**
The token vocabulary has `--success`, `--warning`, and `--danger` but no status-specific tokens for task states. `delegated`, `in_review`, `approved`, `blocked`, `consolidated` all need distinct visual identities. Proposal:

```css
--status-delegated: var(--muted);
--status-in-review: var(--warning);
--status-approved: #7bbfba;      /* cool teal — distinct from success */
--status-in-progress: var(--accent);
--status-delivered: #a09ed4;     /* muted lavender */
--status-verified: var(--success);
--status-consolidated: #8ca678;  /* same as success, completed state */
--status-blocked: var(--danger);
--status-rejected: rgba(217, 106, 93, 0.6);
```

These should live in `:root` alongside the existing tokens, not as inline styles.

**A `--radius-xs` token is needed.**
Current radius scale: `sm: 14px`, `md: 18px`, `lg: 28px`. The gap between 14 and 18 is small but the jump to 28 is large. A `--radius-xs: 8px` token is needed for dense inline elements: status chips, timeline event markers, code badges.

**`--text-dim` as an intermediate opacity step.**
Between `--text: #f5efe5` (active) and `--muted: #b6ab98` (secondary), there is no intermediate. A `--text-dim: #d4c9b8` token would allow three-tier information hierarchy: primary, secondary, tertiary. Currently forced to use `var(--meta)` (#8e8478) which is too dim for readable secondary text.

**Status chip component is needed, not a class.**
Every view that renders task status does so as a plain `<span>`. Define a `.status-chip[data-status="blocked"]` pattern using `data-*` attributes and CSS attribute selectors. This avoids per-status class proliferation and keeps the token mapping in one place:

```css
.status-chip { font-family: var(--mono); font-size: 11px; padding: 3px 8px; border-radius: var(--radius-xs); }
.status-chip[data-status="blocked"] { color: var(--danger); background: rgba(217, 106, 93, 0.12); }
.status-chip[data-status="verified"] { color: var(--success); background: rgba(140, 166, 120, 0.12); }
/* … */
```

**The serif h1–h3 type scale needs tighter control at density.**
`globals.css` line 108: `font-size: clamp(2rem, 3vw, 3rem)` on section headings is correct for the login panel but too large for the operator workspace. Panel h3 at 1.35rem (`line 341`) is still too large relative to the 12px mono data below it. Section headings in workspace context should cap at 1.5rem with tighter letter-spacing.

**The activity rail timeline items need `outcome` color coding.**
`operator-console.tsx` lines 768–776 render each activity entry with outcome as a plain `<span>`. `success`, `error`, `unauthorized`, `rate_limited` should render with the matching status token color. This is the most information-dense element in the interface and currently carries no semantic color.

---

## 8. Suggested Implementation Roadmap

### Immediate (this week, no design required)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| I-1 | Add login rate limiting to `POST /api/session/login` | `console/middleware.ts` (new) | 2h |
| I-2 | Remove sha256 hash acceptance, add startup warning | `console/src/lib/auth.ts` | 1h |
| I-3 | Fix `isMutation()` to use catalog's `mutatesState` flag | `operator-console.tsx` L129 | 30m |
| I-4 | Validate `newStatus` against known statuses on task creation | `delegation-store.ts` L85 | 30m |
| I-5 | Add Next.js middleware for session enforcement on all API routes | `console/middleware.ts` | 2h |
| I-6 | Add CSRF header check on mutation routes | `console/app/api/mcp/call/route.ts` | 1h |

---

### Near-term (2–4 weeks, requires UI work)

| # | Task | File(s) | Effort |
|---|------|---------|--------|
| N-1 | Replace benchmark JSON dump with structured B1–B6 table | New `BenchmarkPanel.tsx` | 1d |
| N-2 | Replace delegation JSON dump with typed task list + status chips | New `DelegationPanel.tsx` | 1d |
| N-3 | Add semantic status tokens to design system | `globals.css` | 2h |
| N-4 | Add `.status-chip` component with `data-status` CSS | `globals.css` | 2h |
| N-5 | Color-code activity rail entries by outcome | `operator-console.tsx` L768 | 2h |
| N-6 | Replace hero card with live system health panel | `operator-console.tsx` L353 | 3h |
| N-7 | Add cycle number input to consolidation view | `operator-console.tsx` L595 | 1h |
| N-8 | Add localStorage size guard with quota error handling | `operator-console.tsx` L165 | 1h |
| N-9 | Add rail collapse/drawer for sub-1180px breakpoint | `globals.css` + layout | 3h |

---

### Larger upgrades (1–3 months)

| # | Task | Notes |
|---|------|-------|
| L-1 | Split `operator-console.tsx` into typed view components + data hooks | Core maintainability work. Required before any significant feature addition. |
| L-2 | Separate audit log from operational state file | Append-only audit log (separate file or SQLite) with no size cap. |
| L-3 | Add per-operator credentials / simple RBAC | Replace shared password with per-operator tokens. Operator ID becomes verified, not self-reported. |
| L-4 | Skeleton loading states for all panels | Use CSS animation or a minimal skeleton component. |
| L-5 | Task history timeline in delegation view | The `history[]` array per task is already stored; render it as a timeline. |
| L-6 | Add typed view-model layer between API responses and components | Eliminates all `Record<string, unknown>` casts and `String()` coercions in render code. |
| L-7 | Frontend test coverage for mutation confirmation, error states, view transitions | Currently one smoke test. Aim for coverage of all state branches. |

---

## Appendix: Files Reviewed

| Path | Purpose |
|------|---------|
| `console/src/components/operator-console.tsx` | Main console component |
| `console/src/components/login-panel.tsx` | Login UI |
| `console/app/globals.css` | Design tokens and layout |
| `console/app/api/session/login/route.ts` | Auth handler |
| `console/app/api/mcp/call/route.ts` | Tool proxy |
| `console/src/lib/auth.ts` | Session and password logic |
| `console/tests/operator-console.test.tsx` | Frontend tests |
| `src/http/security.ts` | Rate limiting, bearer auth, CORS |
| `src/state/delegation-store.ts` | State machine and audit log |
| `src/tools/delegation-chain-state.ts` | Delegation tool handler |
| `src/shared/tool-catalog.ts` | Tool definitions and UI metadata |
| `DEPLOYMENT.md` | Deployment instructions |

---

*End of memo. All findings are grounded in reviewed source. Inferred behavior is not present — where code was not read directly, findings are omitted.*
