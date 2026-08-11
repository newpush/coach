# Linear & Agentic Issue Management — Coach Watts

Issue tracking standards, ticket templates, and AI agent execution workflow for **Coach Watts** in **Linear** (team key **`CW`**).

> [!NOTE]
> **Derived from** the multi-team workspace protocol in the private Watt Mind infra repo (`hdkiller/docs/orgs/linear.md`). If workspace semantics conflict, that SoT wins; this file wins for CW-only product scope, the `develop` PR target, and what may appear in this public repo. Never import `WM` / `OPS` / `LAB` / `CLNT`, internal financial namespaces, or client names into commits, PRs, or issue comments here.

---

## 1. Linear as an execution substrate

Linear is not a passive board — it is the **persistent execution substrate and memory store** for autonomous agents (Claude Code, Gemini CLI, Cursor).

- **Human as architect, agent as executor.** Humans define requirements, review plans, and approve PRs. Agents claim tickets, write code, run verification, and report back.
- **Context efficiency.** Agents fetch one ticket's context — acceptance criteria and file pointers — rather than loading an entire backlog into the context window.
- **No git churn.** Task state lives in Linear, not in git-tracked markdown, so parallel agents never merge-conflict over status lines.

Files under `docs/issues/` are the **archive** of resolved issues plus specs. They are not a live queue.

---

## 2. Team & projects

**Team:** `Coach Watts` — key **`CW`** (`CW-1`, `CW-105`, …)

| Project                                | Scope                                                         | Repo              |
| -------------------------------------- | ------------------------------------------------------------- | ----------------- |
| Coach Watts – Web & AI Core Platform   | Nuxt 3 web app, AI Coach chatroom, Prisma, Trigger.dev        | `coach-wattz`     |
| Coach Watts – Mobile App               | Expo / React Native, iOS & Android                            | `watts-mobile`    |
| Coach Watts – App Store Distribution   | App Store Connect, Google Play, TestFlight, RevenueCat        | `watts-mobile`    |
| Coach Watts – Feeder & Ingestion       | Intervals.icu, Strava, Oura, Yazio connectors; event scrapers | `watts-feeder`    |
| Coach Watts – BI & Analytics           | Platform analytics, telemetry, dashboards                     | `watts-bi`        |
| Coach Watts – Marketing & Outreach     | Social, event promos, race entrant campaigns                  | `watts-marketing` |
| Coach Watts – Integration Partnerships | Partner business agreements                                   | —                 |

---

## 3. Labels

All labels are namespaced. Never invent a label outside these namespaces.

**`ai:*` — agent lifecycle**
`ai:agent-ready` (fully specified, safe to execute autonomously) · `ai:in-progress` · `ai:needs-review` · `ai:blocked`

**`agent:*` — which agent holds the ticket**
`agent:claude-code` · `agent:gemini` · `agent:cursor`

**`type:*`**
`bug` · `feature` · `ui-ux` · `security` · `performance` · `maintenance` · `docs` · `a11y`

**`area:*`**
`ui-ux` `navigation` `backend` `ai` `integrations` `workouts` `coaching` `nutrition` `wellness` `planning` `dashboard` `analytics` `auth` `security` `infra` `performance` `mobile` `chat` `email` `push` `i18n` `a11y` `docs` `data` `profile` `admin` `marketing` `architecture`

`area:*` is the concurrency partition key — it is how the dispatcher avoids giving two agents overlapping work.

**`dist:*`**
`dist:app-store` · `dist:play-store` · `dist:web` · `dist:raycast`

**Priority is Linear's native field**, not a label: Urgent(1) / High(2) / Medium(3) / Low(4). It determines agent dispatch order.

---

## 4. Workflow states

```
Triage ──► Backlog ──► Todo ──► In Progress ──► In Review ──► Done
                                     ▲              │
                                     └── Blocked ◄──┘
                                                    └─► Canceled / Duplicate
```

| State                        | Type      | Trigger                                                                   |
| ---------------------------- | --------- | ------------------------------------------------------------------------- |
| **Triage**                   | Backlog   | Raw or imported; lacks acceptance criteria. **Never agent-dispatchable.** |
| **Backlog**                  | Backlog   | Specified, not scheduled.                                                 |
| **Todo**                     | Unstarted | Actionable. With `ai:agent-ready`, this is the agent queue.               |
| **In Progress**              | Started   | Claimed; branch and worktree exist.                                       |
| **Blocked**                  | Started   | Needs a human: missing credentials, ambiguity, external dependency.       |
| **In Review**                | Started   | PR open; awaiting CI and review.                                          |
| **Done**                     | Completed | Merged **and** verified.                                                  |
| **Canceled** / **Duplicate** | Canceled  | Dropped.                                                                  |

`Blocked` is a real state, not a label. A blocked ticket left in `In Progress` looks like a live agent claim forever — no agent picks it up and no human notices.

---

## 5. AI-Ready ticket template

A ticket earns `ai:agent-ready` only with all five sections present. Missing any → `Triage`.

````markdown
## Problem & Context

What is broken or missing, and why it matters.

## Acceptance Criteria

- [ ] Token refresh propagates auth failure to the caller
- [ ] Unit test covers the expired-refresh-token path

## Source File Pointers

- Primary: `app/services/api.ts`
- Test: `app/services/__tests__/api.test.ts`

## Owned Paths

- `app/services/api.ts`
- `app/services/__tests__/*`

## Verification Command

```bash
pnpm test:unit app/services/__tests__/api.test.ts
```
````

**`Owned Paths`** is the glob set the ticket may modify. Two in-flight tickets must never have overlapping globs — otherwise they collide at merge instead of at dispatch.

---

## 6. Git conventions

**Branch:** `<type>/CW-<id>-<slug>`

```bash
git checkout -b feat/CW-105-spo2-chart
git checkout -b fix/CW-42-token-refresh-race
```

**Worktree — one per ticket, mandatory:**

```bash
git worktree add ~/Develop/.worktrees/coach-wattz/CW-105 -b feat/CW-105-spo2-chart
```

Agents sharing a checkout corrupt each other's branch state. This rule is the mitigation.

**Commits:**

```bash
git commit -m "fix(mobile): resolve token refresh race condition (CW-105)"
```

**Magic keywords move a ticket to `In Review` only — never `Done`.** `Done` is set by the agent after posting verification output. Auto-closing on merge would bypass the test gate.

---

## 7. Concurrent agent protocol

Each agent runs as its **own Linear member with its own API key**, so `assignee` is a real lock.

1. **Query** `state:Todo AND label:ai:agent-ready AND assignee:none`, sorted priority asc, then createdAt asc.
2. **Check paths** — skip tickets whose `Owned Paths` overlap anything currently `In Progress`.
3. **Claim** — set assignee to self, state `In Progress`, add `ai:in-progress` + `agent:<name>`.
4. **Re-read the ticket.** If the assignee is not you, another agent won — release and take the next. Linear has no compare-and-swap; this read-back _is_ the concurrency control.
5. **Heartbeat** — comment at least every 10 minutes while working.
6. **Finish** — push branch (`git push origin <branch>`), open PR (`gh pr create --title "..." --body "Fixes <ISSUE-ID>"`), set state `In Review` + `ai:needs-review` (remove `ai:in-progress`), and post verification comment with PR link. Set to `Done` after PR merge and CI pass.

**Stale claims:** anything `In Progress` with no comment for 45 minutes is reclaimed — assignee cleared, back to `Todo`.

**Rate limits:** poll at most once per minute per agent; back off on `RATELIMITED`.

---

## 8. Execution loop

**Plan → Act → Verify → Push & Open PR → Log & Transition**

### Intake work that arrives without an issue

For meaningful, trackable work with no existing Linear issue, agents must search for duplicates and create an issue before implementation. This covers code or configuration changes, deployments, deliverables, and investigations that produce an operational finding; it does not cover ordinary questions, read-only lookups with no actionable finding, or inconsequential edits. Incomplete requests start in `Triage`. For a clear request, write the complete §5 template, set `ai:agent-ready`, move it to `Todo`, claim it, and only then begin work.

1. **Plan** — confirm file locations; restate the approach on the ticket.
2. **Act** — implement in the ticket's worktree, touching only `Owned Paths`, without breaking existing API contracts.
3. **Verify** — run the Verification Command (`pnpm test`, `pnpm typecheck`, build). **Never mark complete without clean output.**
4. **Push & Open PR** — push the feature/bugfix branch to remote (`git push origin <branch>`) and open a GitHub Pull Request targeting `develop` (`gh pr create --base develop --title "..." --body "Fixes <ISSUE-ID>"`).
5. **Log & Transition** — post verification results, PR URL, and diff summary to the Linear ticket, transitioning state to `In Review` (`ai:needs-review`). Set to `Done` once PR is merged and verified.

### Capture newly discovered work

Agents are empowered to create Linear issues whenever work reveals a genuine bug, risk, missing requirement, technical debt item, or follow-up that is outside the current ticket's acceptance criteria or `Owned Paths`. Do this as soon as the finding is clear; do not let useful work disappear into a PR comment, chat history, or a vague note.

Route the new issue to team **`CW`** and the appropriate Coach Watts project, use the canonical `type:*` and `area:*` labels, set an evidence-based priority, and link it to the originating issue or PR in the description. New discoveries normally start in `Triage`; promote them to `Todo` with `ai:agent-ready` only once they meet the complete template in §5. Creating the follow-up records it — it does **not** expand the current ticket's scope or authorize work outside its `Owned Paths`.
