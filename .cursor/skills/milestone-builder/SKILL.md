---
name: milestone-builder
description: Use when the user says milestone-builder, "build the next milestone", or asks to implement the lowest open GitHub milestone.
---

# Milestone builder

Playbook for one milestone in `arkajyotiMukherjee/discordcardgames`. Follow the steps in order. Stop only when that milestone is closed, or when a real blocker is reported.

This run implements the lowest open milestone only. Do not start the next one. Do not implement tickets from a later milestone. Do not close a milestone that still has open issues.

Issue bodies have sections: Expected outcome, Deliverable, Validation, and Blocked by. Build the dependency graph from native GitHub blocked-by links.

## GitHub access

The cloud environment token can list milestones and often returns 403 on issues. Do not print tokens.

Creating, listing, and closing issues, reading blocked-by, and closing milestones must use `gh` on the user's Mac.

Resolve the Mac at runtime. Call cursor-cloud `list-self-hosted-workers` and choose the connected worker whose repo is `arkajyotiMukherjee/discordcardgames` (Arkajyoti's MacBook Air, checkout `~/Desktop/code/discordcardgames`). Do not hardcode a worker id. If that worker is not approved for placement, request access before using it. If it is not connected, stop and report that blocker.

Run those `gh` commands on that machine from `~/Desktop/code/discordcardgames`. Do not implement tickets on that checkout.

Cloud GitHub MCP may read an issue body when the call succeeds. If it returns 403, read the body with `gh issue view` on the Mac.

## 1. Pick the milestone

List open milestones and take the smallest milestone `number`. That is the only milestone this run implements.

```bash
gh api --paginate "/repos/arkajyotiMukherjee/discordcardgames/milestones?state=open&per_page=100"
```

If none are open, report that and stop. Read the chosen milestone's title and description before implementation. The description's goal and deliverable are the final check in step 7.

## 2. Load issues and build the graph

Load every open issue in that milestone. Ignore pull requests.

```bash
gh api --paginate "/repos/arkajyotiMukherjee/discordcardgames/issues?milestone=NUMBER&state=open&per_page=100"
```

For each open issue, read native blocked-by:

```bash
gh api --paginate "/repos/arkajyotiMukherjee/discordcardgames/issues/ISSUE/dependencies/blocked_by"
```

If that endpoint fails, use GraphQL `blockedBy` on the same issue. Do not assume there are no blockers.

An issue is ready only when every blocker exists and is closed. A missing blocker (unreadable, deleted, or state unknown) means the issue is not ready.

## 3. Launch ready issues

Ready issues that do not depend on each other run in parallel. One worker per ready issue.

Each worker gets its own cloud VM and branch, implements only that issue, and opens a PR. Do not put two ticket implementations on the same checkout. Do not implement tickets on the coordinator checkout or the Mac checkout. Do not start an issue whose blocker is still open.

Give the worker that issue's number, title, Expected outcome, Deliverable, and Validation. It must execute the Validation section and return the PR URL plus evidence for every validation item.

## 4. Check validation

Compare the worker's evidence to that issue's Validation section before treating the ticket as done.

If validation fails or evidence is incomplete, send the failure back to that same worker. Do not close the issue. Do not start dependents.

## 5. Close and unblock

When validation passes, close the issue from the Mac and record the PR on the issue:

```bash
gh issue close ISSUE --repo arkajyotiMukherjee/discordcardgames --reason completed --comment "PR: URL"
```

Recompute the ready set from native blocked-by links. Launch newly unblocked issues. Repeat steps 3–5 until every issue in the milestone is closed.

## 6. Integrate

Merge the recorded PRs in dependency order, blockers before the issues they block. Do not force-push. If a PR is behind the base, merge the base into the PR branch, then merge the PR. Do not integrate while any issue in the milestone is still open.

## 7. Final validation

On the integrated tree, the milestone description's goal and deliverable must hold, and the ticket Validation checks must pass together on that tree. Passing in isolation is not enough.

If this fails, leave the milestone open and report what failed. Do not close it.

## 8. Close the milestone

Close it only after step 7 passes and a fresh list shows no open issues in the milestone. From the Mac:

```bash
gh api --method PATCH "/repos/arkajyotiMukherjee/discordcardgames/milestones/NUMBER" -f state=closed
```

## Real blockers

Stop and report: the Mac worker is unavailable, a missing blocker cannot be resolved, an issue cannot be completed as written, or final validation failed.

A failed Validation section is not a stop. Send it back to the same worker.
