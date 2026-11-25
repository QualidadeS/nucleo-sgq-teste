(function(){
  const original=window.openTriageRecord;
  window.openTriageRecord=function(id,...args){
    const result=original.call(this,id,...args);
    const host=document.getElementById('triageTypeCorrection');
    if(!host)return result;
    host.replaceChildren();
    const ro=findRoByAnyNumber(String(id||'').split('::')[0]);
    if(!ro||!['admin','quality'].includes(getSession()?.role)||!nucleoPersonFeatureCan('ros','triage'))return result;
    const origin=ro.origemBase||roOriginFromNumber(ro.numero,'');
    const hint=document.createElement('span');hint.className='small';
    hint.textContent='Tipo atual: '+origin+(ro.raw?.__numeroOrigem?' · Origem: '+ro.raw.__numeroOrigem:'');
    const button=document.createElement('button');button.type='button';button.className='btn secondary';button.textContent='Corrigir tipo da R.O.';
    button.onclick=async()=>{
      const target=origin==='Interna'?'Externa':'Interna';
      const reason=prompt('Justificativa para corrigir '+ro.numero+' para '+target+':');
      if(reason===null||!reason.trim())return;
      if(button.disabled)return;
      button.disabled=true;
      const warn=event=>{event.preventDefault();event.returnValue='';};
      window.addEventListener('beforeunload',warn);
      try{
        await withNucleoLoading('Corrigindo tipo da R.O....',async()=>{
          if(!nucleoCentralDataConfirmed()){
            const ok=await nucleoRunFullSync({source:'manual'});
            if(!ok||!nucleoCentralDataConfirmed())throw new Error('A base ainda não confirmou a sincronização.');
          }
          const response=await portalJsonp({acao:'nucleo_test_correct_type',ro:ro.numero,targetOrigin:target,reason:reason.trim()},90000);
          if(!response?.sucesso)throw new Error(response?.erro||'Correção não confirmada.');
          const synced=await syncNow();
          closeTriageModal();
          populateTriageUnits();renderTriage();
          alert('Tipo corrigido. Código: '+response.ro+(synced?'':' · Sincronização das listas pendente.'));
        },'Processando');
      }catch(error){alert(error.message||String(error));}
      finally{button.disabled=false;window.removeEventListener('beforeunload',warn);}
    };
    host.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0';
    host.append(hint,button);
    return result;
  };
  let request=0,next=null;
  window.nucleoRenderOperationHistory=async function(more=false){
    if(!nucleoSistemaPodeAbrir())return;
    const day=document.getElementById('nucleoOperationHistoryDay'),body=document.getElementById('nucleoOperationHistoryRows');
    const status=document.getElementById('nucleoOperationHistoryStatus'),button=document.getElementById('nucleoOperationHistoryMore');
    if(!day.value){const pieces=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));day.value=pieces.year+'-'+pieces.month+'-'+pieces.day;}
    const token=getSession()?.authToken,seq=++request;
    if(!more){body.replaceChildren();next=null;}
    button.hidden=true;status.textContent='Consultando operações...';
    try{
      const response=await portalJsonp({acao:'nucleo_test_system_history',day:day.value,offset:more?next||0:0},60000);
      if(seq!==request||token!==getSession()?.authToken)return;
      if(!response?.sucesso)throw new Error(response?.erro||'Histórico indisponível.');
      const names={nucleo_test_save_triage:'Triagem',nucleo_test_manual_actions:'Ações',nucleo_test_ro_investigation:'Investigação / industrialização',nucleo_test_email:'E-mail de teste'};
      for(const e of response.events||[]){
        const row=body.insertRow();
        [formatDateTimeBR(e.at),e.actor||e.email,names[e.action]||e.action,e.recordId,JSON.stringify(e.details||{},null,2)].forEach(v=>row.insertCell().textContent=v||'—');
      }
      next=response.next;
      button.hidden=next==null;button.onclick=()=>window.nucleoRenderOperationHistory(true);
      status.textContent=body.rows.length?body.rows.length+' operação(ões) carregada(s).':'Nenhuma operação registrada neste dia.';
    }catch(error){if(seq===request)status.textContent=error.message||String(error);}
  };
})();
