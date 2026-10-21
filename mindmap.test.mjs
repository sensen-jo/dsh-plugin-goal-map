import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlowMindmap } from './mindmap.mjs';

const plan = (id, title, status) => ({ id, title, status });
const activity = (id, title, status, seq) => ({ id, title, status, seq });
const child = (id, title, status) => ({ id, title, status });
const overview = ({
  liveKnown = true,
  statusKey = 'running',
  headline = '运行中',
  currentItems = [],
  nextItem = null,
  planCounts = { total: 0, completed: 0 },
} = {}) => ({
  liveKnown,
  statusKey,
  headline,
  currentItems,
  nextItem,
  plan: planCounts,
});
const model = ({
  goal = { text: '完成目标', title: '会话目标', source: 'goal-projection', status: 'active' },
  plans = [],
  activities = [],
  children = [],
  historical = false,
} = {}) => ({
  goal,
  plan: { items: plans, historical },
  activity: activities,
  children,
});
const group = (tree, id) => tree.groups.find(item => item.id === id);
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
  assert.deepEqual(reads, [], 'forbidden getters must never be accessed');
});

// Contract shape and the canonical three independent branches.
test('returns the frozen goal-centered tree with all three groups and exact edge meaning', () => {
  const tree = buildFlowMindmap(
    model({
      plans: [plan('p1', '准备', 'completed'), plan('p2', '实现', 'in_progress'), plan('p3', '验证', 'pending')],
      activities: [activity('tool-a', 'read', 'returned', 4)],
      children: [child('c1', '分支 A', 'running')],
    }),
    overview({
      currentItems: [{ id: 'plan:p2' }],
      nextItem: { id: 'plan:p3' },
      planCounts: { total: 3, completed: 1 },
    }),
  );
  assert.deepEqual(tree.root, {
    id: 'goal', title: '完成目标', kind: 'goal', status: 'active', statusLabel: '目标进行中', liveKnown: true, fallback: false,
  });
  assert.deepEqual(tree.groups.map(item => item.id), ['plan', 'activity', 'child']);
  assert.equal(tree.edgeMeaning, '分组关系，非执行依赖');
  assert.deepEqual(group(tree, 'plan').items, [
    { id: 'plan:p1', kind: 'plan', title: '准备', status: 'completed', index: 1, current: false, next: false, stale: false },
    { id: 'plan:p2', kind: 'plan', title: '实现', status: 'in_progress', index: 2, current: true, next: false, stale: false },
    { id: 'plan:p3', kind: 'plan', title: '验证', status: 'pending', index: 3, current: false, next: true, stale: false },
  ]);
  assert.deepEqual(group(tree, 'activity').items[0], { id: 'activity:tool-a', kind: 'activity', title: 'read', status: 'returned', current: false, next: false, stale: false });
  assert.deepEqual(group(tree, 'child').items[0], { id: 'child:c1', kind: 'child', title: '分支 A', status: 'running', current: false, next: false, stale: false });
  for (const value of [tree, tree.root, tree.groups, ...tree.groups, ...tree.groups.flatMap(item => item.items), ...tree.groups.map(item => item.previewIds)]) assert.ok(Object.isFrozen(value));
});

test('uses actual goal text and marks a session-title fallback without inventing a formal goal', () => {
  const tree = buildFlowMindmap(
    model({ goal: { text: '会话标题', title: '会话标题', source: 'session-title', status: 'unknown' } }),
    overview({ liveKnown: false, statusKey: 'unknown', headline: '状态未知' }),
  );
  assert.equal(tree.root.title, '会话标题');
  assert.equal(tree.root.fallback, true);
  assert.equal(tree.root.status, 'unknown');
  assert.equal(tree.root.liveKnown, false);
  const formal = buildFlowMindmap(model({ goal: { text: '正式目标', title: '会话标题', source: 'goal-projection', status: 'active' } }), overview());
  assert.equal(formal.root.fallback, false);
  assert.equal(formal.root.title, '正式目标');
});

test('normalizes missing or unknown canonical statuses without treating them as completion', () => {
  const tree = buildFlowMindmap(
    model({
      plans: [plan('p', '未知计划', 'future')],
      activities: [activity('a', '未知工具', 'success', 2)],
      children: [child('c', '未知分支', 'done')],
    }),
    overview({ statusKey: 'new-status', liveKnown: true }),
  );
  assert.equal(group(tree, 'plan').items[0].status, 'unknown');
  assert.equal(group(tree, 'activity').items[0].status, 'unknown');
  assert.equal(group(tree, 'child').items[0].status, 'unknown');
  assert.equal(group(tree, 'plan').items[0].current, false);
  assert.equal(group(tree, 'plan').items[0].next, false);
  assert.equal(tree.root.status, 'active');
  assert.equal(tree.root.statusLabel, '目标进行中');
});

// Current/next markers and conservative freshness.
test('marks only live running in_progress and the overview next pending item', () => {
  const plans = [
    plan('p1', '早先待办', 'pending'),
    plan('p2', '当前步骤', 'in_progress'),
    plan('p3', '完成项', 'completed'),
    plan('p4', '未确认进行中', 'in_progress'),
    plan('p5', '后续待办', 'pending'),
  ];
  const tree = buildFlowMindmap(model({ plans }), overview({ currentItems: [{ id: 'plan:p2' }], nextItem: { id: 'plan:p1' }, planCounts: { total: 5, completed: 1 } }));
  const items = group(tree, 'plan').items;
  assert.deepEqual(items.map(item => [item.index, item.current, item.next, item.stale]), [
    [1, false, true, false], [2, true, false, false], [3, false, false, false], [4, false, false, true], [5, false, false, false],
  ]);
});

test('idle keeps a first pending reference but downgrades an unconfirmed in_progress declaration', () => {
  const tree = buildFlowMindmap(
    model({ plans: [plan('p1', '待办', 'pending'), plan('p2', '旧进行中', 'in_progress')] }),
    overview({ statusKey: 'idle', currentItems: [{ id: 'plan:p2' }], nextItem: { id: 'plan:p1' } }),
  );
  assert.equal(group(tree, 'plan').items[0].next, true);
  assert.equal(group(tree, 'plan').items[1].current, false);
  assert.equal(group(tree, 'plan').items[1].stale, true);
});

test('waiting, stale, disconnected and historical inputs suppress live current/next claims', () => {
  const plans = [plan('p1', '当前声明', 'in_progress'), plan('p2', '待办', 'pending')];
  for (const [statusKey, liveKnown, historical] of [
    ['waiting-input', true, false], ['stale', false, false], ['disconnected', false, false], ['running', true, true],
  ]) {
    const tree = buildFlowMindmap(model({ plans, historical }), overview({ statusKey, liveKnown, currentItems: [{ id: 'plan:p1' }], nextItem: { id: 'plan:p2' } }));
    const items = group(tree, 'plan').items;
    assert.equal(items.some(item => item.current), false, statusKey);
    assert.equal(items.some(item => item.next), false, statusKey);
    assert.equal(items.find(item => item.status === 'in_progress').stale, true, statusKey);
    assert.equal(items.find(item => item.status === 'pending').stale, liveKnown === false || historical, statusKey);
    assert.equal(group(tree, 'plan').historical, historical);
  }
});

// Plan preview membership is priority-based, while its returned IDs retain the
// original formal list order for rendering and numbering.
test('plan preview includes current declarations and the first pending in original order', () => {
  const plans = [
    plan('p1', '更早待办', 'pending'), plan('p2', '当前 A', 'in_progress'), plan('p3', '完成', 'completed'),
    plan('p4', '当前 B', 'in_progress'), plan('p5', '后续待办', 'pending'),
  ];
  const tree = buildFlowMindmap(model({ plans }), overview({ currentItems: [{ id: 'plan:p2' }, { id: 'plan:p4' }], nextItem: { id: 'plan:p1' }, planCounts: { total: 5, completed: 1 } }));
  assert.deepEqual(group(tree, 'plan').previewIds, ['plan:p1', 'plan:p2', 'plan:p4']);
  assert.deepEqual(group(tree, 'plan').items.map(item => item.index), [1, 2, 3, 4, 5]);
});

test('more than three current declarations reserves two current slots and the next pending slot', () => {
  const plans = [plan('p1', '当前一', 'in_progress'), plan('p2', '当前二', 'in_progress'), plan('p3', '当前三', 'in_progress'), plan('p4', '当前四', 'in_progress'), plan('p5', '首个待办', 'pending')];
  const tree = buildFlowMindmap(model({ plans }), overview({ currentItems: plans.slice(0, 4).map(item => ({ id: `plan:${item.id}` })), nextItem: { id: 'plan:p5' } }));
  assert.deepEqual(group(tree, 'plan').previewIds, ['plan:p1', 'plan:p2', 'plan:p5']);
  assert.equal(group(tree, 'plan').previewIds.filter(id => ['plan:p1', 'plan:p2', 'plan:p3', 'plan:p4'].includes(id)).length, 2);
});

test('all-pending and no-current previews still include the first pending by original index', () => {
  const plans = [plan('p1', '完成', 'completed'), plan('p2', '首项待办', 'pending'), plan('p3', '后续待办', 'pending'), plan('p4', '稍后', 'completed')];
  const tree = buildFlowMindmap(model({ plans }), overview({ nextItem: { id: 'plan:p2' } }));
  assert.deepEqual(group(tree, 'plan').previewIds, ['plan:p1', 'plan:p2', 'plan:p3']);
});

test('historical and over-limit plans retain original numbers and only the canonical first 80 rows', () => {
  const plans = Array.from({ length: 85 }, (_, index) => plan(`p${index + 1}`, `步骤 ${index + 1}`, index === 0 ? 'in_progress' : 'pending'));
  const tree = buildFlowMindmap(model({ plans, historical: true }), overview({ currentItems: [{ id: 'plan:p1' }], nextItem: { id: 'plan:p2' } }));
  const items = group(tree, 'plan').items;
  assert.equal(items.length, 80);
  assert.equal(items[0].index, 1);
  assert.equal(items.at(-1).id, 'plan:p80');
  assert.equal(items.at(-1).index, 80);
  assert.ok(items.every(item => item.current === false && item.next === false && item.stale === true));
  assert.deepEqual(group(tree, 'plan').previewIds, ['plan:p1', 'plan:p2', 'plan:p3']);
});

// Activity and child preview priorities.
test('activity preview prioritizes errors/interruption, then running, then newest sequence', () => {
  const activities = [
    activity('old-return', 'old return', 'returned', 100),
    activity('run-old', 'old running', 'running', 120),
    activity('err-old', 'old error', 'error', 4),
    activity('int-new', 'new interrupt', 'interrupted', 20),
    activity('err-new', 'new error', 'error', 30),
    activity('run-new', 'new running', 'running', 200),
  ];
  const tree = buildFlowMindmap(model({ activities }), overview());
  assert.deepEqual(group(tree, 'activity').previewIds, ['activity:err-new', 'activity:int-new', 'activity:err-old']);
  assert.equal(Object.hasOwn(group(tree, 'activity').items[0], 'seq'), false);
  assert.equal(group(tree, 'activity').count, activities.length);
});

test('child preview prioritizes waiting, then running, then original order', () => {
  const children = [child('idle', '空闲', 'idle'), child('run-a', '运行 A', 'running'), child('wait', '等待', 'waiting'), child('done', '完成', 'completed'), child('run-b', '运行 B', 'running')];
  const tree = buildFlowMindmap(model({ children }), overview());
  assert.deepEqual(group(tree, 'child').previewIds, ['child:wait', 'child:run-a', 'child:run-b']);
});

test('returned tools and completed children remain records, never completion claims', () => {
  const tree = buildFlowMindmap(model({ activities: [activity('a', '返回', 'returned', 1)], children: [child('c', '完成', 'completed')] }), overview({ statusKey: 'idle' }));
  assert.equal(group(tree, 'activity').items[0].status, 'returned');
  assert.equal(group(tree, 'child').items[0].status, 'completed');
  assert.equal(group(tree, 'activity').items[0].current, false);
  assert.equal(group(tree, 'child').items[0].next, false);
  assert.doesNotMatch(JSON.stringify(tree), /success|verified|验收通过/);
});

// Scope, empty branches, privacy, and immutability.
test('group counts use retained canonical rows while summaries state snapshot scope', () => {
  const tree = buildFlowMindmap(
    model({ plans: [plan('p1', 'A', 'pending')], activities: [activity('a', 'A', 'running', 1)], children: [child('c', 'C', 'waiting')] }),
    overview({ planCounts: { total: 999, completed: 998 } }),
  );
  assert.equal(group(tree, 'plan').count, 1);
  assert.equal(group(tree, 'activity').count, 1);
  assert.equal(group(tree, 'child').count, 1);
  assert.match(group(tree, 'plan').summary, /Agent 声明/);
  assert.match(group(tree, 'activity').summary, /可见快照/);
  assert.match(group(tree, 'child').summary, /可见快照/);
});

test('all three groups remain present and explicit when canonical arrays are empty', () => {
  const tree = buildFlowMindmap(model(), overview({ planCounts: { total: 0, completed: 0 } }));
  assert.deepEqual(tree.groups.map(item => ({ id: item.id, count: item.count, items: item.items, previewIds: item.previewIds })), [
    { id: 'plan', count: 0, items: [], previewIds: [] },
    { id: 'activity', count: 0, items: [], previewIds: [] },
    { id: 'child', count: 0, items: [], previewIds: [] },
  ]);
  assert.ok(tree.groups.every(item => typeof item.emptyLabel === 'string' && item.emptyLabel.length > 0));
});

test('never reads chat, tool bodies, errors, pending content, timestamps, or private fields', () => {
  const source = model({
    plans: [plan('p', 'Allowed plan', 'in_progress')],
    activities: [activity('a', 'Allowed activity', 'error', 3)],
    children: [child('c', 'Allowed child', 'waiting')],
  });
  for (const key of ['chat', 'messages', 'history', 'events', 'recent', 'thinking', 'reasoning', 'private', 'pendingInteraction', 'content', 'args', 'result', 'error', 'timestamp']) forbid(source, key);
  for (const key of ['content', 'arguments', 'result', 'output', 'message', 'error', 'timestamp', 'private']) forbid(source.activity[0], key);
  for (const key of ['content', 'question', 'questions', 'pendingInteraction', 'private']) forbid(source.children[0], key);
  for (const key of ['content', 'detail', 'dependencies', 'private']) forbid(source.plan.items[0], key);
  const view = overview({ currentItems: [{ id: 'plan:p' }], nextItem: null });
  for (const key of ['chat', 'messages', 'events', 'private', 'pendingContent', 'errors', 'timestamps']) forbid(view, key);
  const tree = buildFlowMindmap(source, view, {});
  assert.equal(tree.root.title, '完成目标');
  assert.doesNotMatch(JSON.stringify(tree), /PRIVATE_SENTINEL/);
});

test('does not inspect arbitrary options and leaves source objects unfrozen and unchanged', () => {
  const source = model({ plans: [plan('p', 'A', 'in_progress')], activities: [activity('a', 'A', 'running', 1)] });
  const before = JSON.stringify(source);
  const options = {};
  forbid(options, 'filter');
  const tree = buildFlowMindmap(source, overview({ currentItems: [{ id: 'plan:p' }] }), options);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.plan.items), false);
  assert.throws(() => { tree.groups[0].items[0].title = 'changed'; }, TypeError);
  assert.throws(() => { tree.groups.push({}); }, TypeError);
});
