# JEP Event Replay Visualizer

A focused browser visualizer for making **JEP replay semantics observable** from a `archive.jsonl` event stream.

## What it visualizes

- Judgment chain replay
- Delegation lineage graph
- Verification flow state
- Authority propagation and active scopes
- Replay termination state
- Tamper detection highlights for malformed events, broken hash links, explicit integrity failures, failed verifications, post-termination events, and authority gaps

## UI surfaces

- **Timeline view** — scrub through a replay session event-by-event.
- **Graph lineage view** — inspect delegation edges and revoked lineage.
- **Replay inspector** — compare judgment, delegation, verification, authority, termination, and tamper state at the current cursor.
- **Event detail panel** — inspect normalized event evidence and raw source data.

This is intentionally **not** a SIEM, enterprise dashboard, or workflow platform. It is a replay semantics observer for JEP archives.

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
