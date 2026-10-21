/**
 * Session-flow's pure, browser-safe data boundary. No imports, I/O, history,
 * message-content traversal, tool-output parsing, or inferred business success.
 *
 * SDK contract checked against the installed 0.2 declarations:
 * dsh-session/types, dsh-tools/types, dsh-tool-todo/types,
 * dsh-client-ui-conversation/client/contract/conversation.
 */
export const FLOW_KIND = 'session-flow-event';
export const FLOW_TARGET = 'session-flow';
export const FLOW_LIMITS = Object.freeze({ events: 600, tools: 32, running: 24, results: 12, recent: 12, todos: 80, children: 48, description: 80 });
const TYPES = new Set(['turn/start', 'turn/end', 'step/start', 'step/end', 'todo/write', 'tool/call', 'tool/result', 'tool/ptc-dispatch-start', 'tool/ptc-dispatch']);
const TODO_STATES = new Set(['pending', 'in_progress', 'completed']);
const END_REASONS = new Set(['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted', 'forked']);
// Exact, closed vocabulary: arbitrary codes may contain private data.
const ERROR_CODES = new Set(['ABORTED', 'ABORTED_BEFORE_DISPATCH', 'UNKNOWN_TOOL', 'INVALID_TOOL_OUTPUT', 'INVALID_TOOL_ARGUMENTS', 'INVALID_ARGS', 'TOOL_ARGS_ERROR', 'UNKNOWN', 'TIMEOUT', 'PERMISSION_DENIED', 'SANDBOX_DENIED']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (value, key) => { try { return object(value) ? value[key] : undefined; } catch { return undefined; } };
const integer = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => Number.isFinite(value) && value >= 0 ? value : null;
const identifier = (value, cap = 160) => typeof value === 'string' && value.length <= cap && /^[a-zA-Z0-9_.:@/\-]+$/.test(value) ? value : null;
const text = (value, cap = 240) => typeof value === 'string' ? value.slice(0, cap * 4).replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, cap) : '';
const code = value => ERROR_CODES.has(value) ? value : undefined;
const freeze = value => {
  if (Array.isArray(value)) { for (const item of value) freeze(item); return Object.freeze(value); }
  if (object(value)) { for (const key of Object.keys(value)) freeze(value[key]); return Object.freeze(value); }
  return value;
};

/** Validate the official whole-list schema, then retain only capped content/status. */
function todos(value) {
  if (!Array.isArray(value) || value.length > 10000) return null;
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    const content = get(item, 'content');
    const status = get(item, 'status');
    if (typeof content !== 'string' || !TODO_STATES.has(status)) return null;
    if (i < FLOW_LIMITS.todos) result.push({ content: text(content), status });
  }
  return result;
}

function locationNumbers(location, data) {
  const kind = get(location, 'kind');
  const turnLocation = kind === 'turn' || kind === 'step' ? get(location, 'turn') : undefined;
  const stepLocation = kind === 'step' ? get(location, 'step') : undefined;
  let turn = integer(turnLocation) ? turnLocation : get(turnLocation, 'turn');
  let step = integer(stepLocation) ? stepLocation : get(stepLocation, 'step');
  if (!integer(turn)) turn = get(data, 'turn');
  if (!integer(step)) step = get(data, 'step');
  return { ...(integer(turn) ? { turn } : {}), ...(integer(step) ? { step } : {}) };
}

function sanitize(event, location, options, flat = false) {
  const type = get(event, 'type');
  // Crucially, do not even access data for ignored assistant/thinking/message events.
  if (!TYPES.has(type)) return null;
  const seq = get(event, 'seq');
  if (!integer(seq)) return null;
  const data = flat ? event : get(event, 'data');
  if (!object(data)) return null;
  const safe = { type, seq, time: timestamp(get(event, 'time')), ...locationNumbers(location, data) };
  if (type === 'todo/write') {
    const list = get(data, 'todos');
    const validated = todos(list);
    if (!validated) return null;
    safe.todos = validated;
    const trimmed = Math.max(0, list.length - validated.length);
    const previous = flat && integer(get(data, 'todosTruncated')) ? get(data, 'todosTruncated') : 0;
    if (trimmed || previous) safe.todosTruncated = trimmed + previous;
  } else if (type === 'turn/end') {
    const reason = flat ? get(data, 'reason') : get(get(data, 'reason'), 'kind');
    if (END_REASONS.has(reason)) safe.reason = reason;
    safe.completed = reason === 'completed';
  } else if (type.startsWith('tool/')) {
    const nativeResult = type === 'tool/result';
    const ptc = type === 'tool/ptc-dispatch' || type === 'tool/ptc-dispatch-start';
    const message = nativeResult && !flat ? get(data, 'message') : undefined;
    const callId = identifier(flat ? get(data, 'callId') : nativeResult ? get(get(message, 'source'), 'callId') : ptc ? get(data, 'subCallId') : get(data, 'callId'));
    if (!callId) return null;
    safe.callId = callId;
    // A result never gets a guessed name from arbitrary result/message fields.
    if (!nativeResult) safe.name = identifier(get(data, 'name'), 96) || 'unknown';
    if (type === 'tool/call' && options?.allowToolDescription === true && safe.name !== 'todo_write' && safe.name !== 'functions.todo_write') {
      if (flat) {
        const label = text(get(data, 'label'), FLOW_LIMITS.description);
        if (label) safe.label = label;
      } else {
        const args = get(data, 'arguments');
        // Explicit opt-in only. Never retain the arguments or parsed object.
        if (typeof args === 'string' && args.length <= 2048) {
          try {
            const label = text(get(JSON.parse(args), 'description'), FLOW_LIMITS.description);
            if (label) safe.label = label;
          } catch { /* malformed arguments must not affect the flow */ }
        }
      }
    }
    if (nativeResult || type === 'tool/ptc-dispatch') {
      const isError = get(flat ? data : nativeResult ? message : data, 'isError');
      if (typeof isError === 'boolean') safe.isError = isError;
      if (isError === true) {
        const errorCode = code(flat ? get(data, 'errorCode') : get(get(data, 'error'), 'code'));
        if (errorCode) safe.errorCode = errorCode;
      }
    }
  }
  return freeze(safe);
}

/**
 * Whitelisted raw SDK event -> minimal flat safe event, or null.
 * The optional third argument is an explicit privacy opt-in; default is name-only.
 * tool/result reads ONLY message.source.callId/isError and error.code, never content.
 */
export function extractFlowEvent(event, location, options) {
  return sanitize(event, location, options);
}

/** Installed ConversationNodeDefinition<State=SanitizedFlowEvent>. */
export function createFlowDefinition(options = {}) {
  return {
    kind: FLOW_KIND,
    target: FLOW_TARGET,
    match(event) {
      const type = get(event, 'type');
      const seq = get(event, 'seq');
      return TYPES.has(type) && integer(seq) ? { id: String(seq), role: 'start' } : null;
    },
    start(_context, match) { return extractFlowEvent(get(match, 'event'), get(match, 'location'), options); },
    update(_context, match) { return extractFlowEvent(get(match, 'event'), get(match, 'location'), options); },
    buildViewNode(context) {
      const state = sanitize(get(context, 'state'), undefined, options, true);
      if (!state) return null;
      return { key: get(context, 'key'), id: String(state.seq), kind: FLOW_KIND, target: FLOW_TARGET, anchorSeq: state.seq, data: state };
    },
  };
}

function boundaryFacts(timeline) {
  const turns = new Map();
  const steps = new Map();
  const entries = get(timeline, 'turns');
  if (!(entries instanceof Map)) return { turns, steps };
  for (const [key, value] of entries) {
    const turn = integer(get(value, 'turn')) ? get(value, 'turn') : key;
    if (!integer(turn)) continue;
    const status = get(value, 'status');
    const end = status === 'closed' ? extractFlowEvent(get(value, 'end')) : null;
    turns.set(turn, { turn, status: status === 'open' || status === 'closed' ? status : 'unknown', ...(end ? { seq: end.seq, time: end.time, endTime: end.time, reason: end.reason, completed: end.completed } : {}) });
    const stepList = get(value, 'steps');
    if (Array.isArray(stepList)) for (const stepValue of stepList) {
      const step = get(stepValue, 'step');
      if (integer(step) && get(stepValue, 'status') === 'closed') {
        const endStep = extractFlowEvent(get(stepValue, 'end'));
        steps.set(`${turn}:${step}`, endStep?.time ?? null);
      }
    }
  }
  return { turns, steps };
}

const toolTime = item => item.endTime ?? item.time ?? -1;
const descendingTools = (a, b) => toolTime(b) - toolTime(a) || (b.endSeq ?? b.seq) - (a.endSeq ?? a.seq) || a.id.localeCompare(b.id);

/**
 * ConversationViewBuilder plus snapshot(). SDK: replace({nodes,timeline}),
 * apply({upserts,timeline}). Arrays of raw/safe events are also accepted.
 * Safe nodes are keyed/replaced, never appended twice. Only 600 retained events,
 * 24 running tools and at most 32 displayed tools (up to 12 recent results).
 */
export function createFlowBuilder(options = {}) {
  let entries = new Map();
  let lastSnapshot;
  let fingerprint;
  let revision = -1;
  let droppedEvents = 0;
  let floor = -1;
  let evictedPlan = null;
  let activeSeeds = [];
  let timeline;

  function ingest(values, replace) {
    if (replace) { entries = new Map(); droppedEvents = 0; floor = -1; evictedPlan = null; activeSeeds = []; }
    for (const value of values) {
      const isNode = get(value, 'kind') === FLOW_KIND || get(value, 'target') === FLOW_TARGET;
      if (!isNode && get(value, 'kind') && !get(value, 'type')) continue;
      const candidate = isNode ? get(value, 'data') : value;
      const allowed = TYPES.has(get(candidate, 'type'));
      const safe = !allowed ? null : isNode || get(candidate, 'data') === undefined ? sanitize(candidate, undefined, options, true) : extractFlowEvent(candidate, undefined, options);
      const key = isNode && typeof get(value, 'key') === 'string' ? get(value, 'key') : safe ? String(safe.seq) : null;
      if (!safe) { if (key !== null) entries.delete(key); continue; }
      // Replayed events older than the bounded cut cannot displace recent facts.
      if (!replace && safe.seq < floor && !entries.has(key)) continue;
      for (const [oldKey, old] of entries) if (old.seq === safe.seq && oldKey !== key) entries.delete(oldKey);
      entries.set(key, safe);
    }
    const sorted = [...entries].sort((a, b) => a[1].seq - b[1].seq);
    const excess = Math.max(0, sorted.length - FLOW_LIMITS.events);
    droppedEvents += excess;
    if (excess) {
      // Preserve the latest formal plan even when its event leaves the tail.
      for (const [, event] of sorted.slice(0, excess)) if (event.type === 'todo/write' && (!evictedPlan || event.seq > evictedPlan.seq)) evictedPlan = planOf(event);
      entries = new Map(sorted.slice(excess));
      floor = sorted[excess][1].seq;
    }
  }

  function planOf(event) { return { turn: event.turn ?? null, seq: event.seq, time: event.time, todos: event.todos, ...(event.todosTruncated ? { truncated: event.todosTruncated } : {}) }; }

  function materialize() {
    let latestPlan = evictedPlan;
    const events = [...entries.values()].sort((a, b) => a.seq - b.seq);
    const tools = new Map();
    const turns = new Map();
    const closedSteps = new Map();
    // Carry only genuinely evicted calls, never corrected/deleted in-window nodes.
    for (const seed of activeSeeds) if (seed.seq < floor) tools.set(seed.callId, { ...seed });
    for (const event of events) {
      if (event.turn !== undefined) {
        const previous = turns.get(event.turn);
        if (!previous) turns.set(event.turn, { turn: event.turn, status: 'unknown', seq: event.seq, time: event.time });
        if (event.type === 'turn/start') turns.set(event.turn, { turn: event.turn, status: 'open', seq: event.seq, time: event.time });
        if (event.type === 'turn/end') turns.set(event.turn, { turn: event.turn, status: 'closed', seq: event.seq, time: event.time, endTime: event.time, ...(event.reason ? { reason: event.reason } : {}), completed: event.completed });
        if (event.type === 'step/end' && event.step !== undefined) closedSteps.set(`${event.turn}:${event.step}`, event.time);
      }
      if (event.type === 'todo/write' && (!latestPlan || event.seq >= latestPlan.seq)) latestPlan = planOf(event);
      if (!event.callId) continue;
      let tool = tools.get(event.callId);
      const call = event.type === 'tool/call' || event.type === 'tool/ptc-dispatch-start';
      if (!tool) {
        tool = { id: `tool:${event.callId}`, callId: event.callId, name: 'unknown', turn: event.turn ?? null, step: event.step ?? null, seq: event.seq, time: event.time, status: call ? 'running' : 'unknown', hasCall: false };
        tools.set(event.callId, tool);
      }
      if (call && (!tool.hasCall || event.seq < tool.seq)) {
        tool.name = event.name || 'unknown';
        tool.turn = event.turn ?? tool.turn;
        tool.step = event.step ?? tool.step;
        tool.seq = event.seq;
        tool.time = event.time;
        tool.hasCall = true;
        if (tool.endSeq === undefined) tool.status = 'running';
      }
      if (!call && (tool.endSeq === undefined || event.seq >= tool.endSeq)) {
        tool.endSeq = event.seq;
        tool.endTime = event.time;
        tool.status = event.isError === true ? (event.errorCode === 'ABORTED' || event.errorCode === 'ABORTED_BEFORE_DISPATCH' ? 'interrupted' : 'error') : 'returned';
        delete tool.errorCode;
        if (event.errorCode) tool.errorCode = event.errorCode;
      }
    }
    const boundaries = boundaryFacts(timeline);
    for (const [turn, fact] of boundaries.turns) {
      const previous = turns.get(turn);
      if (!previous || fact.status === 'closed' || previous.status === 'unknown') turns.set(turn, { ...previous, ...fact });
    }
    for (const [key, time] of boundaries.steps) closedSteps.set(key, time);
    for (const tool of tools.values()) {
      if (tool.endSeq !== undefined) continue;
      const turn = turns.get(tool.turn);
      const stepKey = `${tool.turn}:${tool.step}`;
      if (turn?.status === 'closed' || closedSteps.has(stepKey)) {
        tool.status = 'interrupted';
        const endTime = closedSteps.get(stepKey) ?? turn?.endTime;
        if (endTime !== undefined && endTime !== null) tool.endTime = endTime;
      }
    }
    const running = [...tools.values()].filter(tool => tool.status === 'running').sort(descendingTools);
    const settled = [...tools.values()].filter(tool => tool.status !== 'running').sort(descendingTools);
    const retainedRunning = running.slice(0, FLOW_LIMITS.running);
    const retainedSettled = settled.slice(0, Math.min(FLOW_LIMITS.results, FLOW_LIMITS.tools - retainedRunning.length));
    activeSeeds = retainedRunning.map(tool => ({ ...tool }));
    const publicTools = [...retainedRunning, ...retainedSettled].sort(descendingTools).map(({ hasCall, endSeq, ...tool }) => tool);
    const latestTurn = [...turns.values()].sort((a, b) => b.turn - a.turn)[0] ?? null;
    const draft = {
      events,
      lastSeq: events.at(-1)?.seq ?? -1,
      lastTime: events.at(-1)?.time ?? null,
      latestTurn,
      latestPlan,
      tools: publicTools,
      recent: events.slice(-FLOW_LIMITS.recent),
      truncated: { events: droppedEvents, tools: tools.size - publicTools.length, running: Math.max(0, running.length - retainedRunning.length), results: Math.max(0, settled.length - retainedSettled.length) },
    };
    const nextFingerprint = JSON.stringify(draft);
    if (nextFingerprint === fingerprint) return lastSnapshot;
    fingerprint = nextFingerprint;
    lastSnapshot = freeze({ revision: ++revision, ...draft });
    return lastSnapshot;
  }

  const empty = materialize();
  return {
    empty,
    replace(input = []) {
      timeline = Array.isArray(input) ? undefined : get(input, 'timeline');
      ingest(Array.isArray(input) ? input : get(input, 'nodes') || [], true);
      return materialize();
    },
    apply(input = []) {
      if (!Array.isArray(input) && get(input, 'timeline') !== undefined) timeline = get(input, 'timeline');
      const list = Array.isArray(input) ? input : get(input, 'upserts');
      ingest(Array.isArray(list) ? list : [input], false);
      return materialize();
    },
    snapshot() { return lastSnapshot; },
  };
}

const TOOL_DETAILS = Object.freeze({ running: '工具调用进行中', returned: '调用已返回；不代表后台任务或业务目标完成', error: '工具调用报告错误', interrupted: '调用已中断或所在步骤已关闭但缺少结果', unknown: '结果或调用状态未知' });
function projectionFlags(value) {
  if (typeof value === 'string') return { stale: value === 'stale' || value === 'error', loading: value === 'loading' || value === 'cold' };
  const state = get(value, 'state') ?? get(value, 'status') ?? get(value, 'phase');
  return { stale: get(value, 'stale') === true || state === 'stale' || state === 'error', loading: get(value, 'loading') === true || state === 'loading' || state === 'cold' };
}

/**
 * Pure canonical presentation model. Explicit formal projections only: never
 * synthesize a goal from assistant/user content, tools, or a fabricated percent.
 * ChildStates is a plain id -> {running?,stale?,timing?/subagentTiming?} map.
 * uiStatus may be 'waiting-input', or {waitingForInput,pendingQuestions}.
 */
export function buildFlowModel(input = {}) {
  const session = get(input, 'session');
  const snapshot = get(input, 'flowSnapshot');
  const projectionState = get(input, 'projectionState');
  const commonFlags = projectionFlags(projectionState);
  const goalFlags = projectionFlags(get(projectionState, 'goal'));
  const todoFlags = projectionFlags(get(projectionState, 'todos'));
  const stale = commonFlags.stale || goalFlags.stale || todoFlags.stale;
  const loading = commonFlags.loading || goalFlags.loading || todoFlags.loading;
  const goalProjection = get(input, 'goalProjection');
  const formalGoal = get(goalProjection, 'goal') ?? (get(goalProjection, 'objective') !== undefined ? goalProjection : null);
  const goalText = text(get(formalGoal, 'objective'), 1200);
  const phase = goalText ? get(formalGoal, 'phase') : undefined;
  const goal = goalText ? { title: '会话目标', text: goalText, status: ['active', 'paused', 'blocked', 'complete'].includes(phase) ? phase : 'unknown', source: 'goal-projection' } : { title: '会话目标', text: text(get(input, 'title'), 240) || '尚未设置正式目标', status: 'unknown', source: 'session-title' };

  const planFact = get(snapshot, 'latestPlan');
  const formalTodos = get(input, 'todosProjection');
  const projectedInput = Array.isArray(formalTodos) ? formalTodos : get(formalTodos, 'todos');
  const projected = todos(projectedInput);
  const fallbackInput = get(planFact, 'todos');
  const fallback = todos(fallbackInput);
  const list = projected ?? fallback ?? [];
  const planSource = projected !== null ? 'todos-projection' : 'todo/write';
  const latestTurn = get(snapshot, 'latestTurn');
  const currentTurn = get(latestTurn, 'turn');
  const planTurn = get(planFact, 'turn');
  // A non-null formal Todo projection is current-turn authority, even if the
  // visible event tail has not caught up. A null projection is the Host reset.
  const historical = list.length > 0 && projected === null && (formalTodos === null || (integer(currentTurn) && integer(planTurn) && planTurn < currentTurn));
  const omitted = projected !== null ? Math.max(0, projectedInput.length - list.length) : Math.max(0, (Array.isArray(fallbackInput) ? fallbackInput.length : 0) - list.length) + (integer(get(planFact, 'truncated')) ? get(planFact, 'truncated') : 0);
  const plan = {
    invalid: formalTodos !== undefined && formalTodos !== null && projected === null,
    omitted,
    truncated: omitted > 0,
    items: list.map((item, index) => ({ id: `todo:${projected !== null ? 'projection' : get(planFact, 'seq') ?? 'unknown'}:${index}`, title: item.content, status: item.status, source: planSource })),
    historical,
    label: historical ? '上一轮计划（非本轮进度）' : list.length ? '明确计划' : '尚无明确计划',
    completed: list.filter(item => item.status === 'completed').length,
    total: list.length,
  };
  const activity = [];
  const toolList = get(snapshot, 'tools');
  if (Array.isArray(toolList)) for (const tool of toolList.slice(0, FLOW_LIMITS.tools)) {
    const callId = identifier(get(tool, 'callId'));
    if (!callId) continue;
    const status = Object.hasOwn(TOOL_DETAILS, get(tool, 'status')) ? get(tool, 'status') : 'unknown';
    const node = { id: `tool:${callId}`, title: identifier(get(tool, 'name'), 96) || 'unknown', status, source: 'tool', detail: TOOL_DETAILS[status], callId };
    if (integer(get(tool, 'seq'))) node.seq = get(tool, 'seq');
    if (timestamp(get(tool, 'time')) !== null) node.time = get(tool, 'time');
    activity.push(node);
  }
  const children = [], childCandidates = [];
  const childCatalog = get(input, 'childCatalog');
  const childStates = get(input, 'childStates');
  const seen = new Set();
  if (Array.isArray(childCatalog)) for (const entry of childCatalog.slice(0, 10000)) {
    const id = identifier(get(entry, 'id'));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const state = object(childStates) && Object.hasOwn(childStates, id) ? get(childStates, id) : undefined;
    const timing = get(state, 'timing') ?? get(state, 'subagentTiming');
    const childStale = projectionFlags(state).stale || projectionFlags(get(state, 'projectionState')).stale;
    const running = get(state, 'running');
    const completed = get(timing, 'lastTurnCompleted');
    const waiting = get(state, 'pendingInteraction') != null;
    const status = !state || childStale ? 'unknown' : waiting ? 'waiting' : running === true ? 'running' : completed === true ? 'completed' : completed === false ? 'interrupted' : running === false ? 'idle' : 'unknown';
    const detail = status === 'unknown' ? '子会话状态尚未取得或已过期' : status === 'waiting' ? '子会话正在等待用户答复或确认' : status === 'completed' ? '最近一轮正常结束；不等于委派目标已验收' : status === 'running' ? '子会话运行中' : status === 'interrupted' ? '最近一轮未正常完成' : '子会话当前空闲；结果未知';
    childCandidates.push({ id, sessionId: id, title: text(get(entry, 'label'), 120) || id, status, source: 'child-catalog', detail });
  }
  const childRank = node => node.status === 'waiting' ? 0 : node.status === 'running' ? 1 : 2;
  childCandidates.sort((a,b) => childRank(a)-childRank(b));
  children.push(...childCandidates.slice(0,FLOW_LIMITS.children));
  const childrenTotal = Array.isArray(childCatalog) ? childCatalog.length : 0;
  const childrenHidden = Math.max(0,childrenTotal-children.length);

  const warnings = [];
  if (childrenHidden > 0) warnings.push(`子代理目录共${childrenTotal}项，当前显示${children.length}项（等待/运行优先）；未显示不等于完成，查找仅覆盖显示节点。`);
  if (stale) warnings.push('正式投影已过期或读取失败；以下为最近可用事实，不代表当前状态。');
  if (loading) warnings.push('正式投影仍在加载，缺少的数据不代表没有目标或计划。');
  if (historical) warnings.push('当前显示的是上一轮明确计划，不计作本轮完成进度。');
  const truncated = get(snapshot, 'truncated');
  if (get(truncated, 'events') > 0 || get(truncated, 'tools') > 0) warnings.push('事件或工具记录已按上限截断；未显示部分不能推断为已完成。');
  if (plan.truncated) warnings.push('计划条目超出显示上限，当前计数仅覆盖显示条目；不计算整体计划百分比。');
  if (children.some(child => child.status === 'unknown')) warnings.push('部分子会话状态未知；父工具返回不代表子任务完成。');
  const connection = get(input, 'connection');
  const connectionState = typeof connection === 'string' ? connection : get(connection, 'state');
  const uiStatus = get(input, 'uiStatus');
  const pendingQuestions = get(uiStatus, 'pendingQuestions');
  const waiting = uiStatus === 'waiting-input' || uiStatus === 'waiting-for-input' || get(uiStatus, 'waitingForInput') === true || (Array.isArray(pendingQuestions) ? pendingQuestions.length > 0 : typeof pendingQuestions === 'number' && pendingQuestions > 0);
  let status;
  if (connectionState === 'disconnected' || connectionState === 'offline' || connectionState === 'closed' || connectionState === 'reconnecting') {
    status = { key: connectionState === 'reconnecting' ? 'reconnecting' : 'disconnected', label: connectionState === 'reconnecting' ? '正在重连' : '连接已断开', detail: '暂不能确认实时执行状态；保留最近可用事实。' };
  } else if (connectionState === 'connecting') status = { key: 'connecting', label: '正在连接', detail: '等待恢复实时执行状态；保留最近可用事实。' };
  else if (get(session, 'removed') === true) status = { key: 'removed', label: '会话已移除', detail: '不再跟踪实时执行状态。' };
  else if (waiting) status = { key: 'waiting-input', label: '等待输入', detail: '需要用户答复或确认，不能推断为执行完成。' };
  else if (phase === 'blocked') status = { key: 'blocked', label: '受阻', detail: '正式目标处于受阻状态，不将保留的运行标记用作当前步骤。' };
  else if (phase === 'paused') status = { key: 'paused', label: '已暂停', detail: '正式目标已暂停，不将保留的运行标记用作当前步骤。' };
  else if (get(session, 'running') === true || get(uiStatus, 'running') === true || get(session, 'awaitingFirstTurn') === true) status = { key: 'running', label: '运行中', detail: '会话执行中；工具调用返回不代表整体目标完成。' };
  else if (stale) status = { key: 'stale', label: '状态已过期', detail: '正式投影暂不可用，无法确认当前进度。' };
  else if (loading || get(session, 'openState') === 'loading' || get(session, 'openState') === 'cold') status = { key: 'loading', label: '加载中', detail: '等待正式投影与事件窗口。' };
  else if (get(latestTurn, 'reason') === 'error' || get(session, 'openState') === 'error' || get(session, 'promptError') != null) status = { key: 'error', label: '执行出错', detail: '正式生命周期报告错误；未读取错误正文。' };
  else if (get(latestTurn, 'reason') === 'aborted' || get(latestTurn, 'reason') === 'interrupted' || get(latestTurn, 'reason') === 'forked') status = { key: 'interrupted', label: '已中断', detail: '最近一轮未正常完成。' };
  else if (get(latestTurn, 'reason') === 'max-tokens') status = { key: 'interrupted', label: '输出达到上限', detail: '最近一轮达到输出上限；不能据此判断目标完成。' };
  else if (phase === 'blocked' || get(latestTurn, 'reason') === 'blocked') status = { key: 'blocked', label: '受阻', detail: '正式目标或回合处于受阻状态。' };
  else if (phase === 'paused') status = { key: 'paused', label: '已暂停', detail: '正式目标已暂停；不会据工具记录推断完成。' };
  else if (phase === 'complete') status = { key: 'completed', label: '目标已标记完成', detail: '来自正式目标投影；不表示外部验收通过。' };
  else if (get(session, 'running') === false) status = { key: 'idle', label: '空闲', detail: get(latestTurn, 'completed') === true ? '最近一轮正常结束；目标是否完成以正式目标为准。' : '当前未运行；无足够依据推断业务完成。' };
  else status = { key: 'unknown', label: '状态未知', detail: '缺少当前正式生命周期事实。' };
  const recentInput = get(snapshot, 'recent');
  const recent = Array.isArray(recentInput) ? recentInput.slice(-FLOW_LIMITS.recent).map(event => sanitize(event, undefined, undefined, true)).filter(Boolean) : [];
  return freeze({ goal, plan, activity, children, childrenTotal, childrenHidden, status, warnings, recent });
}
