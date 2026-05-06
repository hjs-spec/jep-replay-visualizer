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
  assert.ok(session.authorityScopes.some((entry) => entry.principal === 'agent-b' && entry.scopes.includes('case:17:read')));
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
