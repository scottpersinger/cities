# Securing Axons for multi-tenant

How the codespace ↔ Axon pub/sub path is exposed across tenants, why Runloop's
native authorization can't fix it on its own, and the recommended architecture.

This document is about the **consumer side** that lives in this repo
(`axon_bridge.py`). The publisher and credential-minting live in **Central**,
which is a separate system; the changes it needs are specified here but not
implemented in this repo.

## The setup

```
                Central (control plane, holds the master Runloop key)
                   │  creates one Axon per codespace: name = cs-<CODESPACE_NAME>
                   │  publishes user.message / session.clear (from Slack)
                   ▼
            ┌──────────────┐  POST /v1/axons/{id}/publish
            │   Axon  cs-X │◀───────────────────────────────  Central
            └──────┬───────┘
                   │  GET /v1/axons/{id}/subscribe/sse
                   ▼
   codespace X  ── axon_bridge.py ── drives Claude (bypassPermissions) ── posts to Slack
```

Each codespace authenticates to Runloop with `RUNLOOP_API_KEY`, delivered as a
Codespaces secret. The bridge uses it to (1) resolve its own axon id by listing
axons by name (`GET /v1/axons?name=cs-…`) and (2) open the SSE subscription.

## The threat model

The **codespace is an untrusted boundary**:

- It runs Claude with `permission_mode=bypassPermissions` (`axon_bridge.py`), i.e.
  arbitrary shell/tool execution with no human in the loop.
- Its inputs are untrusted: Slack messages from anyone in the workspace, plus
  whatever is in the repo the agent is working on. Both are classic
  prompt-injection / data-exfiltration vectors.
- Anything readable in the container (env vars, `.env`, process memory) is
  reachable by that agent.

So we must assume a tenant's codespace — or an attacker who has injected it — can
read and use any credential present in the container, and can make arbitrary
outbound HTTPS calls.

## Why this is a multi-tenant problem

Runloop authorization is **account-wide and coarse**. Two facts establish this:

1. There is **no per-axon access control and no per-axon token**. The Axon API
   surface is `create`, `retrieve`, `list`, `publish`, `subscribe/sse`,
   `events.list`, `sql.query/batch` — none of them mint a scoped, per-axon
   credential.
2. Runloop **restricted keys** (`POST /v1/restricted_keys`) scope only by
   `resource_type` × `access_level`. The resource types are
   `DEVBOXES, BLUEPRINTS, SNAPSHOTS, BENCHMARKS, SCENARIOS, REPO_CONNECTIONS,
   AGENTS, OBJECTS, ACCOUNT`. There is **no `AXONS` resource type and no
   per-resource-id scoping**. A restricted key cannot say "subscribe to only
   axon cs-X".

Consequently, **any** Runloop credential that can read one axon can read them
all. A codespace holding the account `RUNLOOP_API_KEY` can:

- `list` every tenant's axon and `subscribe` to it → read all tenants' Slack
  traffic and agent I/O.
- `publish` to any tenant's axon → inject commands into another tenant's agent.
- manage devboxes/snapshots/etc. account-wide.

That is a complete cross-tenant isolation failure, and the blast radius of a
single leaked/injected codespace is the **entire Runloop account**.

## What does NOT fix it

- **Restricted keys alone** (`RESOURCE_TYPE_*` + `READ`): can drop devbox/account
  write so a leak can't manage infra, but it still reads every axon. Partial
  mitigation, not isolation.
- **Hiding the axon id**: ids are enumerable via `list`; obscurity is not a
  control.
- **Rotating the key**: doesn't change the fact that one valid key reaches all
  axons.

## Recommended architecture: relay / trust inversion

Because Runloop cannot enforce per-axon scope, **the codespace must not hold a
Runloop credential at all**. Move the master key behind a trusted relay in
Central and give each codespace a token scoped — by Central, not Runloop — to
exactly its own axon.

```
codespace X ── axon_bridge.py ──Bearer <per-codespace token>──▶  Central relay
                                                                    │  validates token → axon cs-X only
                                                                    │  uses master RUNLOOP_API_KEY
                                                                    ▼
                                                                 Axon cs-X  (subscribe/sse)
```

Properties:

- The master `RUNLOOP_API_KEY` never enters a codespace.
- Each codespace token maps to exactly one axon, enforced server-side by Central.
  A leaked/injected codespace can reach only its own axon — true per-tenant
  isolation, independent of Runloop's authz model.
- The relay only needs to proxy the SSE subscribe stream (the consumer is
  one-way; nothing is published back through the Axon — see `axon_bridge.py`).

### Central-side work (not in this repo)

1. Mint a **per-codespace bearer token** at provisioning time, stored in a table
   mapping `token → axon_id` (or `token → codespace_name`). Inject it into the
   codespace as `AXON_RELAY_TOKEN` instead of `RUNLOOP_API_KEY`.
2. Expose an authenticated **SSE relay endpoint**, e.g.
   `GET {AXON_RELAY_URL}/subscribe/sse?after_sequence=N` with
   `Authorization: Bearer <token>`. Central resolves the token → axon, then
   proxies `GET /v1/axons/{id}/subscribe/sse` upstream with the master key,
   streaming bytes back unchanged. Honor `after_sequence` and the 408 idle-timeout
   semantics so the existing resume logic keeps working.
3. Scope/expire tokens (per codespace, revocable on deprovision; short TTL with
   refresh is better still).
4. **Egress lockdown** (defense in depth): apply a Runloop network policy
   (`POST /v1/network-policies`, `allow_all=false`) so the codespace can reach
   the relay host but **not** `api.runloop.ai` directly. Without this, a key that
   leaks in by any path can still hit Runloop directly.

### Codespace-side work (this repo)

`axon_bridge.py` supports a **relay mode** (see below). When `AXON_RELAY_URL` is
set it routes the subscription through the relay with `AXON_RELAY_TOKEN` and
needs **no** `RUNLOOP_API_KEY` and **no** account-wide axon listing.

## Interim hardening (already in this repo)

Until the relay exists, two changes reduce risk without a Central rewrite:

1. **Inject `AXON_ID` directly.** Central already names axons deterministically
   (`cs-<CODESPACE_NAME>`), so it can write `AXON_ID` into the codespace `.env`
   and the bridge will skip the account-wide `GET /v1/axons` listing entirely.
   The bridge now logs a `SECURITY` warning whenever it falls back to that
   listing, and the fallback can be disabled with `AXON_ALLOW_NAME_LOOKUP=0`.
2. **Use a restricted key** for `RUNLOOP_API_KEY` (READ-only, no `DEVBOXES`/
   `ACCOUNT` write). This does not stop cross-tenant axon reads, but it stops a
   leaked key from managing infrastructure. Treat it as a stopgap, not the fix.

## Options summary

| Option | Cross-tenant isolation | Notes |
| --- | --- | --- |
| **Relay / trust inversion** (recommended) | **Yes** | Master key stays in Central; per-codespace token → one axon. Needs relay in Central + relay mode here (implemented). |
| Per-tenant Runloop org/key | Yes, if Runloop supports per-tenant orgs | Blast radius = one tenant; heavier provisioning. |
| Restricted key (READ-only) | No | Limits infra blast radius only; still reads all axons. Stopgap. |
| Egress network policy | — | Defense in depth; pairs with the relay. |
