// Goal-to-plan reading route. Only uses the detached, public progress projection.
function FlowGoalProgress({value,zoom,onOpen,onPlan,scopedId,selection,detailsOpen,detailsId}) {
  const [expanded,setExpanded]=React.useState(true),[allRemaining,setAllRemaining]=React.useState(false);
  const bodyId=scopedId('journey-body'),basisId=scopedId('journey-basis'),remainingId=scopedId('journey-remaining');
  const p=value.progress,current=value.currentItems,completed=value.completedItems,remaining=value.remainingItems;
  const currentIds=new Set(current.map(item=>item.id));
  const stateText=({'waiting-input':'等待你的答复或确认',blocked:'会话已受阻',paused:'会话已暂停',idle:'会话当前空闲',error:'会话报告执行出错',interrupted:'本轮已中断',disconnected:'连接已断开',connecting:'连接尚未就绪',reconnecting:'连接正在恢复',stale:'状态已过期',loading:'状态仍在加载',removed:'会话已移除',unknown:'当前状态未知'}[value.statusKey]);
  const goalComplete=value.goal.formal&&['complete','completed'].includes(value.goal.status);
  const summary=value.available?[stateText,!value.goal.formal?'尚无正式目标摘要':null,(goalComplete||p.completed===p.total)?value.remainingLabel:null,'按本轮计划项等权计算 · 非目标验收'].filter(Boolean).join(' · '):[stateText,value.remainingLabel].filter(Boolean).join(' · ');
  React.useEffect(()=>{setAllRemaining(false);},[value.reason]);
  const open=(item,label)=>h('button',{type:'button',className:'sf-journey-step','data-sf-progress-node':item.id,'aria-current':label.startsWith('当前进行')?'step':undefined,'aria-expanded':detailsOpen&&selection===item.id,'aria-controls':detailsOpen&&selection===item.id?detailsId:undefined,onClick:event=>onOpen(item.id,event)},h('span',null,`步骤 ${item.index} · ${label}`),h('strong',null,item.title||'未命名计划项'));
  return h('section',{className:'sf-journey',style:{'--sf-zoom':zoom},'data-sf-progress-state':value.available?'available':value.reason,'aria-labelledby':scopedId('journey-title')},
    h('div',{className:'sf-journey-head'},h('h2',{id:scopedId('journey-title')},'目标进展'),h('span',{className:'sf-journey-count','data-sf-progress-count':''},value.available?`已报告 ${p.completed} / ${p.total} 项`:'暂不能计算'),h('strong',{className:'sf-journey-percent','data-sf-progress-percent':''},value.available?`${p.percent}%`:'—'),h('button',{type:'button',className:'sf-journey-toggle','data-sf-progress-toggle':'','aria-label':(expanded?'收起路线':'展开路线')+' · 目标进展','aria-expanded':expanded,'aria-controls':bodyId,onClick:()=>setExpanded(old=>!old)},expanded?'收起路线':'展开路线')),
    value.available?h('progress',{className:'sf-journey-bar',value:p.completed,max:p.total,'aria-label':'本轮计划已报告完成比例（非目标验收）','aria-valuetext':`已报告完成 ${p.completed} / ${p.total} 项，${p.percent}%，每项等权，非目标验收`,'aria-describedby':basisId}):null,
    h('p',{className:'sf-journey-summary'},summary),
    h('div',{id:bodyId,className:'sf-journey-body',hidden:!expanded},
      h('div',{className:'sf-journey-route'},
        h('section',{className:'sf-journey-card sf-journey-request','aria-labelledby':scopedId('journey-request')},h('h3',{id:scopedId('journey-request')},h('span',{'aria-hidden':true},'1'),'你的要求'),h(value.goal.formal?'button':'div',{...(value.goal.formal?{type:'button','data-sf-progress-goal':'','aria-expanded':detailsOpen&&selection==='goal','aria-controls':detailsOpen&&selection==='goal'?detailsId:undefined,onClick:event=>onOpen('goal',event)}:{}),className:'sf-journey-goal'},h('strong',null,value.goal.formal?value.goal.text:value.liveKnown?'尚无正式目标摘要':'目标摘要待同步'),h('small',null,value.goal.formal?'查看结构化目标依据 ›':'下方根节点仅作会话标题参考。')),h('p',null,value.goal.formal?'正式目标摘要；完整要求覆盖尚未确认。':'未从聊天猜测或编造你的要求。')),
        h('section',{className:'sf-journey-card sf-journey-action','aria-labelledby':scopedId('journey-action')},h('h3',{id:scopedId('journey-action')},h('span',{'aria-hidden':true},'2'),'AI 做到这里'),
          h('p',{className:'sf-journey-parent-state'},stateText??(value.liveKnown?'依据已同步的计划声明':'当前状态待同步')),
          value.available?h('p',{className:'sf-journey-done'},`计划已报告完成 ${p.completed} 项`):h('p',null,'暂无可确认的本轮进度'),
          value.available&&completed.length?open(completed[completed.length-1],'报告完成'):null,
          ...current.slice(0,2).map(item=>h(React.Fragment,{key:item.id},open(item,'当前进行 · Agent 声明'))),
          current.length>2?h('button',{type:'button',onClick:onPlan},`另 ${current.length-2} 项进行声明 · 查看计划`):null,
          !current.length?h('p',null,value.available?'当前没有可确认的进行中步骤。':value.liveKnown?'计划范围待明确后再确认当前项。':'等待正式状态同步后再确认当前项。'):null,
          h('small',{className:'sf-journey-activity'},`${value.liveKnown?'可见行动':'上次行动'}：工具 ${value.activity.runningTools} 运行 / ${value.activity.returnedTools} 已返回；子代理 ${value.activity.runningChildren} 运行 / ${value.activity.waitingChildren} 等待`)),
        h('section',{className:'sf-journey-card sf-journey-gap','aria-labelledby':scopedId('journey-gap')},h('h3',{id:scopedId('journey-gap')},h('span',{'aria-hidden':true},'3'),'距离目标还差'),h('p',{className:'sf-journey-gap-label'},value.remainingLabel),
          h('div',{id:remainingId,className:'sf-journey-items'},...(allRemaining?remaining:remaining.slice(0,3)).map(item=>h(React.Fragment,{key:item.id},open(item,item.status==='in_progress'?(currentIds.has(item.id)?'进行中，尚未完成':'声明进行中，尚未完成'):'待办，尚未报告完成')))),
          remaining.length>3?h('button',{type:'button',className:'sf-journey-more','data-sf-progress-more':'','aria-label':(allRemaining?'回到重点预览':`展开全部 ${remaining.length} 项`)+' · 未完成计划','aria-controls':remainingId,'aria-expanded':allRemaining,onClick:()=>setAllRemaining(old=>!old)},allRemaining?'回到重点预览':`展开全部 ${remaining.length} 项`):null,
          h('p',{className:'sf-journey-gap-note'},value.available?(remaining.length?'未完成项按原计划排列；完整要求仍需核对。':'请核对实际结果是否满足你的要求。'):value.remainingNote),h('small',null,value.goal.label))),
      h('details',{className:'sf-journey-basis'},h('summary',null,'进度依据与范围'),h('p',{id:basisId},p.note),h('p',null,value.remainingNote),h('p',null,value.activity.scopeLabel+'；工具和子代理独立观测，未确认其与每一步的归属。路线箭头仅表示阅读顺序。'))));
}
