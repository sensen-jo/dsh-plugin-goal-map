/**
 * Pure overview of buildFlowModel's canonical output. Browser-safe: no imports,
 * I/O, Session access, event traversal, tool parameters/results, or chat parsing.
 * Only status.key, plan.items/historical and activity/children id/title/status
 * are read. Canonical titles remain plain strings for the UI to render as text.
 *
 * A plan's in_progress/completed values are Agent declarations, not execution
 * receipts or acceptance. Counts cover visible canonical nodes only and always
 * remain snapshot counts, even when a live connection is available.
 */
const STATUS_KEYS = new Set(['running', 'waiting-input', 'idle', 'completed', 'complete', 'blocked', 'paused', 'error', 'interrupted', 'unknown', 'disconnected', 'reconnecting', 'connecting', 'stale', 'loading', 'removed']);
const UNAVAILABLE = new Set(['unknown', 'disconnected', 'reconnecting', 'connecting', 'stale', 'loading', 'removed']);
const PLAN_STATES = new Set(['pending', 'in_progress', 'completed']);
const TOOL_STATES = new Set(['running', 'returned', 'error', 'interrupted', 'unknown']);
const CHILD_STATES = new Set(['running', 'waiting', 'completed', 'interrupted', 'idle', 'unknown']);
const REFERENCE_STATES = new Set(['running', 'idle']);
const NEXT_NOTE = '待办首项 · 按列表顺序；仅供计划顺序参考，不是下一步实际执行承诺，也不表示依赖关系。';
const NEXT_POLICY_NOTE = '始终取正式计划原列表中第一个 pending，不因进行中项的位置跳过更早待办；不保证实际执行先后或紧跟当前项。';
const BASE_NOTICES = Object.freeze([
  '计划状态由 Agent 声明，不等于执行收据或验收结果。',
  '工具已返回只说明调用已返回，不代表验证成功、后台任务结束或整体目标完成。',
  '子代理报告完成只表示最近一轮正常结束，不等于委派目标已验收。',
  '工具与子代理独立展示公开状态，不推断其与计划项的归属、依赖或执行关系。',
]);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (value, key) => { try { return object(value) ? value[key] : undefined; } catch { return undefined; } };
const list = value => Array.isArray(value) ? value : [];

// The optional projectionState is the Host's existing flags shape, not raw
// projection content. It closes the canonical status precedence gap where a
// running Session can coexist with stale/loading goal or todo projections.
function projectionFlags(value) {
  if (typeof value === 'string') return { stale: value === 'stale' || value === 'error', loading: value === 'loading' || value === 'cold' };
  const state = get(value, 'state') ?? get(value, 'status') ?? get(value, 'phase');
  return {
    stale: get(value, 'stale') === true || state === 'stale' || state === 'error',
    loading: get(value, 'loading') === true || state === 'loading' || state === 'cold',
  };
}

function row(value, kind, states, index) {
  const id = get(value, 'id');
  if (typeof id !== 'string' || !id) return null;
  const title = get(value, 'title');
  const status = get(value, 'status');
  return Object.freeze({
    id: `${kind}:${id}`,
    kind,
    title: typeof title === 'string' ? title : kind === 'plan' ? '未命名计划项' : kind === 'activity' ? '未知工具' : '未命名子代理',
    status: states.has(status) ? status : 'unknown',
    ...(kind === 'plan' ? { index } : {}),
  });
}

function rows(value, kind, states) {
  const result = [];
  let index = 0;
  for (const item of list(value)) {
    const normalized = row(item, kind, states, ++index);
    if (normalized) result.push(normalized);
  }
  return result;
}

function summary(statusKey, currentItems, plan) {
  switch (statusKey) {
    case 'disconnected': return ['stale', '连接未就绪，暂不能确认当前执行', '保留最近可见记录；计划、工具和子代理的记录都不保证仍是当前状态。'];
    case 'reconnecting': return ['stale', '连接正在恢复，暂不能确认当前执行', '重连期间只展示最近可见记录，不据旧的进行中标记描述当前工作。'];
    case 'connecting': return ['stale', '连接尚未就绪，等待状态同步', '在取得实时状态前，不确认父会话或任何计划项正在执行。'];
    case 'stale': return ['stale', '状态已过期，暂不能确认当前进度', '正式状态或投影暂不可用；以下为最近可见记录，不作为当前项或下一项。'];
    case 'loading': return ['stale', '状态仍在加载，暂不能确认当前进度', '等待正式状态和投影就绪；缺少数据不代表没有计划，也不能用旧记录推断正在执行。'];
    case 'removed': return ['stale', '会话已移除，不再跟踪当前执行', '保留的节点只供回看，不作为当前项或下一项。'];
    case 'waiting-input': return ['waiting', '需要你答复或确认', '父会话的正式状态为等待输入；未读取问题或确认内容，等待也不等于任务完成。'];
    case 'running': {
      if (currentItems.length > 1) return ['running', `计划有 ${currentItems.length} 项标记进行中`, '这些都是正式计划中的 in_progress 声明；逐项展示，不任选其中一项当作唯一当前项，也不据此推断同时执行或依赖关系。'];
      if (currentItems.length === 1) return ['running', `计划标记进行中：${currentItems[0].title}`, `当前参考为计划第 ${currentItems[0].index} 项；依据 Agent 的 in_progress 声明，不表示工具已经归属该项或实际执行已验证。`];
      if (plan.historical) return ['running', '会话运行中，但当前只有历史计划', '上一轮计划不作为本轮进度；不从工具活动或子代理状态猜测当前计划项。'];
      if (plan.total === 0) return ['running', '会话运行中，尚未提供正式计划', '只确认父会话的正式运行状态；不从聊天、工具或子代理内容编造步骤。'];
      return ['running', '会话运行中，计划暂无进行中项', '没有正式 in_progress 声明；待办只是计划顺序参考，不因此成为正在执行的步骤。'];
    }
    case 'idle': return ['neutral', '会话当前空闲，不代表任务已完成', '正式状态没有表明父会话正在执行；计划完成数、工具返回或子代理结束都不能替代目标验收。'];
    case 'completed':
    case 'complete': return ['neutral', '正式目标已标记完成（非验收）', '这是正式状态标记，不表示外部验收通过；不会把计划完成数、工具返回或子代理回合结束升级为验收结果。'];
    case 'blocked': return ['attention', '父会话正式状态为受阻', '依据父会话自身的正式状态，不将子代理等待或工具错误自动归因为父任务受阻。'];
    case 'paused': return ['waiting', '父会话已暂停', '依据正式暂停状态；保留计划声明供查看，不推断任何计划项仍在执行。'];
    case 'error': return ['attention', '父会话报告执行出错', '依据父会话正式生命周期状态；未读取错误正文，不根据子代理或工具记录猜测根因。'];
    case 'interrupted': return ['attention', '父会话最近一轮已中断', '中断不等于目标完成；保留计划声明，不将旧的进行中项描述为当前执行。'];
    default: return ['neutral', '暂不能确认会话执行状态', '缺少正式生命周期事实；不据计划、工具或子代理记录猜测父会话正在执行或已完成。'];
  }
}

/**
 * Build a detached, deeply readonly overview from canonical buildFlowModel data.
 *
 * @param {object} model Canonical model, never a Session or raw events object.
 * @param {object} [options]
 * @param {string} [options.connection='connected'] Only exact 'connected' is live.
 * @param {string|object} [options.projectionState] Optional Host flags, including
 *   common/goal/todos stale/loading flags. Never projection values or bodies.
 * @returns {object} currentItems/nextItem use UI full ids and 1-based index.
 *   plan.activeCount counts declarations (including historical/snapshot ones).
 *   plan.actionable means usable as this turn's plan reference, NOT permission
 *   to execute. Only running/idle can have an actionable plan.
 *   currentItems additionally requires parent running; only a single current
 *   plan item gets focus. Multiple current items deliberately have no focus.
 *   nextItem is always the first pending in the original formal list, regardless
 *   of where active items occur; this reference never promises execution order.
 *   counts/attention always cover visible snapshots, never global totals.
 */
export function buildFlowOverview(model, { connection = 'connected', projectionState } = {}) {
  const rawKey = get(get(model, 'status'), 'key');
  const modelStatusKey = STATUS_KEYS.has(rawKey) ? rawKey : 'unknown';
  const commonFlags = projectionFlags(projectionState);
  const goalFlags = projectionFlags(get(projectionState, 'goal'));
  const todoFlags = projectionFlags(get(projectionState, 'todos'));
  const stale = commonFlags.stale || goalFlags.stale || todoFlags.stale;
  const loading = commonFlags.loading || goalFlags.loading || todoFlags.loading;
  let statusKey = modelStatusKey;
  if (connection !== 'connected') statusKey = connection === 'connecting' || connection === 'reconnecting' ? connection : 'disconnected';
  else if (modelStatusKey === 'removed' || modelStatusKey === 'disconnected' || modelStatusKey === 'reconnecting' || modelStatusKey === 'connecting') statusKey = modelStatusKey;
  else if (modelStatusKey === 'stale' || stale) statusKey = 'stale';
  else if (modelStatusKey === 'loading' || loading) statusKey = 'loading';
  const liveKnown = connection === 'connected' && !UNAVAILABLE.has(statusKey);

  const canonicalPlan = get(model, 'plan');
  const planItems = rows(get(canonicalPlan, 'items'), 'plan', PLAN_STATES);
  const historical = get(canonicalPlan, 'historical') === true;
  const completed = planItems.filter(item => item.status === 'completed').length;
  const active = planItems.filter(item => item.status === 'in_progress');
  const pendingCount = planItems.filter(item => item.status === 'pending').length;
  const total = planItems.length;
  const incomplete = get(canonicalPlan, 'invalid') === true || get(canonicalPlan, 'truncated') === true;
  const actionable = liveKnown && REFERENCE_STATES.has(statusKey) && !historical && !incomplete && total > 0;
  const plan = Object.freeze({
    total,
    completed,
    activeCount: active.length,
    actionable,
    historical,
    pendingCount,
    progressLabel: total === 0 ? '尚无正式计划' : `${historical ? '历史计划' : '计划'}自报完成 ${completed} / ${total}${historical ? '（非本轮进度）' : '（非验收）'}`,
  });
  const currentItems = Object.freeze(actionable && statusKey === 'running' ? active : []);
  const candidate = actionable ? planItems.find(item => item.status === 'pending') : undefined;
  const nextItem = candidate ? Object.freeze({ ...candidate, note: NEXT_NOTE }) : null;
  const uniqueCurrent = currentItems.length === 1 ? currentItems[0] : null;

  const activities = rows(get(model, 'activity'), 'activity', TOOL_STATES);
  const children = rows(get(model, 'children'), 'child', CHILD_STATES);
  const waitingChildren = children.filter(item => item.status === 'waiting');
  const attentionTools = activities.filter(item => item.status === 'error' || item.status === 'interrupted');
  const attention = Object.freeze([...waitingChildren, ...attentionTools]);
  const counts = Object.freeze({
    toolsRunning: activities.filter(item => item.status === 'running').length,
    toolsReturned: activities.filter(item => item.status === 'returned').length,
    toolsAttention: attentionTools.length,
    childrenRunning: children.filter(item => item.status === 'running').length,
    childrenWaiting: waitingChildren.length,
  });

  const [tone, rawHeadline, baseExplanation] = summary(statusKey, currentItems, plan);
  const headline = incomplete && liveKnown && statusKey === 'running' ? '计划状态待核对，暂不确认当前步骤' : rawHeadline;
  const notes = [incomplete ? '本轮计划状态无效或已截断，以下保留快照待核对，不作为当前项或待办顺序参考。' : baseExplanation];
  if (historical && statusKey !== 'running') notes.push('历史计划只供回看，不作为当前项或下一项。');
  if (nextItem) notes.push('下一项仅按计划列表顺序参考，不是执行承诺。');
  if (attention.length > 0) {
    notes.push(liveKnown
      ? `另有 ${counts.childrenWaiting} 个子代理等待答复或确认、${counts.toolsAttention} 次工具错误或中断记录需关注；这些记录不代表父任务受阻。`
      : `另保留 ${attention.length} 项上次可见的关注记录，需在状态同步后核对。`);
  }
  const notices = [...BASE_NOTICES];
  if (!liveKnown) notices.push('计数和关注项保留最近可见记录，不保证仍为当前状态。');
  if (historical) notices.push('历史计划不作为本轮当前项或下一项；历史完成数不算当前进度。');

  return Object.freeze({
    tone,
    headline,
    explanation: notes.join(' '),
    statusKey,
    modelStatusKey,
    liveKnown,
    focusId: uniqueCurrent?.id ?? null,
    focusKind: uniqueCurrent?.kind ?? null,
    currentItems,
    nextItem,
    nextPolicy: 'first-pending',
    nextNote: `${NEXT_NOTE} ${NEXT_POLICY_NOTE}`,
    plan,
    counts,
    countsScope: 'visible-snapshot',
    countsLabel: liveKnown ? '当前可见节点的记录（非全局总量）' : '最近可见节点的快照（不保证是当前状态）',
    attention,
    attentionLabel: liveKnown ? '需要关注的公开状态' : '上次可见的关注项（可能已变化）',
    notices: Object.freeze(notices),
  });
}
