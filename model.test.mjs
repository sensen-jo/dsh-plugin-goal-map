import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_KIND, FLOW_TARGET, FLOW_LIMITS, extractFlowEvent, createFlowDefinition, createFlowBuilder, buildFlowModel } from './model.mjs';

// Synthetic fixtures only: never read real Session history, raw chat or profiles.
const event = (type, seq, data = {}, time = seq * 10) => ({ type, seq, time, data });
const start = (seq, turn = 1) => event('turn/start', seq, { turn });
const end = (seq, turn = 1, reason = 'completed') => event('turn/end', seq, { turn, reason: { kind: reason } });
const call = (seq, callId = 'call-1', name = 'pwsh', extra = {}) => event('tool/call', seq, { turn: 1, step: 0, callId, name, arguments: '{"secret":"PRIVATE"}', ...extra });
const result = (seq, callId = 'call-1', isError = false, extra = {}) => event('tool/result', seq, { turn: 1, step: 0, message: { source: { kind: 'tool', callId }, isError, content: ['PRIVATE_OUTPUT'] }, ...extra });
const todo = (seq, items, turn = 1) => event('todo/write', seq, { todos: items, turn });
const item = (content = 'Implement', status = 'pending') => ({ content, status });
let forbiddenReads = [];
const poison = (target, key) => Object.defineProperty(target, key, { get() { forbiddenReads.push(key); throw new Error(`MUST_NOT_READ_${key}`); }, configurable: true });
afterEach(() => { const reads = forbiddenReads; forbiddenReads = []; assert.deepEqual(reads, [], 'forbidden getter must not be accessed, even if an exception was caught'); });
const node = (raw, key = `k:${raw.seq}`) => ({ key, id: String(raw.seq), kind: FLOW_KIND, target: FLOW_TARGET, data: extractFlowEvent(raw) });
const timeline = (turn = 1, status = 'open', stepStatus = 'open') => ({ turnOrder: [turn], turns: new Map([[turn, { turn, status, ...(status === 'closed' ? { end: end(900, turn) } : {}), steps: [{ turn, step: 0, status: stepStatus, ...(stepStatus === 'closed' ? { end: event('step/end', 800, { turn, step: 0 }) } : {}) }] }]]) });
const baseInput = flowSnapshot => ({ title: 'Synthetic title', session: { running: false, openState: 'open' }, connection: 'connected', projectionState: 'ready', flowSnapshot });

test('ignores assistant/thinking/message/attempt before touching data or bodies', () => {
  for (const type of ['assistant/message', 'assistant/attempt', 'assistant/reasoning', 'reasoning', 'thinking', 'user/message', 'developer/message', 'system/message', 'request/header']) {
    const ignored = poison({ type, seq: 3 }, 'data');
    poison(ignored, 'content');
    assert.equal(extractFlowEvent(ignored), null);
    assert.equal(createFlowDefinition().match(ignored), null);
    const builder = createFlowBuilder();
    assert.equal(builder.apply([ignored]).events.length, 0);
  }
});

test('uses ConversationLocation nested step/turn, then event.data fallback', () => {
  const location = { kind: 'step', turn: { turn: 7 }, step: { step: 4 } };
  poison(location.turn, 'start');
  poison(location.step, 'data');
  assert.deepEqual(extractFlowEvent(call(2), location), { type: 'tool/call', seq: 2, time: 20, turn: 7, step: 4, callId: 'call-1', name: 'pwsh' });
  assert.equal(extractFlowEvent(start(3, 5), { kind: 'unresolved' }).turn, 5);
  assert.equal(extractFlowEvent(start(3), { kind: 'turn', turn: { turn: 9 } }).turn, 9);
});

test('tool call default is name-only and never reads arguments/description', () => {
  const raw = call(2);
  poison(raw.data, 'arguments');
  poison(raw.data, 'description');
  const safe = extractFlowEvent(raw);
  assert.deepEqual(Object.keys(safe), ['type', 'seq', 'time', 'turn', 'step', 'callId', 'name']);
  assert.ok(!JSON.stringify(safe).includes('PRIVATE'));
});

test('optional description is explicit, bounded, plain, and never parses todo_write params', () => {
  const safe = extractFlowEvent(call(1, 'c', 'pwsh', { arguments: JSON.stringify({ description: `\n${'a'.repeat(200)}`, secret: 'PRIVATE' }) }), undefined, { allowToolDescription: true });
  assert.equal(safe.label.length, FLOW_LIMITS.description);
  assert.ok(!JSON.stringify(safe).includes('PRIVATE'));
  const planCall = call(2, 'todo-c', 'todo_write');
  poison(planCall.data, 'arguments');
  assert.equal(extractFlowEvent(planCall, undefined, { allowToolDescription: true }).label, undefined);
  assert.equal(extractFlowEvent(call(4, 'x', 'pwsh', { arguments: '{bad' }), undefined, { allowToolDescription: true }).label, undefined);
});

test('current tool/result reads only source.callId/isError and error.code', () => {
  const raw = result(5, 'c', true, { error: { code: 'UNKNOWN_TOOL' } });
  poison(raw.data.message, 'content');
  poison(raw.data.message, 'toolCallId');
  poison(raw.data, 'meta');
  poison(raw.data.error, 'reason');
  poison(raw.data.error, 'name');
  assert.deepEqual(extractFlowEvent(raw), { type: 'tool/result', seq: 5, time: 50, turn: 1, step: 0, callId: 'c', isError: true, errorCode: 'UNKNOWN_TOOL' });
});

test('arbitrary private error codes are dropped, known codes retained only on error', () => {
  assert.equal(extractFlowEvent(result(2, 'c', true, { error: { code: 'SECRET_TOKEN_123' } })).errorCode, undefined);
  const raw = result(3, 'c', false);
  poison(raw.data, 'error');
  assert.equal(extractFlowEvent(raw).errorCode, undefined);
});

test('formal todo/write validates schema, copies exact allowed fields, bounds text/items', () => {
  const source = Array.from({ length: 83 }, (_, i) => ({ content: `${i}${'x'.repeat(400)}`, status: 'pending', private: 'PRIVATE' }));
  const safe = extractFlowEvent(todo(1, source));
  assert.equal(safe.todos.length, 80);
  assert.equal(safe.todosTruncated, 3);
  assert.equal(safe.todos[0].content.length, 240);
  assert.deepEqual(Object.keys(safe.todos[0]), ['content', 'status']);
  assert.equal(extractFlowEvent(todo(2, [{ content: 'x', status: 'done' }])), null);
  assert.equal(extractFlowEvent(todo(3, [{ title: 'not official', status: 'pending' }])), null);
});

test('turn/end completed is based on installed reason.kind, not a guessed flag', () => {
  assert.equal(extractFlowEvent(end(1)).completed, true);
  for (const reason of ['aborted', 'error', 'blocked', 'interrupted', 'forked', 'max-tokens']) assert.equal(extractFlowEvent(end(2, 1, reason)).completed, false);
  assert.equal(extractFlowEvent(event('turn/end', 3, { turn: 1, completed: true, reason: { kind: 'future' } })).completed, false);
});

test('definition has exact SDK callback signatures and replace semantics', () => {
  const definition = createFlowDefinition();
  assert.equal(definition.kind, FLOW_KIND);
  assert.equal(definition.target, FLOW_TARGET);
  assert.deepEqual(definition.match(start(0)), { id: '0', role: 'start' });
  const context = { key: 'context-key', id: '0' };
  const first = definition.start(context, { event: start(0), location: { kind: 'turn', turn: { turn: 2 } } });
  assert.equal(first.turn, 2);
  const second = definition.update({ ...context, state: first }, { event: end(0, 2), location: { kind: 'session' } });
  const view = definition.buildViewNode({ ...context, state: second });
  assert.deepEqual(Object.keys(view), ['key', 'id', 'kind', 'target', 'anchorSeq', 'data']);
  assert.equal(view.anchorSeq, 0);
  assert.equal(view.data.type, 'turn/end');
  assert.equal(definition.buildViewNode({ state: null }), null);
});

test('builder supports SDK replace/apply, key and seq dedup, stable snapshots', () => {
  const builder = createFlowBuilder();
  const a = builder.replace({ nodes: [node(call(3), 'same')], timeline: timeline() });
  assert.equal(a.tools[0].status, 'running');
  const duplicate = builder.apply({ upserts: [node(call(3), 'same')], timeline: timeline() });
  assert.equal(duplicate, a);
  assert.equal(builder.snapshot(), a);
  const replaced = builder.apply({ upserts: [node(result(3), 'same')] });
  assert.equal(replaced.events.length, 1);
  assert.equal(replaced.tools[0].name, 'unknown');
  assert.equal(replaced.tools[0].status, 'returned');
  const again = builder.apply({ upserts: [node(result(3), 'different-key')] });
  assert.equal(again.events.length, 1);
});

test('out-of-order arrival pairs by id and seq, never reopens a settled call', () => {
  const builder = createFlowBuilder();
  assert.equal(builder.apply([result(5)]).tools[0].status, 'returned');
  const safe = builder.apply([call(2)]);
  assert.deepEqual(safe.events.map(e => e.seq), [2, 5]);
  assert.equal(safe.tools[0].status, 'returned');
  assert.equal(safe.tools[0].name, 'pwsh');
  assert.equal(safe.tools[0].time, 20);
  assert.equal(safe.tools[0].endTime, 50);
});

test('out-of-window result is unknown-name returned, not fabricated success', () => {
  const snapshot = createFlowBuilder().replace([result(8)]);
  assert.equal(snapshot.tools[0].name, 'unknown');
  assert.equal(snapshot.tools[0].status, 'returned');
  const model = buildFlowModel(baseInput(snapshot));
  assert.equal(model.activity[0].status, 'returned');
  assert.match(model.activity[0].detail, /不代表/);
});

test('isError=false returned does not complete background or goal work', () => {
  const snapshot = createFlowBuilder().replace([call(2, 'sub', 'subagent'), result(3, 'sub', false), end(4)]);
  const model = buildFlowModel(baseInput(snapshot));
  assert.equal(snapshot.tools[0].status, 'returned');
  assert.equal(model.status.key, 'idle');
  assert.equal(model.goal.status, 'unknown');
  assert.ok(!JSON.stringify(model).includes('"status":"done"'));
});

test('known cancellation tool errors interrupted, other isError true errors', () => {
  const builder = createFlowBuilder();
  assert.equal(builder.replace([call(1), result(2, 'call-1', true, { error: { code: 'ABORTED' } })]).tools[0].status, 'interrupted');
  assert.equal(builder.replace([call(1), result(2, 'call-1', true, { error: { code: 'UNKNOWN_TOOL' } })]).tools[0].status, 'error');
});

test('closed event step/turn without result interrupts even a completed turn', () => {
  const builder = createFlowBuilder();
  assert.equal(builder.replace([call(1), event('step/end', 2, { turn: 1, step: 0 })]).tools[0].status, 'interrupted');
  assert.equal(builder.replace([call(1), end(2)]).tools[0].status, 'interrupted');
  assert.equal(builder.snapshot().latestTurn.completed, true);
});

test('timeline-only close interrupts dangling calls without reading closed bodies', () => {
  const builder = createFlowBuilder();
  builder.replace({ nodes: [node(call(1))], timeline: timeline() });
  const t = timeline(1, 'closed');
  poison(t.turns.get(1).end.data.reason, 'error');
  const snapshot = builder.apply({ upserts: [], timeline: t });
  assert.equal(snapshot.tools[0].status, 'interrupted');
  assert.equal(snapshot.latestTurn.reason, 'completed');
  assert.equal(builder.replace({ nodes: [node(call(1))], timeline: timeline(1, 'open', 'closed') }).tools[0].status, 'interrupted');
});

test('PTC names/types correct; settlement ignores content and arguments', () => {
  const ptcStart = event('tool/ptc-dispatch-start', 1, { subCallId: 'root:ptc:1', rootCallId: 'root', parentCallId: 'root', name: 'read' });
  poison(ptcStart.data, 'arguments');
  const ptcEnd = event('tool/ptc-dispatch', 2, { subCallId: 'root:ptc:1', name: 'read', isError: false });
  poison(ptcEnd.data, 'content');
  poison(ptcEnd.data, 'arguments');
  const snapshot = createFlowBuilder().replace([ptcEnd, ptcStart]);
  assert.equal(snapshot.tools.length, 1);
  assert.equal(snapshot.tools[0].name, 'read');
  assert.equal(snapshot.tools[0].status, 'returned');
  assert.equal(extractFlowEvent(event('tool/ptcdispatch', 3, {})), null);
});

test('todo reset [] replaces whole plan; stale older writes never win', () => {
  const builder = createFlowBuilder();
  builder.apply([todo(4, [item('New')])]);
  assert.equal(builder.apply([todo(1, [item('Old')])]).latestPlan.todos[0].content, 'New');
  assert.equal(builder.apply([todo(7, [])]).latestPlan.todos.length, 0);
  assert.equal(buildFlowModel(baseInput(builder.snapshot())).plan.total, 0);
});

test('same-key plan correction/deletion does not leave a cached ghost plan', () => {
  const builder = createFlowBuilder();
  builder.replace({ nodes: [node(todo(3, [item('one')]), 'p')] });
  assert.equal(builder.apply({ upserts: [node(todo(3, []), 'p')] }).latestPlan.todos.length, 0);
  const invalid = { key: 'p', kind: FLOW_KIND, target: FLOW_TARGET, data: { type: 'todo/write', seq: 3, time: 30, todos: [{ status: 'bad' }] } };
  assert.equal(builder.apply({ upserts: [invalid] }).latestPlan, null);
});

test('events bounded last600 ordered, old apply cannot evict new facts', () => {
  const builder = createFlowBuilder();
  const snapshot = builder.replace(Array.from({ length: 650 }, (_, i) => start(i, i)));
  assert.equal(snapshot.events.length, 600);
  assert.equal(snapshot.events[0].seq, 50);
  assert.equal(snapshot.lastSeq, 649);
  assert.equal(snapshot.lastTime, 6490);
  assert.equal(snapshot.truncated.events, 50);
  assert.equal(builder.apply([start(2, 2)]), snapshot);
});

test('formal plan survives event tail trimming, replace resets it', () => {
  const builder = createFlowBuilder();
  const snapshot = builder.replace([todo(0, [item('Keep')]), ...Array.from({ length: 650 }, (_, i) => start(i + 1, 2))]);
  assert.equal(snapshot.latestPlan.todos[0].content, 'Keep');
  assert.equal(snapshot.events.some(e => e.type === 'todo/write'), false);
  assert.equal(builder.replace([start(900, 3)]).latestPlan, null);
});

test('tools bounded with running protection max24, total32, recentresults max12', () => {
  const builder = createFlowBuilder();
  const raw = [...Array.from({ length: 30 }, (_, i) => call(i, `run-${i}`)), ...Array.from({ length: 20 }, (_, i) => result(100 + i, `settled-${i}`))];
  const snapshot = builder.replace(raw);
  assert.equal(snapshot.tools.length, 32);
  assert.equal(snapshot.tools.filter(t => t.status === 'running').length, 24);
  assert.equal(snapshot.tools.filter(t => t.status === 'returned').length, 8);
  assert.equal(snapshot.truncated.running, 6);
  assert.equal(snapshot.truncated.results, 12);
  assert.equal(snapshot.truncated.tools, 18);
  assert.ok(snapshot.tools.some(t => t.callId === 'settled-19'));
  assert.equal(builder.replace(raw.filter(e => e.type === 'tool/result')).tools.length, 12);
});

test('incremental trimming carries bounded running calls until later close', () => {
  const builder = createFlowBuilder();
  builder.apply([call(0)]);
  const snapshot = builder.apply(Array.from({ length: 650 }, (_, i) => start(i + 1, 1)));
  assert.equal(snapshot.tools[0].status, 'running');
  assert.equal(builder.apply([end(700)]).tools[0].status, 'interrupted');
});

test('prior-turn plan historical and counts literal, never fabricated percentage', () => {
  const snapshot = createFlowBuilder().replace([todo(2, [item('A', 'completed'), item('B', 'in_progress')]), start(8, 2)]);
  const model = buildFlowModel(baseInput(snapshot));
  assert.equal(model.plan.historical, true);
  assert.equal(model.plan.completed, 1);
  assert.equal(model.plan.total, 2);
  assert.match(model.plan.label, /上一轮/);
  assert.ok(!JSON.stringify(model).match(/percent|percentage|progressPercent|%/i));
});

test('formal projection goal wins, session title fallback not assistant body', () => {
  const input = { ...baseInput(createFlowBuilder().empty), title: 'Fallback', goalProjection: { goal: { objective: 'Formal goal', phase: 'active' } } };
  poison(input, 'messages');
  poison(input.session, 'history');
  poison(input.session, 'lastAgentError');
  const model = buildFlowModel(input);
  assert.equal(model.goal.text, 'Formal goal');
  assert.equal(model.goal.source, 'goal-projection');
  assert.equal(buildFlowModel({ ...input, goalProjection: null }).goal.text, 'Fallback');
});

test('formal todos [] authoritative reset; projection source preserved', () => {
  const flowSnapshot = createFlowBuilder().replace([todo(2, [item('History')])]);
  const input = { ...baseInput(flowSnapshot), todosProjection: [] };
  assert.equal(buildFlowModel(input).plan.total, 0);
  const model = buildFlowModel({ ...input, todosProjection: [item('Official', 'completed')] });
  assert.equal(model.plan.items[0].source, 'todos-projection');
  assert.equal(model.plan.completed, 1);
});

test('plan truncation metadata covers arrays and wrapped projections without borrowing event omissions', () => {
  const entries=Array.from({length:81},(_,i)=>item('Step '+i,i<80?'completed':'pending'));
  const snapshot=createFlowBuilder().replace([todo(2,entries)]);
  for(const todosProjection of [entries,{todos:entries}]) {
    const model=buildFlowModel({...baseInput(snapshot),todosProjection});
    assert.equal(model.plan.total,80);assert.equal(model.plan.omitted,1);assert.equal(model.plan.truncated,true);
    assert(model.warnings.some(text=>text.includes('不计算整体计划百分比')));
  }
  const complete=buildFlowModel({...baseInput(snapshot),todosProjection:{todos:[item('New') ]}});
  assert.equal(complete.plan.omitted,0);assert.equal(complete.plan.truncated,false);
  assert(!complete.warnings.some(text=>text.includes('计划条目超出')));
});

test('malformed formal plan cannot silently become a valid progress denominator from an older event', () => {
  const snapshot=createFlowBuilder().replace([todo(2,[item('Older','completed')])]);
  const model=buildFlowModel({...baseInput(snapshot),todosProjection:[{content:'New',status:'unrecognized'}]});
  assert.equal(model.plan.invalid,true);
  assert.equal(buildFlowModel({...baseInput(snapshot),todosProjection:null}).plan.invalid,false);
  assert.equal(buildFlowModel({...baseInput(snapshot),todosProjection:[]}).plan.invalid,false);
});

test('retained event plan carries its omitted count into canonical progress scope', () => {
  const snapshot=createFlowBuilder().replace([todo(2,Array.from({length:83},()=>item()))]);
  const model=buildFlowModel({...baseInput(snapshot),todosProjection:undefined});
  assert.equal(model.plan.omitted,3);assert.equal(model.plan.truncated,true);
  assert.equal(model.plan.items.length,80);
  const reset=buildFlowModel({...baseInput(snapshot),todosProjection:[]});
  assert.equal(reset.plan.omitted,0);assert.equal(reset.plan.truncated,false);
});

test('connection, pending question and live session have truthful precedence', () => {
  const input = { ...baseInput(createFlowBuilder().empty), uiStatus: { waitingForInput: true }, session: { running: true } };
  assert.equal(buildFlowModel(input).status.key, 'waiting-input');
  assert.equal(buildFlowModel({ ...input, connection: 'disconnected' }).status.key, 'disconnected');
  assert.equal(buildFlowModel({ ...input, connection: 'connecting' }).status.key, 'connecting');
  assert.equal(buildFlowModel({ ...input, uiStatus: { running: true }, session: {} }).status.key, 'running');
  assert.equal(buildFlowModel({ ...input, uiStatus: { pendingQuestions: 1 } }).status.key, 'waiting-input');
});

test('invalid goal objectives cannot contribute completion, pause or block phases', () => {
  for (const objective of ['', '   ', null, undefined, 42, {}]) {
    for (const phase of ['complete', 'paused', 'blocked']) {
      for (const running of [true, false]) {
        const goal={objective,phase};
        const model=buildFlowModel({...baseInput(createFlowBuilder().empty),session:{running},goalProjection:{goal}});
        assert.equal(model.goal.source,'session-title');
        assert.equal(model.goal.status,'unknown');
        assert.equal(model.status.key,running?'running':'idle');
      }
    }
  }
});

test('formal paused or blocked goals suppress current execution despite retained running flags', () => {
  for(const phase of ['paused','blocked']) {
    const model=buildFlowModel({...baseInput(createFlowBuilder().empty),session:{running:true},uiStatus:{running:true},goalProjection:{goal:{objective:'Goal',phase}}});
    assert.equal(model.status.key,phase);
    assert.equal(buildFlowModel({...baseInput(createFlowBuilder().empty),connection:'disconnected',session:{running:true},goalProjection:{goal:{objective:'Goal',phase}}}).status.key,'disconnected');
  }
});

test('stale/loading formal projections warn; stale completion is not current completion', () => {
  const input = { ...baseInput(createFlowBuilder().empty), goalProjection: { goal: { objective: 'Goal', phase: 'complete' } }, projectionState: 'error' };
  const model = buildFlowModel(input);
  assert.equal(model.status.key, 'stale');
  assert.ok(model.warnings.some(w => /过期/.test(w)));
  assert.equal(buildFlowModel({ ...input, projectionState: 'loading' }).status.key, 'loading');
  assert.equal(buildFlowModel({ ...input, projectionState: 'ready' }).status.key, 'completed');
});

test('children dedup, unknown by default; true timing only indicates last turn', () => {
  const input = { ...baseInput(createFlowBuilder().empty), childCatalog: [{ id: 'c1', label: 'A' }, { id: 'c1', label: 'duplicate' }, { id: 'c2' }, { id: 'c3' }], childStates: { c1: { running: false, subagentTiming: { lastTurnCompleted: true } }, c3: { running: true, projectionState: 'error' } } };
  poison(input.childStates.c1, 'messages');
  const model = buildFlowModel(input);
  assert.equal(model.children.length, 3);
  assert.equal(model.children[0].status, 'completed');
  assert.match(model.children[0].detail, /不等于/);
  assert.equal(model.children[1].status, 'unknown');
  assert.equal(model.children[2].status, 'unknown');
});

test('recent events sanitized again, bounded; no private args/result metadata', () => {
  const snapshot = createFlowBuilder().replace(Array.from({ length: 30 }, (_, i) => call(i, `c-${i}`)));
  const model = buildFlowModel(baseInput(snapshot));
  assert.equal(model.recent.length, 12);
  const output = JSON.stringify({ snapshot, model });
  assert.ok(!output.includes('PRIVATE'));
  assert.ok(!output.includes('arguments'));
  assert.ok(!output.includes('content'));
  assert.ok(Object.isFrozen(snapshot.events));
  assert.ok(Object.isFrozen(model.plan.items));
});

test('numeric validation rejects malformed ids/seq while safe canonical defaults remain', () => {
  assert.equal(extractFlowEvent(start(-1)), null);
  assert.equal(extractFlowEvent(start(Number.MAX_SAFE_INTEGER + 1)), null);
  assert.equal(extractFlowEvent(call(1, 'not a safe id')), null);
  assert.equal(extractFlowEvent(start(2, 1), { kind: 'turn', turn: { turn: NaN } }).turn, 1);
  const model = buildFlowModel();
  assert.equal(model.status.key, 'unknown');
  assert.equal(model.plan.total, 0);
  assert.deepEqual(model.recent, []);
});

test('sensitive getter counters stay zero, not merely swallowed exceptions', () => {
  let reads = 0;
  const forbid = (target, key) => Object.defineProperty(target, key, { get() { reads++; return 'PRIVATE_MUST_NOT_READ'; } });
  const ignored = { type: 'assistant/reasoning', seq: 1 }; forbid(ignored, 'data'); forbid(ignored, 'content');
  const c = call(2); forbid(c.data, 'arguments'); forbid(c.data, 'description');
  const r = result(3); forbid(r.data.message, 'content'); forbid(r.data, 'meta'); forbid(r.data, 'error');
  const t = end(4); forbid(t.data.reason, 'error'); forbid(t.data.reason, 'message');
  const events = [ignored, c, r, t]; const b = createFlowBuilder();
  for (const raw of events) { const d = createFlowDefinition(), matched = d.match(raw); if (!matched) continue; const match = { event: raw, location: { kind: 'session' } }; const state = d.start({}, match); d.buildViewNode({ key: 'k'+raw.seq, state }); }
  b.replace(events); const session = { running: false }; forbid(session, 'lastAgentError'); forbid(session, 'messages');
  buildFlowModel({ ...baseInput(b.snapshot()), session });
  assert.equal(reads, 0);
});

test('formal projection beats old event-plan attribution and null reset never current', () => {
  const flowSnapshot = createFlowBuilder().replace([todo(2, [item('old')]), start(5, 2)]);
  const current = buildFlowModel({ ...baseInput(flowSnapshot), todosProjection: [item('new')] });
  assert.equal(current.plan.historical, false); assert.equal(current.plan.items[0].title, 'new');
  const noTail = createFlowBuilder().replace([todo(2, [item('old')])]);
  assert.equal(buildFlowModel({ ...baseInput(noTail), todosProjection: null }).plan.historical, true);
  assert.equal(buildFlowModel({ ...baseInput(flowSnapshot), todosProjection: [] }).plan.historical, false);
});

test('SDK error boundary statuses use existence only and max-token is not done', () => {
  let reads = 0; const promptError = {}; Object.defineProperty(promptError, 'message', { get(){ reads++; return 'PRIVATE'; } });
  assert.equal(buildFlowModel({ ...baseInput(createFlowBuilder().empty), session: { running: false, promptError } }).status.key, 'error');
  const snapshot = createFlowBuilder().replace([end(4, 1, 'max-tokens')]);
  assert.equal(buildFlowModel(baseInput(snapshot)).status.key, 'interrupted'); assert.equal(reads, 0);
});

test('child pending interaction wins over running without reading question content', () => {
  let reads = 0; const pendingInteraction = { key:'q1',kind:'approval',sessionId:'child' };Object.defineProperty(pendingInteraction,'question',{get(){reads++;return'PRIVATE';}});
  const input={...baseInput(createFlowBuilder().empty),childCatalog:[{id:'child',label:'Test'}],childStates:{child:{running:true,pendingInteraction}}};
  const model=buildFlowModel(input);assert.equal(model.children[0].status,'waiting');assert.match(model.children[0].detail,/等待/);assert.equal(reads,0);
});

test('child budget prefers live/waiting branches and reports every hidden item',()=>{
  const childCatalog=Array.from({length:50},(_,i)=>({id:'child-'+i,label:'Child '+i}));const childStates=Object.fromEntries(childCatalog.map(c=>[c.id,{running:false}]));childStates['child-49']={running:true};childStates['child-48']={running:true,pendingInteraction:{key:'qa',kind:'approval'}};
  const model=buildFlowModel({...baseInput(createFlowBuilder().empty),childCatalog,childStates});assert.equal(model.children.length,48);assert.equal(model.children[0].sessionId,'child-48');assert.equal(model.children[1].sessionId,'child-49');assert.equal(model.childrenTotal,50);assert.equal(model.childrenHidden,2);assert(model.warnings.some(w=>w.includes('50')&&w.includes('48')&&w.includes('查找')));
});
