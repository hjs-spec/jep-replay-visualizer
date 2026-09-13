import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplaySession, parseArchiveJsonl, sampleArchiveJsonl } from '../src/replayEngine.js';

test('parses JSONL archives and reports malformed lines as replay events', () => {
  const events = parseArchiveJsonl('{"id":"ok","type":"judgment"}\nnot-json');
  assert.equal(events.length, 2);
  assert.equal(events[1].type, 'parse_error');
  assert.equal(events[1].tampered, true);
});

test('builds replay semantics for judgment, delegation, verification, authority, and termination', () => {
  const session = buildReplaySession(parseArchiveJsonl(sampleArchiveJsonl));

  assert.equal(session.session.totalEvents, 8);
  assert.equal(session.judgmentChain.length, 2);
  assert.equal(session.delegationGraph.edges.length, 2);
  assert.equal(session.verificationFlow.length, 2);
  assert.equal(session.terminationState.status, 'terminated');
  assert.equal(session.integrityStatus, 'not-cryptographically-verified');
  assert.equal(session.authorityScopes.length, 0);
});

test('highlights tamper evidence from broken hash chain, failed verification, and parse errors', () => {
  const events = parseArchiveJsonl(`${sampleArchiveJsonl}\n{bad json}`);
  const session = buildReplaySession(events);
  const highlightedIds = session.tamperHighlights.map((item) => item.eventId);

  assert.ok(highlightedIds.includes('evt-005'));
  assert.ok(highlightedIds.includes('evt-006'));
  assert.ok(highlightedIds.includes('parse-error-9'));
});

test('supports partial replay cursor sessions', () => {
  const session = buildReplaySession(parseArchiveJsonl(sampleArchiveJsonl), { cursor: 3 });

  assert.equal(session.session.replayedEvents, 3);
  assert.equal(session.timeline.length, 3);
  assert.equal(session.terminationState.status, 'open');
  assert.equal(session.delegationGraph.edges.length, 1);
});


test('untrusted events cannot grant themselves authority', () => {
  const session = buildReplaySession([
    { id: '1', type: 'judgment', actor: 'attacker', scope: ['admin'] },
    { id: '2', type: 'delegation', delegator: 'attacker', delegatee: 'child', scope: ['admin'] }
  ]);
  assert.equal(session.authorityScopes.length, 0);
  assert.equal(session.events[1].authorityStatus, 'unknown');
  assert.equal(session.tamperHighlights.length, 0);
});

test('scope checks require all scopes and prevent ancestor escalation', () => {
  const session = buildReplaySession([
    { id: '1', type: 'judgment', actor: 'worker', scope: ['case:17:read', 'admin'] },
    { id: '2', type: 'delegation', delegator: 'worker', delegatee: 'child', scope: ['case:17'] }
  ], { initialAuthority: { worker: ['case:17:read'] } });
  assert.equal(session.events[0].authorityStatus, 'out-of-scope');
  assert.equal(session.events[1].authorityStatus, 'out-of-scope');
  assert.ok(!session.authority.has('child'));
});

test('revocation invalidates descendants', () => {
  const session = buildReplaySession([
    { type: 'delegation', delegator: 'owner', delegatee: 'a', scope: ['read'] },
    { type: 'delegation', delegator: 'a', delegatee: 'b', scope: ['read'] },
    { type: 'revocation', delegator: 'owner', delegatee: 'a', scope: ['read'] }
  ], { initialAuthority: { owner: ['read'] } });
  assert.equal(session.authority.get('b')?.size ?? 0, 0);
  assert.ok(session.delegations.every(edge => !edge.active));
});

test('recognizes core verbs without treating a T as global log termination', () => {
  const session = buildReplaySession([
    { jep: '1', verb: 'T', who: 'actor', when: 1, ref: 'sha256:a', what: { reason: 'done' } },
    { jep: '1', verb: 'J', who: 'other', when: 2, what: { claim: 'next' } },
    null
  ]);
  assert.equal(session.events[0].category, 'termination');
  assert.equal(session.events[0].actor, 'actor');
  assert.equal(session.events[0].parentId, 'sha256:a');
  assert.equal(session.terminationState.status, 'open');
  assert.equal(session.events[1].tamperReasons.length, 0);
  assert.equal(session.events[2].type, 'parse_error');
});
