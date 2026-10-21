import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowOverview } from './presentation.mjs';
import { buildFlowModel } from './model.mjs';

// Synthetic canonical fixtures only: never open real Sessions, files, or events.
const item = (title, status = 'pending') => ({ content: title, status });
const canonical = (statuses = [], overrides = {}) => buildFlowModel({
  session: { running: true, openState: 'open' },
  connection: 'connected',
  projectionState: 'ready',
  todosProjection: statuses.map((status, index) => item(`Step ${index + 1}`, status)),
  ...overrides,
});
const withStatus = (key, statuses = ['in_progress', 'pending']) => ({ ...canonical(statuses), status: { key } });
const tool = (id, status, title = id) => ({ id, title, status });
const child = (id, status, title = id) => ({ id, title, status });
let forbiddenReads = [];
const forbid = (target, key, throwing = true) => Object.defineProperty(target, key, {
  enumerable: true,
  configurable: true,
  get() {
    forbiddenReads.push(key);
    if (throwing) throw new Error(`MUST_NOT_READ_${key}`);
    return 'PRIVATE_SENTINEL_MUST_NOT_READ';
  },
});
afterEach(() => {
  const reads = forbiddenReads;
  forbiddenReads = [];
  assert.deepEqual(reads, [], 'forbidden getters must never be accessed, not even inside try/catch');
});
const noCurrent = overview => {
  assert.deepEqual(overview.currentItems, []);
  assert.equal(overview.focusId, null);
  assert.equal(overview.focusKind, null);
};
const noCurrentOrNext = overview => {
  noCurrent(overview);
  assert.equal(overview.nextItem, null);
  assert.equal(overview.plan.actionable, false);
};

// Basics and plan semantics.
test('missing canonical data is unknown, not completed, with no percentage or invented plan', () => {
  const overview = buildFlowOverview();
  assert.equal(overview.statusKey, 'unknown');
  assert.equal(overview.tone, 'neutral');
  assert.equal(overview.liveKnown, false);
  noCurrentOrNext(overview);
  assert.deepEqual(overview.plan, { total: 0, completed: 0, activeCount: 0, actionable: false, historical: false, pendingCount: 0, progressLabel: '尚无正式计划' });
  assert.deepEqual(overview.counts, { toolsRunning: 0, toolsReturned: 0, toolsAttention: 0, childrenRunning: 0, childrenWaiting: 0 });
  assert.deepEqual(overview.attention, []);
  assert.doesNotMatch(JSON.stringify(overview), /%|NaN|Infinity|undefined/);
});

test('accepts the actual canonical buildFlowModel output without adapters', () => {
  const model = canonical(['completed', 'in_progress', 'pending']);
  const overview = buildFlowOverview(model);
  assert.ok(Object.isFrozen(model));
  assert.equal(overview.liveKnown, true);
  assert.equal(overview.statusKey, 'running');
  assert.equal(overview.tone, 'running');
  assert.deepEqual(overview.currentItems, [{ id: `plan:${model.plan.items[1].id}`, kind: 'plan', title: 'Step 2', status: 'in_progress', index: 2 }]);
  assert.equal(overview.focusId, 'plan:todo:projection:1');
  assert.equal(overview.focusKind, 'plan');
  assert.equal(overview.plan.completed, 1);
  assert.equal(overview.plan.total, 3);
  assert.equal(overview.plan.activeCount, 1);
  assert.equal(overview.plan.actionable, true);
  assert.match(overview.headline, /计划标记进行中：Step 2/);
});

test('invalid and truncated canonical plans never supply live current or next markers', () => {
  for(const flag of ['invalid','truncated']) {
    const model=canonical(['in_progress','pending']);
    const value=buildFlowOverview({...model,plan:{...model.plan,[flag]:true}});
    noCurrentOrNext(value);assert.equal(value.plan.actionable,false);
    assert.match(value.explanation,/无效或已截断/);
    assert.equal(value.plan.total,2);
  }
});

test('only exact formal in_progress can be a current item', () => {
  const model = {
    status: { key: 'running' },
    plan: { historical: false, items: ['pending', 'running', 'active', 'completed', 'in_progress', 'future', undefined].map((status, i) => ({ id: `p${i}`, title: `P${i}`, status })) },
    activity: [tool('tool:run', 'running')],
    children: [child('child-run', 'running')],
  };
  const overview = buildFlowOverview(model);
  assert.deepEqual(overview.currentItems.map(row => row.id), ['plan:p4']);
  assert.equal(overview.plan.activeCount, 1);
  assert.equal(overview.plan.completed, 1);
  assert.equal(overview.plan.pendingCount, 1);
  assert.equal(overview.focusId, 'plan:p4');
  assert.equal(overview.nextItem.index, 1, 'the first pending is not lost because it precedes an active item');
});

test('multiple active declarations are all listed, explicitly counted, and never arbitrarily focused', () => {
  const overview = buildFlowOverview(canonical(['in_progress', 'pending', 'in_progress', 'pending']));
  assert.equal(overview.currentItems.length, 2);
  assert.equal(overview.plan.activeCount, 2);
  assert.match(overview.headline, /2 项标记进行中/);
  assert.doesNotMatch(overview.headline, /Step 1|Step 3/);
  assert.match(overview.explanation, /不任选/);
  assert.match(overview.explanation, /不据此推断同时执行/);
  assert.equal(overview.focusId, null);
  assert.equal(overview.focusKind, null);
  assert.deepEqual(overview.currentItems.map(row => row.index), [1, 3]);
  assert.equal(overview.nextItem.index, 2);
});

test('all-pending plan has no current but a first pending plan-order reference', () => {
  const overview = buildFlowOverview(canonical(['pending', 'pending']));
  noCurrent(overview);
  assert.equal(overview.nextItem.id, 'plan:todo:projection:0');
  assert.equal(overview.nextItem.index, 1);
  assert.equal(overview.nextItem.status, 'pending');
  assert.match(overview.nextItem.note, /计划顺序参考/);
  assert.match(overview.nextItem.note, /不是.*执行承诺/);
  assert.match(overview.nextItem.note, /不表示依赖/);
  assert.match(overview.explanation, /暂无.*|没有正式 in_progress/);
});

test('without active items the first pending is chosen in list order, not by title or id', () => {
  const model = { status: { key: 'running' }, plan: { items: [
    { id: 'z', title: 'Z completed', status: 'completed' },
    { id: 'y', title: 'Z first pending', status: 'pending' },
    { id: 'a', title: 'A later pending', status: 'pending' },
  ] } };
  const overview = buildFlowOverview(model);
  assert.equal(overview.nextItem.id, 'plan:y');
  assert.equal(overview.nextItem.index, 2);
  assert.equal(overview.nextPolicy, 'first-pending');
});

test('first pending remains visible even before several active items without reordering the plan', () => {
  const overview = buildFlowOverview(canonical(['pending', 'in_progress', 'pending', 'in_progress', 'completed', 'pending', 'pending']));
  assert.equal(overview.nextItem.index, 1);
  assert.equal(overview.nextItem.id, 'plan:todo:projection:0');
  assert.match(overview.nextNote, /正式计划原列表/);
  assert.match(overview.nextNote, /不因进行中项的位置跳过更早待办/);
});

test('pending before the final active is shown as a reference not an execution prediction', () => {
  const overview = buildFlowOverview(canonical(['pending', 'in_progress', 'completed']));
  assert.equal(overview.nextItem.index, 1);
  assert.match(overview.nextItem.note, /不是.*执行承诺/);
  assert.equal(overview.plan.pendingCount, 1);
  assert.equal(overview.plan.actionable, true);
});

test('completed items are never next or current; a completed plan does not complete a running parent', () => {
  const overview = buildFlowOverview(canonical(['completed', 'completed']));
  noCurrent(overview);
  assert.equal(overview.nextItem, null);
  assert.equal(overview.statusKey, 'running');
  assert.equal(overview.tone, 'running');
  assert.equal(overview.plan.completed, 2);
  assert.match(overview.plan.progressLabel, /非验收/);
  assert.doesNotMatch(overview.headline, /验收通过|任务已完成|全部完成/);
});

test('no plan does not fabricate steps, focus, percentages or progress from tool/child/goal records', () => {
  const model = { ...canonical(), activity: [tool('tool:x', 'running', 'Implement current feature')], children: [child('child-x', 'running', 'Finish task')], goal: { title: 'Goal', text: 'Steps mentioned here are not a plan' } };
  const overview = buildFlowOverview(model);
  noCurrentOrNext(overview);
  assert.equal(overview.plan.total, 0);
  assert.equal(overview.counts.toolsRunning, 1);
  assert.equal(overview.counts.childrenRunning, 1);
  assert.match(overview.headline, /尚未提供正式计划/);
  assert.doesNotMatch(overview.headline, /Implement|Finish|Goal/);
  assert.doesNotMatch(overview.plan.progressLabel, /%|0\s*\/\s*0/);
});

test('historical active/pending declarations never become current or next', () => {
  const model = canonical();
  const historical = { ...model, plan: { ...canonical(['in_progress', 'pending', 'completed']).plan, historical: true } };
  const overview = buildFlowOverview(historical);
  noCurrentOrNext(overview);
  assert.equal(overview.plan.historical, true);
  assert.equal(overview.plan.activeCount, 1, 'declaration count remains available for a historical lane');
  assert.equal(overview.plan.completed, 1);
  assert.equal(overview.plan.total, 3);
  assert.match(overview.headline, /只有历史计划/);
  assert.match(overview.plan.progressLabel, /历史计划.*非本轮进度/);
});

test('canonical previous-turn fallback plan is historical without presentation inferring turn attribution', () => {
  const model = buildFlowModel({ session: { running: true }, connection: 'connected', flowSnapshot: {
    latestPlan: { seq: 2, turn: 1, todos: [item('Old current', 'in_progress'), item('Old next')] },
    latestTurn: { turn: 2, status: 'open' },
  } });
  assert.equal(model.plan.historical, true);
  const overview = buildFlowOverview(model);
  noCurrentOrNext(overview);
  assert.match(overview.notices.join(' '), /历史计划不作为本轮当前项或下一项/);
});

// Availability guards override even a plausible active plan.
for (const connection of ['disconnected', 'offline', 'closed', 'connecting', 'reconnecting', 'future-connection', null, false]) {
  test(`connection ${String(connection)} prevents current/next claims despite canonical running`, () => {
    const overview = buildFlowOverview(canonical(['in_progress', 'pending']), { connection });
    noCurrentOrNext(overview);
    assert.equal(overview.liveKnown, false);
    assert.equal(overview.tone, 'stale');
    assert.equal(overview.plan.activeCount, 1);
    assert.equal(overview.modelStatusKey, 'running');
    assert.doesNotMatch(overview.headline, /Step 1|正在做|标记进行中/);
    assert.match(overview.countsLabel, /快照/);
  });
}

for (const key of ['disconnected', 'reconnecting', 'connecting', 'stale', 'loading', 'removed', 'unknown', 'new-unknown-status']) {
  test(`canonical status ${key} remains conservative on a connected socket`, () => {
    const overview = buildFlowOverview(withStatus(key));
    noCurrentOrNext(overview);
    assert.equal(overview.liveKnown, false);
    assert.doesNotMatch(overview.headline, /Step 1|正在做|标记进行中/);
    assert.equal(overview.statusKey, key === 'new-unknown-status' ? 'unknown' : key);
  });
}

test('default connection remains connected, but object-shaped connection is not silently treated as live', () => {
  assert.equal(buildFlowOverview(canonical(['in_progress'])).liveKnown, true);
  const connection = {};
  forbid(connection, 'state');
  const overview = buildFlowOverview(canonical(['in_progress', 'pending']), { connection });
  noCurrentOrNext(overview);
  assert.equal(overview.statusKey, 'disconnected');
});

for (const [projectionState, effective] of [['stale', 'stale'], ['error', 'stale'], ['loading', 'loading'], ['cold', 'loading']]) {
  test(`Host projectionState ${projectionState} suppresses a canonical running status`, () => {
    // Canonical model currently prioritizes a running Session over projection flags.
    const model = canonical(['in_progress', 'pending'], { projectionState });
    assert.equal(model.status.key, 'running');
    const overview = buildFlowOverview(model, { projectionState });
    noCurrentOrNext(overview);
    assert.equal(overview.statusKey, effective);
    assert.equal(overview.modelStatusKey, 'running');
    assert.equal(overview.liveKnown, false);
    assert.doesNotMatch(overview.headline, /Step 1|标记进行中/);
  });
}

test('projection common and goal/todos flags match canonical shape without reading values or bodies', () => {
  for (const [projectionState, effective] of [
    [{ state: 'error' }, 'stale'], [{ status: 'cold' }, 'loading'], [{ phase: 'stale' }, 'stale'],
    [{ stale: true }, 'stale'], [{ loading: true }, 'loading'],
    [{ state: 'ready', goal: { stale: true } }, 'stale'],
    [{ state: 'ready', todos: { status: 'loading' } }, 'loading'],
    [{ goal: 'error', todos: 'cold' }, 'stale'],
  ]) {
    forbid(projectionState, 'values');
    forbid(projectionState, 'content');
    const overview = buildFlowOverview(canonical(['in_progress', 'pending']), { projectionState });
    noCurrentOrNext(overview);
    assert.equal(overview.statusKey, effective);
  }
});

test('ready projection flags do not suppress a known running state or read unrelated options', () => {
  const options = { connection: 'connected', projectionState: { state: 'ready', goal: { loading: false }, todos: 'ready' } };
  forbid(options, 'session');
  forbid(options, 'chat');
  forbid(options.projectionState.goal, 'objective');
  const overview = buildFlowOverview(canonical(['in_progress', 'pending']), options);
  assert.equal(overview.currentItems.length, 1);
  assert.equal(overview.plan.actionable, true);
  assert.equal(overview.nextItem.index, 2);
});

test('unavailable state precedence keeps removed/offline unambiguous and stale stricter than loading', () => {
  assert.equal(buildFlowOverview(withStatus('removed'), { projectionState: 'loading' }).statusKey, 'removed');
  assert.equal(buildFlowOverview(withStatus('waiting-input'), { connection: 'reconnecting', projectionState: 'stale' }).statusKey, 'reconnecting');
  assert.equal(buildFlowOverview(withStatus('loading'), { projectionState: 'stale' }).statusKey, 'stale');
  assert.equal(buildFlowOverview(withStatus('stale'), { projectionState: 'loading' }).statusKey, 'stale');
});

test('without explicit Host flags presentation does not parse warnings to guess data freshness', () => {
  const model = { ...canonical(['in_progress', 'pending']) };
  forbid(model, 'warnings');
  const overview = buildFlowOverview(model);
  assert.equal(overview.statusKey, 'running');
  assert.equal(overview.currentItems.length, 1);
});

// Parent lifecycle is separate from plan declarations and branch/tool statuses.
test('waiting-input headline asks for reply/confirmation without reading content; stale flags override it', () => {
  const model = withStatus('waiting-input');
  forbid(model, 'pendingInteraction');
  forbid(model, 'questions');
  forbid(model.status, 'detail');
  const overview = buildFlowOverview(model);
  assert.equal(overview.headline, '需要你答复或确认');
  assert.equal(overview.tone, 'waiting');
  noCurrent(overview);
  assert.equal(overview.plan.activeCount, 1);
  assert.equal(overview.nextItem, null, 'pending interaction takes priority over plan-order reference');
  assert.equal(overview.plan.actionable, false);
  noCurrentOrNext(buildFlowOverview(model, { projectionState: 'stale' }));
});

test('idle does not promote an in_progress declaration or all-completed plan into execution/acceptance', () => {
  const overview = buildFlowOverview(withStatus('idle'));
  noCurrent(overview);
  assert.equal(overview.tone, 'neutral');
  assert.equal(overview.plan.actionable, true, 'plan can remain a reference without a current executing item');
  assert.equal(overview.nextItem.index, 2);
  assert.match(overview.headline, /空闲.*不代表任务已完成/);
  const allCompleted = buildFlowOverview(withStatus('idle', ['completed', 'completed']));
  assert.equal(allCompleted.plan.completed, 2);
  assert.equal(allCompleted.nextItem, null);
  assert.match(allCompleted.headline, /不代表任务已完成/);
});

for (const key of ['complete', 'completed']) {
  test(`${key} is a formal completion marker, never an acceptance verdict`, () => {
    const overview = buildFlowOverview(withStatus(key));
    noCurrentOrNext(overview);
    assert.equal(overview.tone, 'neutral', 'no fabricated success/verified tone');
    assert.match(overview.headline, /正式目标已标记完成.*非验收/);
    assert.match(overview.explanation, /不表示外部验收通过/);
  });
}

for (const key of ['paused', 'blocked', 'error', 'interrupted']) {
  test(`${key} does not present old plan declarations as currently executing`, () => {
    const overview = buildFlowOverview(withStatus(key));
    noCurrentOrNext(overview);
    assert.equal(overview.plan.activeCount, 1);
    assert.equal(overview.statusKey, key);
    assert.doesNotMatch(overview.headline, /Step 1|标记进行中/);
  });
}

test('waiting child and failed tools are attention records, not evidence that parent is blocked', () => {
  const model = { ...canonical(['in_progress', 'pending']), children: [child('c-wait', 'waiting', 'Needs confirmation'), child('c-run', 'running')], activity: [tool('tool:err', 'error'), tool('tool:int', 'interrupted')] };
  const overview = buildFlowOverview(model);
  assert.equal(overview.statusKey, 'running');
  assert.equal(overview.tone, 'running');
  assert.equal(overview.focusId, 'plan:todo:projection:0');
  assert.deepEqual(overview.attention, [
    { id: 'child:c-wait', kind: 'child', title: 'Needs confirmation', status: 'waiting' },
    { id: 'activity:tool:err', kind: 'activity', title: 'tool:err', status: 'error' },
    { id: 'activity:tool:int', kind: 'activity', title: 'tool:int', status: 'interrupted' },
  ]);
  assert.match(overview.explanation, /不代表父任务受阻/);
  assert.equal(overview.counts.childrenWaiting, 1);
  assert.equal(overview.counts.toolsAttention, 2);
});

test('attention never becomes a substitute current item or focus when a parent is idle or has no plan', () => {
  const overview = buildFlowOverview({ status: { key: 'idle' }, children: [child('c', 'waiting')], activity: [tool('tool:e', 'error')] });
  noCurrentOrNext(overview);
  assert.equal(overview.statusKey, 'idle');
  assert.equal(overview.tone, 'neutral');
  assert.equal(overview.attention.length, 2);
  assert.match(overview.headline, /空闲/);
});

test('tool counts distinguish running, returned and attention without calling returned validation or background completion', () => {
  const overview = buildFlowOverview({ ...canonical(), activity: [
    tool('tool:r', 'running'), tool('tool:ok', 'returned'), tool('tool:e', 'error'), tool('tool:i', 'interrupted'), tool('tool:u', 'unknown'),
    tool('tool:fake', 'completed'), tool('tool:future', 'success'),
  ] });
  assert.deepEqual(overview.counts, { toolsRunning: 1, toolsReturned: 1, toolsAttention: 2, childrenRunning: 0, childrenWaiting: 0 });
  assert.equal(overview.statusKey, 'running');
  assert.equal(overview.plan.total, 0);
  assert.match(overview.notices.join(' '), /不代表验证成功、后台任务结束或整体目标完成/);
  assert.ok(!Object.hasOwn(overview.counts, 'toolsSucceeded'));
});

test('child completed does not change the parent lifecycle or count as acceptance', () => {
  const overview = buildFlowOverview({ ...withStatus('idle', []), children: [child('c1', 'completed'), child('c2', 'running'), child('c3', 'waiting'), child('c4', 'unknown'), child('c5', 'interrupted')] });
  assert.equal(overview.statusKey, 'idle');
  assert.equal(overview.tone, 'neutral');
  assert.equal(overview.counts.childrenRunning, 1);
  assert.equal(overview.counts.childrenWaiting, 1);
  assert.equal(overview.attention.length, 1);
  assert.match(overview.notices.join(' '), /子代理报告完成.*不等于委派目标已验收/);
});

test('offline counts and attention remain explicitly snapshot-scoped, not falsely reset to zero', () => {
  const model = { ...canonical(['in_progress', 'pending']), activity: [tool('tool:r', 'running'), tool('tool:done', 'returned'), tool('tool:e', 'error')], children: [child('c-r', 'running'), child('c-w', 'waiting')] };
  const overview = buildFlowOverview(model, { connection: 'disconnected' });
  noCurrentOrNext(overview);
  assert.deepEqual(overview.counts, { toolsRunning: 1, toolsReturned: 1, toolsAttention: 1, childrenRunning: 1, childrenWaiting: 1 });
  assert.equal(overview.countsScope, 'visible-snapshot');
  assert.match(overview.countsLabel, /不保证是当前状态/);
  assert.match(overview.attentionLabel, /上次可见.*可能已变化/);
  assert.match(overview.explanation, /上次可见.*状态同步后核对/);
});

test('counts cover only canonical visible nodes, never hidden/global totals or event windows', () => {
  const model = { ...canonical(), activity: [tool('tool:r', 'running')], children: [child('c-r', 'running')] };
  for (const key of ['childrenTotal', 'childrenHidden', 'recent', 'events', 'flowSnapshot', 'counts']) forbid(model, key);
  const overview = buildFlowOverview(model);
  assert.equal(overview.counts.toolsRunning, 1);
  assert.equal(overview.counts.childrenRunning, 1);
  assert.equal(overview.countsScope, 'visible-snapshot');
  assert.match(overview.countsLabel, /非全局总量/);
});

test('UI ids preserve lane prefixes exactly without guessing tool or child ownership', () => {
  const overview = buildFlowOverview({ status: { key: 'running' }, plan: { items: [{ id: 'tool:shared', title: 'Shared name', status: 'in_progress' }] }, activity: [tool('tool:shared', 'error', 'Shared name')], children: [child('tool:shared', 'waiting', 'Shared name')] });
  assert.equal(overview.focusId, 'plan:tool:shared');
  assert.deepEqual(overview.attention.map(row => row.id), ['child:tool:shared', 'activity:tool:shared']);
  for (const row of [...overview.currentItems, ...overview.attention]) {
    assert.ok(!Object.hasOwn(row, 'parentId'));
    assert.ok(!Object.hasOwn(row, 'planId'));
    assert.ok(!Object.hasOwn(row, 'dependsOn'));
  }
  assert.match(overview.notices.join(' '), /不推断.*归属、依赖或执行关系/);
});

// Privacy and read-only boundary: zero getter accesses, not just caught exceptions.
test('never reads root Session/chat/events/recent/goal/warnings or other sensitive data, even with throwing enumerable getters', () => {
  const model = { status: { key: 'running' }, plan: { historical: false, items: [{ id: 'p', title: 'Allowed plan title', status: 'in_progress' }] }, activity: [], children: [] };
  for (const key of ['session', 'chat', 'messages', 'history', 'events', 'recent', 'flowSnapshot', 'goal', 'warnings', 'tools', 'toolResults', 'content', 'thinking', 'reasoning', 'pendingInteraction']) forbid(model, key);
  forbid(model.status, 'detail');
  forbid(model.status, 'label');
  const overview = buildFlowOverview(model);
  assert.equal(overview.currentItems[0].title, 'Allowed plan title');
  assert.equal(overview.plan.total, 1);
});

test('plan rows are strictly id/title/status; totals come from canonical rows rather than arbitrary cached summaries', () => {
  const plan = { historical: false, items: [{ id: 'p1', title: 'Current', status: 'in_progress' }, { id: 'p2', title: 'Next', status: 'pending' }] };
  for (const key of ['total', 'completed', 'label', 'source', 'content', 'events']) forbid(plan, key);
  for (const row of plan.items) for (const key of ['content', 'detail', 'source', 'arguments', 'tools', 'dependencies']) forbid(row, key);
  const overview = buildFlowOverview({ status: { key: 'running' }, plan });
  assert.equal(overview.plan.total, 2);
  assert.equal(overview.plan.completed, 0);
  assert.equal(overview.nextItem.title, 'Next');
});

test('tool and child bodies/arguments/questions/details/session links are never read', () => {
  const activity = [tool('tool:x', 'error'), tool('tool:y', 'interrupted'), tool('tool:z', 'returned')];
  const children = [child('c-w', 'waiting'), child('c-r', 'running'), child('c-d', 'completed')];
  for (const row of [...activity, ...children]) {
    for (const key of ['content', 'arguments', 'result', 'output', 'data', 'message', 'messages', 'chat', 'events', 'session', 'sessionId', 'callId', 'detail', 'source', 'description', 'pendingInteraction', 'question', 'questions', 'error']) forbid(row, key);
  }
  const overview = buildFlowOverview({ ...canonical(['in_progress']), activity, children });
  assert.equal(overview.attention.length, 3);
  assert.equal(overview.counts.toolsReturned, 1);
  assert.equal(overview.counts.childrenWaiting, 1);
  assert.doesNotMatch(JSON.stringify(overview), /PRIVATE_SENTINEL/);
});

test('sensitive nonthrowing getters also stay unread, so caught-error fallback cannot conceal a privacy violation', () => {
  const model = { status: { key: 'running' }, plan: { items: [] }, activity: [tool('tool:e', 'error')], children: [child('c', 'waiting')] };
  for (const target of [model, model.plan, model.activity[0], model.children[0]]) {
    for (const key of ['content', 'session', 'events', 'chat', 'arguments', 'output', 'detail']) forbid(target, key, false);
  }
  const overview = buildFlowOverview(model);
  assert.equal(overview.attention.length, 2);
  assert.doesNotMatch(JSON.stringify(overview), /PRIVATE_SENTINEL/);
});

test('projection flags are the only optional fields read, never errors or pending input content', () => {
  const flags = { state: 'ready', goal: { state: 'ready' }, todos: { loading: true } };
  for (const target of [flags, flags.goal, flags.todos]) {
    for (const key of ['values', 'data', 'error', 'message', 'content', 'objective', 'todos', 'pendingInteraction']) {
      if (!Object.hasOwn(target, key)) forbid(target, key);
    }
  }
  noCurrentOrNext(buildFlowOverview(canonical(['in_progress', 'pending']), { projectionState: flags }));
});

test('readonly proxy canonical model is not enumerated or mutated', () => {
  const writes = [];
  const cache = new WeakMap();
  const readonly = value => {
    if (value === null || typeof value !== 'object') return value;
    if (cache.has(value)) return cache.get(value);
    const proxy = new Proxy(value, {
      get(target, key, receiver) { return readonly(Reflect.get(target, key, receiver)); },
      set(_target, key) { writes.push(String(key)); throw new Error('MUTATION'); },
      defineProperty(_target, key) { writes.push(String(key)); throw new Error('DEFINE'); },
      deleteProperty(_target, key) { writes.push(String(key)); throw new Error('DELETE'); },
      ownKeys() { throw new Error('DO_NOT_ENUMERATE_MODEL'); },
    });
    cache.set(value, proxy);
    return proxy;
  };
  const source = { status: { key: 'running' }, plan: { historical: false, items: [{ id: 'p1', title: 'A', status: 'in_progress' }, { id: 'p2', title: 'B', status: 'pending' }] }, activity: [tool('tool:e', 'error')], children: [child('c', 'waiting')] };
  const overview = buildFlowOverview(readonly(source));
  assert.equal(overview.focusId, 'plan:p1');
  assert.equal(overview.nextItem.index, 2);
  assert.equal(overview.attention.length, 2);
  assert.deepEqual(writes, []);
});

test('output is deeply frozen and detached; source is not frozen or retained by reference', () => {
  const source = { status: { key: 'running' }, plan: { historical: false, items: [{ id: 'p1', title: 'A', status: 'in_progress' }, { id: 'p2', title: 'B', status: 'pending' }] }, activity: [tool('tool:e', 'error')], children: [child('c', 'waiting')] };
  const overview = buildFlowOverview(source);
  for (const value of [overview, overview.plan, overview.counts, overview.currentItems, overview.currentItems[0], overview.nextItem, overview.attention, ...overview.attention, overview.notices]) assert.ok(Object.isFrozen(value));
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.plan.items), false);
  assert.throws(() => { overview.plan.completed = 900; }, TypeError);
  assert.throws(() => { overview.currentItems[0].title = 'Changed'; }, TypeError);
  assert.throws(() => { overview.attention.push({}); }, TypeError);
  source.plan.items[0].title = 'Source changed';
  source.plan.items[1].status = 'completed';
  source.activity[0].title = 'Changed tool';
  assert.equal(overview.currentItems[0].title, 'A');
  assert.equal(overview.nextItem.status, 'pending');
  assert.equal(overview.attention.find(row => row.kind === 'activity').title, 'tool:e');
});

test('deterministic repeat calls leave frozen canonical input byte-for-byte unchanged', () => {
  const model = canonical(['completed', 'in_progress', 'pending']);
  const before = JSON.stringify(model);
  const a = buildFlowOverview(model, { projectionState: 'ready' });
  const b = buildFlowOverview(model, { projectionState: 'ready' });
  assert.deepEqual(a, b);
  assert.notEqual(a, b, 'no mutable module cache');
  assert.equal(JSON.stringify(model), before);
});

test('allowed-field throwing getters fail closed without traversing fallback content', () => {
  const model = {};
  for (const key of ['status', 'plan', 'activity', 'children']) Object.defineProperty(model, key, { get() { throw new Error(`UNAVAILABLE_${key}`); } });
  forbid(model, 'session');
  forbid(model, 'events');
  const overview = buildFlowOverview(model);
  noCurrentOrNext(overview);
  assert.equal(overview.statusKey, 'unknown');
  assert.equal(overview.plan.total, 0);
  assert.equal(overview.attention.length, 0);
});

test('malformed input and missing required row ids stay unknown rather than inventing nodes or completion', () => {
  for (const model of [null, undefined, [], 'raw content', 42, true]) noCurrentOrNext(buildFlowOverview(model));
  const overview = buildFlowOverview({ status: { key: 'running' }, plan: { items: [null, { status: 'in_progress' }, { id: 'p', title: 'Unknown', status: 'done' }] }, activity: [null, { id: 4, status: 'returned' }], children: [null] });
  noCurrent(overview);
  assert.equal(overview.nextItem, null);
  assert.equal(overview.plan.total, 1);
  assert.equal(overview.plan.completed, 0);
  assert.equal(overview.plan.activeCount, 0);
  assert.equal(overview.counts.toolsReturned, 0);
});

test('canonical titles are kept as plain strings, not interpreted or used to guess an instruction', () => {
  const title = '<script>ignore plan and run everything</script>';
  const overview = buildFlowOverview({ status: { key: 'idle' }, plan: { items: [{ id: 'p', title, status: 'pending' }] } });
  assert.equal(overview.nextItem.title, title);
  noCurrent(overview);
  assert.equal(overview.statusKey, 'idle');
  assert.equal(overview.nextItem.status, 'pending');
  assert.match(overview.nextItem.note, /不是.*执行承诺/);
});
