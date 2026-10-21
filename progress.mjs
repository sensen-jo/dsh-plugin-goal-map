/**
 * Pure goal/plan progress projection of the public canonical model + overview.
 * No imports, I/O, event/chat traversal, tool bodies, or acceptance inference.
 * Read only goal text/source/status; plan items/historical/truncated/omitted/invalid;
 * activity/children status; overview liveKnown/statusKey/currentItems[].id.
 * Counts describe bounded visible snapshots, never accumulated work or effort.
 */
const PLAN_LIMIT = 80;
const TOOL_LIMIT = 32;
const CHILD_LIMIT = 48;
const PLAN_STATES = new Set(['pending', 'in_progress', 'completed']);
const GOAL_STATES = new Set(['active', 'paused', 'blocked', 'complete', 'completed', 'unknown']);
const STATUS_KEYS = new Set(['running', 'waiting-input', 'idle', 'completed', 'complete', 'blocked', 'paused', 'error', 'interrupted', 'unknown', 'disconnected', 'reconnecting', 'connecting', 'stale', 'loading', 'removed']);
const UNAVAILABLE = new Set(['unknown', 'disconnected', 'reconnecting', 'connecting', 'stale', 'loading', 'removed']);
const BASE_NOTE = '仅按可见计划范围内的条目等权计数；状态由 Agent 声明，非目标验收；未计工具返回/子代理，也不衡量工作量。计划增删会重新计算，百分比可以回退，不作永久累积。';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (value, key) => {
  try { return object(value) ? value[key] : undefined; } catch { return undefined; }
};
const array = value => {
  try { return Array.isArray(value) ? value : null; } catch { return null; }
};
const size = value => {
  try { return Number.isSafeInteger(value?.length) && value.length >= 0 ? value.length : 0; } catch { return 0; }
};
const at = (value, index) => {
  try { return value[index]; } catch { return undefined; }
};
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
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

function readPlan(plan) {
  const rawItems = get(plan, 'items');
  const items = array(rawItems);
  const length = size(items);
  const historicalFlag = get(plan, 'historical');
  const truncatedFlag = get(plan, 'truncated');
  const omitted = get(plan, 'omitted');
  const invalidFlag = get(plan, 'invalid');
  // A positive legacy truncation count also fails closed. New canonical output
  // supplies boolean truncated and nonnegative integer omitted.
  const truncated = length > PLAN_LIMIT || truncatedFlag === true ||
    (nonnegative(truncatedFlag) && truncatedFlag > 0) || (nonnegative(omitted) && omitted > 0);
  let invalid = invalidFlag === true || (invalidFlag !== undefined && typeof invalidFlag !== 'boolean') ||
    (rawItems !== undefined && !items) ||
    (historicalFlag !== undefined && typeof historicalFlag !== 'boolean') ||
    (truncatedFlag !== undefined && typeof truncatedFlag !== 'boolean') ||
    (omitted !== undefined && !nonnegative(omitted));
  const counts = { completed: 0, total: Math.min(length, PLAN_LIMIT), active: 0, pending: 0, unknown: 0 };
  const rows = [];
  const seen = new Set();
  for (let index = 0; index < counts.total; index += 1) {
    const item = at(items, index);
    const id = get(item, 'id');
    const title = get(item, 'title');
    const rawStatus = get(item, 'status');
    const status = PLAN_STATES.has(rawStatus) ? rawStatus : 'unknown';
    if (status === 'completed') counts.completed += 1;
    else if (status === 'in_progress') counts.active += 1;
    else if (status === 'pending') counts.pending += 1;
    else { counts.unknown += 1; invalid = true; }
    // Never drop an invalid-status slot from the denominator/unknown count.
    // Invalid identities/titles also disable the entire current-plan reference.
    if (typeof id !== 'string' || id.length === 0 || typeof title !== 'string' || seen.has(id)) {
      invalid = true;
      continue;
    }
    seen.add(id);
    rows.push({ id: `plan:${id}`, title, index: index + 1, status });
  }
  return { rows, counts, historical: historicalFlag === true, truncated, invalid };
}

function readGoal(model, known) {
  const source = get(model, 'goal');
  const rawText = get(source, 'text');
  const formal = get(source, 'source') === 'goal-projection' && typeof rawText === 'string' && rawText.trim().length > 0;
  const rawStatus = get(source, 'status');
  const status = formal && GOAL_STATES.has(rawStatus) ? rawStatus : 'unknown';
  let label = !formal ? '尚无明确正式目标（会话标题不代表本人要求）' :
    status === 'active' ? '正式目标进行中' :
    status === 'paused' ? '正式目标已暂停' :
    status === 'blocked' ? '正式目标受阻' :
    status === 'complete' || status === 'completed' ? 'Agent 已标记目标完成（非目标验收）' : '正式目标状态未知';
  if (!known) label = `上次可见：${label}`;
  // A session-title fallback is deliberately not returned as requirement text.
  return { text: formal ? rawText : '', formal, status, label };
}

function countStatus(value, limit, first, second) {
  const items = array(value);
  const count = Math.min(size(items), limit);
  const result = [0, 0];
  for (let index = 0; index < count; index += 1) {
    const status = get(at(items, index), 'status');
    if (status === first) result[0] += 1;
    else if (status === second) result[1] += 1;
  }
  return result;
}

function activitySnapshot(model, known) {
  const [runningTools, returnedTools] = countStatus(get(model, 'activity'), TOOL_LIMIT, 'running', 'returned');
  const [runningChildren, waitingChildren] = countStatus(get(model, 'children'), CHILD_LIMIT, 'running', 'waiting');
  return {
    runningTools,
    returnedTools,
    runningChildren,
    waitingChildren,
    scopeLabel: `${known ? '可见节点快照' : '上次可见节点快照（不保证当前状态）'}；工具最多 32 项、子代理最多 48 项，非全量；独立计数，未计入计划进度。`,
  };
}

function unavailableText(reason, key) {
  if (reason === 'no-plan') return ['尚无本轮计划', '没有可计算的明确本轮计划；不能从目标标记、工具或子代理推断剩余要求。'];
  if (reason === 'historical') return ['上轮计划快照（非本轮剩余）', '当前可见的是历史计划，只供回看；历史声明不作为本轮当前项、剩余项或百分比。'];
  if (reason === 'truncated') return ['计划快照已截断（剩余待核对）', '计划超出 80 项上限或公开计划标记存在遗漏；计数仅覆盖可见快照，无法确认完整本轮计划范围，不提供百分比或当前/剩余列表。'];
  if (reason === 'invalid-plan') return ['计划状态待核对', '可见计划含无效条目、重复标识、未知状态或无效范围标记；未知状态保留计数，不缩小分母；快照不作为当前/剩余列表。'];
  const state = key === 'disconnected' ? '连接已断开' : key === 'connecting' ? '连接尚未就绪' :
    key === 'reconnecting' ? '连接正在恢复' : key === 'stale' ? '正式状态或投影已过期' :
    key === 'loading' ? '正式状态或投影仍在加载' : key === 'removed' ? '会话已移除' : '实时状态未知';
  return ['上次可见计划快照（当前剩余待同步）', `${state}；只保留上次可见声明，不保证仍是当前状态；同步前不提供本轮百分比、当前项或剩余项。`];
}

function remainingText(goal, counts, key) {
  const remaining = counts.total - counts.completed;
  const goalComplete = goal.formal && (goal.status === 'complete' || goal.status === 'completed');
  const lifecycle = {
    'waiting-input': ['等待输入', '需要用户答复或确认；保留的进行中声明不表示仍在执行。'],
    blocked: ['受阻', '父会话正式状态为受阻；不从工具或子代理记录推断原因。'],
    paused: ['已暂停', '父会话正式状态为暂停；不将保留的进行中声明描述为正在做。'],
    error: ['执行出错', '父会话正式生命周期报告错误；计划状态不说明错误原因或恢复结果。'],
    interrupted: ['已中断', '最近一轮已中断；保留的进行中声明不表示仍在执行。'],
    idle: ['当前空闲', '父会话当前未运行；进行中标记只保留计划声明。'],
    completed: ['', '会话正式状态标记完成，非目标验收。'],
    complete: ['', '会话正式状态标记完成，非目标验收。'],
    running: ['', '当前项仅依据已同步的会话运行状态与计划进行中声明，不推断工具归属、依赖或下一步执行承诺。'],
  };
  const [prefix, stateNote] = lifecycle[key] || ['', '计划声明不能替代正式执行状态。'];
  let label, note;
  if (goalComplete && remaining > 0) {
    label = `目标已标记完成，但本轮计划尚有 ${remaining} 项未完成（待核对）`;
    note = 'Agent 的目标完成标记与本轮计划声明存在冲突，待核对；不自动将未完条目改为完成，也不将目标标记升级为验收。';
  } else if (remaining === 0) {
    label = goalComplete ? '本轮计划已报告全完成，目标由 Agent 标记完成（非目标验收）' :
      goal.formal && goal.status === 'active' ? '本轮计划已报告全完成，正式目标仍进行中' :
      goal.formal && goal.status === 'paused' ? '本轮计划已报告全完成，正式目标仍暂停' :
      goal.formal && goal.status === 'blocked' ? '本轮计划已报告全完成，正式目标仍受阻' :
      goal.formal ? '本轮计划已报告全完成，正式目标状态待核对' : '本轮计划已报告全完成，完整要求覆盖尚未确认';
    note = '全部可见本轮计划项已由 Agent 报告完成；计划全完成不等于完整要求已覆盖或目标验收通过。';
  } else {
    label = `本轮计划尚有 ${remaining} 项未完成`;
    note = '以下包含所有尚未报告 completed 的本轮计划项，保留原顺序与原编号；这些只是计划缺口，不代表完整要求缺口。';
  }
  return [prefix ? `${prefix}：${label}` : label, `${stateNote} ${note}`];
}

/**
 * Return a detached, deeply frozen plain object. Percent is floor(completed /
 * total * 100) only for a live, nonhistorical, complete, valid plan of 1..80
 * items. This measures Agent-declared equal-weight plan items, not acceptance.
 * Reason precedence: unavailable, historical, a genuinely empty live plan,
 * truncated, invalid-plan. Missing optional truncation metadata is supported; explicit
 * omitted > 0 or an over-limit array always suppresses the percentage.
 */
export function buildGoalProgress(model = {}, overview = {}) {
  const rawKey = get(overview, 'statusKey');
  const statusKey = STATUS_KEYS.has(rawKey) ? rawKey : 'unknown';
  const liveKnown = get(overview, 'liveKnown') === true && !UNAVAILABLE.has(statusKey);
  const goal = readGoal(model, liveKnown);
  const plan = readPlan(get(model, 'plan'));
  const { counts } = plan;
  const reason = !liveKnown ? 'unavailable' : plan.historical ? 'historical' :
    counts.total === 0 && !plan.invalid && !plan.truncated ? 'no-plan' :
    plan.truncated ? 'truncated' : plan.invalid ? 'invalid-plan' : null;
  const available = reason === null;
  const percent = available ? Math.floor(counts.completed / counts.total * 100) : null;
  let currentItems = [], completedItems = [], remainingItems = [];
  if (available) {
    completedItems = plan.rows.filter(item => item.status === 'completed');
    remainingItems = plan.rows.filter(item => item.status !== 'completed');
    if (statusKey === 'running') {
      const candidates = array(get(overview, 'currentItems'));
      const ids = new Set();
      for (let index = 0; index < Math.min(size(candidates), PLAN_LIMIT); index += 1) {
        const id = get(at(candidates, index), 'id');
        if (typeof id === 'string') ids.add(id);
      }
      currentItems = plan.rows.filter(item => item.status === 'in_progress' && ids.has(item.id));
    }
  }
  const [remainingLabel, remainingNote] = available ? remainingText(goal, counts, statusKey) : unavailableText(reason, statusKey);
  const label = available ? `本轮计划已报告完成 ${counts.completed} / ${counts.total}` :
    reason === 'no-plan' ? '尚无本轮计划进度' :
    reason === 'historical' ? `上轮计划已报告完成 ${counts.completed} / ${counts.total}（非本轮进度）` :
    reason === 'unavailable' ? `上次可见计划已报告完成 ${counts.completed} / ${counts.total}（非当前进度）` :
    `已报告计划快照完成 ${counts.completed} / ${counts.total}（${reason === 'truncated' ? '已截断，非完整进度' : '状态无效，待核对'}）`;
  const coverageNote = goal.formal ? '正式目标与计划未建立逐条要求覆盖或验收关系。' : '尚无明确正式目标；计划进度不代表完整要求覆盖。';
  return freeze({
    goal,
    available,
    reason,
    progress: { ...counts, percent, label, note: `${BASE_NOTE} ${coverageNote}${available ? '' : ` ${remainingNote}`}` },
    currentItems,
    completedItems,
    remainingItems,
    remainingLabel,
    remainingNote,
    activity: activitySnapshot(model, liveKnown),
    statusKey,
    liveKnown,
  });
}
