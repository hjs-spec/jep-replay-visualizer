import { buildReplaySession, parseArchiveJsonl, sampleArchiveJsonl } from './replayEngine.js';

const state = {
  rawText: sampleArchiveJsonl,
  events: parseArchiveJsonl(sampleArchiveJsonl),
  cursor: 8,
  selectedEventId: null
};

const els = {
  archiveInput: document.querySelector('#archiveInput'),
  loadSample: document.querySelector('#loadSample'),
  resetReplay: document.querySelector('#resetReplay'),
  stepBack: document.querySelector('#stepBack'),
  stepForward: document.querySelector('#stepForward'),
  replayCursor: document.querySelector('#replayCursor'),
  cursorLabel: document.querySelector('#cursorLabel'),
  sessionSummary: document.querySelector('#sessionSummary'),
  timeline: document.querySelector('#timeline'),
  graph: document.querySelector('#delegationGraph'),
  inspector: document.querySelector('#inspector'),
  eventDetail: document.querySelector('#eventDetail')
};

els.archiveInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  state.rawText = await file.text();
  state.events = parseArchiveJsonl(state.rawText);
  state.cursor = state.events.length;
  state.selectedEventId = null;
  render();
});

els.loadSample.addEventListener('click', () => {
  state.rawText = sampleArchiveJsonl;
  state.events = parseArchiveJsonl(sampleArchiveJsonl);
  state.cursor = state.events.length;
  state.selectedEventId = null;
  render();
});

els.resetReplay.addEventListener('click', () => {
  state.cursor = 0;
  state.selectedEventId = null;
  render();
});

els.stepBack.addEventListener('click', () => {
  state.cursor = Math.max(0, state.cursor - 1);
  render();
});

els.stepForward.addEventListener('click', () => {
  state.cursor = Math.min(state.events.length, state.cursor + 1);
  render();
});

els.replayCursor.addEventListener('input', (event) => {
  state.cursor = Number(event.target.value);
  render();
});

function render() {
  const replay = buildReplaySession(state.events, { cursor: state.cursor });
  if (!state.selectedEventId && replay.events.length) state.selectedEventId = replay.events.at(-1).id;
  if (state.selectedEventId && !replay.events.some((event) => event.id === state.selectedEventId)) state.selectedEventId = replay.events.at(-1)?.id ?? null;

  els.replayCursor.max = String(state.events.length);
  els.replayCursor.value = String(state.cursor);
  els.cursorLabel.textContent = `${replay.session.replayedEvents}/${replay.session.totalEvents} events replayed`;

  renderSessionSummary(replay);
  renderTimeline(replay);
  renderGraph(replay);
  renderInspector(replay);
  renderDetail(replay);
}

function renderSessionSummary(replay) {
  const tamperCount = replay.tamperHighlights.length;
  els.sessionSummary.innerHTML = `
    <p class="eyebrow">Replay Session</p>
    <strong>${Math.round(replay.session.progress * 100)}% observed</strong>
    <span>${replay.terminationState.status}</span>
    <span class="${tamperCount ? 'danger-text' : 'ok-text'}">${tamperCount} tamper highlight${tamperCount === 1 ? '' : 's'}</span>
  `;
}

function renderTimeline(replay) {
  if (!replay.events.length) {
    els.timeline.className = 'timeline empty-state';
    els.timeline.textContent = 'Move the replay cursor forward to observe events.';
    return;
  }
  els.timeline.className = 'timeline';
  els.timeline.innerHTML = replay.events.map((event) => {
    const selected = event.id === state.selectedEventId ? 'selected' : '';
    const tampered = event.tamperReasons.length ? 'tampered' : '';
    return `
      <button class="timeline-event ${event.category} ${selected} ${tampered}" data-event-id="${escapeHtml(event.id)}">
        <span class="event-dot"></span>
        <span class="event-time">${escapeHtml(event.timestamp || `#${event.index + 1}`)}</span>
        <strong>${escapeHtml(event.type)}</strong>
        <span>${escapeHtml(event.actor || event.delegator || 'unknown')}</span>
      </button>
    `;
  }).join('');
  els.timeline.querySelectorAll('[data-event-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedEventId = button.dataset.eventId;
      render();
    });
  });
}

function renderGraph(replay) {
  const { nodes, edges } = replay.delegationGraph;
  const width = 760;
  const height = 360;
  const radius = 112;
  const center = { x: width / 2, y: height / 2 };
  const positions = new Map(nodes.map((node, index) => {
    const angle = nodes.length <= 1 ? -Math.PI / 2 : (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
    return [node.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }];
  }));

  els.graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (!nodes.length) {
    els.graph.innerHTML = '<text x="50%" y="50%" text-anchor="middle" class="svg-muted">No delegation lineage replayed.</text>';
    return;
  }

  const edgeMarkup = edges.map((edge) => {
    const from = positions.get(edge.from) || center;
    const to = positions.get(edge.to) || center;
    return `
      <g class="graph-edge ${edge.active ? 'active' : 'revoked'}">
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>
        <text x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 8}" text-anchor="middle">${escapeHtml(edge.scopes.join(', ') || 'authority')}</text>
      </g>
    `;
  }).join('');

  const nodeMarkup = nodes.map((node) => {
    const point = positions.get(node.id);
    return `
      <g class="graph-node">
        <circle cx="${point.x}" cy="${point.y}" r="42"></circle>
        <text x="${point.x}" y="${point.y - 4}" text-anchor="middle">${escapeHtml(shorten(node.id, 18))}</text>
        <text x="${point.x}" y="${point.y + 14}" text-anchor="middle" class="scope-count">${node.scopes.length} scopes</text>
      </g>
    `;
  }).join('');

  els.graph.innerHTML = `${edgeMarkup}${nodeMarkup}`;
}

function renderInspector(replay) {
  els.inspector.innerHTML = `
    ${metricCard('Judgment chain', replay.judgmentChain.length, replay.judgmentChain.map((j) => `${j.id}: ${j.decision || 'observed'}`))}
    ${metricCard('Delegations', replay.delegations.length, replay.delegations.map((d) => `${d.from} → ${d.to} (${d.active ? 'active' : 'revoked'})`))}
    ${metricCard('Verification flow', replay.verificationFlow.length, replay.verificationFlow.map((v) => `${v.id}: ${v.state}`))}
    ${metricCard('Authority scopes', replay.authorityScopes.length, replay.authorityScopes.map((a) => `${a.principal}: ${a.scopes.join(', ') || 'none'}`))}
    ${metricCard('Termination state', replay.terminationState.status, [replay.terminationState.reason, replay.terminationState.eventId].filter(Boolean))}
    ${metricCard('Tamper detection', replay.tamperHighlights.length, replay.tamperHighlights.flatMap((t) => t.reasons.map((reason) => `${t.eventId}: ${reason}`)), replay.tamperHighlights.length ? 'danger' : 'ok')}
  `;
}

function metricCard(title, value, lines, tone = '') {
  const body = lines.length ? lines.slice(0, 5).map((line) => `<li>${escapeHtml(String(line))}</li>`).join('') : '<li>No replay evidence yet.</li>';
  return `
    <article class="metric-card ${tone}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <ul>${body}</ul>
    </article>
  `;
}

function renderDetail(replay) {
  const event = replay.events.find((item) => item.id === state.selectedEventId);
  els.eventDetail.textContent = event ? JSON.stringify(event, null, 2) : 'Select an event to inspect normalized replay evidence.';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function shorten(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

render();
