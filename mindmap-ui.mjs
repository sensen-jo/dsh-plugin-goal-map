// DOM buttons keep labels/focus accessible; SVG contains decorative grouping lines only.
function FlowMindmap({tree,zoom,filter,showTools,showChildren,historicalExpanded,onHistory,onOpen,selection,details,scopedId,expanded,setExpanded,collapsed,setCollapsed}) {
  const surface=React.useRef(null),[geometry,setGeometry]=React.useState({width:0,height:0,paths:[]});
  const term=filter.trim().toLocaleLowerCase();
  const groups=tree.groups.filter(group=>(group.id!=='activity'||showTools)&&(group.id!=='child'||showChildren)).map(group=>{
    const items=group.items.filter(item=>!term||item.title.toLocaleLowerCase().includes(term));
    const folded=collapsed[group.id]===true,historyHidden=group.historical&&!historicalExpanded;
    const selectedId=selection?.startsWith(group.id+':')?selection:null;
    const preview=new Set(group.previewIds);
    if(selectedId)preview.add(selectedId);
    const visible=folded||historyHidden?[]:(term||expanded[group.id]?items:items.filter(item=>preview.has(item.id)));
    return {...group,filteredItems:items,previewCount:items.filter(item=>preview.has(item.id)).length,visible,folded,historyHidden};
  });
  const layoutKey=JSON.stringify([zoom,term,groups.map(g=>[g.id,g.folded,g.historyHidden,g.summary,g.visible.map(n=>[n.id,n.title,n.status,n.current,n.next,n.stale])]),tree.root.title,tree.headline]);
  React.useLayoutEffect(()=>{
    const node=surface.current;if(!node)return;
    let frame=0,active=true;
    const measure=()=>{
      if(!active)return;
      const bounds=node.getBoundingClientRect(),root=node.querySelector('[data-sf-map-anchor="goal"]');
      if(!root||bounds.width<=0)return;
      const box=element=>{const r=element.getBoundingClientRect();return{x:r.left-bounds.left,y:r.top-bounds.top,width:r.width,height:r.height};};
      const source=box(root),narrow=node.getAttribute('data-map-narrow')==='true',paths=[];
      for(const group of node.querySelectorAll('[data-sf-map-group]')){
        const id=group.getAttribute('data-sf-map-group'),target=group.querySelector('[data-sf-map-anchor]');
        if(!target)continue;const b=box(target),middle=b.y+b.height/2;
        const sx=narrow?source.x+source.width/2:source.x+source.width,sy=narrow?source.y+source.height:source.y+source.height/2,tx=narrow?b.x+b.width/2:b.x,ty=narrow?b.y:middle;
        // Narrow mode uses a left-side trunk, so no line crosses node text.
        const trunk=9;
        const d=narrow?`M ${sx} ${sy} V ${sy+8} H ${trunk} V ${ty-9} Q ${trunk} ${ty-2} ${trunk+8} ${ty-2} H ${tx} V ${ty}`:`M ${sx} ${sy} C ${sx+14} ${sy}, ${tx-14} ${ty}, ${tx} ${ty}`;
        paths.push({id:'goal-'+id,branch:id,d});
        for(const leaf of group.querySelectorAll('[data-sf-map-leaf]')){
          const c=box(leaf),x=b.x+b.width,y=middle,xx=c.x,yy=c.y+c.height/2;
          paths.push({id:leaf.getAttribute('data-sf-map-leaf'),branch:id,d:`M ${x} ${y} C ${x+11} ${y}, ${xx-11} ${yy}, ${xx} ${yy}`});
        }
      }
      const next={width:Math.round(bounds.width*100)/100,height:Math.round(bounds.height*100)/100,paths};
      setGeometry(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const node=surface.current;if(!node)return;node.setAttribute('data-map-narrow',String(node.clientWidth<=544));measure();});};
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
    observer?.observe(node);for(const child of node.querySelectorAll('[data-sf-map-anchor],[data-sf-map-leaf]'))observer?.observe(child);
    window.addEventListener('resize',schedule);schedule();
    return()=>{active=false;cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',schedule);};
  },[layoutKey]);
  const label=n=>n.stale?`上次 / 声明：${statusLabels[n.status]??'未知'}`:n.current?'当前进行':n.next?'待办首项':statusLabels[n.status]??'未知';
  return h('section',{className:'sf-mindmap','aria-label':'目标中心的思维导图总览',style:{'--sf-zoom':zoom}},
    h('div',{className:'sf-map-caption'},h('strong',null,'目标全景'),h('span',null,'分支是分组，不是执行依赖'),h('span',{className:'sf-map-legend'},h('i',{'aria-hidden':true}),tree.liveKnown?'当前 / 待处理优先':'上次快照 · 待同步'),tree.groups[0]?.items.some(n=>n.current)?h('button',{type:'button',className:'sf-map-locate',onClick:e=>onOpen(tree.groups[0].items.find(n=>n.current).id,e)},'定位当前'):null),
    h('div',{className:'sf-map-tree',ref:surface,'data-sf-map-tree':'','data-map-narrow':'false'},
      h('svg',{className:'sf-map-lines',width:geometry.width,height:geometry.height,viewBox:`0 0 ${geometry.width||1} ${geometry.height||1}`,'aria-hidden':true,focusable:false},...geometry.paths.map(path=>h('path',{key:path.id,d:path.d,'data-sf-edge':path.id,className:'sf-map-edge sf-map-edge-'+path.branch}))),
      h('button',{type:'button',id:scopedId('map-goal'),className:'sf-map-root','data-sf-map-anchor':'goal','data-sf-node':'goal','aria-label':`${tree.root.fallback?'会话标题':'目标'}，${tree.root.title}，查看详情`,'aria-expanded':selection==='goal'&&!!details,'aria-controls':selection==='goal'&&details?scopedId('map-detail-goal'):undefined,onClick:e=>onOpen('goal',e)},h('span',{className:'sf-map-root-label'},tree.root.fallback?'会话标题 · 未设正式目标':'这次要完成'),h('strong',null,tree.root.title),h('span',{className:'sf-map-root-state'},tree.headline),h('small',null,'点击节点看详情')),
      ...groups.map(group=>h('section',{key:group.id,className:'sf-map-branch sf-map-branch-'+group.id,'data-sf-map-group':group.id,role:'group',id:scopedId('map-group-'+group.id),'aria-labelledby':scopedId('map-title-'+group.id)},
        h('button',{type:'button',className:'sf-map-group','data-sf-map-anchor':group.id,'data-sf-map-toggle':group.id,id:scopedId('map-toggle-'+group.id),'aria-label':`${group.title}，${group.count} 项`,'aria-expanded':!group.folded,'aria-controls':scopedId('map-branch-'+group.id),'aria-describedby':scopedId('map-summary-'+group.id),onClick:()=>setCollapsed(old=>({...old,[group.id]:!group.folded}))},h('span',{className:'sf-map-group-top'},h('strong',{id:scopedId('map-title-'+group.id)},group.title),h('span',null,String(group.count))),h('small',{id:scopedId('map-summary-'+group.id)},group.summary),h('span',{className:'sf-map-fold','aria-hidden':true},group.folded?'＋ 展开':'− 收起')),
        h('div',{className:'sf-map-leaves',id:scopedId('map-branch-'+group.id),hidden:group.folded},
          group.historical?h('button',{key:'history',type:'button',className:'sf-map-empty','data-sf-map-history':'','aria-expanded':historicalExpanded,'aria-controls':scopedId('map-items-'+group.id),onClick:onHistory},historicalExpanded?'上轮计划 · 收起回看':'上轮计划 · 默认收起',h('small',null,historicalExpanded?'不计当前进度':'点击回看，不计当前进度')):null,
          h('div',{key:'items',className:'sf-map-items',id:scopedId('map-items-'+group.id),hidden:group.historyHidden},group.visible.length?group.visible.map(n=>h('button',{type:'button',key:n.id,id:scopedId('map-node-'+n.id),className:'sf-map-leaf '+(n.stale?'sf-map-stale':clsStatus(n.status))+(n.current?' sf-map-current':'')+(n.next?' sf-map-next':'')+(selection===n.id&&details?' sf-selected':''),'data-sf-map-leaf':n.id,'data-sf-node':n.id,'data-sf-current':n.current?'true':undefined,'aria-current':n.current?'step':undefined,'aria-label':`${n.index?'步骤 '+n.index+'，':''}${n.title}，${label(n)}，查看详情`,'aria-expanded':selection===n.id&&!!details,'aria-controls':selection===n.id&&details?scopedId('map-detail-'+n.id):undefined,onClick:e=>onOpen(n.id,e)},h('span',{className:'sf-map-leaf-meta'},h('span',null,n.index?'步骤 '+n.index:group.id==='activity'?'工具调用':'子代理'),h('span',{className:'sf-map-state'},label(n))),h('strong',null,n.title))):h('p',{className:'sf-map-empty'},term?'无匹配节点':group.emptyLabel)),
          !group.historyHidden&&!group.folded&&!term&&group.filteredItems.length>group.previewCount?h('button',{key:'preview-toggle',type:'button',className:'sf-map-more','data-sf-map-more':group.id,'aria-expanded':expanded[group.id]===true,'aria-controls':scopedId('map-items-'+group.id),onClick:()=>setExpanded(old=>({...old,[group.id]:!old[group.id]}))},expanded[group.id]?'回到重点预览':`＋ 另 ${Math.max(0,group.filteredItems.length-group.visible.length)} 项 · 展开全部`):null))),
      ),
    h('p',{className:'sf-map-footnote'},term?'查找显示匹配的已保留节点，编号不变。':'预览当前与首项待办，保留原编号；展开分支查看全部已保留节点。', ' 工具已返回、子代理结束与步骤自报完成都不等于目标验收。'),
    details?React.cloneElement(details,{id:scopedId('map-detail-'+selection),'aria-labelledby':scopedId('detail-heading'),className:'sf-detail sf-map-detail'}):null);
}
