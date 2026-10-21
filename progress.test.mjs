import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalProgress } from './progress.mjs';
import { buildFlowModel } from './model.mjs';
import { buildFlowOverview } from './presentation.mjs';

// Only synthetic public canonical fixtures. Never read Sessions or raw history.
const rows = statuses => statuses.map((status, index) => ({ id: `todo:projection:${index}`, title: `步骤 ${index + 1}`, status }));
const canonical = (statuses = ['completed', 'in_progress', 'pending'], overrides = {}) => ({
  goal: { text: '完成当前功能', source: 'goal-projection', status: 'active' },
  plan: { items: rows(statuses), historical: false, truncated: false, omitted: 0 },
  activity: [],
  children: [],
  status: { key: 'running' },
  ...overrides,
});
const overview = (model, overrides = {}) => ({
  liveKnown: true,
  statusKey: 'running',
  currentItems: model.plan.items.filter(item => item?.status === 'in_progress').map(item => ({ id: `plan:${item.id}` })),
  ...overrides,
});
const project = (model = canonical(), overrides) => buildGoalProgress(model, overview(model, overrides));
const noReferences = result => {
  assert.deepEqual(result.currentItems, []);
  assert.deepEqual(result.completedItems, []);
  assert.deepEqual(result.remainingItems, []);
};
const unavailable = (result, reason) => {
  assert.equal(result.available, false);
  assert.equal(result.reason, reason);
  assert.equal(result.progress.percent, null);
  noReferences(result);
};
let forbiddenReads = [];
const forbid = (target, key, throwing = true) => Object.defineProperty(target, key, {
  enumerable: true,
  configurable: true,
  get() {
    forbiddenReads.push(key);
    if (throwing) throw new Error(`FORBIDDEN_${key}`);
    return 'PRIVATE_SENTINEL';
  },
});
afterEach(() => {
  const reads = forbiddenReads;
  forbiddenReads = [];
  assert.deepEqual(reads, [], 'private/irrelevant getters must not be accessed, even inside try/catch');
});

// Arithmetic and exact output contract.
test('normal 1/3 is 33 and retains canonical ids, original indices, and required semantics', () => {
  const result = project();
  assert.deepEqual(Object.keys(result), ['goal', 'available', 'reason', 'progress', 'currentItems', 'completedItems', 'remainingItems', 'remainingLabel', 'remainingNote', 'activity', 'statusKey', 'liveKnown']);
  assert.deepEqual(Object.keys(result.goal), ['text', 'formal', 'status', 'label']);
  assert.deepEqual(Object.keys(result.progress), ['completed', 'total', 'active', 'pending', 'unknown', 'percent', 'label', 'note']);
  assert.deepEqual(Object.keys(result.activity), ['runningTools', 'returnedTools', 'runningChildren', 'waitingChildren', 'scopeLabel']);
  assert.equal(result.available, true);
  assert.equal(result.reason, null);
  assert.equal(result.progress.percent, 33);
  assert.equal(result.progress.completed, 1);
  assert.equal(result.progress.total, 3);
  assert.equal(result.progress.active, 1);
  assert.equal(result.progress.pending, 1);
  assert.equal(result.progress.unknown, 0);
  assert.equal(result.progress.label, '本轮计划已报告完成 1 / 3');
  assert.match(result.progress.note, /等权/);
  assert.match(result.progress.note, /计划范围/);
  assert.match(result.progress.note, /非目标验收/);
  assert.match(result.progress.note, /未计工具返回\/子代理/);
  assert.match(result.progress.note, /不衡量工作量/);
  assert.deepEqual(result.currentItems, [{ id: 'plan:todo:projection:1', title: '步骤 2', index: 2, status: 'in_progress' }]);
  assert.deepEqual(result.completedItems, [{ id: 'plan:todo:projection:0', title: '步骤 1', index: 1, status: 'completed' }]);
  assert.deepEqual(result.remainingItems, [
    { id: 'plan:todo:projection:1', title: '步骤 2', index: 2, status: 'in_progress' },
    { id: 'plan:todo:projection:2', title: '步骤 3', index: 3, status: 'pending' },
  ]);
});

test('accepts actual buildFlowModel and buildFlowOverview output without an adapter', () => {
  const model = buildFlowModel({
    session: { running: true },
    connection: 'connected',
    goalProjection: { goal: { objective: '正式目标', phase: 'active' } },
    todosProjection: ['completed', 'in_progress', 'pending'].map((status, index) => ({ content: `真实结构 ${index + 1}`, status })),
  });
  const result = buildGoalProgress(model, buildFlowOverview(model));
  assert.equal(result.available, true);
  assert.equal(result.progress.percent, 33);
  assert.equal(result.goal.formal, true);
  assert.equal(result.currentItems[0].id, `plan:${model.plan.items[1].id}`);
  assert.equal(result.currentItems[0].index, 2);
});

test('0/1 pending is exactly zero, with a remaining item but no current item', () => {
  const result = project(canonical(['pending']));
  assert.equal(result.available, true);
  assert.equal(result.progress.percent, 0);
  assert.equal(result.progress.label, '本轮计划已报告完成 0 / 1');
  assert.deepEqual(result.currentItems, []);
  assert.equal(result.remainingItems.length, 1);
  assert.equal(result.remainingItems[0].index, 1);
});

test('all completed is 100 while an active formal goal remains active', () => {
  const result = project(canonical(['completed', 'completed']));
  assert.equal(result.progress.percent, 100);
  assert.equal(result.completedItems.length, 2);
  assert.deepEqual(result.remainingItems, []);
  assert.deepEqual(result.currentItems, []);
  assert.equal(result.goal.status, 'active');
  assert.match(result.remainingLabel, /计划已报告全完成.*目标仍进行中/);
  assert.match(result.remainingNote, /不等于.*目标验收通过/);
});

test('a changed whole-list plan may grow and make progress regress; no permanent accumulation', () => {
  const model = canonical(['completed', 'pending']);
  const first = project(model);
  model.plan.items.push(...[
    { id: 'extra:1', title: '新增步骤', status: 'pending' },
    { id: 'extra:2', title: '再次新增', status: 'pending' },
  ]);
  const grown = project(model);
  assert.equal(first.progress.percent, 50);
  assert.equal(grown.progress.percent, 25);
  assert.equal(first.progress.total, 2);
  assert.equal(grown.progress.total, 4);
  assert.match(grown.progress.note, /重新计算.*可以回退.*不作永久累积/);
  model.plan.items = rows(['pending']);
  const replacement = project(model);
  assert.equal(replacement.progress.completed, 0);
  assert.equal(replacement.progress.percent, 0);
});

test('79/80 uses floor and cannot round an unfinished valid plan to 100', () => {
  const statuses = [...Array(79).fill('completed'), 'pending'];
  const result = project(canonical(statuses));
  assert.equal(result.available, true);
  assert.equal(result.progress.percent, 98);
  assert.equal(result.progress.total, 80);
  assert.equal(result.remainingItems[0].index, 80);
});

test('remaining and completed partitions retain original order and original numbering', () => {
  const result = project(canonical(['pending', 'completed', 'in_progress', 'completed', 'pending']));
  assert.deepEqual(result.remainingItems.map(item => item.index), [1, 3, 5]);
  assert.deepEqual(result.completedItems.map(item => item.index), [2, 4]);
  assert.deepEqual(result.currentItems.map(item => item.index), [3]);
  assert.match(result.remainingNote, /原顺序与原编号/);
});

// Availability is explicit and cannot turn snapshots into current work.
test('empty or absent plan never synthesizes zero percent, requirements, or work from activity', () => {
  const result = project(canonical([], {
    activity: [{ status: 'returned' }],
    children: [{ status: 'completed' }],
    goal: { text: '正式目标', source: 'goal-projection', status: 'complete' },
  }));
  unavailable(result, 'no-plan');
  assert.equal(result.progress.total, 0);
  assert.match(result.remainingNote, /不能.*推断剩余要求/);
  assert.doesNotMatch(result.progress.label, /0\s*\/\s*0|100|%/);
  const absent = buildGoalProgress();
  unavailable(absent, 'unavailable');
  assert.equal(absent.liveKnown, false);
  assert.equal(absent.statusKey, 'unknown');
  assert.doesNotMatch(JSON.stringify(absent), /NaN|Infinity|undefined|%/);
});

test('historical plan retains counts only and never becomes current/remaining progress', () => {
  const model = canonical();
  model.plan.historical = true;
  const result = project(model);
  unavailable(result, 'historical');
  assert.equal(result.progress.completed, 1);
  assert.equal(result.progress.active, 1);
  assert.equal(result.progress.total, 3);
  assert.match(result.progress.label, /上轮计划.*非本轮进度/);
  assert.match(result.remainingNote, /历史计划.*不作为本轮/);
});

for (const key of ['disconnected', 'reconnecting', 'connecting', 'stale', 'loading', 'removed', 'unknown']) {
  test(`${key} canonical overview yields an unavailable snapshot, even if a caller incorrectly claims liveKnown`, () => {
    const result = project(canonical(), { liveKnown: true, statusKey: key });
    unavailable(result, 'unavailable');
    assert.equal(result.liveKnown, false);
    assert.equal(result.statusKey, key);
    assert.match(result.goal.label, /上次可见/);
    assert.match(result.progress.label, /上次可见.*非当前进度/);
    assert.match(result.remainingNote, /上次可见.*不保证.*当前/);
    assert.match(result.activity.scopeLabel, /上次可见.*不保证当前/);
  });
}

for (const statusKey of ['disconnected', 'loading', 'stale', 'removed', 'unknown']) {
  test(`empty ${statusKey} snapshot is awaiting synchronization, never a claim of no plan`, () => {
    const model = canonical([]);
    const result = project(model, { liveKnown: false, statusKey });
    unavailable(result, 'unavailable');
    assert.match(result.remainingLabel, /待同步/);
    assert.match(result.remainingNote, /同步前/);
    assert.doesNotMatch(result.progress.label, /尚无/);
    assert.doesNotMatch(result.remainingLabel, /尚无/);
  });
}

test('empty snapshot with unsynchronized overview flags cannot be described as no plan', () => {
  const model = canonical([]);
  const view = buildFlowOverview(model, { projectionState: { todos: { loading: true } } });
  const result = buildGoalProgress(model, view);
  unavailable(result, 'unavailable');
  assert.match(result.remainingLabel, /待同步/);
  assert.doesNotMatch(result.remainingLabel, /尚无/);
});

test('unrecognized status key is normalized to unknown rather than exposing an arbitrary string', () => {
  const result = project(canonical(), { statusKey: 'PRIVATE_ARBITRARY_STATUS', liveKnown: true });
  unavailable(result, 'unavailable');
  assert.equal(result.statusKey, 'unknown');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_ARBITRARY_STATUS/);
});

for (const flag of [false, undefined, null, 1, 'true']) {
  test(`only exact boolean true is liveKnown: ${String(flag)}`, () => {
    const result = project(canonical(), { liveKnown: flag });
    unavailable(result, 'unavailable');
    assert.equal(result.liveKnown, false);
  });
}

for (const connection of ['disconnected', 'offline', 'closed', 'reconnecting', 'connecting', 'unknown']) {
  test(`actual overview connection ${connection} suppresses percentage and all plan references`, () => {
    const model = canonical();
    const view = buildFlowOverview(model, { connection });
    unavailable(buildGoalProgress(model, view), 'unavailable');
  });
}

const flagFixtures = [
  'stale', 'error', 'loading', 'cold',
  { stale: true }, { loading: true }, { state: 'error' }, { status: 'cold' }, { phase: 'stale' },
  { goal: 'stale' }, { goal: { loading: true } }, { todos: 'cold' }, { todos: { state: 'error' } },
];
for (const flags of flagFixtures) {
  test(`Host projection flags from actual overview are honored: ${JSON.stringify(flags)}`, () => {
    const model = canonical();
    const view = buildFlowOverview(model, { projectionState: flags });
    const result = buildGoalProgress(model, view);
    unavailable(result, 'unavailable');
    assert.match(result.goal.label, /上次可见/);
  });
}

for (const [key, phrase] of [
  ['waiting-input', '等待输入'], ['paused', '已暂停'], ['blocked', '受阻'],
  ['idle', '当前空闲'], ['error', '执行出错'], ['interrupted', '已中断'],
  ['complete', ''], ['completed', ''],
]) {
  test(`${key} never claims current work, even with an in_progress overview candidate`, () => {
    const result = project(canonical(), { statusKey: key });
    assert.equal(result.available, true);
    assert.equal(result.progress.percent, 33);
    assert.equal(result.progress.active, 1, 'active counts declarations rather than claiming execution');
    assert.deepEqual(result.currentItems, []);
    assert.equal(result.remainingItems.length, 2);
    if (phrase) assert.ok(result.remainingLabel.includes(phrase));
  });
}

test('multiple current items use only overview intersection, require in_progress, and preserve plan order', () => {
  const model = canonical(['in_progress', 'pending', 'in_progress', 'completed', 'in_progress']);
  const result = project(model, { currentItems: [
    { id: 'plan:todo:projection:4' }, { id: 'plan:todo:projection:1' },
    { id: 'plan:todo:projection:2' }, { id: 'plan:todo:projection:3' },
    { id: 'not-a-plan-id' }, { id: 'plan:todo:projection:2' },
  ] });
  assert.deepEqual(result.currentItems.map(item => item.index), [3, 5]);
  assert.equal(result.progress.active, 3);
  assert.deepEqual(result.remainingItems.map(item => item.index), [1, 2, 3, 5]);
});

test('missing currentItems never infers current work from in_progress alone', () => {
  const result = project(canonical(['in_progress']), { currentItems: undefined });
  assert.equal(result.progress.active, 1);
  assert.deepEqual(result.currentItems, []);
  assert.equal(result.remainingItems.length, 1);
});

test('a model in_progress label cannot override stale or waiting overview authority', () => {
  const model = canonical(['in_progress']);
  for (const [statusKey, liveKnown, reason] of [['stale', false, 'unavailable'], ['waiting-input', true, null]]) {
    const result = project(model, { statusKey, liveKnown });
    assert.deepEqual(result.currentItems, []);
    assert.equal(result.reason, reason);
  }
});

// Bounds, malformed plans and unknown slots.
test('explicit truncation suppresses percentage even if every visible item is completed', () => {
  const model = canonical(['completed', 'completed']);
  model.plan.truncated = true;
  model.plan.omitted = 1;
  const result = project(model);
  unavailable(result, 'truncated');
  assert.equal(result.progress.completed, 2);
  assert.equal(result.progress.total, 2);
  assert.match(result.progress.label, /快照.*已截断/);
  assert.match(result.remainingNote, /可见快照.*完整本轮计划范围/);
});

test('omitted count independently suppresses percentage even if truncated flag is false', () => {
  const model = canonical(['completed']);
  model.plan.omitted = 5;
  unavailable(project(model), 'truncated');
});

test('a legacy positive truncation count fails closed', () => {
  const model = canonical(['completed']);
  model.plan.truncated = 4;
  unavailable(project(model), 'truncated');
});

test('81 entries are capped at 80 without reading the overflowing item', () => {
  const model = canonical(Array(81).fill('completed'));
  forbid(model.plan.items, 80);
  const result = buildGoalProgress(model, { liveKnown: true, statusKey: 'running', currentItems: [] });
  unavailable(result, 'truncated');
  assert.equal(result.progress.total, 80);
  assert.equal(result.progress.completed, 80);
});

test('199/200 is an over-limit plan and cannot produce a rounded or partial 100 percent', () => {
  const model = canonical([...Array(199).fill('completed'), 'pending']);
  const result = buildGoalProgress(model, { liveKnown: true, statusKey: 'running' });
  unavailable(result, 'truncated');
  assert.equal(result.progress.total, 80);
  assert.equal(result.progress.completed, 80);
  assert.doesNotMatch(result.progress.label, /100\s*%/);
});

test('empty truncated snapshot is truncated rather than a claim of no plan', () => {
  const model = canonical([]);
  model.plan.truncated = true;
  model.plan.omitted = 2;
  unavailable(project(model), 'truncated');
});

test('unknown statuses remain in total/unknown and invalidate the entire percentage', () => {
  const model = canonical(['completed', 'future', 'in_progress', undefined, 'pending', null]);
  const result = project(model);
  unavailable(result, 'invalid-plan');
  assert.deepEqual({
    total: result.progress.total, completed: result.progress.completed,
    active: result.progress.active, pending: result.progress.pending, unknown: result.progress.unknown,
  }, { total: 6, completed: 1, active: 1, pending: 1, unknown: 3 });
  assert.equal(result.progress.completed + result.progress.active + result.progress.pending + result.progress.unknown, result.progress.total);
  assert.match(result.remainingNote, /未知状态保留计数.*不缩小分母/);
});

test('holes and null entries count as unknown rather than disappearing', () => {
  const model = canonical([]);
  model.plan.items = [{ id: 'one', title: 'One', status: 'completed' }, , null];
  const result = buildGoalProgress(model, { liveKnown: true, statusKey: 'running' });
  unavailable(result, 'invalid-plan');
  assert.equal(result.progress.total, 3);
  assert.equal(result.progress.completed, 1);
  assert.equal(result.progress.unknown, 2);
});

for (const [label, mutate] of [
  ['duplicate id', model => { model.plan.items[1].id = model.plan.items[0].id; }],
  ['missing id', model => { delete model.plan.items[1].id; }],
  ['empty id', model => { model.plan.items[1].id = ''; }],
  ['nonstring title', model => { model.plan.items[1].title = { private: true }; }],
  ['nonarray plan items', model => { model.plan.items = { length: 3 }; }],
  ['negative omitted', model => { model.plan.omitted = -1; }],
  ['fractional omitted', model => { model.plan.omitted = 0.5; }],
  ['string truncated', model => { model.plan.truncated = 'false'; }],
  ['string historical', model => { model.plan.historical = 'false'; }],
]) {
  test(`malformed canonical plan (${label}) cannot become a current plan reference`, () => {
    const model = canonical();
    mutate(model);
    const result = buildGoalProgress(model, { liveKnown: true, statusKey: 'running', currentItems: [] });
    unavailable(result, 'invalid-plan');
    assert.match(result.remainingLabel, /待核对/);
  });
}

test('canonical invalid flag disables otherwise valid fallback counts, including an empty snapshot', () => {
  for (const statuses of [['completed', 'pending'], []]) {
    const model = canonical(statuses);
    model.plan.invalid = true;
    const result = project(model);
    unavailable(result, 'invalid-plan');
    assert.equal(result.progress.total, statuses.length);
    assert.match(result.remainingLabel, /待核对/);
  }
});

test('allowed invalid flag getter is read while private plan getters stay untouched', () => {
  const model = canonical(['completed']);
  let reads = 0;
  Object.defineProperty(model.plan, 'invalid', { get() { reads += 1; return true; } });
  forbid(model.plan, 'private');
  const result = project(model);
  unavailable(result, 'invalid-plan');
  assert.equal(reads, 1);
});

test('invalid formal todos projection cannot reuse valid old event-plan counts as progress', () => {
  const model = buildFlowModel({
    session: { running: true },
    connection: 'connected',
    todosProjection: [{ content: '新版无效计划', status: 'future' }],
    flowSnapshot: { latestPlan: { seq: 7, turn: 1, todos: [{ content: '旧版已完成计划', status: 'completed' }] } },
  });
  assert.equal(model.plan.invalid, true);
  const result = buildGoalProgress(model, buildFlowOverview(model));
  unavailable(result, 'invalid-plan');
  assert.equal(result.progress.completed, 1, 'old visible counts are only a disabled snapshot');
});

test('empty string title is preserved as plain canonical text without inventing a requirement', () => {
  const model = canonical(['pending']);
  model.plan.items[0].title = '';
  const result = project(model);
  assert.equal(result.available, true);
  assert.equal(result.remainingItems[0].title, '');
});

test('throwing allowed status getter is safely unknown and never silently excluded', () => {
  const model = canonical(['completed', 'pending']);
  Object.defineProperty(model.plan.items[1], 'status', { get() { throw new Error('unreadable status'); } });
  const result = buildGoalProgress(model, { liveKnown: true, statusKey: 'running' });
  unavailable(result, 'invalid-plan');
  assert.equal(result.progress.total, 2);
  assert.equal(result.progress.unknown, 1);
});

test('reason precedence is stable for unavailable/historical/truncated/invalid combinations', () => {
  const model = canonical(['future']);
  model.plan.historical = true;
  model.plan.truncated = true;
  assert.equal(project(model, { liveKnown: false }).reason, 'unavailable');
  assert.equal(project(model).reason, 'historical');
  model.plan.historical = false;
  assert.equal(project(model, { liveKnown: false }).reason, 'unavailable');
  assert.equal(project(model).reason, 'truncated');
  model.plan.truncated = false;
  assert.equal(project(model).reason, 'invalid-plan');
});

// Formal goal provenance and completion claims.
for (const source of ['session-title', 'chat', undefined, 'goal-projection-lookalike']) {
  test(`fallback goal source ${String(source)} is never promoted to user requirement or acceptance`, () => {
    const model = canonical(['completed'], { goal: { text: 'FALLBACK_TITLE_NOT_A_REQUIREMENT', source, status: 'complete' } });
    const result = project(model);
    assert.equal(result.goal.formal, false);
    assert.equal(result.goal.text, '');
    assert.equal(result.goal.status, 'unknown');
    assert.match(result.goal.label, /尚无明确正式目标/);
    assert.match(result.progress.note, /计划进度不代表完整要求覆盖/);
    assert.match(result.remainingLabel, /完整要求覆盖尚未确认/);
    assert.doesNotMatch(JSON.stringify(result), /FALLBACK_TITLE_NOT_A_REQUIREMENT/);
    assert.equal(result.progress.percent, 100, 'a valid plan may have progress without a formal goal');
  });
}

for (const text of ['', '   ', undefined, { objective: 'not plain text' }]) {
  test(`goal-projection source alone is insufficient without nonempty text: ${typeof text}`, () => {
    const result = project(canonical(['pending'], { goal: { text, source: 'goal-projection', status: 'active' } }));
    assert.equal(result.goal.formal, false);
    assert.equal(result.goal.text, '');
    assert.match(result.progress.note, /尚无明确正式目标/);
    assert.equal(result.progress.percent, 0);
  });
}

for (const [status, phrase] of [
  ['active', '进行中'], ['paused', '暂停'], ['blocked', '受阻'], ['complete', 'Agent.*标记目标完成.*非目标验收'],
]) {
  test(`formal goal ${status} gets a Chinese label rather than acceptance`, () => {
    const result = project(canonical(['pending'], { goal: { text: '明确目标', source: 'goal-projection', status } }));
    assert.equal(result.goal.formal, true);
    assert.equal(result.goal.status, status);
    assert.match(result.goal.label, new RegExp(phrase));
    assert.doesNotMatch(result.goal.label, /验收通过/);
  });
}

test('unrecognized goal status is normalized without leaking arbitrary status content', () => {
  const result = project(canonical(['pending'], { goal: { text: '明确目标', source: 'goal-projection', status: 'PRIVATE_GOAL_PHASE' } }));
  assert.equal(result.goal.status, 'unknown');
  assert.match(result.goal.label, /状态未知/);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_GOAL_PHASE/);
});

test('goal complete plus unfinished todo explicitly shows conflict pending reconciliation', () => {
  const result = project(canonical(['completed', 'pending', 'in_progress'], {
    goal: { text: '明确目标', source: 'goal-projection', status: 'complete' },
  }), { statusKey: 'completed' });
  assert.equal(result.progress.percent, 33);
  assert.equal(result.remainingItems.length, 2);
  assert.match(result.remainingLabel, /目标已标记完成.*尚有 2 项未完成.*待核对/);
  assert.match(result.remainingNote, /冲突，待核对/);
  assert.match(result.goal.label, /Agent.*非目标验收/);
  assert.deepEqual(result.currentItems, []);
});

test('goal complete and all todo complete preserve both declarations without claiming acceptance', () => {
  const result = project(canonical(['completed'], {
    goal: { text: '明确目标', source: 'goal-projection', status: 'complete' },
  }), { statusKey: 'completed' });
  assert.equal(result.progress.percent, 100);
  assert.match(result.remainingLabel, /计划已报告全完成.*Agent.*非目标验收/);
  assert.match(result.remainingNote, /不等于.*目标验收通过/);
});

// Snapshot activity is independent of plan progress and has hard read bounds.
test('activity and children are independent visible-snapshot counts and cannot change percent', () => {
  const model = canonical();
  const base = project(model);
  model.activity = ['running', 'running', 'returned', 'error', 'interrupted', 'unknown'].map(status => ({ status }));
  model.children = ['running', 'waiting', 'waiting', 'completed', 'idle', 'interrupted', 'unknown'].map(status => ({ status }));
  const result = project(model);
  assert.equal(result.progress.percent, base.progress.percent);
  assert.deepEqual(result.progress, base.progress);
  assert.deepEqual({ ...result.activity, scopeLabel: null }, {
    runningTools: 2, returnedTools: 1, runningChildren: 1, waitingChildren: 2, scopeLabel: null,
  });
  assert.match(result.activity.scopeLabel, /可见节点快照.*非全量.*独立计数.*未计入计划进度/);
});

test('tool count reads at most 32 statuses and child count at most 48', () => {
  const model = canonical(['pending']);
  model.activity = Array.from({ length: 33 }, () => ({ status: 'returned' }));
  model.children = Array.from({ length: 49 }, () => ({ status: 'running' }));
  forbid(model.activity, 32);
  forbid(model.children, 48);
  const result = project(model);
  assert.equal(result.activity.returnedTools, 32);
  assert.equal(result.activity.runningChildren, 48);
  assert.equal(result.progress.percent, 0);
});

test('overview current-id scan is capped at 80 and still intersects canonical in_progress only', () => {
  const model = canonical(['in_progress']);
  const currentItems = Array.from({ length: 81 }, (_, index) => ({ id: index === 0 ? 'plan:todo:projection:0' : `irrelevant:${index}` }));
  forbid(currentItems, 80);
  const result = project(model, { currentItems });
  assert.equal(result.currentItems.length, 1);
});

test('unknown tool/child statuses stay uncounted and do not leak arbitrary strings', () => {
  const model = canonical(['pending'], {
    activity: [{ status: 'PRIVATE_TOOL_STATUS' }, null],
    children: [{ status: 'PRIVATE_CHILD_STATUS' }, {}],
  });
  const result = project(model);
  assert.equal(result.progress.percent, 0);
  assert.deepEqual({ ...result.activity, scopeLabel: null }, {
    runningTools: 0, returnedTools: 0, runningChildren: 0, waitingChildren: 0, scopeLabel: null,
  });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOOL_STATUS|PRIVATE_CHILD_STATUS/);
});

test('private and noncanonical fields are never read, including poison getters', () => {
  const model = canonical();
  for (const key of ['events', 'recent', 'chat', 'messages', 'session', 'flowSnapshot', 'goalProjection', 'todosProjection', 'projectionState', 'warnings', 'status', 'childrenTotal', 'childrenHidden', 'private']) forbid(model, key);
  for (const key of ['objective', 'title', 'raw', 'private', 'acceptance']) forbid(model.goal, key);
  for (const key of ['completed', 'total', 'label', 'source', 'events', 'private']) forbid(model.plan, key);
  for (const row of model.plan.items) for (const key of ['source', 'content', 'arguments', 'results', 'private']) forbid(row, key);
  const activity = { status: 'returned' };
  const child = { status: 'waiting' };
  for (const record of [activity, child]) for (const key of ['id', 'title', 'name', 'callId', 'description', 'arguments', 'args', 'result', 'results', 'message', 'messages', 'error', 'detail', 'session', 'seq', 'private']) forbid(record, key);
  model.activity = [activity];
  model.children = [child];
  const view = { liveKnown: true, statusKey: 'running', currentItems: [{ id: 'plan:todo:projection:1' }] };
  for (const key of ['counts', 'plan', 'modelStatusKey', 'headline', 'explanation', 'nextItem', 'attention', 'notices', 'private']) forbid(view, key);
  for (const key of ['title', 'status', 'index', 'kind', 'arguments', 'results', 'private']) forbid(view.currentItems[0], key);
  const result = buildGoalProgress(model, view);
  assert.equal(result.progress.percent, 33);
  assert.equal(result.currentItems.length, 1);
  assert.equal(result.activity.returnedTools, 1);
  assert.equal(result.activity.waitingChildren, 1);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL/);
});

test('even nonthrowing private getters are untouched; objects are not string-coerced', () => {
  const model = canonical(['pending']);
  const secret = { toString() { assert.fail('must not coerce private/nonstring text'); } };
  model.plan.items[0].title = secret;
  forbid(model, 'private', false);
  forbid(model.plan, 'private', false);
  const result = project(model);
  unavailable(result, 'invalid-plan');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL/);
});

test('detached output is deeply frozen, plain, and leaves mutable inputs untouched', () => {
  const model = canonical();
  const view = overview(model);
  const result = buildGoalProgress(model, view);
  const check = value => {
    if (value === null || typeof value !== 'object') return;
    assert.ok(Object.isFrozen(value));
    assert.equal(Object.getPrototypeOf(value), Array.isArray(value) ? Array.prototype : Object.prototype);
    for (const child of Object.values(value)) check(child);
  };
  check(result);
  assert.notEqual(result.goal, model.goal);
  assert.notEqual(result.currentItems, view.currentItems);
  assert.notEqual(result.remainingItems[0], model.plan.items[1]);
  assert.equal(Object.isFrozen(model), false);
  assert.equal(Object.isFrozen(model.plan.items[1]), false);
  model.goal.text = 'changed';
  model.plan.items[1].title = 'changed';
  model.plan.items[1].status = 'completed';
  view.currentItems[0].id = 'changed';
  assert.equal(result.goal.text, '完成当前功能');
  assert.equal(result.currentItems[0].title, '步骤 2');
  assert.equal(result.currentItems[0].status, 'in_progress');
  assert.equal(result.progress.percent, 33);
  assert.throws(() => { result.remainingItems.push({}); }, TypeError);
  assert.throws(() => { result.goal.text = 'changed'; }, TypeError);
});

test('XSS-like goal and plan content remains inert exact plain text without html/URL fields', () => {
  const xss = '<img src=x onerror="alert(1)"><script>throw 1</script> javascript:alert(1)';
  const model = canonical(['in_progress'], {
    goal: { text: xss, source: 'goal-projection', status: 'active' },
  });
  model.plan.items[0].title = xss;
  const result = project(model);
  assert.equal(result.goal.text, xss);
  assert.equal(result.currentItems[0].title, xss);
  assert.equal(typeof result.currentItems[0].title, 'string');
  assert.deepEqual(Object.keys(result.currentItems[0]), ['id', 'title', 'index', 'status']);
  assert.equal(Object.hasOwn(result.goal, 'html'), false);
  assert.equal(Object.hasOwn(result.currentItems[0], 'href'), false);
  assert.match(result.progress.note, /未建立逐条要求覆盖或验收关系/);
});
