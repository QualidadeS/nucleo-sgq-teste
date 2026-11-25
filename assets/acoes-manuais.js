const UNIFIED_ACTIONS_KEY='nucleo-unified-actions-v1';

let unifiedCentralActions=[],unifiedCentralToken='';
function getUnifiedManualActions(){return unifiedCentralToken===getSession()?.authToken?unifiedCentralActions.slice():[];}
async function loadUnifiedManualActions(){
  const token=getSession()?.authToken;if(!token)return;
  const r=await portalJsonp({acao:'nucleo_test_manual_actions',mode:'list'},60000);
  if(token!==getSession()?.authToken)return;
  if(!r?.sucesso||!Array.isArray(r.records))throw new Error(r?.erro||'A base não confirmou as ações.');
  unifiedCentralActions=r.records;unifiedCentralToken=token;
}
async function unifiedConfirmedActionMutation(params,timeout=60000){
 const token=getSession()?.authToken,base=nucleoSessionApiBase(token)||portalApiBase();
 if(!token||!base||!navigator.onLine)throw Error('Entre novamente e conecte-se à base central de ações.');
 const fresh=await portalJsonp({acao:'nucleo_test_manual_actions',mode:'list',token},60000,base);
 if(getSession()?.authToken!==token)throw Error('A sessão mudou. Entre novamente.');
 if(!fresh?.sucesso||!Array.isArray(fresh.records))throw Error(fresh?.erro||'A base central não confirmou as ações; nenhuma alteração foi enviada.');
 const records=fresh.records,old=records.find(r=>r.id===params.id),version=r=>String(r?.updatedAt||r?.createdAt||'');
 if(params.mode==='save'){
  const incoming=JSON.parse(params.dados||'{}'),expected=String(incoming._manualExpected||'');
  if(old&&version(old)===String(incoming.updatedAt||'')&&old.action===incoming.action)return {sucesso:true,registro:old};
  if((old&&version(old)!==expected)||(!old&&expected))throw Error('A ação mudou na base central. Reabra a ação antes de salvar.');
 }else if(params.mode==='delete'){
  if(!old||version(old)!==String(params.manualExpected||''))throw Error('A ação mudou na base central. Reabra antes de excluir.');
 }else if(params.mode==='dependency_roles'){
  if(!old)throw Error('A ação não está mais disponível.');
  const data=JSON.parse(params.dados||'{}'),group=old.groupId||old.id,children=records.filter(r=>r.groupId===group&&r.dependencySector===data.sector);
  const expected=data.expected||[];
  if(children.length!==expected.length||children.some(r=>!expected.some(v=>v.id===r.id&&String(v.updatedAt||'')===version(r))))throw Error('Os participantes da dependência mudaram. Reabra a ação.');
 }
 return portalJsonp({acao:'nucleo_test_manual_actions',...params,token},timeout,base,{manualActionRead:true});
}

async function saveUnifiedManualActions(list){
 const token=getSession()?.authToken;if(!token)throw new Error('Entre novamente.');
 const before=getUnifiedManualActions().slice();
 for(const record of list){
   const previous=before.find(x=>x.id===record.id);
   if(previous&&JSON.stringify(previous)===JSON.stringify(record))continue;
   const payload={...record,updatedAt:new Date().toISOString(),_manualExpected:previous?.updatedAt||previous?.createdAt||''};
   const result=await confirmNewUnifiedManualAction(payload,token);
   if(token!==getSession()?.authToken)throw new Error('A sessão mudou. Sincronize para conferir o resultado.');
   if(!result?.sucesso||!result.registro)throw new Error(result?.erro||'A ação não foi confirmada. Confira as ações antes de tentar novamente.');
   unifiedCentralToken=token;unifiedCentralActions=unifiedCentralActions.filter(x=>x.id!==record.id).concat(result.registro);
 }
 for(const removed of before.filter(x=>!list.some(y=>y.id===x.id))){
   const r=await unifiedConfirmedActionMutation({mode:'delete',id:removed.id,manualExpected:removed.updatedAt||removed.createdAt||''},60000);
   if(!r?.sucesso)throw new Error(r?.erro||'A exclusão não foi confirmada.');
   unifiedCentralActions=unifiedCentralActions.filter(x=>x.id!==removed.id);
 }
}
async function confirmNewUnifiedManualAction(record,token){
  let saveError;
  try{
    // As ações manuais são registros pequenos. Recebe a resposta da própria
    // gravação, em vez de enviar por iframe e depender de outro endpoint.
    const response=await unifiedConfirmedActionMutation({mode:'save',id:record.id,dados:JSON.stringify(record)},60000);
    if(response?.sucesso!==true)throw new Error(response?.erro||'Gravação não confirmada.');
    if(response.registro?.id===record.id&&response.registro.updatedAt===record.updatedAt)return response;
  }catch(error){
    saveError=error;
    if(/mudou na base central|não confirmou as ações|sessão mudou|não está mais disponível/i.test(String(error.message||error)))throw error;
  }
  for(let attempt=0;attempt<3;attempt++){
    if(getSession()?.authToken!==token)throw new Error('A sessão mudou. Entre novamente.');
    try{
      const response=await portalJsonp({acao:'nucleo_test_manual_actions',mode:'list'},60000);
      if(getSession()?.authToken!==token)throw new Error('A sessão mudou.');
      const saved=response?.sucesso===true&&Array.isArray(response.records)
        ? response.records.find(item=>item.id===record.id):null;
      if(saved&&saved.assigneeKey===record.assigneeKey&&saved.action===record.action
        &&(record.sharedAction?JSON.stringify(saved.executorKeys||[])===JSON.stringify(record.executorKeys||[])&&JSON.stringify(saved.awarenessKeys||[])===JSON.stringify(record.awarenessKeys||[]):String(saved.sector||'')===String(record.sector||''))
        &&saved.recordKind===record.recordKind&&String(saved.updatedAt||'')===String(record.updatedAt||'')){
        return {sucesso:true,registro:saved};
      }
    }catch(error){if(!saveError)saveError=error;}
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
  }
  throw new Error('Ação '+(record.actionCode||record.id)+' · '+(record.sector||record.assigneeName||'')+
    ': '+(saveError?.message||'A base central ainda não retornou o registro. Faça nova tentativa para continuar a distribuição.'));
}

async function unifiedDependencyRecordId(parentId,sector,key){
  const bytes=new TextEncoder().encode(JSON.stringify([parentId,sector,key]));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return 'ACT-DEP-'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}

function unifiedActionUserKey(user){
  return String(user?.email||user?.name||'').trim().toLowerCase();
}
function unifiedCurrentUserKey(){
  const s=getSession()||{};
  return String(s.email||s.name||'').trim().toLowerCase();
}
function unifiedActionUserDisplay(key){
  const wanted=String(key||'').trim().toLowerCase();
  const u=getOperationalUsers().find(x=>unifiedActionUserKey(x)===wanted);
  return u?.name||u?.email||key||'-';
}
function unifiedActionUserSector(user){
  return String(user?.sector||'').trim();
}











function unifiedActionAssignableUsers(){
  const users=getOperationalUsers().filter(unifiedActionIsActiveUser);
  if(isAdmin())return users;
  if(isManager()){
    const managed=managedSectorsForCurrentUser().map(normalizeAnswer);
    return users.filter(u=>{
      const sectors=[u.sector,...(u.managedSectors||[]),(u.sectorMemberships||[]).map(m=>m.sector)].flat().filter(Boolean);
      return sectors.some(s=>managed.includes(normalizeAnswer(s)));
    });
  }
  const self=unifiedCurrentUserKey();
  return users.filter(u=>unifiedActionUserKey(u)===self);
}
function unifiedActionCanCreateFor(mode,targetUser=''){
  if(isAdmin())return ['self','person','sector'].includes(mode);
  if(isManager()){
    if(mode==='self')return true;
    if(mode!=='person')return false;
    return unifiedActionAssignableUsers().some(u=>unifiedActionUserKey(u)===String(targetUser||'').toLowerCase());
  }
  return mode==='self';
}
function unifiedActionCanSee(record){
  if(!record)return false;
  if(isAdmin())return true;
  const me=unifiedCurrentUserKey();
  if(unifiedSharedExecutors(record).includes(me)||unifiedSharedObservers(record).includes(me))return true;
  if(String(record.createdByKey||'').toLowerCase()===me)return true;

  if(isManager()){
    const target=getOperationalUsers().find(u=>unifiedSharedExecutors(record).includes(unifiedActionUserKey(u))&&([u.sector,...(u.sectorMemberships||[]).map(m=>m.sector)].filter(Boolean).some(managesSector)));
    if(target){
      const targetSectors=[target.sector,...(target.sectorMemberships||[]).map(m=>m.sector)].filter(Boolean);
      if(targetSectors.some(managesSector))return true;
    }
  }
  return false;
}

function unifiedActionDateLabel(v){
  if(!v)return '—';
  try{
    const d=new Date(v);
    if(!Number.isNaN(d.getTime()))return d.toLocaleDateString('pt-BR');
  }catch(e){}
  return String(v||'—');
}
function unifiedActionDateTimeLabel(v){
  if(!v)return '—';
  try{
    const d=new Date(v);
    if(!Number.isNaN(d.getTime()))return d.toLocaleString('pt-BR');
  }catch(e){}
  return String(v||'—');
}
function unifiedActionUrgencyLabel(v){
  const n=normalizeAnswer(v||'media');
  if(n==='alta')return '🔴 Alta';
  if(n==='baixa')return '🟢 Baixa';
  return '🟡 Média';
}





function unifiedManualActionStatus(a){
  if(a?.completedAt || Number(a?.progress||0)>=100)return {code:'done',label:'Concluída',reason:'Conclusão registrada.'};
  if(unifiedManualActionDeadline(a).days<0)return {code:'overdue',label:'Atrasada',reason:'O prazo da ação venceu.'};
  return {code:'pending',label:'Pendente',reason:'Aguardando conclusão.'};
}
function unifiedManualActionDeadline(a){
  const value=String(a?.deadline||'').trim();
  const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return actionDeadlineInfo({answers:{p12:iso?iso[3]+'/'+iso[2]+'/'+iso[1]:value}});
}

function unifiedActionAllSectors(){
  const values=[];
  ['matriz','filial'].forEach(unit=>{
    try{values.push(...getConfiguredSectors(unit))}catch(e){}
  });
  try{values.push(...getConfiguredSectorsForTriage())}catch(e){}
  return [...new Set(values.map(x=>String(x||'').trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function populateUnifiedActionDependencySectors(){
  const sel=document.getElementById('unifiedActionDependencySectors');
  if(!sel)return;
  const current=new Set([...sel.selectedOptions].map(o=>o.value));
  sel.innerHTML=unifiedActionAllSectors()
    .map(s=>`<option value="${escapeHtml(s)}"${current.has(s)?' selected':''}>${escapeHtml(s)}</option>`)
    .join('');
}
const unifiedSectorDescriptions=new Map();
const unifiedSectorPeople=new Map();

function unifiedActionDependencyUnit(){
 const value=String(document.getElementById('unifiedActionRo')?.value||'').trim();
 const matches=value?unifiedActionRoChoices().filter(r=>r.number.toUpperCase()===value.toUpperCase()||(/^\d+$/.test(value)&&Number(r.number.match(/\d+$/)?.[0])===Number(value))):[];
 const units=[...new Set(matches.map(r=>r.unit))];
 if(value&&units.length!==1)return '';
 return explicitPortalUnit(units[0]||document.getElementById('unifiedActionUnit')?.value||getSession()?.unit||currentUserUnit());
}
function unifiedDependencyUsers(unit,sector){
 if(!unit)return [];
 return [...new Map(getOperationalUsers().filter(unifiedActionIsActiveUser)
   .filter(u=>unifiedActionUserKey(u)&&userHasUnitSector(u,unit,sector))
   .map(u=>[unifiedActionUserKey(u),u])).values()];
}
function unifiedDependencyRole(sector,key,name,role=''){
 return '<label style="display:grid;grid-template-columns:minmax(0,1fr) minmax(120px,160px);gap:8px;align-items:center;margin:5px 0"><span>'+escapeHtml(name)+'</span><select style="width:100%" data-dependency-sector="'+escapeHtml(sector)+'" data-dependency-key="'+escapeHtml(key)+'">'+[['','Não participa'],['execute','Executa'],['aware','Para ciência']].map(([v,t])=>'<option value="'+v+'"'+(role===v?' selected':'')+'>'+t+'</option>').join('')+'</select></label>';
}
function readUnifiedSectorPeople(host){
 for(const field of host.querySelectorAll('[data-dependency-people]')){
   unifiedSectorPeople.set(field.dataset.dependencyPeople,new Map([...field.querySelectorAll('select[data-dependency-key]')].map(el=>[el.dataset.dependencyKey,el.value])));
 }
}
function renderUnifiedSectorResponsibilities(){
 const host=document.getElementById('unifiedActionSectorResponsibilities');if(!host)return;
 host.querySelectorAll('textarea[data-action-sector]').forEach(el=>unifiedSectorDescriptions.set(el.dataset.actionSector,el.value));
 readUnifiedSectorPeople(host);
 const unit=unifiedActionDependencyUnit();
 const sectors=[...(document.getElementById('unifiedActionDependencySectors')?.selectedOptions||[])].map(o=>o.value);
 host.innerHTML=sectors.map(sector=>{
   const key=unit+'|'+sector;
   const users=unifiedDependencyUsers(unit,sector);
   const selected=unifiedSectorPeople.get(key)||new Map();
   return '<div style="margin-top:10px"><label><div class="label">Parte do setor '+escapeHtml(sector)+'</div><textarea data-action-sector="'+escapeHtml(sector)+'" rows="2" maxlength="2000" placeholder="Descreva o que este setor precisa fazer nesta ação">'+escapeHtml(unifiedSectorDescriptions.get(sector)||'')+'</textarea></label>'+
     '<div data-dependency-people="'+escapeHtml(key)+'"><b class="small">Quem executa e quem precisa ter ciência?</b>'+
     (users.length?users.map(u=>{const id=unifiedActionUserKey(u);return unifiedDependencyRole(sector,id,u.name||u.email,selected.get(id)||'');}).join(''):'<div class="small">'+(unit?'Nenhum usuário ativo neste setor.':'Selecione a R.O. ou unidade.')+'</div>')+'</div></div>';
 }).join('');
 host.hidden=sectors.length===0;
}
function unifiedActionSelectedDependencies(){
 const sectors=[...(document.getElementById('unifiedActionDependencySectors')?.selectedOptions||[])].map(o=>String(o.value||'').trim()).filter(Boolean);
 const host=document.getElementById('unifiedActionSectorResponsibilities');
 host.querySelectorAll('textarea[data-action-sector]').forEach(el=>unifiedSectorDescriptions.set(el.dataset.actionSector,el.value));
 readUnifiedSectorPeople(host);
 const unit=unifiedActionDependencyUnit();
 const external=String(document.getElementById('unifiedActionExternalDependencies')?.value||'').split(/\n|;/).map(x=>x.trim()).filter(Boolean);
 return {sectors:[...new Set(sectors)],external:[...new Set(external)],
   sectorResponsibilities:[...new Set(sectors)].map(sector=>{const chosen=[...(unifiedSectorPeople.get(unit+'|'+sector)||new Map())];return {sector,description:String(unifiedSectorDescriptions.get(sector)||'').trim(),people:chosen.filter(([,v])=>v==='execute').map(([k])=>k),awareness:chosen.filter(([,v])=>v==='aware').map(([k])=>k)};})};
}
function unifiedActionDependencyText(a){
 const deps=a?.dependencies||{},sectors=Array.isArray(deps.sectors)?deps.sectors:[],external=Array.isArray(deps.external)?deps.external:[];
 const all=[...sectors,...external];
 if(!all.length&&a?.dependency)all.push(String(a.dependency));
 return all.length?all.join(' · '):'—';
}
function unifiedActionDependencyDetails(a){
 const summary=unifiedActionDependencyText(a);
 const me=unifiedCurrentUserKey();
 if(a.dependencySector||(!isAdmin()&&a.createdByKey!==me))return escapeHtml(summary);
 const parts=new Map((a.dependencies?.sectorResponsibilities||[]).map(part=>[part.sector,part.description]));
 const groupId=a.groupId||a.id;
 const children=getUnifiedManualActions().filter(child=>child.groupId===groupId&&child.dependencySector);
 for(const child of children)parts.set(child.dependencySector,child.action);
 for(const sector of a.dependencies?.sectors||[])if(!parts.has(sector))parts.set(sector,'');
 if(!parts.size)return escapeHtml(summary);
 return '<div>'+escapeHtml(summary)+'</div><div style="display:grid;gap:8px;margin-top:10px">'+
   [...parts].map(([sector,description])=>{
     const assigned=children.filter(child=>child.dependencySector===sector);
     const done=assigned.filter(child=>unifiedManualActionStatus(child).code==='done').length;
     const checked=assigned.length>0&&done===assigned.length;
     const label=assigned.length?done+'/'+assigned.length+' concluídas':'Aguardando distribuição';
     const people=assigned.map(child=>{
       const completed=unifiedManualActionStatus(child).code==='done';
       return '<div class="small" style="margin-top:4px">'+(completed?'✓ ':'○ ')+escapeHtml(unifiedSharedNames(child,'execute'))+
         ' · '+(completed?'Concluída':'Pendente')+(unifiedSharedNames(child,'aware')?'<div class="small">Para ciência: '+escapeHtml(unifiedSharedNames(child,'aware'))+'</div>':'')+
         (unifiedSharedCanEdit(child)?' <button class="btn secondary" type="button" onclick="document.getElementById(\'actionDetailsDialog\').close();openUnifiedActionEdit(\''+escapeHtml(child.id)+'\')">Editar</button>':'')+(!completed&&unifiedManualActionCanComplete(child)?' <button class="btn secondary" type="button" data-dependency-complete="'+escapeHtml(child.id)+'">Concluir</button>':'')+'</div>';
     }).join('');
     return '<div style="border:1px solid var(--line);padding:10px;border-radius:8px"><b>'+ (checked?'✓ ':'○ ')+escapeHtml(sector)+'</b>'+
       '<div class="small">'+escapeHtml(label)+'</div>'+
       '<details style="margin-top:5px"><summary>Consultar parte</summary>'+
       '<div style="white-space:pre-wrap;overflow-wrap:anywhere">'+escapeHtml(description)+'</div>'+people+'</details></div>';
   }).join('')+'</div>';
}
document.addEventListener('change',event=>{
 if(['unifiedActionDependencySectors','unifiedActionRo','unifiedActionUnit','unifiedActionMode'].includes(event.target.id))renderUnifiedSectorResponsibilities();
});
async function openUnifiedActionModal(){
  if(!nucleoFeatureRequire('pdca','actions'))return;
  try{await loadUnifiedManualActions();}catch(e){alert(e.message);return;}
  const ov=document.getElementById('unifiedActionOverlay');
  if(!ov)return;
  document.getElementById('unifiedActionRo').value='';
  populateUnifiedActionRos();
  document.getElementById('unifiedActionText').value='';
  document.getElementById('unifiedActionDeadline').value='';
  document.getElementById('unifiedActionNote').value='';
  document.getElementById('unifiedActionType').value='Contenção';
  document.getElementById('unifiedActionProject').value='';
  document.getElementById('unifiedActionSubject').value='';
  document.getElementById('unifiedActionExternalDependencies').value='';
  document.getElementById('unifiedActionUrgency').value='media';
  document.getElementById('unifiedActionNextStep').value='';
  document.getElementById('unifiedActionProgress').value='0';
  document.getElementById('unifiedActionRemaining').value='';
  unifiedSectorDescriptions.clear();
  unifiedSectorPeople.clear();
  const responsibilityHost=document.getElementById('unifiedActionSectorResponsibilities');if(responsibilityHost)responsibilityHost.innerHTML='';
  const sectorSelect=document.getElementById('unifiedActionDependencySectors');if(sectorSelect)[...sectorSelect.options].forEach(o=>o.selected=false);
  populateUnifiedActionDependencySectors();
  renderUnifiedSectorResponsibilities();

  const mode=document.getElementById('unifiedActionMode');
  if(isAdmin()){
    mode.innerHTML='<option value="self">Para mim</option><option value="person">Pessoa</option><option value="sector">Grupo / setor</option>';
  }else if(isManager()){
    mode.innerHTML='<option value="self">Para mim</option><option value="person">Liderado</option>';
  }else{
    mode.innerHTML='<option value="self">Para mim</option>';
  }
  mode.value='self';

  const unit=document.getElementById('unifiedActionUnit');
  if(unit)unit.value=currentUserUnit();

  refreshUnifiedActionTargetUi();
  unifiedNewSharedSelection=new Map([[unifiedCurrentUserKey(),'execute']]);
  document.getElementById('unifiedActionSharedPeople')?.replaceChildren();
  unifiedRenderCreationPeople();
  ov.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeUnifiedActionModal(){
  document.getElementById('unifiedActionOverlay')?.classList.remove('open');
  document.body.style.overflow='';
}
function refreshUnifiedActionTargetUi(){
  ['unifiedActionModeWrap','unifiedActionPersonWrap','unifiedActionPersonSectorWrap','unifiedActionSectorWrap'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  const unitWrap=document.getElementById('unifiedActionUnitWrap');if(unitWrap)unitWrap.classList.remove('hidden');
  const unit=document.getElementById('unifiedActionUnit');if(unit){const allowed=unifiedSharedAccessUnits(getSession());Array.from(unit.options).forEach(o=>o.disabled=!allowed.includes(o.value));if(!allowed.includes(unit.value))unit.value=allowed[0]||'matriz';unit.disabled=allowed.length<=1;}
  const summary=document.getElementById('unifiedActionTargetSummary');if(summary)summary.textContent='Será criada uma única ação compartilhada. Quem executa pode atualizar e concluir; quem tem ciência apenas acompanha.';
  if(document.getElementById('unifiedActionOverlay')?.classList.contains('open'))unifiedRenderCreationPeople();
}
function refreshUnifiedActionPeopleBySector(){
  const person=document.getElementById('unifiedActionPerson');
  const sector=String(document.getElementById('unifiedActionPersonSector')?.value||'').trim();
  if(!person)return;

  if(!sector){
    person.innerHTML='<option value="">Selecione primeiro o setor...</option>';
    return;
  }

  const users=unifiedActionAssignableUsers()
    .filter(u=>{
      const sectors=[
        u.sector,
        ...(Array.isArray(u.sectorMemberships)?u.sectorMemberships.map(m=>m.sector):[])
      ].filter(Boolean);
      return sectors.some(s=>normalizeAnswer(s)===normalizeAnswer(sector));
    })
    .sort((a,b)=>String(a.name||a.email||'').localeCompare(String(b.name||b.email||''),'pt-BR'));

  person.innerHTML='<option value="">Selecione a pessoa...</option>'+
    users.map(u=>
      `<option value="${escapeHtml(unifiedActionUserKey(u))}">${escapeHtml(u.name||u.email)} · ${escapeHtml(canonicalUnitName(u.unit||''))}</option>`
    ).join('');

  if(!users.length){
    person.innerHTML='<option value="">Nenhuma pessoa ativa neste setor</option>';
  }
}

function unifiedActionCodeScope(record){
  const ro=String(record.ro||'').trim().toUpperCase();
  if(!ro)return '';
  const unit=explicitPortalUnit(record.roUnit||record.unit)||'';
  const origin=normalizeAnswer(record.sourceRoOrigin||'');
  return JSON.stringify([ro,unit,/^RO[- ]?(IN|EX)[- ]/.test(ro)?'':origin]);
}

function unifiedActionCodePrefix(ro){
  const number=String(ro||'').trim().match(/\d+$/)?.[0];
  return number?'ACT-'+number.replace(/^0+(?=\d)/,'')+'-':'ACT-';
}

function unifiedActionLegacySequences(records){
  const scopes=new Map();
  const sequences=new Map();
  for(const record of records){
    const scope=unifiedActionCodeScope(record);
    if(!scopes.has(scope))scopes.set(scope,{used:new Set(),groups:new Map()});
    const {used,groups}=scopes.get(scope);
    if(record.actionCode){
      if(Number(record.actionSequence)>0)used.add(Number(record.actionSequence));
      continue;
    }
    const key=JSON.stringify([record.groupId||record.id,record.dependencySector||'']);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(record);
  }
  for(const {used,groups} of scopes.values()){
    const ordered=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b));
    let sequence=1;
    for(const [,group] of ordered){
      while(used.has(sequence))sequence++;
      for(const record of group)sequences.set(record.id,sequence);
      sequence++;
    }
  }
  return sequences;
}

function unifiedActionCodeStart(records,scope){
  const previous=records.filter(record=>unifiedActionCodeScope(record)===scope);
  const legacy=unifiedActionLegacySequences(previous);
  return previous.reduce((max,record)=>Math.max(max,Number(record.actionSequence)||legacy.get(record.id)||0),0)+1;
}

let unifiedActionPendingCreation=null;
async function saveUnifiedAction(button){
  if(button?.disabled)return;
  if(button)button.disabled=true;
  try{await createUnifiedAction();}
  catch(error){alert(error.message||String(error));}
  finally{if(button)button.disabled=false;}
}
async function createUnifiedAction(){
  const text=String(document.getElementById('unifiedActionText')?.value||'').trim();
  const deadline=String(document.getElementById('unifiedActionDeadline')?.value||'').trim();
  const note=String(document.getElementById('unifiedActionNote')?.value||'').trim();
  const type=String(document.getElementById('unifiedActionType')?.value||'Ação').trim();
  const project=String(document.getElementById('unifiedActionProject')?.value||'').trim();
  const subject=String(document.getElementById('unifiedActionSubject')?.value||'').trim();
  const dependencies=unifiedActionSelectedDependencies();
  const urgency=String(document.getElementById('unifiedActionUrgency')?.value||'media').trim();
  const nextStep=String(document.getElementById('unifiedActionNextStep')?.value||'').trim();
  const progress=Math.max(0,Math.min(100,Number(document.getElementById('unifiedActionProgress')?.value||0)));
  const remaining=String(document.getElementById('unifiedActionRemaining')?.value||'').trim();
  const mode=String(document.getElementById('unifiedActionMode')?.value||'self');
  if(!text){alert('Informe a ação.');return}
  const ro=resolveUnifiedActionRo();
  if(ro===null)return;

  const session=getSession()||{};
  const creatorKey=unifiedCurrentUserKey();
  const creatorName=session.name||session.email||'Usuário';
  const now=new Date().toISOString();
  const unit=explicitPortalUnit(ro?.unit||document.getElementById('unifiedActionUnit')?.value||session.unit||currentUserUnit());
  if(!unit)throw new Error('Selecione a unidade da ação.');
  const chosen=unifiedReadSharedPeople(document.getElementById('unifiedActionSharedPeople'));
  const byKey=new Map(unifiedSharedEligibleUsers(unit).map(u=>[unifiedActionUserKey(u),u]));
  const assignees=[...chosen].filter(([key,role])=>role==='execute'&&byKey.has(key)).map(([key])=>({key,name:byKey.get(key).name||key,sector:byKey.get(key).sector||'',unit}));
  const awarenessKeys=[...chosen].filter(([key,role])=>role==='aware'&&byKey.has(key)).map(([key])=>key);
  if(!assignees.length)throw new Error('Selecione pelo menos uma pessoa que executará a ação.');

  const deliveries=[];
  for(const part of dependencies.sectorResponsibilities){
    if(!part.description){alert('Descreva a ação de '+part.sector+'.');return;}
    if(!unit){alert('Identifique a unidade da ação para atribuir aos setores.');return;}
    const recipients=getOperationalUsers().filter(unifiedActionIsActiveUser)
       .filter(u=>part.people.includes(unifiedActionUserKey(u))&&userHasUnitSector(u,unit,part.sector));
    if(!recipients.length){alert('Selecione pelo menos um responsável em '+part.sector+'.');return;}
    const recipientKeys=new Set();
    for(const user of recipients){
      const key=unifiedActionUserKey(user);
      if(recipientKeys.has(key))continue;
      recipientKeys.add(key);
      deliveries.push({key,name:user.name||user.email,unit,sector:part.sector,description:part.description,awarenessKeys:part.awareness||[]});
    }
  }

  await loadUnifiedManualActions();
  const list=getUnifiedManualActions();
  const main={...assignees[0],executorKeys:assignees.map(u=>u.key),awarenessKeys};
  const grouped=new Map();for(const d of deliveries){if(!grouped.has(d.sector))grouped.set(d.sector,{...d,executorKeys:[],awarenessKeys:[...d.awarenessKeys]});grouped.get(d.sector).executorKeys.push(d.key);}
  const destinations=[main,...grouped.values()];
  const signature=JSON.stringify({creatorKey,mode,ro,text,deadline,note,type,project,subject,dependencies,urgency,nextStep,progress,remaining,destinations});
  if(unifiedActionPendingCreation?.signature!==signature){
    const groupId='ACTGRP-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
    const codeScope=unifiedActionCodeScope({ro:ro?.number,roUnit:ro?.unit,sourceRoOrigin:ro?.origin});
    const firstSequence=unifiedActionCodeStart(list,codeScope);
    const prefix=unifiedActionCodePrefix(ro?.number);
    const sectorSequences=new Map(dependencies.sectors.map((sector,i)=>[sector,firstSequence+i+1]));
    const records=destinations.map((recipient,index)=>{
      const isDependency=index>0;
      const actionSequence=isDependency?sectorSequences.get(recipient.sector):firstSequence;
      return {
        id:'ACT-'+groupId.slice(7)+'-'+index,
        actionCode:prefix+actionSequence,actionSequence,
        groupId:destinations.length>1?groupId:'',
        source:isDependency||recipient.executorKeys.some(k=>k!==creatorKey)||recipient.awarenessKeys.length?'assigned':'self',
        sharedAction:true,executorKeys:recipient.executorKeys,awarenessKeys:recipient.awarenessKeys,
        recordKind:'manual_action',
        ro:ro?.number||'',roUnit:ro?.unit||'',sourceRoOrigin:ro?.origin||'',
        action:isDependency?recipient.description:text,
        deadline,
        note:isDependency?'':note,
        type,project,subject,urgency,
        dependencies:isDependency?{}:{sectors:dependencies.sectors,external:dependencies.external,sectorResponsibilities:dependencies.sectorResponsibilities},
        dependencySector:isDependency?recipient.sector:'',
        nextStep:isDependency?'':nextStep,
        progress:isDependency?0:progress,
        remaining:isDependency?'':remaining,
        history:[{
          id:'UPD-'+groupId+'-'+index,at:now,byKey:creatorKey,byName:creatorName,
          text:'Ação criada.',progress:isDependency?0:progress,
          remaining:isDependency?'':remaining,nextStep:isDependency?'':nextStep
        }],
        assigneeKey:recipient.key,assigneeName:recipient.name,
        sector:recipient.sector||'',unit:recipient.unit||'',
        createdByKey:creatorKey,createdByName:creatorName,createdAt:now,
        completedAt:'',completedBy:'',evidence:''
      };
    });
    unifiedActionPendingCreation={signature,records};
  }
  const records=unifiedActionPendingCreation.records;
  const existing=new Set(list.map(record=>record.id));
  await saveUnifiedManualActions(list.concat(records.filter(record=>!existing.has(record.id))));
  unifiedActionPendingCreation=null;

  for(const record of records){
    for(const key of [...record.executorKeys,...record.awarenessKeys])createNotification({
      type:'action',skipEmail:true,audience:'user',userKey:key,sector:record.sector,
      title:record.awarenessKeys.includes(key)?'Ação para ciência':'Nova ação atribuída',message:record.action+(deadline?' · Prazo: '+formatDateBR(deadline):'')
    });
  }
  closeUnifiedActionModal();
  renderActionsDashboard();
  refreshUserPendingActionAlert();
  alert('Ação compartilhada criada. '+assignees.length+' responsável(is) pela execução e '+awarenessKeys.length+' pessoa(s) para ciência.');
}
function unifiedManualActionCanComplete(a){
  const me=unifiedCurrentUserKey();
  return unifiedSharedExecutors(a).includes(me)||unifiedSharedCanEdit(a);
}

function unifiedActionCanUpdate(a){
  if(!a)return false;
  const me=unifiedCurrentUserKey();
  if(a.sharedAction)return unifiedSharedExecutors(a).includes(me)||unifiedSharedCanEdit(a);
  if(isAdmin())return true;
  if(String(a.assigneeKey||'').toLowerCase()===me)return true;
  if(isManager()){
    const target=getOperationalUsers().find(u=>unifiedActionUserKey(u)===String(a.assigneeKey||'').toLowerCase());
    const sectors=[
      target?.sector,
      ...(Array.isArray(target?.sectorMemberships)?target.sectorMemberships.map(m=>m.sector):[])
    ].filter(Boolean);
    if(sectors.some(managesSector))return true;
  }
  return false;
}
function openUnifiedActionHistory(id){
  const a=getUnifiedManualActions().find(x=>String(x.id)===String(id));
  if(!a)return;
  if(!unifiedActionCanSee(a)){alert('Você não possui acesso a esta ação.');return}

  const ov=document.getElementById('unifiedActionHistoryOverlay');
  if(!ov)return;
  document.getElementById('unifiedActionHistoryId').value=String(a.id||'');
  document.getElementById('unifiedActionHistoryTitle').textContent=a.action||'Acompanhamento da ação';
  document.getElementById('unifiedActionHistorySubtitle').textContent=
    [a.id,a.assigneeName,a.sector].filter(Boolean).join(' · ');

  const canUpdate=unifiedActionCanUpdate(a);
  const updateBlock=document.getElementById('unifiedActionUpdateText')?.closest('.settings-block');
  if(updateBlock)updateBlock.style.display=canUpdate?'':'none';

  document.getElementById('unifiedActionUpdateText').value='';
  document.getElementById('unifiedActionUpdateProgress').value=String(Math.max(0,Math.min(100,Number(a.progress||0))));
  document.getElementById('unifiedActionUpdateRemaining').value=a.remaining||'';
  document.getElementById('unifiedActionUpdateNextStep').value=a.nextStep||'';

  renderUnifiedActionHistory(a);
  ov.classList.add('open');
  document.body.style.overflow='hidden';
}
function closeUnifiedActionHistory(){
  document.getElementById('unifiedActionHistoryOverlay')?.classList.remove('open');
  document.body.style.overflow='';
}
function renderUnifiedActionHistory(a){
  const summary=document.getElementById('unifiedActionDetailSummary');
  const timeline=document.getElementById('unifiedActionTimeline');
  if(summary){
    const progress=Math.max(0,Math.min(100,Number(a.progress||0)));
    summary.innerHTML=`
      <div><span>Responsável</span><b>${escapeHtml(unifiedSharedNames(a,'execute'))}</b></div>
      <div><span>Para ciência</span><b>${escapeHtml(unifiedSharedNames(a,'aware')||'—')}</b></div><div><span>Setor</span><b>${escapeHtml(a.sector||'-')}</b></div>
      <div><span>Tipo</span><b>${escapeHtml(a.type||'Ação')}</b></div>
      <div><span>Urgência</span><b>${escapeHtml(unifiedActionUrgencyLabel(a.urgency))}</b></div>
      <div><span>Dependências</span>${unifiedActionDependencyDetails(a)}</div>
      <div><span>Prazo</span><b>${escapeHtml(a.deadline?formatDateBR(a.deadline):'—')}</b></div>
      <div class="full"><span>Próximo passo</span><b>${escapeHtml(a.nextStep||'—')}</b></div>
      <div class="full"><span>Falta para terminar</span><b>${escapeHtml(a.remaining||'—')}</b></div>
      <div class="full">
        <span>Andamento</span>
        <div class="action-progress-bar large"><span style="width:${progress}%"></span></div>
        <b>${progress}%</b>
      </div>`;
  }

  if(timeline){
    const history=Array.isArray(a.history)?a.history.slice():[];
    history.sort((x,y)=>String(y.at||'').localeCompare(String(x.at||'')));
    timeline.innerHTML=history.length?history.map(h=>`
      <div class="action-timeline-item">
        <div class="action-timeline-dot"></div>
        <div class="action-timeline-content">
          <div class="action-timeline-head">
            <b>${escapeHtml(h.byName||'Usuário')}</b>
            <span>${escapeHtml(unifiedActionDateTimeLabel(h.at))}</span>
          </div>
          <div class="action-timeline-text">${escapeHtml(h.text||'Atualização registrada.')}</div>
          <div class="action-timeline-meta">
            <span>${Math.max(0,Math.min(100,Number(h.progress||0)))}% concluído</span>
            ${h.remaining?`<span>Falta: ${escapeHtml(h.remaining)}</span>`:''}
            ${h.nextStep?`<span>Próximo: ${escapeHtml(h.nextStep)}</span>`:''}
          </div>
        </div>
      </div>`).join(''):'<div class="small">Nenhuma atualização registrada.</div>';
  }
}
async function saveUnifiedActionUpdate(){
  const id=String(document.getElementById('unifiedActionHistoryId')?.value||'');
  const list=getUnifiedManualActions();
  const i=list.findIndex(a=>String(a.id)===id);
  if(i<0)return;
  const a=list[i];
  if(!unifiedActionCanUpdate(a)){alert('Você não pode atualizar esta ação.');return}

  const text=String(document.getElementById('unifiedActionUpdateText')?.value||'').trim();
  const progress=Math.max(0,Math.min(100,Number(document.getElementById('unifiedActionUpdateProgress')?.value||0)));
  const remaining=String(document.getElementById('unifiedActionUpdateRemaining')?.value||'').trim();
  const nextStep=String(document.getElementById('unifiedActionUpdateNextStep')?.value||'').trim();

  if(!text){alert('Descreva o que foi feito ou o que mudou.');return}

  const now=new Date().toISOString();
  const session=getSession()||{};
  const history=Array.isArray(a.history)?a.history.slice():[];
  history.push({
    id:'UPD-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
    at:now,
    byKey:unifiedCurrentUserKey(),
    byName:session.name||session.email||'Usuário',
    text,
    progress,
    remaining,
    nextStep
  });

  list[i]={
    ...a,
    progress,
    remaining,
    nextStep,
    history,
    updatedAt:now,
    ...(progress>=100?{
      completedAt:a.completedAt||now,
      completedBy:a.completedBy||session.name||session.email||'Usuário'
    }:{
      completedAt:'',
      completedBy:''
    })
  };
  await saveUnifiedManualActions(list);

  renderUnifiedActionHistory(list[i]);
  document.getElementById('unifiedActionUpdateText').value='';
  renderActionsDashboard();
  refreshUserPendingActionAlert();
}

async function completeUnifiedManualAction(id){
  const list=getUnifiedManualActions();
  const i=list.findIndex(a=>String(a.id)===String(id));
  if(i<0)return;
  if(!unifiedManualActionCanComplete(list[i])){alert('Esta ação não está atribuída a você.');return}

  const evidence=prompt('Descreva brevemente o que foi feito / evidência da conclusão:',list[i].evidence||'');
  if(evidence===null)return;
  if(!String(evidence).trim()){alert('Informe a evidência ou resultado da ação.');return}

  const now=new Date().toISOString();
  const actor=getSession()?.name||getSession()?.email||'Usuário';
  const history=Array.isArray(list[i].history)?list[i].history.slice():[];
  history.push({
    id:'UPD-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
    at:now,
    byKey:unifiedCurrentUserKey(),
    byName:actor,
    text:'Ação concluída. '+String(evidence).trim(),
    progress:100,
    remaining:'',
    nextStep:'Concluída'
  });

  list[i]={
    ...list[i],
    evidence:String(evidence).trim(),
    progress:100,
    remaining:'',
    nextStep:'Concluída',
    history,
    completedAt:now,
    updatedAt:now,
    completedBy:actor
  };
  await saveUnifiedManualActions(list);
  renderActionsDashboard();
  refreshUserPendingActionAlert();
}
async function deleteUnifiedManualAction(id){
  const list=getUnifiedManualActions();
  const a=list.find(x=>String(x.id)===String(id));
  if(!a)return;
  const me=unifiedCurrentUserKey();
  const allowed=unifiedSharedCanEdit(a);
  if(!allowed){alert('Somente quem criou a ação ou o SGQ pode excluí-la.');return}
  if(!confirm('Excluir esta ação?'))return;
  await saveUnifiedManualActions(list.filter(x=>String(x.id)!==String(id)));
  renderActionsDashboard();
  refreshUserPendingActionAlert();
}

function actionDashboardItems(){
  const sent=getAllSentPdcas();const admin=isAdmin();const items=[];

  // Ações originadas de PDCA.
  sent.forEach(p=>{
    allPdcaActionsForRecord(p).forEach(a=>{
      const assigned=parseResponsibleSectors(a.responsibleSectors?.length?a.responsibleSectors:a.owner);
      const visible=admin||assigned.some(s=>normalizeAnswer(s)===normalizeAnswer(currentSector())||(isManager()&&managesSector(s)));
      if(!visible)return;
      const pseudo={...p,answers:{...(p.answers||{}),p11:a.action,p12:a.deadline,p13:a.owner},acaoConferidaEm:a.completedAt||a.acaoConferidaEm};
      const status=inferActionStatus(pseudo);
      const sourceRo=findRoByAnyNumber(p.ro||'',p.origemBase||p.sourceRoOrigin||'');
      items.push({
        source:'pdca',sourceLabel:'PDCA',
        id:a.id||p.id||'PDCA',
        createdAt:p.envio||p.dataEnvio||p.sentAt||'',
        type:'Ação corretiva',
        project:p.ro||'-',
        subject:sourceRo?.cliente||p.cliente||p.titulo||p.title||'PDCA',
        dependency:'',
        urgency:pdcaActionUrgency(status),
        nextStep:status.code==='review'?'Aguardar conferência do SGQ':status.code==='overdue'?'Regularizar ação atrasada':'Executar ação e registrar evidência',
        updatedAt:a.completedAt||p.updatedAt||p.envio||'',
        p,actionRecord:a,
        ro:p.ro||'-',setor:p.setor||assigned.join(', ')||'-',acao:a.action||'',
        responsavel:a.owner||p.responsavel||'-',
        responsibleSectors:assigned,prazo:a.deadline||'-',
        status,deadline:actionDeadlineInfo(pseudo),impacta5S:status.code==='overdue'
      });
    });
  });

  // Ações atribuídas / pessoais.
  const manualActions=getUnifiedManualActions();
  const legacySequences=unifiedActionLegacySequences(manualActions);
  const mainGroups=new Set(manualActions.filter(a=>!a.dependencySector).map(a=>a.groupId||a.id));
  const me=unifiedCurrentUserKey();
  manualActions.filter(a=>{
    if(!unifiedActionCanSee(a))return false;
    if(!a.dependencySector)return true;
    // A gestão acompanha as partes na ação principal.
    // A fila operacional contém apenas as atribuições do próprio responsável.
    return admin?!mainGroups.has(a.groupId):unifiedSharedExecutors(a).includes(me)||unifiedSharedObservers(a).includes(me);
  }).forEach(a=>{
    const status=unifiedManualActionStatus(a);
    items.push({
      source:a.source==='self'?'self':'assigned',
      sourceLabel:a.source==='self'?'Pessoal':'Atribuída',
      id:a.actionCode||unifiedActionCodePrefix(a.ro)+legacySequences.get(a.id),
      createdAt:a.createdAt||'',
      type:a.type||'Ação',
      project:[a.ro,a.project].filter(Boolean).join(' · ')||'—',
      subject:a.subject||'—',
      dependency:unifiedActionDependencyText(a),
      urgency:a.urgency||'media',
      nextStep:a.nextStep||'—',
      progress:Number(a.progress||0),
      remaining:a.remaining||'',
      updatedAt:a.completedAt||a.updatedAt||a.createdAt||'',
      manualAction:a,
      ro:a.ro||'—',
      setor:a.sector||'-',
      acao:a.action||'',
      responsavel:unifiedSharedNames(a,'execute'),
      responsibleSectors:[...new Set([a.sector,...(a.executors||[]).map(u=>u.sector)].filter(Boolean))],
      participantRole:unifiedSharedObservers(a).includes(me)&&!unifiedSharedExecutors(a).includes(me)?'Ciência':'',
      prazo:a.deadline||'-',
      status,
      deadline:unifiedManualActionDeadline(a),
      impacta5S:false
    });
  });

  return items.filter(x=>x.acao);
}

function populateActionsSectorFilter(){
  const wrap=document.getElementById('actionsSectorFilterWrap');
  const sel=document.getElementById('actionsSectorFilter');
  const personWrap=document.getElementById('actionsPersonFilterWrap');
  const personSel=document.getElementById('actionsPersonFilter');
  if(!wrap||!sel)return;

  const items=actionDashboardItems();
  const current=sel.value||'all';

  if(!isAdmin()&&!isManager()){
    wrap.style.display='none';
  }else{
    wrap.style.display='';
    const sectors=[...new Set(items.flatMap(x=>x.responsibleSectors||[]).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));
    sel.innerHTML='<option value="all">Todos os setores</option>'+sectors.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    if([...sel.options].some(o=>o.value===current))sel.value=current;
  }

  if(personWrap&&personSel){
    const people=[...new Set(items.flatMap(x=>x.manualAction?.executors?.length?x.manualAction.executors.map(u=>u.name):[String(x.responsavel||'').trim()]).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const currentPerson=personSel.value||'all';
    personSel.innerHTML='<option value="all">Todas as pessoas</option>'+people.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    if([...personSel.options].some(o=>o.value===currentPerson))personSel.value=currentPerson;
    personWrap.style.display=people.length?'':'none';
  }
}
function unifiedActionRowButtons(x){
  if(x.source==='pdca'){
    const buttons=[];
    if(x.p?.id)buttons.push(`<button class="btn secondary" type="button" onclick="openPdcaReport('${escapeHtml(x.p.id)}')">Ver PDCA</button>`);
    if(x.status.code!=='done' && !isAdmin() && x.actionRecord?.id){
      buttons.push(`<button class="btn primary" type="button" onclick="registerActionEvidence('${escapeHtml(x.p.id)}','${escapeHtml(x.actionRecord.id)}')">Registrar conclusão</button>`);
    }
    if(isAdmin() && x.status.code==='review' && x.p?.id){
      buttons.push(`<button class="btn primary" type="button" onclick="confirmActionCompletion('${escapeHtml(x.p.id)}')">Confirmar conclusão</button>`);
    }
    if(canContestActionSector(x.p,x.actionRecord)){
      const c=getActionSectorContest(x.actionRecord.id,currentSector());
      if(c?.status==='pending')buttons.push('<span class="status-badge pending">Contestação em análise</span>');
      else if(c?.status==='accepted')buttons.push('<span class="status-badge answered">Retirado da ação</span>');
      else buttons.push(`<button class="btn secondary" type="button" onclick="contestActionSector('${escapeHtml(x.p.id)}','${escapeHtml(x.actionRecord.id)}')">Contestar</button>`);
    }
    return buttons.join('');
  }

  const a=x.manualAction||{};
  const buttons=[];
  buttons.push(`<button class="btn secondary" type="button" onclick="openUnifiedActionHistory('${escapeHtml(a.id)}')">Acompanhar</button>`);
  if(x.status.code!=='done' && unifiedManualActionCanComplete(a)){
    buttons.push(`<button class="btn primary" type="button" onclick="completeUnifiedManualAction('${escapeHtml(a.id)}')">Concluir</button>`);
  }
  const me=unifiedCurrentUserKey();
  if(unifiedSharedCanEdit(a))buttons.push(`<button class="btn secondary" type="button" onclick="openUnifiedActionEdit('${escapeHtml(a.id)}')">Editar ação</button>`);
  if(unifiedSharedCanEdit(a)){
    buttons.push(`<button class="btn secondary" type="button" onclick="deleteUnifiedManualAction('${escapeHtml(a.id)}')">Excluir</button>`);
  }
  return buttons.join('')||'<span class="small">Somente acompanhamento</span>';
}
function renderActionsDashboard(){
  const items=actionDashboardItems();
  const statusFilter=document.getElementById('actionsStatusFilter')?.value||'all';
  const search=normalizeAnswer(document.getElementById('actionsSearch')?.value||'');
  const sectorFilter=document.getElementById('actionsSectorFilter')?.value||'all';
  const originFilter=document.getElementById('actionsOriginFilter')?.value||'all';
  const personFilter=document.getElementById('actionsPersonFilter')?.value||'all';
  const urgencyFilter=document.getElementById('actionsUrgencyFilter')?.value||'all';

  const counts={pending:0,overdue:0,review:0,done:0};
  items.forEach(x=>{ if(x.participantRole!=='Ciência'&&counts[x.status.code]!==undefined) counts[x.status.code]++; });
  ['sumPending','sumOverdue','sumReview','sumDone'].forEach((id,i)=>{
    const key=['pending','overdue','review','done'][i];
    const el=document.getElementById(id);if(el)el.textContent=counts[key]||0;
  });

  let filtered=items.filter(x=>{
    if(statusFilter!=='all' && x.status.code!==statusFilter)return false;
    if(originFilter!=='all' && x.source!==originFilter)return false;
    if(urgencyFilter!=='all' && normalizeAnswer(x.urgency)!==normalizeAnswer(urgencyFilter))return false;
    if(personFilter!=='all' && ![x.responsavel,...(x.manualAction?.executors||[]).map(u=>u.name)].some(n=>normalizeAnswer(n)===normalizeAnswer(personFilter)))return false;
    if((isAdmin()||isManager()) && sectorFilter!=='all' && !(x.responsibleSectors||[]).some(s=>normalizeAnswer(s)===normalizeAnswer(sectorFilter)))return false;
    if(search){
      const hay=normalizeAnswer([
        x.id,x.sourceLabel,x.type,x.project,x.ro,x.subject,x.setor,x.acao,x.responsavel,
        x.dependency,x.nextStep,x.remaining,x.manualAction?.createdByName,unifiedSharedNames(x.manualAction,'aware')
      ].join(' '));
      if(!hay.includes(search))return false;
    }
    return true;
  });

  filtered.sort((a,b)=>{
    const da=a.deadline.days, db=b.deadline.days;
    if(da===null && db===null)return String(a.acao).localeCompare(String(b.acao),'pt-BR');
    if(da===null)return 1;
    if(db===null)return -1;
    return da-db;
  });

  const body=document.getElementById('actionsDashboardBody');
  if(!body)return;
  body.innerHTML=filtered.length?filtered.map((x,index)=>`<tr>
    <td><b>${escapeHtml(x.id||'—')}</b><div class="small">${escapeHtml(x.ro||'—')}</div></td>
    <td><div class="action-main-text action-summary-text">${escapeHtml(x.acao)}</div></td>
    <td>${escapeHtml(x.responsavel)}<div class="small">${escapeHtml(x.setor)}${x.participantRole?' · '+escapeHtml(x.participantRole):''}</div></td>
    <td><span class="action-pill ${x.status.code}">${escapeHtml(x.status.label)}</span></td>
    <td><button class="btn secondary" type="button" data-action-consult="${index}">Consultar</button></td>
  </tr>`).join(''):'<tr><td colspan="5" style="text-align:center;padding:24px">Nenhuma ação encontrada nesta visão.</td></tr>';
  body.querySelectorAll('[data-action-consult]').forEach(button=>{
    button.onclick=async()=>{
      const item=filtered[Number(button.dataset.actionConsult)];
      if(!item)return;
      if(!item.manualAction){openUnifiedActionDetails(item);return;}
      button.disabled=true;
      try{
        await loadUnifiedManualActions();
        const current=actionDashboardItems().find(row=>row.manualAction?.id===item.manualAction.id);
        if(current)openUnifiedActionDetails(current);
        else alert('A ação não está mais disponível nesta visualização.');
      }catch(error){alert(error.message||String(error));}
      finally{button.disabled=false;}
    };
  });

}
function unifiedExistingDependencyParts(parent,records){
 const parts=new Map((parent.dependencies?.sectorResponsibilities||[]).map(part=>[part.sector,part.description]));
 for(const child of records){
   if(child.groupId===(parent.groupId||parent.id)&&child.dependencySector)parts.set(child.dependencySector,child.action);
 }
 return [...parts].map(([sector,description])=>({sector,description}));
}
function unifiedExistingPeopleEditor(parent){
 const records=getUnifiedManualActions(),groupId=parent.groupId||parent.id,unit=explicitPortalUnit(parent.roUnit||parent.unit);
 const parts=unifiedExistingDependencyParts(parent,records);if(!parts.length)return '';
 return '<details style="margin:12px 0" open><summary>Escolher execução e ciência por setor</summary><p class="small">Uma atividade por setor. Quem tem ciência visualiza, mas não precisa concluir.</p>'+parts.map(part=>{
   const assigned=records.filter(a=>a.groupId===groupId&&a.dependencySector===part.sector),users=new Map(unifiedDependencyUsers(unit,part.sector).map(u=>[unifiedActionUserKey(u),u.name||u.email]));
   const roles=new Map();
   for(const record of assigned){
    for(const key of unifiedSharedObservers(record)){if(!users.has(key))users.set(key,unifiedActionUserDisplay(key));if(!roles.has(key))roles.set(key,'aware');}
    for(const key of unifiedSharedExecutors(record)){if(!users.has(key))users.set(key,unifiedActionUserDisplay(key));roles.set(key,'execute');}
   }
   return '<fieldset style="margin:8px 0;padding:10px;border:1px solid var(--line)" data-role-sector="'+escapeHtml(part.sector)+'"><legend>'+escapeHtml(part.sector)+'</legend>'+
     [...users].map(([key,name])=>unifiedDependencyRole(part.sector,key,name,roles.get(key)||'')).join('')+'</fieldset>';
 }).join('')+'</details>';
}
async function distributeExistingActionParts(id,button){
 if(button.disabled)return;button.disabled=true;
 const parent=getUnifiedManualActions().find(a=>a.id===id);
 if(!parent||!unifiedSharedCanEdit(parent)){button.disabled=false;return;}
 const old=getUnifiedManualActions(),group=parent.groupId||parent.id,host=document.getElementById('dependencyPeopleEditor'),updates=[];
 const guard=e=>{e.preventDefault();e.returnValue='';};
 try{
  for(const field of host.querySelectorAll('[data-role-sector]')){
   const sector=field.dataset.roleSector,choices=[...field.querySelectorAll('select[data-dependency-key]')],executorKeys=choices.filter(x=>x.value==='execute').map(x=>x.dataset.dependencyKey),awarenessKeys=choices.filter(x=>x.value==='aware').map(x=>x.dataset.dependencyKey);
   const children=old.filter(a=>a.groupId===group&&a.dependencySector===sector);
   if(!executorKeys.length)throw Error('Selecione pelo menos um executor em '+sector+'.');
   const expected=children.map(a=>({id:a.id,updatedAt:a.updatedAt||a.createdAt||''}));
   if(children.length===1&&children[0].sharedAction&&JSON.stringify([...executorKeys].sort())===JSON.stringify([...unifiedSharedExecutors(children[0])].sort())&&JSON.stringify([...awarenessKeys].sort())===JSON.stringify([...unifiedSharedObservers(children[0])].sort()))continue;
   updates.push({sector,executorKeys,awarenessKeys,expected});
  }
  if(!updates.length){alert('Os participantes já estão atualizados.');return;}
  window.addEventListener('beforeunload',guard);
  await withNucleoLoading('Confirmando participantes por setor…',async()=>{
   for(const update of updates){
    const r=await unifiedConfirmedActionMutation({mode:'dependency_roles',id,dados:JSON.stringify(update)},90000);
    if(!r?.sucesso||!r.registro)throw Error(r?.erro||'A distribuição não foi confirmada.');
   }
   await loadUnifiedManualActions();
  },'Salvar responsáveis');
  renderActionsDashboard();refreshUserPendingActionAlert();
  const current=actionDashboardItems().find(row=>row.manualAction?.id===id);if(current)openUnifiedActionDetails(current);
  alert('Participantes atualizados. Execução e ciência compartilham a mesma atividade do setor.');
 }catch(error){alert(error.message||String(error));try{await loadUnifiedManualActions();renderActionsDashboard();const current=actionDashboardItems().find(r=>r.manualAction?.id===id);if(current)openUnifiedActionDetails(current);}catch(_){}}
 finally{window.removeEventListener('beforeunload',guard);button.disabled=false;}
}

function openUnifiedActionDetails(x){
  if(!x||!nucleoFeatureRequire('pdca','actions'))return;
  if(x.manualAction&&!unifiedActionCanSee(x.manualAction))return;
  const dialog=document.getElementById('actionDetailsDialog');
  const content=document.getElementById('actionDetailsContent');
  document.getElementById('actionDetailsTitle').textContent='Ação '+x.id;
  const fields=[
    ['Descrição',x.acao],['Observações',x.manualAction?.note],
    ['Projeto / R.O.',x.project],['Cliente / assunto',x.subject],
    ['Origem',x.sourceLabel],['Tipo',x.type],['Responsáveis pela execução',x.responsavel],['Para ciência',x.manualAction?unifiedSharedNames(x.manualAction,'aware'):''],['Sua participação',x.participantRole],['Setor',x.setor],
    ['Urgência',unifiedActionUrgencyLabel(x.urgency)],['Status',x.status.label],
    ['Prazo',x.prazo],['Situação do prazo',x.deadline.text],['Próximo passo',x.nextStep],
    ['Progresso',x.manualAction?x.progress+'%':''],['Falta',x.remaining],
    ['Data de criação',unifiedActionDateTimeLabel(x.createdAt)],
    ['Última atualização',unifiedActionDateTimeLabel(x.updatedAt)],
    ['Impacto no 5S',x.source==='pdca'?(x.impacta5S?'Impacta 5S':'Sem impacto no 5S'):''],
    ['Evidência',x.manualAction?.evidence||x.actionRecord?.evidenceNote]
  ];
  content.innerHTML='<dl class="action-details-fields">'+fields
    .filter(([,value])=>String(value??'').trim()&&!['-','—'].includes(value))
    .map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(value)+'</dd></div>').join('')
    +'<div><dt>Dependências</dt><dd>'+(x.manualAction?unifiedActionDependencyDetails(x.manualAction):escapeHtml(x.dependency||'—'))
    +'</dd></div></dl><div class="unified-action-buttons">'+unifiedActionRowButtons(x)+'</div>';
  content.querySelectorAll('.unified-action-buttons button').forEach(button=>{
    button.addEventListener('click',()=>dialog.close(),{capture:true});
  });
  content.querySelectorAll('[data-dependency-complete]').forEach(button=>{
    button.onclick=async()=>{
      const id=button.dataset.dependencyComplete;
      dialog.close();
      await window.completeUnifiedManualAction(id);
      const current=actionDashboardItems().find(row=>row.manualAction?.id===x.manualAction?.id);
      if(current)openUnifiedActionDetails(current);
    };
  });
  const action=x.manualAction;
  if(action&&!action.dependencySector&&unifiedExistingDependencyParts(action,getUnifiedManualActions()).some(part=>String(part.description||'').trim())
    &&unifiedSharedCanEdit(action)){
    const distribute=document.createElement('button');
    distribute.type='button';
    distribute.className='btn secondary';
    distribute.textContent='Salvar execução e ciência';
    const editor=document.createElement('div');
    editor.id='dependencyPeopleEditor';
    editor.innerHTML=unifiedExistingPeopleEditor(action);
    content.querySelector('.unified-action-buttons').before(editor);
    distribute.onclick=()=>distributeExistingActionParts(action.id,distribute);
    content.querySelector('.unified-action-buttons').append(distribute);
  }
  if(!dialog.open)dialog.showModal();
}

function showActionsDashboard(){
  if(!nucleoFeatureRequire('pdca','actions'))return;
  view('actionsDashboardView');
  setNav('actions');

  try{
    populateActionsSectorFilter();
    const scope=document.getElementById('actionsScopeLabel');
    if(scope){
      scope.textContent=isAdmin()
        ?'SGQ · todas as ações'
        :isManager()
          ?'Gestor · minhas + liderados'
          :'Minhas ações';
    }
    renderActionsDashboard();
  }catch(err){
    console.error('Erro ao carregar Ações:',err);
    const body=document.getElementById('actionsDashboardBody');
    if(body)body.innerHTML='<tr><td colspan="5" style="padding:24px;text-align:center;color:#667085">Não foi possível carregar as ações nesta visualização.</td></tr>';
  }
}

// Compatibilidade: a antiga tela "Ações pendentes" agora abre a área unificada.

function unifiedActionRoChoices(){
  return getAllRoRecords().filter(ro=>nucleoManagerScopeAllows(ro)).map(ro=>({
    number:String(ro.numero||ro.id||ro.codigo||'').split('::')[0],
    unit:explicitRecordUnit(ro),origin:ro.origemBase||ro.raw?.__origemBase||'',client:ro.cliente||''
  })).filter(ro=>/^RO-(IN|EX)-\d+$/i.test(ro.number));
}
function populateUnifiedActionRos(){
 const list=document.getElementById('unifiedActionRoOptions');if(!list)return;
 const seen=new Set();list.innerHTML=unifiedActionRoChoices().filter(r=>{const key=r.number+'|'+r.unit;if(seen.has(key))return false;seen.add(key);return true;}).map(r=>'<option value="'+escapeHtml(r.number)+'">'+escapeHtml([r.origin,r.client,canonicalUnitName(r.unit)].filter(Boolean).join(' · '))+'</option>').join('');
}
function resolveUnifiedActionRo(){
 const value=String(document.getElementById('unifiedActionRo')?.value||'').trim();if(!value)return undefined;
 const choices=unifiedActionRoChoices();let matches=choices.filter(r=>r.number.toUpperCase()===value.toUpperCase());
 if(!matches.length&&/^\d+$/.test(value))matches=choices.filter(r=>Number(r.number.match(/\d+$/)[0])===Number(value));
 const unique=[...new Map(matches.map(r=>[r.number+'|'+r.unit,r])).values()];
 if(unique.length!==1){alert(unique.length?'Há R.O.s internas/externas com esse número. Selecione o código completo da lista.':'Selecione uma R.O. disponível na lista ou deixe o vínculo vazio.');return null;}
 document.getElementById('unifiedActionRo').value=unique[0].number;return unique[0];
}
for(const name of ['saveUnifiedAction','saveUnifiedActionUpdate','completeUnifiedManualAction','deleteUnifiedManualAction']){
 const original=window[name];let busy=false;
 window[name]=async function(...args){if(busy)return;busy=true;const guard=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);try{return await withNucleoLoading('Aguarde a confirmação da base central…',()=>original(...args),'Ações');}catch(e){alert(e.message||'A base não confirmou a operação.');}finally{window.removeEventListener('beforeunload',guard);busy=false;}};
}
const unifiedOriginalShowActions=showActionsDashboard;
showActionsDashboard=async function(){
 if(!nucleoFeatureRequire('pdca','actions'))return;
 unifiedOriginalShowActions();
 try{await loadUnifiedManualActions();populateActionsSectorFilter();renderActionsDashboard();}
 catch(e){alert('Não foi possível atualizar as ações atribuídas: '+e.message);}
};

// A mesma ação tem uma lista de executores e uma lista de ciência, não cópias por pessoa.
let unifiedNewSharedSelection=new Map();
const unifiedSharedKey=v=>String(v||'').trim().toLowerCase();
function unifiedSharedExecutors(a){return Array.isArray(a?.executorKeys)?a.executorKeys.map(unifiedSharedKey):[unifiedSharedKey(a?.assigneeKey)].filter(Boolean);}
function unifiedSharedObservers(a){return Array.isArray(a?.awarenessKeys)?a.awarenessKeys.map(unifiedSharedKey):[];}
function unifiedSharedCanEdit(a){return !!a&&(nucleoPersonPermissions(getSession()).sgq===true||unifiedSharedKey(a.createdByKey)===unifiedCurrentUserKey());}
function unifiedSharedNames(a,role){
 if(!a)return '';
 const people=role==='aware'?a.awareness:a.executors,keys=role==='aware'?unifiedSharedObservers(a):unifiedSharedExecutors(a);
 return keys.map(key=>(people||[]).find(p=>p.key===key)?.name||(key===a.assigneeKey?a.assigneeName:'')||unifiedActionUserDisplay(key)).join(' · ');
}
function unifiedSharedAccessUnits(u){
 if(!u)return [];
 if(Array.isArray(u.accessUnits))return u.accessUnits.map(explicitPortalUnit).filter(Boolean);
 if(nucleoPersonPermissions(u).sgq===true)return ['matriz','filial'];
 return [...new Set([explicitPortalUnit(u.unit),...(u.sectorMemberships||[]).map(m=>explicitPortalUnit(m.unit))].filter(Boolean))];
}
function unifiedSharedEligibleUsers(unit){
 const s=getSession(),sgq=nucleoPersonPermissions(s).sgq===true;
 const users=sgq?getOperationalUsers().filter(unifiedActionIsActiveUser):isManager()?unifiedActionAssignableUsers():[];
 const me=unifiedCurrentUserKey(),map=new Map();
 for(const u of [...users,s]){if(!u)continue;const key=unifiedActionUserKey(u);if(key&&unifiedSharedAccessUnits(u).includes(unit))map.set(key,u);}
 return [...map.values()].sort((a,b)=>String(a.name||a.email).localeCompare(String(b.name||b.email),'pt-BR'));
}
function unifiedReadSharedPeople(host){
 const map=new Map();if(host)host.querySelectorAll('[data-shared-role]').forEach(el=>{if(el.value)map.set(el.dataset.sharedRole,el.value);});
 return map;
}
function unifiedSharedPeoplePanel(host,unit,selected,dependencySector=''){
 if(!host)return;
 host.replaceChildren();
 const title=document.createElement('h4');title.textContent='Participantes da ação';host.append(title);
 const info=document.createElement('p');info.className='small';info.textContent='Selecione quem executa e quem precisa apenas ter ciência. Uma única ação será exibida para todos.';host.append(info);
 const search=document.createElement('input');search.placeholder='Buscar pessoa ou setor';search.type='search';host.append(search);
 const list=document.createElement('div');list.style.cssText='max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:8px;margin-top:8px;padding:6px';host.append(list);
 for(const user of unifiedSharedEligibleUsers(unit)){
  const key=unifiedActionUserKey(user),row=document.createElement('label');row.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) minmax(125px,180px);gap:10px;align-items:center;padding:7px;border-bottom:1px solid var(--line)';
  const name=document.createElement('span');name.textContent=(user.name||user.email)+(user.sector?' · '+user.sector:'');row.append(name);
  const choice=document.createElement('select');choice.dataset.sharedRole=key;
  for(const [value,label] of [['','Não participa'],['execute','Executa'],['aware','Para ciência']]){const o=document.createElement('option');o.value=value;o.textContent=label;if(value==='execute'&&dependencySector&&!userHasUnitSector(user,unit,dependencySector))o.disabled=true;choice.append(o);}
  choice.value=selected.get(key)||'';if(choice.selectedOptions[0]?.disabled)choice.value='';
  row.append(choice);list.append(row);
 }
 search.oninput=()=>{for(const row of list.children)row.style.display=normalizeAnswer(row.firstElementChild?.textContent||'').includes(normalizeAnswer(search.value))?'grid':'none';};
 if(!list.children.length){const empty=document.createElement('p');empty.textContent='Nenhuma pessoa disponível nesta unidade.';list.append(empty);}
}
function unifiedRenderCreationPeople(){
 const host=document.getElementById('unifiedActionSharedPeople');if(!host)return;
 if(host.querySelector('[data-shared-role]'))unifiedNewSharedSelection=unifiedReadSharedPeople(host);
 unifiedSharedPeoplePanel(host,unifiedActionDependencyUnit(),unifiedNewSharedSelection);
}
document.addEventListener('change',e=>{if(e.target.id==='unifiedActionRo'&&document.getElementById('unifiedActionOverlay')?.classList.contains('open'))unifiedRenderCreationPeople();});
async function openUnifiedActionEdit(id){
 let a=getUnifiedManualActions().find(x=>x.id===id);
 if(!a||!unifiedSharedCanEdit(a))return;
 const dlg=document.createElement('dialog');dlg.style.cssText='width:min(760px,96vw);max-height:90vh;border:1px solid var(--line);border-radius:12px;padding:20px;overflow:auto';
 const form=document.createElement('form');form.style.cssText='display:grid;gap:12px';dlg.append(form);
 const title=document.createElement('h3');title.textContent='Editar ação '+(a.actionCode||a.id);form.append(title);
 const hint=document.createElement('p');hint.className='small';hint.textContent='O código, o histórico, o vínculo com a R.O. e a unidade serão preservados.';form.append(hint);
 const fields={};
 const add=(k,label,multiline=false,type='text')=>{const node=document.createElement('label'),txt=document.createElement('span');txt.textContent=label;node.append(txt);const el=document.createElement(multiline?'textarea':'input');if(!multiline)el.type=type;else el.rows=3;el.value=a[k]||'';el.style.width='100%';node.append(el);form.append(node);fields[k]=el;};
 add('action','Descrição da ação',true);add('deadline','Prazo',false,'date');add('type','Tipo');add('project','Projeto / referência');add('subject','Cliente / assunto');add('note','Observações',true);add('nextStep','Próximo passo',true);add('remaining','O que falta');
 const urg=document.createElement('label');urg.textContent='Urgência';const select=document.createElement('select');for(const [value,label] of [['baixa','Baixa'],['media','Média'],['alta','Alta']]){const op=document.createElement('option');op.value=value;op.textContent=label;select.append(op);}select.value=a.urgency||'media';urg.append(select);form.append(urg);fields.urgency=select;
 const host=document.createElement('div');form.append(host);
 const initial=new Map([...unifiedSharedObservers(a).map(k=>[k,'aware']),...unifiedSharedExecutors(a).map(k=>[k,'execute'])]);
 unifiedSharedPeoplePanel(host,explicitPortalUnit(a.roUnit||a.unit),initial,a.dependencySector||'');
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:10px;justify-content:flex-end';const close=document.createElement('button');close.type='button';close.className='btn secondary';close.textContent='Cancelar';close.onclick=()=>dlg.close();const save=document.createElement('button');save.className='btn primary';save.type='submit';save.textContent='Salvar alterações';buttons.append(close,save);form.append(buttons);
 dlg.addEventListener('close',()=>dlg.remove());dlg.addEventListener('cancel',e=>{if(save.disabled)e.preventDefault();});
 form.onsubmit=async e=>{
  e.preventDefault();if(save.disabled)return;
  const choices=unifiedReadSharedPeople(host),executorKeys=[...choices].filter(([,v])=>v==='execute').map(([k])=>k),awarenessKeys=[...choices].filter(([,v])=>v==='aware').map(([k])=>k);
  if(!fields.action.value.trim()||!executorKeys.length){alert('Informe a ação e selecione pelo menos um executor.');return;}
  const changes=Object.fromEntries(Object.entries(fields).map(([k,el])=>[k,el.value.trim()]));
  const now=new Date().toISOString(),s=getSession(),updated={...a,...changes,sharedAction:true,executorKeys,awarenessKeys,assigneeKey:executorKeys[0],assigneeName:unifiedActionUserDisplay(executorKeys[0]),history:[...(a.history||[]),{id:'UPD-'+Date.now(),at:now,byKey:unifiedCurrentUserKey(),byName:s.name||s.email,text:'Ação editada: dados e participantes atualizados.',progress:Number(a.progress)||0,remaining:changes.remaining,nextStep:changes.nextStep}]};
  save.disabled=close.disabled=true;
  const guard=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);
  try{
   await withNucleoLoading('Salvando alterações da ação…',async()=>{const list=getUnifiedManualActions();const current=list.find(r=>r.id===a.id);if(!current||String(current.updatedAt||current.createdAt)!==String(a.updatedAt||a.createdAt))throw new Error('A ação foi atualizada em outro dispositivo. Feche e reabra para editar.');await saveUnifiedManualActions(list.map(r=>r.id===a.id?updated:r));},'Ações');
   dlg.close();renderActionsDashboard();refreshUserPendingActionAlert();alert('Ação atualizada na base central.');
  }catch(error){alert(error.message||String(error));}
  finally{window.removeEventListener('beforeunload',guard);save.disabled=close.disabled=false;}
 };
 document.body.append(dlg);dlg.showModal();
}
