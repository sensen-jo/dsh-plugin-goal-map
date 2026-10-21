/**
 * Pure, detached mindmap projection for the canonical session-flow model.
 *
 * This module deliberately reads only the small public shapes produced by
 * model.mjs and presentation.mjs. It does not traverse events, chat, tool
 * bodies, or private status fields, and it never infers edges between leaves.
 */

const PLAN_LIMIT = 80;
const PREVIEW_LIMIT = 3;
const PLAN_STATES = new Set(['pending', 'in_progress', 'completed']);
const TOOL_STATES = new Set(['running', 'returned', 'error', 'interrupted', 'unknown']);
const CHILD_STATES = new Set(['running', 'waiting', 'completed', 'interrupted', 'idle', 'unknown']);
const GOAL_STATES = new Set(['active', 'paused', 'blocked', 'complete', 'completed', 'unknown']);

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (value, key) => {
  try { return object(value) ? value[key] : undefined; } catch { return undefined; }
};
const array = value => Array.isArray(value) ? value : [];
const string = value => typeof value === 'string' ? value : '';
const status = (value, allowed) => {
  const candidate = get(value, 'status');
  return allowed.has(candidate) ? candidate : 'unknown';
};
const freeze = value => {
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value);
  }
  if (object(value)) {
    for (const key of Object.keys(value)) freeze(value[key]);
    return Object.freeze(value);
  }
  return value;
};

function row(value, kind, allowed, index) {
  const id = get(value, 'id');
  if (typeof id !== 'string' || id.length === 0) return null;
  const title = string(get(value, 'title')) || (kind === 'plan' ? '未命名计划项' : kind === 'activity' ? '未知工具' : '未命名子代理');
  return {
    id: `${kind}:${id}`,
    kind,
    title,
    status: status(value, allowed),
    ...(kind === 'plan' ? { index } : {}),
  };
}

function rows(value, kind, allowed, limit = Infinity) {
  const result = [];
  let index = 0;
  for (const item of array(value)) {
    index += 1;
    if (index > limit) break;
    const normalized = row(item, kind, allowed, index);
    if (normalized) result.push(normalized);
  }
  return result;
}

function planRows(model) {
  return rows(get(get(model, 'plan'), 'items'), 'plan', PLAN_STATES, PLAN_LIMIT);
}

function liveKnown(overview) {
  return get(overview, 'liveKnown') === true;
}

function planMarkersAllowed(overview, historical) {
  const key = get(overview, 'statusKey');
  return liveKnown(overview) && !historical && key === 'running';
}

function nextMarkerAllowed(overview, historical) {
  const key = get(overview, 'statusKey');
  return liveKnown(overview) && !historical && (key === 'running' || key === 'idle');
}

function isCurrent(item, overview, historical = false) {
  if (!planMarkersAllowed(overview, historical) || item.status !== 'in_progress') return false;
  const ids = array(get(overview, 'currentItems'));
  for (const current of ids) if (get(current, 'id') === item.id) return true;
  return false;
}

function isNext(item, overview, historical = false) {
  if (!nextMarkerAllowed(overview, historical) || item.status !== 'pending') return false;
  const next = get(overview, 'nextItem');
  return object(next) && get(next, 'id') === item.id;
}

function staleFor(item, kind, overview, historical, current) {
  if (!liveKnown(overview)) return true;
  if (kind === 'plan' && historical) return true;
  // An in-progress declaration not named by the live overview is only a
  // retained declaration, especially when the parent is idle or waiting.
  if (kind === 'plan' && item.status === 'in_progress' && !current) return true;
  return false;
}

function planPreview(items, overview, historical) {
  if (historical || !liveKnown(overview)) return items.slice(0, PREVIEW_LIMIT).map(item => item.id);
  const current = items.filter(item => item.current === true);
  const firstPending = items.find(item => item.status === 'pending');
  const selected = [];
  // Keep the compact view honest when many declarations are active: two
  // current declarations plus the first pending item, never three actives.
  if (current.length > 3) {
    selected.push(...current.slice(0, 2));
    if (firstPending) selected.push(firstPending);
  } else {
    selected.push(...current.slice(0, current.length > 1 ? 2 : 1));
    if (firstPending && selected.length < PREVIEW_LIMIT) selected.push(firstPending);
    for (const item of items) {
      if (selected.length >= PREVIEW_LIMIT) break;
      if (!selected.some(candidate => candidate.id === item.id)) selected.push(item);
    }
  }
  // IDs are always returned in original plan order; priority only chooses the
  // members of the set, never an invented execution ordering.
  const chosen = new Set(selected.map(item => item.id));
  return items.filter(item => chosen.has(item.id)).map(item => item.id);
}

function activityRecords(value) {
  const result = [];
  const source = array(value);
  for (let index = 0; index < source.length; index += 1) {
    const node = row(source[index], 'activity', TOOL_STATES, index + 1);
    if (!node) continue;
    const rawSeq = get(source[index], 'seq');
    result.push({ node, seq: Number.isSafeInteger(rawSeq) && rawSeq >= 0 ? rawSeq : -1, order: index });
  }
  return result;
}

function activityPreview(records) {
  return records
    .slice()
    .sort((a, b) => {
      const rank = record => record.node.status === 'error' || record.node.status === 'interrupted' ? 0 : record.node.status === 'running' ? 1 : 2;
      return rank(a) - rank(b) || b.seq - a.seq || a.order - b.order;
    })
    .slice(0, PREVIEW_LIMIT)
    .map(record => record.node.id);
}

function childPreview(items) {
  return items
    .map((node, order) => ({ node, order }))
    .sort((a, b) => {
      const rank = item => item.node.status === 'waiting' ? 0 : item.node.status === 'running' ? 1 : 2;
      return rank(a) - rank(b) || a.order - b.order;
    })
    .slice(0, PREVIEW_LIMIT)
    .map(record => record.node.id);
}

function group(id, title, items, { historical = false, emptyLabel, summary, previewIds }) {
  return {
    id,
    title,
    count: items.length,
    summary,
    historical,
    emptyLabel,
    items,
    previewIds,
  };
}

function statusLabel(key) {
  const labels = {
    active: '目标进行中',
    running: '运行中',
    'waiting-input': '等待输入',
    idle: '空闲',
    completed: '目标已标记完成',
    complete: '目标已标记完成',
    blocked: '受阻',
    paused: '已暂停',
    error: '执行出错',
    interrupted: '已中断',
    unknown: '状态未知',
    disconnected: '连接已断开',
    reconnecting: '正在重连',
    connecting: '正在连接',
    stale: '状态已过期',
    loading: '加载中',
    removed: '会话已移除',
  };
  return labels[key] || '状态未知';
}

/**
 * Build a detached, deeply frozen mindmap tree from canonical model data.
 *
 * @param {object} model buildFlowModel() output
 * @param {object} overview buildFlowOverview() output
 * @param {object} [options] Reserved for UI-side filters; this pure projection
 * intentionally does not inspect arbitrary option fields.
 * @returns {{root: object, groups: object[], edgeMeaning: string, headline: string, liveKnown: boolean, statusKey: string}}
 */
export function buildFlowMindmap(model = {}, overview = {}, options = {}) {
  // Keep the third parameter API-compatible without reading it: filtering is a
  // view concern, while this tree must retain canonical order and totals.
  void options;

  const goal = get(model, 'goal');
  const goalText = string(get(goal, 'text'));
  const goalSource = string(get(goal, 'source'));
  const goalTitle = goalText || string(get(goal, 'title')) || '当前会话';
  const fallback = goalSource === 'session-title' || !goalText;
  const overviewStatusKey = string(get(overview, 'statusKey')) || 'unknown';
  const goalStatus = get(goal, 'status');
  const rootStatus = GOAL_STATES.has(goalStatus) ? goalStatus : 'unknown';
  const headline = string(get(overview, 'headline')) || statusLabel(overviewStatusKey);
  const known = liveKnown(overview);
  const plan = get(model, 'plan');
  const historical = get(plan, 'historical') === true;
  const planItems = planRows(model);
  const activitySource = get(model, 'activity');
  const activityRecordsList = activityRecords(activitySource);
  const activityItems = activityRecordsList.map(record => record.node);
  const childItems = rows(get(model, 'children'), 'child', CHILD_STATES);

  const decorate = (items, kind) => items.map(item => {
    const current = kind === 'plan' ? isCurrent(item, overview, historical) : false;
    const next = kind === 'plan' ? isNext(item, overview, historical) : false;
    return {
      ...item,
      current,
      next,
      stale: staleFor(item, kind, overview, historical, current),
    };
  });
  const planNodes = decorate(planItems, 'plan');
  const activityNodes = decorate(activityItems, 'activity');
  const childNodes = decorate(childItems, 'child');

  const overviewPlan = get(overview, 'plan');
  const planCounts = object(overviewPlan) ? overviewPlan : {};
  const root = {
    id: 'goal',
    title: goalTitle,
    kind: 'goal',
    status: rootStatus,
    statusLabel: statusLabel(rootStatus),
    liveKnown: known,
    fallback,
  };
  const groups = [
    group('plan', historical ? '上轮计划' : '计划', planNodes, {
      historical,
      summary: historical ? '历史记录，不计入当前进度 · 可见快照' : `${get(planCounts, 'completed') ?? 0} / ${get(planCounts, 'total') ?? planNodes.length} · Agent 声明 · 可见快照`,
      emptyLabel: historical ? '暂无可回看的历史计划' : '尚无明确计划',
      previewIds: planPreview(planNodes, overview, historical),
    }),
    group('activity', '工具活动', activityNodes, {
      summary: known ? '公开工具生命周期记录 · 可见快照' : '最近可见记录，可能已变化',
      emptyLabel: '暂无工具活动',
      previewIds: activityPreview(activityRecordsList.map((record, index) => ({
        node: activityNodes[index],
        seq: record.seq,
        order: record.order,
      })).filter(record => record.node)),
    }),
    group('child', '子代理', childNodes, {
      summary: known ? '直接子代理公开状态 · 可见快照' : '最近可见状态，可能已变化',
      emptyLabel: '暂无直接子代理',
      previewIds: childPreview(childNodes),
    }),
  ];
  return freeze({
    root,
    groups,
    edgeMeaning: '分组关系，非执行依赖',
    headline,
    liveKnown: known,
    statusKey: overviewStatusKey,
  });
}
