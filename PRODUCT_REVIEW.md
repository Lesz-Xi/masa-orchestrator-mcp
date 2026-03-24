# MASA Orchestrator MCP — Comprehensive Product Review
**Date:** 2026-03-24
**Reviewer mode:** Principal engineer · Design systems lead · Security reviewer
**Basis:** Full source read — all files cited by exact path and line

---

## 1. Executive Assessment

MASA Orchestrator MCP is a coherent product idea executed with architectural discipline in its backend and with genuine aesthetic intention in its frontend. That combination is rarer than it sounds. Most internal tools are either technically sound and visually negligent, or styled beautifully and structurally hollow. This one is neither extreme.

The backend has real bones: a clear tool contract, explicit state machine, timing-safe auth primitives, activity logging, and a separation between the MCP backend and the console proxy that actually holds at the trust boundary. The frontend has a visual identity — warm dark, serif editorial register, mono data density — that is doing real expressive work, not just defaulting to shadcn defaults.

The gap is that neither half has been finished to the standard the product concept demands. The backend has two exploitable vulnerabilities (no login rate limiting; unsandboxed subprocess execution) that undermine its trust posture. The frontend stops well short of its editorial ambition — six of its panels are raw JSON `<pre>` blocks, and the operator workflow has no contextual affordances for review, approval, or state transition. The single most important component, `operator-console.tsx`, is an 800-line monolith with no view-model layer, no typed result shapes, and a brittle hardcoded mutation check that will silently fail when the tool set grows.

**Current state:** A functional prototype with sound architecture and exploitable security gaps, delivered in the right visual register but without finishing the operator interface.

**Immediate blockers to production use:**
1. Login brute force is completely unconstrained
2. Authenticated operators can make the server execute arbitrary filesystem paths as vitest subprocesses
3. Four scan tools can read any file on the host the process can access
4. The console communicates benchmark truth as raw JSON, not as an operator-readable evidence surface

**Biggest leverage point:** Fix the two security criticals and replace `<pre>JSON.stringify</pre>` with typed rendering components. These two changes transform the product's trust posture and operational utility simultaneously.

---

## 2. UI/UX Findings

### U1 — Shell Composition: The Right Architecture, Not Yet Filled

**Priority: HIGH**
**File:** `console/app/globals.css` lines 199–211, `console/src/components/operator-console.tsx` lines 720–796

The three-column shell — nav at 280px, workspace fluid, rail at 360px — is the correct information architecture for this product. It mirrors what Bloomberg Terminal and Figma's inspector panel both get right: persistent navigation context, wide working surface, persistent auxiliary strip.

**What's working:** The column proportions are well-chosen. The nav-header containing product identity, nav-stack containing actions, and nav-footer containing session context are compositionally correct. The `.console-rail` concept is right — a persistent audit strip that doesn't compete with the workspace.

**What's not working:** The rail vanishes at 1180px (`globals.css` line 425: `display: none`). On any 13" laptop — the canonical internal-tool screen — the audit log disappears with no fallback drawer, tab, or collapsed state. The product's most distinctive surface (visible trust audit trail) is the first thing removed at real screen sizes.

The nav has no iconography. Six text-only nav buttons at 280px wide, 12px padding, with `var(--muted)` color. These are functional but carry no semantic weight. In an instrument panel, navigation items should communicate their domain at a glance — not through decorative icons, but through data state indicators. A task count badge on "Delegation", a benchmark pass/fail indicator on "Benchmarks" — these transform nav into a live system status display.

**Recommendation:** Implement a rail collapse to a 48px icon-only strip at 1180px rather than hiding it. Add badge-style state indicators to nav items derived from the already-loaded dashboard data.

---

### U2 — Raw JSON as Primary Result Surface: The Foundational UX Failure

**Priority: CRITICAL (UX)**
**File:** `console/src/components/operator-console.tsx` lines 400, 410, 463, 588, 617, 713

Six distinct panels render this pattern:
```tsx
<pre>{JSON.stringify(data ?? {}, null, 2)}</pre>
```

This is the most consequential UX decision in the product and it is wrong at every level. The panels affected:
- Dashboard: benchmark posture (`line 400`)
- Dashboard: delegation queues (`line 410`)
- Delegation: blockers (`line 463`)
- Compliance: latest result (`line 588`)
- Consolidation: latest result (`line 617`)
- Tool Runner: result (`line 713`)

An operator reviewing benchmark state should see: B1–B6 as labeled rows, each with a pass/fail indicator, expected value, actual value (if available), last run timestamp. Instead they see a JSON object with keys like `honestCapabilityStatement`, `notImplemented`, `consolidationEligible`, rendered in a 12px mono wall.

The backend already produces structured, semantically rich responses. The benchmark result has `status`, `expectedValue`, `actualValue`, `lastRun`. The delegation state has `tasks[]` with `currentStatus`, `currentAgent`, `history[]`. The tool catalog captures `riskLevel` and `mutatesState`. All of this structure is discarded at the render boundary.

**This is not a styling problem. It is a product problem.** The console exists to surface truth and enable safe operator decisions. A raw JSON dump neither surfaces truth readably nor enables decisions safely. An operator cannot look at a JSON blob and confidently say "consolidation is safe to proceed."

**Recommendation:** Each panel needs a typed result component. Define TypeScript interfaces for each tool's response shape. Render benchmark results as a keyed table, delegation tasks as a timeline list with status chips, blockers as a numbered list with severity markers, consolidation output as a structured readiness statement. The JSON `<pre>` can remain as a "raw" toggle for debugging — it should not be the primary surface.

---

### U3 — Typography System: Strong Instincts, Incomplete Execution

**Priority: MEDIUM**
**File:** `console/app/globals.css` lines 103–111, 232–236, 340–345

The Newsreader serif for headings, Geist Mono for data/metadata, Inter for body — this is a considered editorial stack. The combination communicates something specific: archival weight in the headings, precision in the data, clarity in the prose. This is correct for a workbench that positions itself as evidence-first and trust-first.

**What's working:** `.meta-chip` at 11px uppercase mono with 0.12em letter-spacing (`line 135`) is excellent — it reads as system annotation, not decoration. The accent color on the active nav state is restrained. The `--text: #f5efe5` / `--muted: #b6ab98` / `--meta: #8e8478` three-level hierarchy is the right structure.

**What's not working:**

`clamp(2rem, 3vw, 3rem)` on `.section-heading h2` and `.hero-card h2` (`line 108`) is too large for an operator workspace. At 3rem, section headings dominate their panels and leave little room for density below. Marketing sites use large display type because screen time per page is short. Operator consoles use larger type only on primary state signals — "3 blockers" or "B4: failing" — not on section labels.

`.metric-card strong` at `1.6rem` (`line 316`) similarly oversizes numbers that should be immediately scannable, not large. These should be 1.1–1.25rem with tighter leading.

`.panel-card h3` at `1.35rem` (`line 344`) in serif at panel-header scale is attractive but pushes the header area tall. A 1.1rem mono or even small-caps sans would maintain hierarchy with less height cost.

**Missing tokens:**
- No `--radius-xs` (gap between 14px and 18px is fine, but dense inline elements need ~8px)
- No `--text-dim` between `--text` and `--muted` (three-level hierarchy without an intermediate step forces either color or opacity to do too much work)
- No status-specific tokens — `delegated`, `blocked`, `verified`, `consolidated` all render identically

**Recommendation:** Reduce section heading to 1.6rem cap. Pull metric values to 1.15rem. Add `--radius-xs: 8px`, `--text-dim: #d4c9b8`, and a semantic status token set.

---

### U4 — Hero Card Is Editorial, Not Operational

**Priority: MEDIUM**
**File:** `console/src/components/operator-console.tsx` lines 353–365

```tsx
<h2>MASA orchestration remains a trust-first instrument.</h2>
<p>Remote HTTP is authenticated, the MCP backend stays authoritative…</p>
```

This copy is aspirational rather than operational. An operator loading the dashboard does not need to be reminded of the product's philosophy — they need to know the current system state: Is the MCP backend reachable? When did the last benchmark run? Are there active blockers? How many tasks are pending review?

The hero card occupies the top of the workspace on every dashboard load and communicates exactly nothing about the actual system state at that moment. The space it uses is the highest-attention real estate on the screen.

**Recommendation:** Replace with a system status bar: backend connectivity (live from the health endpoint), last benchmark run timestamp and pass count, active blocker count, active task count, session age. These four signals tell the operator whether the system is healthy and whether action is needed. This is the editorial equivalent of a dateline on a news front page — it orients, not decorates.

---

### U5 — Motion Restraint: Correctly Absent, But Transition Opportunity Missed

**Priority: LOW**
**File:** `console/app/globals.css` lines 176–177, 193–197

Buttons have `transition: background 180ms ease, border-color 180ms ease, transform 180ms ease` and a subtle `translateY(-1px)` on hover. This is correct in restraint — micro-interactions that signal interactivity without distracting from content.

**What's missing:** View transitions. Switching between Dashboard, Delegation, Benchmarks, Compliance, Consolidation, and Tool Runner (`operator-console.tsx` lines 748–753) is instantaneous with no transition. In a cinematic-premium product, this feels abrupt. A 120ms opacity fade on view content would add the right amount of polish without motion sickness or delay.

Also missing: loading state feedback. The `loading` boolean (`line 143`) is used to disable the submit button and show "Running…" text, but there is no loading indicator on the panel areas being populated. Panels flash from empty state to populated state without signal.

**Recommendation:** Add `opacity: 0` → `opacity: 1` transition on `.console-workspace > section` on mount. Add skeleton shimmer on panels while bootstrap is loading. Both are ~20 lines of CSS.

---

### U6 — Right Rail: Concept Is Correct, Execution Is Decorative

**Priority: MEDIUM**
**File:** `console/src/components/operator-console.tsx` lines 756–795, `console/app/globals.css` lines 369–401

The activity log in the rail (`lines 764–779`) is the right concept: a persistent audit strip showing the last N tool executions with outcome. The issue is execution:

1. Outcome is a plain `<span>` with no color coding. `success`, `error`, `unauthorized`, `rate_limited`, `bad_request` render identically in `var(--muted)`.
2. Tool names are shown without context — `benchmark_status` and `validate_task_header` look identical in weight, but carry very different operational meaning.
3. Timestamps are formatted readably (`formatTimestamp` uses `Intl.DateTimeFormat`) but relative time ("3 minutes ago") would be more useful in a live context.

The "Trust Rail" card (`lines 780–794`) is the bigger problem:
```tsx
<ul className="signal-list">
  <li>Browser traffic never carries the MCP bearer token.</li>
  <li>State mutations require explicit confirmation.</li>
  …
</ul>
```
Four static bullet points that never change. This is documentation written into UI real estate. It should be replaced with live provenance data: active session expiry countdown, current operator ID, last backend health check timestamp, backend version mismatch warning (if console compatibility version doesn't match the health response).

**Recommendation:** Color-code activity entries by outcome. Replace the static trust rail with a live system provenance panel. Move documentation to a help modal or README.

---

### U7 — Delegation View: Most Important Surface, Least Rendered

**Priority: HIGH**
**File:** `console/src/components/operator-console.tsx` lines 417–467

The delegation view renders tasks as:
```tsx
<div key={String(task.taskId)} className="timeline-item">
  <div>
    <strong>{String(task.taskId)}</strong>
    <span>{String(task.currentStatus)}</span>
  </div>
  <p>{String(task.currentAgent)}</p>
</div>
```

`taskId`, `currentStatus`, and `currentAgent` as plain strings. Status values (`delegated`, `in_review`, `approved`, `blocked`, `verified`, `consolidated`) carry critical semantic meaning — they map to a defined state machine in `delegation-store.ts` lines 12–23 — but render with no visual differentiation. A task with `currentStatus: "blocked"` looks identical to one with `currentStatus: "verified"`.

The `history[]` array on each task contains the full transition log (status, agent, timestamp, notes) but is never rendered in the UI. An operator reviewing the delegation view cannot see: how long a task has been in its current state, what transitions it went through, which agent is responsible for the current state, or whether there are notes indicating blockers.

The blockers panel renders as `<pre>{JSON.stringify(dashboard.delegation?.blockers ?? [], null, 2)}</pre>` — a raw JSON array of strings.

**There is no path in the delegation view to perform a state transition.** The only way to update task status is to navigate to Tool Runner, select `delegation_chain_state`, fill in all fields manually, and submit. This requires knowing the task ID, valid status transition, and agent — none of which are presented in context.

**Recommendation:** Status chips with semantic color. Task history timeline on expand. Inline transition controls (pre-populated with valid next states per the transition graph). Blockers as a numbered list with timestamps.

---

### U8 — Confirmation Pattern Is Structurally Weak

**Priority: MEDIUM**
**File:** `console/src/components/operator-console.tsx` lines 684–693

```tsx
{selectedTool.mutatesState ? (
  <label className="confirm-row">
    <input type="checkbox" checked={confirmMutation} onChange={…} />
    <span>I confirm this state-changing action is intentional.</span>
  </label>
) : null}
```

A checkbox inline with the form is the weakest form of mutation confirmation. Problems:
1. The checkbox state (`confirmMutation`) persists across tool selections — if an operator confirms a mutation, switches tools, and switches back, the checkbox may still be checked (`useState` initializes at `false` but is never reset on tool change).
2. There is no contextual description of what will change — the operator must read the form fields and mentally model the consequence.
3. Generic "I confirm this action is intentional" communicates nothing about the specific mutation.

**Recommendation:** Reset `confirmMutation` to `false` on tool selection change. Replace the generic checkbox with a contextual preview: "This will transition TASK-009 from `in_review` → `approved`. This action cannot be undone except by a subsequent transition." Show the specific mutation consequence before it happens.

---

## 3. Security Findings

*(These were detailed in the separate SECURITY_AUDIT.md. The full technical report is there. This section captures the product-facing implications.)*

### S1 — Login Brute Force Is Completely Open

**Severity: CRITICAL**
**File:** `console/app/api/session/login/route.ts`

No rate limiting. Unlimited attempts. A shared password with no per-account lockout is the worst combination. The backend `FixedWindowRateLimiter` exists and is tested — it was not ported to the console login route.

**Product implication:** The console's entire trust posture is undermined if the password is guessable. A product that calls itself "trust-first" must not have an open credential brute-force surface.

---

### S2 — Benchmark `run` Action Executes Unsandboxed User-Supplied Path

**Severity: CRITICAL**
**File:** `src/adapters/benchmark-runner.ts` line 65, `src/tools/benchmark-status.ts` line 75

`execFileAsync("npx", ["vitest", "run", input.testPath])` where `input.testPath` is validated only as `z.string().min(1)`. No restriction to `AUDIT_ROOT` or `ENGINE_ROOT`. Child process inherits `process.env` in full, including all secrets.

**Product implication:** Any authenticated operator session can trigger arbitrary code execution on the host. This is not a theoretical risk — the exploit path is two HTTP calls.

---

### S3 — File Scanner Tools Have No Path Sandboxing

**Severity: HIGH**
**Files:** `src/adapters/file-scanner.ts`, `src/tools/check-notation-compliance.ts`, `src/tools/validate-assumption-envelope.ts`, `src/tools/llm-independence-check.ts`

`collectFiles(input.path, ...)` accepts any absolute path. An authenticated operator can make the server read any file the process can access on the host.

---

### S4 — SHA-256 Password Hash Format Accepted

**Severity: HIGH**
**File:** `console/src/lib/auth.ts` lines 59–62

SHA-256 is computationally trivial for offline password cracking (~500M guesses/second). The timing-safe comparison is correct but irrelevant — the attack is offline, not a side-channel. The scrypt path is correct; the sha256 path should be removed.

---

### S5 — Filesystem Paths Sent to the Browser

**Severity: HIGH**
**File:** `console/src/lib/mcp-client.ts` lines 22–28

`AUDIT_ROOT`, `ENGINE_ROOT`, `BENCHMARK_TEST_PATH` are returned in the authenticated bootstrap response and rendered in the browser's tool form defaults. An authenticated session receives the server's full filesystem layout — information that directly aids the S3 path traversal attack.

---

### S6 — Session Cookie `Secure` Flag Conditional on `NODE_ENV`

**Severity: MEDIUM**
**File:** `console/app/api/session/login/route.ts` line 37

`secure: process.env.NODE_ENV === "production"`. The VPS deployment example in `DEPLOYMENT.md` does not set `NODE_ENV=production`. Following the docs exactly produces an insecure-flag cookie.

---

### S7 — No CSRF Protection on Mutation Routes

**Severity: MEDIUM**
**File:** `console/app/api/mcp/call/route.ts`

`sameSite=lax` does not block `fetch()`-based cross-origin requests from same-site origins. No CSRF token, no custom header requirement. A same-site XSS can trigger delegation mutations with `confirmMutation: true`.

---

## 4. Architecture / Maintainability Findings

### A1 — `operator-console.tsx` Is an 800-Line State-and-View Monolith

**Priority: HIGH**
**File:** `console/src/components/operator-console.tsx`

The entire frontend — state, data fetching, form logic, and six view renderers — is one component with:
- 10 `useState` hooks
- 5 async functions with intertwined loading state
- 6 inline render functions (`renderDashboard`, `renderDelegation`, etc.)
- All localStorage read/write
- All form normalization
- All API calls

There is no view-model layer. Every result is typed as `Record<string, unknown>` and accessed via `String()` coercions or unsafe casts. `dashboard.benchmark?.passing` is accessed on an `unknown`-typed field — TypeScript cannot catch a backend response shape change.

**The consequence is unmaintainability.** Adding an eighth tool, a new state shape, or a new view requires understanding the full 800-line file. The `currentFormValues()` function is called in both `renderToolRunner()` and `submitSelectedTool()` without memoization. `loadBootstrap()` re-fetches the tool catalog plus triggers two additional tool calls after every single tool execution.

**Recommendation:** Extract a data layer (`useDashboardData`, `useToolExecution`), typed response interfaces for each tool, and separate view components (`DelegationView`, `BenchmarksView`, etc.) with typed props. The refactor scope is 2–3 days and should precede any significant feature additions.

---

### A2 — `isMutation()` Is a Hardcoded Bypass of the Tool Catalog

**Priority: HIGH**
**File:** `console/src/components/operator-console.tsx` lines 129–131

```typescript
function isMutation(toolName: string, payload: Record<string, unknown>): boolean {
  return toolName === "delegation_chain_state" && payload.action === "update";
}
```

The tool catalog at `src/shared/tool-catalog.ts` has `mutatesState: true` on `delegation_chain_state`. This function ignores that flag and reimplements the check with a hardcoded string. If any new tool is added to the catalog with `mutatesState: true`, the confirmation requirement is silently skipped. The catalog is the source of truth; the client should derive from it.

Also: the server-side `requiresConfirmation()` in `console/app/api/mcp/call/route.ts` line 8 is identically hardcoded:
```typescript
function requiresConfirmation(toolName: string, toolArgs: Record<string, unknown>): boolean {
  return toolName === "delegation_chain_state" && toolArgs.action === "update";
}
```

Two separate hardcoded checks that both must be manually updated for any new mutation tool. Neither references the catalog.

---

### A3 — New Task Creation Bypasses Status Validation

**Priority: HIGH**
**File:** `src/state/delegation-store.ts` lines 85–103

When a task doesn't already exist, `updateTask()` creates it with whatever `newStatus` string is passed — no validation against `allowedTransitions`, no check against a `KNOWN_STATUSES` set. A task can be created with `currentStatus: "consolidated"` (bypassing the entire workflow) or with an unrecognized string that puts it in a permanent deadlock state (all `allowedTransitions` lookups return `[]`).

The Zod schema for `delegation_chain_state` allows `newStatus: z.string().optional()` with no enum constraint. A 10-line fix: add `KNOWN_STATUSES` and validate on creation.

---

### A4 — `handleMcpRequest` Creates a New Server Instance Per Request

**Priority: LOW-MEDIUM**
**File:** `src/http.ts` lines 67–101

```typescript
async function handleMcpRequest(…): Promise<void> {
  const server = createServerFromDependencies(dependencies);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
```

`createServerFromDependencies()` is called on every incoming MCP request, creating a new MCP server and transport instance. `ServerDependencies` (config, rules, benchmark map, store) is created once at startup and reused, so this is not re-reading files on every request. But the pattern means each request allocates a full Server + Transport object pair and tears it down after use. For a low-traffic internal tool this is fine. For a high-frequency benchmark scan this would add measurable overhead.

---

### A5 — Audit Log Architecture Does Not Support Compliance Use

**Priority: MEDIUM**
**File:** `src/state/delegation-store.ts` lines 155–158

```typescript
state.activityLog = [entry, ...state.activityLog].slice(0, ACTIVITY_LOG_LIMIT);
```

The audit log is:
1. Co-located with the operational state file (single point of failure)
2. A rolling rewrite, not append-only (can be modified by anyone with state file access)
3. Bounded to 250 entries — silent data loss after that cap

For an internal tool tracking delegation state and benchmark truth for compliance review, this is inadequate. Audit entries that disappear silently cannot support any retrospective review. The log also cannot be queried by time range, operator, or tool without reading the entire state file.

**Recommendation:** Separate audit log to its own append-only file (newline-delimited JSON). Increase or remove the cap. Consider a read-only query interface for the activity endpoint.

---

### A6 — `localStorage` Result Cache Has No Size Guard

**Priority: MEDIUM**
**File:** `console/src/components/operator-console.tsx` lines 165–171

```typescript
window.localStorage.setItem(RECENT_RESULTS_KEY, JSON.stringify(recentResults));
```

Notation compliance scans on a large codebase can return large violation arrays. `setItem()` will throw `QuotaExceededError` when localStorage approaches its ~5MB limit. This exception is not caught. The operator's form inputs may also fail to persist, causing data loss on the next reload.

---

### A7 — Frontend Tests Are a Single Smoke Test

**Priority: HIGH**
**File:** `console/tests/operator-console.test.tsx`

One test: render the component, click "Tool Runner", verify the tool name appears. Nothing tests: mutation confirmation flow, form field normalization, localStorage failure handling, error state rendering, view transitions, or any of the six render paths. The backend test suite (`tests/http-security.test.ts`, `tests/delegation-store.test.ts`, `tests/server-e2e.test.ts`) is substantively better and should serve as the model.

---

## 5. Operator Workflow Findings

### W1 — No Contextual Action Path: Review ≠ Act

**Priority: CRITICAL (workflow)**

The most fundamental workflow problem: **every view-specific panel is read-only, and all actions are in the Tool Runner**.

The Delegation view shows task status but offers no transition controls. The Benchmarks view shows B1–B6 state but the "Run benchmark suite" button triggers a tool call that provides no contextual confirmation about what will happen (which test file? how long will it run?). The Compliance view has three action buttons that fire tools with default arguments and display raw JSON results. The Consolidation view has a single hardcoded "Generate cycle 1 statement" button.

An operator following a review workflow must:
1. Load the dashboard → see raw JSON benchmark state
2. Navigate to Benchmarks → see metric cards (status as string) + raw JSON capability statement
3. Navigate to Tool Runner to actually check notation compliance with custom path
4. Navigate back to Compliance to run the quick scan
5. Navigate to Delegation to see tasks (as plain strings)
6. Navigate to Tool Runner to update any task status
7. Navigate to Consolidation to generate the readiness statement

The tool-runner is the universal escape hatch. That's appropriate for power users and debugging. It should not be the primary action surface for the named views.

**Recommendation:** Each view should have its own contextual action surface. Delegation should show inline transition controls next to each task, pre-populated with valid next states. Benchmarks should show a "Run" button that summarizes what it will execute (test file path, estimated time). Compliance results should be rendered as a structured findings list, not a JSON dump.

---

### W2 — Benchmark Truth Communication Fails at Every Step

**Priority: HIGH**

The product's primary value proposition — "benchmark truth" — is communicated as follows in the current UI:

1. Dashboard metric card: `"— passing"` and `"— not implemented"` (when no snapshot exists)
2. Dashboard benchmark panel: `<pre>{JSON.stringify(dashboard.benchmark ?? {}, null, 2)}</pre>`
3. Benchmarks view metric grid: a loop over `benchmarkEntries` rendering `status` and `expectedValue` as strings
4. Benchmarks capability statement: `<div className="signal-text">{String(benchmark.honestCapabilityStatement || "No benchmark snapshot yet.")}</div>`

The `honestCapabilityStatement` text content is the best surface — it renders the narrative string from the backend (`buildHonestCapabilityStatement()` in `src/utils/capability-statement.ts`), which is deliberately calibrated and conservative. This is good. But it floats at the bottom of a view where the primary evidence above it (the JSON dump) is unreadable.

The B1–B6 metric grid is almost right. It renders benchmark IDs as keys and status/expectedValue as text. What it's missing: actual vs. expected comparison, a pass/fail color indicator, last run timestamp, and whether the benchmark is actively running.

**What the operator needs:** A single, authoritative "Benchmark posture" surface that shows: last run timestamp, each benchmark with pass/fail indicator and value comparison, overall eligibility signal, and the capability statement as the concluding authoritative text. This is what the backend already produces — it just needs to be rendered.

---

### W3 — Delegation State Machine Is Invisible to the Operator

**Priority: HIGH**

The `allowedTransitions` map in `delegation-store.ts` lines 12–23 encodes a meaningful state machine:

```
delegated → [in_review, in_progress, rejected, blocked]
in_review → [approved, rejected, blocked]
approved → [delegated, in_progress, blocked]
in_progress → [delivered, blocked, rejected]
delivered → [verified, rejected, blocked]
verified → [consolidated]
```

This is the workflow. An operator needs to understand where a task is in this flow, what moves are available next, and what actions have been taken previously. None of this is visible in the current UI. Tasks render as three text fields. The state machine is implicit. The history array (present in the data) is never rendered.

The fact that `blocked` tasks can transition to `in_review | approved | in_progress | rework | rejected` is critical information for an operator trying to unblock work. Currently, they would have to consult the source code to know which transitions are valid.

**Recommendation:** Render the task history timeline from `task.history[]`. Show available next states per task derived from the transition graph. Consider a visual pipeline view that positions tasks by phase.

---

### W4 — Consolidation Is a Single-Button Experience With No Context

**Priority: MEDIUM**
**File:** `console/src/components/operator-console.tsx` lines 595–621

The consolidation view is one button ("Generate cycle 1 statement") and a `<pre>` result panel. The cycle number is hardcoded to `1`. An operator on cycle 3 of a consolidation review cannot use this view — they must go to Tool Runner.

More importantly: the consolidation result is a structured object with `readinessStatement`, `eligible`, `blockers`, and `warnings` — but rendered as raw JSON. An operator should be able to read the consolidation statement as a document, see the blockers preventing consolidation, and see which benchmark or compliance conditions are not yet met. The backend produces this structured output. The UI discards it.

---

### W5 — Error States Are Inline But Undifferentiated

**Priority: MEDIUM**
**File:** `console/src/components/operator-console.tsx` line 747, `console/app/globals.css` lines 353–363

```tsx
{error ? <div className="warning-card">{error}</div> : null}
```

Error messages appear as a single `warning-card` at the top of the workspace. This is functional but undifferentiated: a network timeout, a backend validation error, and a mutation confirmation failure all produce identical-looking cards with different text. An operator cannot tell at a glance whether an error is transient (retry), requires a correction to their input, or indicates a backend problem.

There's also no error recovery guidance. "Tool execution failed" tells the operator nothing actionable. The error surface should categorize: `retryable`, `input_error`, `backend_error`, `auth_error` — with different visual treatment and different suggested actions.

---

### W6 — Tool Runner Is Ergonomically Correct but Contextually Isolated

**Priority: LOW-MEDIUM**
**File:** `console/src/components/operator-console.tsx` lines 623–717

The Tool Runner — the most flexible view — is actually reasonably well-designed. It shows the tool name, risk level, category, summary, and fields. The form normalization (`normalizeFieldValue`) handles type coercion. Results persist to `recentResults` in localStorage.

The problems are contextual:
1. Switching tools resets `liveResult` to null — the previous result disappears even though it's cached in `recentResults`. The "Load last result" button recovers it, but the UX feels like accidental data loss.
2. The tool selector is a nav-level selection, not visible in the tool runner view itself. An operator who lands on tool runner from a bookmark doesn't know which tool is selected without looking at the nav.
3. `selectedTool` defaults to the first tool in the catalog (`validate_task_header`) rather than the most recently used tool, which would be more ergonomic.

---

## 6. Highest-Priority Risks

Rank-ordered by immediate impact to trust and usability.

| # | Risk | Severity | Exploitability | Fix Effort |
|---|------|----------|----------------|------------|
| 1 | No login rate limiting | CRITICAL | Immediate | Low (2h) |
| 2 | Subprocess path injection via `testPath` | CRITICAL | One API call | Low (1h) |
| 3 | File scanner reads any host path | HIGH | One API call | Low (2h) |
| 4 | SHA-256 password hash accepted | HIGH | Offline after hash leak | Trivial (30m) |
| 5 | Filesystem paths in browser response | HIGH | Authenticated session | Low (1h) |
| 6 | Raw JSON as primary result surface | CRITICAL (UX) | Every operator session | High (3–5d) |
| 7 | No operator workflow affordances | HIGH (UX) | Every operator session | High (5–7d) |
| 8 | 800-line monolith component | HIGH (arch) | Every future change | High (3d) |
| 9 | No session revocation | MEDIUM | Post-compromise | Low (4h) |
| 10 | CSRF on mutation routes | MEDIUM | Same-site XSS required | Low (2h) |

---

## 7. Highest-Leverage Improvements

These are the changes that move the product furthest, fastest.

**1. Login rate limiter + path sandboxing (one sprint)**
These two security fixes together close the most exploitable surface area. The rate limiter is a `middleware.ts` file; the path sandbox is a 10-line guard in `file-scanner.ts`. Combined, they eliminate the two critical findings and the one high-severity read-access finding.

**2. Typed result renderers for benchmark and delegation (one sprint)**
Replace the `<pre>JSON.stringify</pre>` pattern in the two highest-value panels (Benchmarks view + Delegation view). Define TypeScript types for the known response shapes and render them as structured, colored, information-dense panels. This is the single change with the highest operator-facing impact. An operator who can finally read benchmark truth at a glance will immediately understand what the product is for.

**3. Component split + data layer (one sprint)**
Extract `operator-console.tsx` into view components and a `useDashboardData` hook. This unblocks all subsequent feature work and eliminates the `isMutation()` brittleness at the same time.

**4. Delegation state machine surface (one sprint)**
Render task history timelines, valid next-state affordances, and status chips with color encoding. This is the delegation view becoming what it was meant to be — a live state machine inspector.

**5. System status bar replacing hero card (one day)**
Backend reachability, last benchmark timestamp, active blocker count, session expiry. Four live signals replace one static declaration.

---

## 8. Recommended Roadmap

### Phase 1 — Security Floor (1 week)

Fix the exploitable gaps before any other work. These are non-negotiable for any deployment.

- Add `console/middleware.ts` rate limiting on login (`/api/session/login`, 5 attempts per 60 seconds)
- Add path sandboxing in `file-scanner.ts` `collectFiles()`
- Sandbox `testPath` in `benchmark-status.ts` to configured `BENCHMARK_TEST_PATH` only
- Remove SHA-256 hash acceptance from `auth.ts`
- Strip filesystem paths from bootstrap response in `mcp-client.ts`
- Strip secrets from subprocess environment in `benchmark-runner.ts`
- Add `X-Console-Request: 1` CSRF header check to Next.js mutation routes

**Exit gate:** Security audit re-run finds no critical or high findings.

---

### Phase 2 — Operator Surfaces (2 weeks)

Make the product usable for its stated purpose.

- **Benchmark view:** Typed `BenchmarkPanel` component. B1–B6 as keyed rows with pass/fail indicator (`--success` / `--danger`), expected vs. actual values, last run timestamp. Capability statement as a formatted document block, not a JSON field.
- **Delegation view:** Typed `TaskList` component. Status chips with semantic color (define status token set). Task history timeline from `history[]` array. Valid-next-state controls next to each task. Blockers as numbered list.
- **Activity rail:** Color-coded by outcome. Relative timestamps ("3m ago"). Tool category prefix.
- **System status bar:** Replace hero card with live backend connectivity, benchmark posture, blocker count, session age.
- **Status token set:** Add `--status-delegated`, `--status-blocked`, `--status-verified`, etc. to CSS custom properties.

**Exit gate:** An operator can review benchmark posture, read delegation state, and understand system health without opening browser devtools or reading raw JSON.

---

### Phase 3 — Component Architecture (2 weeks)

Make the product maintainable.

- Split `operator-console.tsx` into view components with typed props
- Introduce `useDashboardData()` and `useToolExecution()` hooks
- Define TypeScript response interfaces for all 8 tool outputs
- Fix `isMutation()` to use catalog's `mutatesState` flag
- Add `KNOWN_STATUSES` validation on task creation in `delegation-store.ts`
- Add localStorage `QuotaExceededError` handling
- Add 5–8 frontend unit tests covering mutation confirmation, error states, view transitions, and field normalization

**Exit gate:** Adding a new tool or view requires changes in one file, not the full monolith.

---

### Phase 4 — Workflow Completion (2 weeks)

Complete the operator workflows as designed.

- **Inline task transitions:** Delegation view shows available next states per task, confirms before submitting, requires notes for state-changing transitions
- **Consolidation view:** Render `readinessStatement` as a formatted document, show blockers and missing conditions explicitly, allow cycle number input
- **Compliance view:** Render scan findings as a structured violations table (file, line, rule, severity) rather than raw JSON
- **Confirmation UX:** Reset `confirmMutation` on tool change. Show specific mutation preview ("This will transition TASK-009 from `in_review` → `approved`").
- **Error differentiation:** Categorize errors as retryable / input / backend / auth with different visual treatment

**Exit gate:** An operator can complete a full review cycle (benchmark check → compliance scan → delegation review → consolidation generation) without using the Tool Runner for any primary workflow step.

---

### Phase 5 — Design System Completion + Polish (1 week)

Finish the visual system.

- Add `--radius-xs: 8px`, `--text-dim: #d4c9b8` tokens
- Add semantic status token set to `:root`
- Reduce section heading scale to 1.6rem cap
- Pull metric values to 1.15rem
- Add 120ms opacity fade on view transitions
- Add skeleton loading states on bootstrap
- Implement rail collapse to 48px icon strip at 1180px
- Add badge-style state indicators to nav items
- Implement session revocation in logout
- Add `--text-dim` intermediate text level

**Exit gate:** The product feels complete, restrained, and premium at all breakpoints from 1400px down to 1024px.

---

## 9. Final Verdict

**Current maturity:** Functional prototype. Security-compromised in two critical areas. Operator-unusable as primary interface due to raw JSON rendering. Architecturally sound at the backend layer; architecturally fragile at the frontend layer.

**Biggest blocker:** The operator interface cannot communicate truth. Six of the product's primary panels render raw JSON. A product that claims to surface "benchmark truth" and "consolidation readiness" must render those concepts interpretably. Until this is fixed, the product cannot be evaluated on its actual merits.

**Second blocker:** Login brute force is unconstrained. A trust-first product must not have an open credential attack surface. This is a two-hour fix with outsized symbolic and practical importance.

**Best next move:** Security floor in the first week (critical/high fixes), typed result renderers for benchmark and delegation in the second week. These two moves transform the product from "security-compromised prototype with good visual instincts" into "deployable internal tool with a genuine operator surface." Everything else in the roadmap builds on this foundation.

**What this product does well that must be preserved:** The backend architecture — state machine, tool contract, compliance rule engine, bearer auth, rate limiting — is the right foundation. The visual identity — warm dark palette, serif/mono typographic register, meta-chip annotation pattern — is distinctive and correct for this product's register. The three-column shell is the right information architecture. The trust boundary between browser and console proxy is correctly implemented at the server layer. These are real strengths. The roadmap is about finishing, not rebuilding.

---

*All findings grounded in source code read directly. Every file citation is exact. Inferred behaviors are not presented as implemented facts.*
