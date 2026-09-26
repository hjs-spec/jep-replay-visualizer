# JEP Event Replay Visualizer

> **Maintenance: retired experiment — 2026-09-26.** Active feature development
> has ended. Source history, releases, examples and existing archive readers are
> retained for reproduction. Package names and historical formats are unchanged.

Browser projections of the local replay format remain available here. New Core event reports belong to the Agent SDK; its reports are not a decoder for this viewer's flexible input aliases.

For new signed Core integrations, use the [maintained recording and report path](https://github.com/hjs-spec/jep-agent-sdk/blob/main/docs/INTEGRATIONS.md).
See the [repository directory](https://github.com/hjs-spec/.github/blob/main/PROJECTS.md#retired-experiments) for maintenance status. No automatic archive migration is provided.

A browser viewer for recorded events and declared delegation relationships in JSONL archives.

**This is a visualization, not a cryptographic verifier.** It displays supplied links and verification results; it does not recompute event hashes or validate JWS. Its authority and termination projections are local visualization rules, not JEP Core semantics. Use the [Core validator](https://github.com/hjs-spec/jep-core/tree/main/reference-validator) for signed-event checks.

## What it visualizes

- Judgment chain replay
- Delegation lineage graph
- Verification flow state
- Authority propagation and active scopes
- Replay termination state
- Consistency findings for malformed events, broken reported links and explicit reported failures; unknown authority is not proof of tampering

## UI surfaces

- **Timeline view** — scrub through a replay session event-by-event.
- **Graph lineage view** — inspect delegation edges and revoked lineage.
- **Replay inspector** — compare judgment, delegation, verification, authority, termination, and tamper state at the current cursor.
- **Event detail panel** — inspect normalized event evidence and raw source data.

This is intentionally **not** a SIEM, enterprise dashboard, or workflow platform. It projects the supported archive fields listed below.

## Input

Open a newline-delimited JSON file named like `archive.jsonl`. Common event fields are normalized automatically, including:

- `event_id` / `id`
- `type` / `event_type` / `kind` / `action`
- `ts` / `timestamp`
- `actor`, `delegator`, `delegatee`, `subject`
- `scope` / `scopes` / `permissions`
- `previous_hash` / `prev_hash`, `hash`
- `result`, `status`, `state`, `verified`, `signature_valid`, `integrity`

## Run locally

```bash
npm start
```

Then open <http://localhost:4173>.

## Checks

```bash
npm test
npm run check
```

## Runtime and verification notes

See [HARDENING.md](HARDENING.md) for supported behavior, regression checks, and compatibility boundaries.
