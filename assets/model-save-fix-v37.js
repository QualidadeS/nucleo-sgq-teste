(function(){
'use strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function sameModel(requested,saved){
 if(!requested||!saved)return false;
 for(const k of ['title','footer','fontSize','marginMm','showEvidence']){
  if(JSON.stringify(requested[k]??null)!==JSON.stringify(saved[k]??null))return false;
 }
 if(JSON.stringify(requested.universalLayout||null)!==JSON.stringify(saved.universalLayout||null))return false;
 if(JSON.stringify(requested.layoutGrid||null)!==JSON.stringify(saved.layoutGrid||null))return false;
 return true;
}
function ensureTopStatus(){
 const btn=document.getElementById('umSave');if(!btn)return null;
 let box=document.getElementById('umSaveTopStatus');if(box)return box;
 box=document.createElement('span');box.id='umSaveTopStatus';box.setAttribute('role','status');box.setAttribute('aria-live','polite');
 box.style.cssText='display:inline-flex;align-items:center;min-height:34px;max-width:430px;padding:6px 10px;border-radius:9px;font-size:12px;font-weight:700;background:#f2f4f7;color:#475467;border:1px solid #e4e7ec';
 btn.parentElement?.insertBefore(box,btn);box.textContent='Nenhuma alteração salva nesta sessão.';return box;
}
function setTopStatus(message,type='info'){
 const box=ensureTopStatus();if(!box)return;box.textContent=String(message||'');
 const styles={info:['#eff8ff','#175cd3','#b2ddff'],success:['#ecfdf3','#067647','#abefc6'],error:['#fef3f2','#b42318','#fecdca']};
 const [bg,fg,border]=styles[type]||styles.info;box.style.background=bg;box.style.color=fg;box.style.borderColor=border;
}
function mirrorEditorStatus(){
 const status=document.getElementById('umStatus');if(!status||status.__saveMirrorInstalled)return;status.__saveMirrorInstalled=true;
 const sync=()=>{const msg=String(status.textContent||'').trim();if(!msg)return;const low=msg.toLowerCase();const type=/erro|falh|não foi|nao foi|recus|indispon|não confirmou|nao confirmou/.test(low)?'error':/salvo|confirmado|conclu/.test(low)?'success':'info';setTopStatus(msg,type);};
 new MutationObserver(sync).observe(status,{childList:true,subtree:true,characterData:true});sync();
}
async function verifyCentralModel(params,result){
 const kind=String(params?.kind||'');if(!['ro','sac','pdca'].includes(kind)||!params?.data)return result;
 let requested=null;try{requested=JSON.parse(params.data)}catch(_){}if(!requested)return result;
 setTopStatus('Envio concluído. Confirmando o modelo na base TESTE…','info');
 let lastError='';
 for(let attempt=0;attempt<12;attempt++){
  try{
   const check=await portalJsonp({acao:'nucleo_drive_process_formats',unit:params.unit,kind},60000);
   if(check?.sucesso===false)lastError=check.erro||'A base recusou a releitura.';
   else{
    const saved=check?.formats?.[kind];
    if(saved&&sameModel(requested,saved)){
     setTopStatus('✓ Modelo salvo e confirmado na base TESTE.','success');
     return {...(result||{}),sucesso:true,formats:check.formats,documentFormatStandards:check.documentFormatStandards,__confirmedByV37:true};
    }
    lastError=saved?'A base ainda está devolvendo a versão anterior do modelo.':'O modelo não apareceu na releitura da base.';
   }
  }catch(e){lastError=String(e?.message||e)}
  await sleep(attempt<3?500:900);
 }
 throw new Error('O envio terminou, mas a base TESTE não confirmou a nova versão do modelo. '+(lastError||'Tente novamente.'));
}
function installMutationWrapper(){
 const current=window.nucleoAdminDriveMutation;if(typeof current!=='function')return false;if(current.__modelSaveV37)return true;
 const original=current;
 async function wrapped(action,params){
  const isModelSave=action==='nucleo_drive_process_formats'&&['ro','sac','pdca'].includes(String(params?.kind||''))&&!!params?.data;
  if(!isModelSave)return original(action,params);
  const btn=document.getElementById('umSave'),originalLabel=btn?.textContent||'Salvar modelo';
  try{
   if(btn){btn.disabled=true;btn.textContent='Salvando…';}
   setTopStatus('Enviando alterações para a base TESTE…','info');
   const result=await original(action,params);
   const confirmed=await verifyCentralModel(params,result);
   if(btn){btn.textContent='✓ Salvo';setTimeout(()=>{if(document.body.contains(btn)){btn.textContent=originalLabel;btn.disabled=false;}},2200)}
   return confirmed;
  }catch(e){
   const msg='Erro ao salvar: '+String(e?.message||e);setTopStatus(msg,'error');
   if(btn){btn.textContent='Erro ao salvar';setTimeout(()=>{if(document.body.contains(btn)){btn.textContent=originalLabel;btn.disabled=false;}},2600)}
   throw e;
  }finally{if(btn&&btn.textContent!=='✓ Salvo')btn.disabled=false;}
 }
 wrapped.__modelSaveV37=true;wrapped.__original=original;window.nucleoAdminDriveMutation=wrapped;return true;
}
function installEditorWatch(){
 const scan=()=>{installMutationWrapper();ensureTopStatus();mirrorEditorStatus();};
 const observer=new MutationObserver(scan);observer.observe(document.documentElement,{childList:true,subtree:true});scan();
 const timer=setInterval(()=>{scan();if(typeof window.nucleoAdminDriveMutation==='function'&&window.nucleoAdminDriveMutation.__modelSaveV37)clearInterval(timer);},250);
 setTimeout(()=>clearInterval(timer),30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installEditorWatch,{once:true});else installEditorWatch();
})();