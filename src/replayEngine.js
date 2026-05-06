const DELEGATION_TYPES = new Set(['delegate', 'delegation', 'authority_delegated', 'grant']);
const REVOCATION_TYPES = new Set(['revoke', 'revocation', 'authority_revoked']);
const JUDGMENT_TYPES = new Set(['judgment', 'judge', 'decision', 'verdict']);
const VERIFICATION_TYPES = new Set(['verify', 'verification', 'signature_check', 'attestation']);
const TERMINATION_TYPES = new Set(['terminate', 'termination', 'closed', 'finalized', 'replay_terminated']);

export const sampleArchiveJsonl = [
  { event_id: 'evt-001', ts: '2026-05-06T10:00:00Z', type: 'judgment', actor: 'root-authority', subject: 'case-17', decision: 'accepted', scope: ['case:17', 'delegate:review'], hash: 'h001' },
  { event_id: 'evt-002', ts: '2026-05-06T10:01:00Z', type: 'delegation', delegator: 'root-authority', delegatee: 'reviewer-a', scope: ['case:17'], previous_hash: 'h001', hash: 'h002' },
  { event_id: 'evt-003', ts: '2026-05-06T10:02:00Z', type: 'verification', actor: 'reviewer-a', subject: 'case-17', result: 'verified', previous_hash: 'h002', hash: 'h003' },
  { event_id: 'evt-004', ts: '2026-05-06T10:03:00Z', type: 'delegation', delegator: 'reviewer-a', delegatee: 'agent-b', scope: ['case:17:read'], previous_hash: 'h003', hash: 'h004' },
  { event_id: 'evt-005', ts: '2026-05-06T10:04:00Z', type: 'verification', actor: 'agent-b', subject: 'case-17', result: 'failed', reason: 'signature mismatch', previous_hash: 'h004', hash: 'h005' },
  { event_id: 'evt-006', ts: '2026-05-06T10:05:00Z', type: 'judgment', actor: 'reviewer-a', subject: 'case-17', decision: 'escalated', parent_id: 'evt-001', previous_hash: 'h999', hash: 'h006' },
  { event_id: 'evt-007', ts: '2026-05-06T10:06:00Z', type: 'revocation', delegator: 'root-authority', delegatee: 'reviewer-a', scope: ['case:17'], previous_hash: 'h006', hash: 'h007' },
  { event_id: 'evt-008', ts: '2026-05-06T10:07:00Z', type: 'termination', actor: 'root-authority', state: 'terminated', reason: 'failed verification caused replay stop', previous_hash: 'h007', hash: 'h008' }
].map((event) => JSON.stringify(event)).join('\n');

export function parseArchiveJsonl(text) {
  if (!text.trim()) return [];
  return text.split(/\r?\n/).map((line, index) => ({ line, index })).filter(({ line }) => line.trim() && !line.trim().startsWith('#')).map(({ line, index }) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      return {
        event_id: `parse-error-${index + 1}`,
        type: 'parse_error',
        ts: null,
        raw_line: line,
        error: error.message,
        tampered: true
      };
    }
  });
}

export function buildReplaySession(events, options = {}) {
  const normalized = events.map((event, index) => normalizeEvent(event, index));
  const cursor = Number.isInteger(options.cursor) ? Math.max(0, Math.min(options.cursor, normalized.length)) : normalized.length;
  const replayed = normalized.slice(0, cursor);
  const state = createInitialState(normalized.length, cursor);

  replayed.forEach((event, index) => applyEvent(state, event, replayed[index - 1], index));

  state.events = replayed.map((event) => ({
    ...event,
    tamperReasons: state.tamperEvents.get(event.id) ?? [],
    authorityStatus: state.eventAuthority.get(event.id) ?? 'observed'
  }));
  state.timeline = state.events.map((event, index) => ({
    id: event.id,
    index,
    label: event.type,
    timestamp: event.timestamp,
    actor: event.actor,
    severity: state.tamperEvents.has(event.id) || event.verificationState === 'failed' ? 'danger' : event.isTermination ? 'terminal' : 'normal'
  }));
  state.authorityScopes = [...state.authority.entries()].map(([principal, scopes]) => ({ principal, scopes: [...scopes].sort() })).sort((a, b) => a.principal.localeCompare(b.principal));
  state.delegationGraph = buildDelegationGraph(state.delegations, state.authorityScopes);
  state.terminationState = state.termination ?? { status: 'open', reason: 'No termination event replayed yet.' };
  state.tamperHighlights = [...state.tamperEvents.entries()].map(([eventId, reasons]) => ({ eventId, reasons }));
  return state;
}

function createInitialState(totalEvents, cursor) {
  return {
    session: { totalEvents, replayedEvents: cursor, progress: totalEvents ? cursor / totalEvents : 0 },
    events: [],
    timeline: [],
    judgmentChain: [],
    delegations: [],
    verificationFlow: [],
    authority: new Map(),
    authorityScopes: [],
    eventAuthority: new Map(),
    tamperEvents: new Map(),
    termination: null,
    terminationIndex: null,
    delegationGraph: { nodes: [], edges: [] },
    tamperHighlights: []
  };
}

function normalizeEvent(raw, index) {
  const type = normalizeToken(raw.type ?? raw.event_type ?? raw.kind ?? raw.action ?? 'event');
  const id = String(raw.event_id ?? raw.id ?? raw.hash ?? `event-${index + 1}`);
  const actor = stringify(raw.actor ?? raw.principal ?? raw.authority ?? raw.delegator ?? raw.issuer ?? 'unknown');
  const delegator = stringify(raw.delegator ?? raw.from ?? raw.issuer ?? (DELEGATION_TYPES.has(type) || REVOCATION_TYPES.has(type) ? actor : undefined));
  const delegatee = stringify(raw.delegatee ?? raw.to ?? raw.subject ?? raw.recipient ?? raw.assignee);
  const scopes = normalizeScopes(raw.scope ?? raw.scopes ?? raw.authority_scope ?? raw.permissions ?? raw.claims);
  const verificationState = normalizeVerificationState(raw.result ?? raw.status ?? raw.state ?? raw.verified ?? raw.signature_valid ?? raw.integrity);

  return {
    id,
    index,
    raw,
    type,
    category: categorize(type),
    timestamp: raw.ts ?? raw.timestamp ?? raw.time ?? null,
    actor,
    subject: stringify(raw.subject ?? raw.target ?? raw.case_id ?? raw.resource),
    delegator,
    delegatee,
    scopes,
    decision: stringify(raw.decision ?? raw.judgment ?? raw.verdict ?? raw.outcome),
    parentId: stringify(raw.parent_id ?? raw.parent ?? raw.previous_event ?? raw.causal_parent),
    previousHash: stringify(raw.previous_hash ?? raw.prev_hash ?? raw.previousHash),
    hash: stringify(raw.hash ?? raw.event_hash ?? raw.digest),
    verificationState,
    reason: stringify(raw.reason ?? raw.error ?? raw.message),
    isTermination: TERMINATION_TYPES.has(type),
    explicitTamper: raw.tampered === true || raw.integrity === false || raw.signature_valid === false || raw.verified === false
  };
}

function applyEvent(state, event, previousEvent, index) {
  if (state.termination && index > state.terminationIndex) {
    flagTamper(state, event.id, 'Event appears after replay termination.');
  }

  if (event.previousHash && previousEvent?.hash && event.previousHash !== previousEvent.hash) {
    flagTamper(state, event.id, `previous_hash ${event.previousHash} does not match prior event hash ${previousEvent.hash}.`);
  }

  if (event.explicitTamper || event.type === 'parse_error') {
    flagTamper(state, event.id, event.reason || event.raw.error || 'Event contains an explicit failed integrity signal.');
  }

  if (event.category === 'judgment') {
    state.judgmentChain.push({ id: event.id, parentId: event.parentId, actor: event.actor, subject: event.subject, decision: event.decision, timestamp: event.timestamp });
  }

  if (event.category === 'delegation') {
    const inherited = event.delegator && state.authority.has(event.delegator);
    const isRoot = !state.delegations.length && !state.authority.size;
    if (!inherited && !isRoot) flagTamper(state, event.id, `${event.delegator || 'unknown delegator'} delegated without observed authority.`);
    grantAuthority(state, event.delegatee, event.scopes);
    if (isRoot && event.delegator) grantAuthority(state, event.delegator, event.scopes);
    state.delegations.push({ id: event.id, from: event.delegator || event.actor, to: event.delegatee || event.subject, scopes: event.scopes, timestamp: event.timestamp, active: true });
    state.eventAuthority.set(event.id, inherited || isRoot ? 'propagated' : 'authority-gap');
  } else if (event.category === 'revocation') {
    revokeAuthority(state, event.delegatee, event.scopes);
    state.delegations.filter((edge) => edge.to === event.delegatee).forEach((edge) => { edge.active = false; });
    state.eventAuthority.set(event.id, 'revoked');
  } else {
    if (event.scopes.length) grantAuthority(state, event.actor, event.scopes);
    const hasAuthority = event.actor === 'unknown' || !event.scopes.length || hasAnyScope(state, event.actor, event.scopes);
    state.eventAuthority.set(event.id, hasAuthority ? 'observed' : 'out-of-scope');
    if (!hasAuthority) flagTamper(state, event.id, `${event.actor} acted outside replayed authority scope.`);
  }

  if (event.category === 'verification') {
    state.verificationFlow.push({ id: event.id, actor: event.actor, subject: event.subject, state: event.verificationState, reason: event.reason, timestamp: event.timestamp });
    if (event.verificationState === 'failed') flagTamper(state, event.id, event.reason || 'Verification flow reported failure.');
  }

  if (event.isTermination) {
    state.termination = { status: event.raw.state ?? 'terminated', eventId: event.id, timestamp: event.timestamp, reason: event.reason || 'Termination event replayed.' };
    state.terminationIndex = index;
  }
}

function buildDelegationGraph(delegations, authorityScopes) {
  const principals = new Set(authorityScopes.map((entry) => entry.principal));
  delegations.forEach((edge) => { if (edge.from) principals.add(edge.from); if (edge.to) principals.add(edge.to); });
  return {
    nodes: [...principals].sort().map((id) => ({ id, scopes: authorityScopes.find((entry) => entry.principal === id)?.scopes ?? [] })),
    edges: delegations.map((edge) => ({ ...edge }))
  };
}

function grantAuthority(state, principal, scopes) {
  if (!principal || !scopes.length) return;
  if (!state.authority.has(principal)) state.authority.set(principal, new Set());
  scopes.forEach((scope) => state.authority.get(principal).add(scope));
}

function revokeAuthority(state, principal, scopes) {
  if (!principal || !state.authority.has(principal)) return;
  if (!scopes.length) {
    state.authority.delete(principal);
    return;
  }
  scopes.forEach((scope) => state.authority.get(principal).delete(scope));
}

function hasAnyScope(state, principal, scopes) {
  const current = state.authority.get(principal);
  if (!current) return false;
  return scopes.some((scope) => current.has(scope) || [...current].some((owned) => scope.startsWith(owned) || owned.startsWith(scope)));
}

function flagTamper(state, eventId, reason) {
  if (!state.tamperEvents.has(eventId)) state.tamperEvents.set(eventId, []);
  state.tamperEvents.get(eventId).push(reason);
}

function categorize(type) {
  if (DELEGATION_TYPES.has(type)) return 'delegation';
  if (REVOCATION_TYPES.has(type)) return 'revocation';
  if (JUDGMENT_TYPES.has(type)) return 'judgment';
  if (VERIFICATION_TYPES.has(type)) return 'verification';
  if (TERMINATION_TYPES.has(type)) return 'termination';
  return 'event';
}

function normalizeVerificationState(value) {
  if (value === true) return 'verified';
  if (value === false) return 'failed';
  const token = normalizeToken(value ?? 'observed');
  if (['ok', 'pass', 'passed', 'valid', 'verified', 'trusted'].includes(token)) return 'verified';
  if (['fail', 'failed', 'invalid', 'error', 'rejected', 'tampered'].includes(token)) return 'failed';
  if (['pending', 'unknown', 'observed'].includes(token)) return token;
  return token;
}

function normalizeScopes(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'object') return Object.entries(value).filter(([, enabled]) => Boolean(enabled)).map(([scope]) => scope);
  return String(value).split(/[ ,]+/).map((scope) => scope.trim()).filter(Boolean);
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function stringify(value) {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
