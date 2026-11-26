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
  function historyRecord(event, details){
    const id=String(event.recordId||'');
    const code=[details.actionCode,details.code,id].map(value=>String(value||'').trim())
      .find(value=>/^(?:(?:RO-(?:IN|EX)|ACT|PDCA|SAC|CDT|DP|DOC|SD|RNC)-?\d+(?:-[A-Z]?\d+)*|R\.?O\.?\s*\d+)$/i.test(value));
    if(code)return code;
    const ro=id.match(/(?:^|\b)RO-(?:IN|EX)-\d+/i);
    if(ro)return ro[0];
    if(/^ACT-DEP-/i.test(id))return 'Dependência de ação';
    if(event.action==='nucleo_test_manual_actions')return 'Ação';
    if(event.action==='Cadastro de documento padrão')return details.name||'Documento padrão';
    if(event.action==='Configuração de integração')return 'Integração';
    return details.title||'—';
  }

  function historySummary(event, details){
    const mode=details.mode;
    const status=details.status;
    if(status==='Falha')return 'Operação não concluída.';
    const sector=details.sector ? ' ('+details.sector+')' : '';
    switch(event.action){
      case 'nucleo_test_manual_actions': {
        const previous=details.anterior;
        if(mode==='delete')return /^ACT-DEP-/i.test(event.recordId) ? 'Dependência excluída.' : 'Ação excluída.';
        if(mode==='dependency_roles')return 'Responsáveis e pessoas em ciência atualizados'+sector+'.';
        if(mode==='save'){
          if(!previous)return 'Ação cadastrada'+sector+'.';
          const changes=[];
          if(details.descricao!==undefined&&details.descricao!==previous.descricao)changes.push('descrição');
          if(details.prazo!==undefined&&details.prazo!==previous.prazo)changes.push('prazo');
          if(details.progress!==undefined&&details.progress!==previous.progresso)changes.push('progresso');
          if(changes.length)return 'Alteração em '+changes.join(', ')+sector+'.';
          return 'Ação atualizada'+sector+'.';
        }
        break;
      }
      case 'nucleo_test_save_triage': {
        const decisions=Array.isArray(details.decision)?details.decision:[];
        const sectors=[...new Set(decisions.map(item=>item.sector).filter(Boolean))];
        if(sectors.length)return 'R.O. direcionada para '+sectors.join(', ')+'.';
        const outcomes={record:'R.O. mantida como registro.',cancelled:'R.O. cancelada.',obsolete:'R.O. marcada como obsoleta.'};
        return outcomes[decisions[0]?.decision]||'Triagem registrada.';
      }
      case 'nucleo_test_ro_investigation':
        if(mode==='industrialization')return details.industrialization?'R.O. marcada como industrialização.':'Marcação de industrialização removida.';
        if(mode==='add')return details.foto?'Complemento com foto adicionado.':'Complemento de investigação adicionado.';
        if(mode==='edit')return 'Complemento de investigação editado.';
        if(mode==='delete')return 'Complemento de investigação excluído.';
        break;
      case 'nucleo_test_email':
        return 'Envio de teste confirmado.';
      case 'Correção de tipo':
        return details.novo?'Tipo da R.O. alterado para '+details.novo+'.':'Tipo da R.O. corrigido.';
      case 'Cadastro de documento padrão':
        return 'Documento padrão cadastrado.';
      case 'Configuração de integração':
        return 'Configuração de integração atualizada.';
    }
    if(details.title&&status&&status!=='Confirmado')return details.title+' · '+status;
    return status==='Confirmado'?'Operação confirmada.':'Operação registrada.';
  }

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
        const details=e.details||{};
        [formatDateTimeBR(e.at),e.actor||e.email,names[e.action]||e.action,historyRecord(e,details),historySummary(e,details)].forEach(value=>row.insertCell().textContent=value||'—');
      }
      next=response.next;
      button.hidden=next==null;button.onclick=()=>window.nucleoRenderOperationHistory(true);
      status.textContent=body.rows.length?body.rows.length+' operação(ões) carregada(s).':'Nenhuma operação registrada neste dia.';
    }catch(error){if(seq===request)status.textContent=error.message||String(error);}
  };
})();
