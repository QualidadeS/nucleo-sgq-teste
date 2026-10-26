(function(){
'use strict';

let lastDriveModel=null;
let syncPromise=null;

function showDriveState(message,type='info'){
  const status=document.getElementById('umStatus');
  if(status)status.textContent=message;
  const feedback=document.getElementById('umStandardFeedback');
  if(feedback){
    feedback.style.display='';
    feedback.textContent=message;
    feedback.style.background=type==='error'?'#fef2f2':type==='success'?'#ecfdf3':'#eff6ff';
    feedback.style.color=type==='error'?'#b42318':type==='success'?'#067647':'#1d4ed8';
  }
}

async function driveStatus(unit){
  return await portalJsonp({acao:'nucleo_drive_process_formats',unit,kind:'ro',driveStatus:'1'},30000);
}

async function syncDriveOfficial(unit){
  if(syncPromise)return syncPromise;

  syncPromise=(async()=>{
    showDriveState('Modelo salvo na base TESTE. Criando/atualizando o Slides oficial em Modelos do Núcleo > Padrões…','info');

    try{
      const result=await portalJsonp({
        acao:'nucleo_drive_process_formats',
        unit,
        kind:'ro',
        driveSync:'1'
      },90000);

      if(!result?.sucesso||!result?.driveTemplateId){
        throw new Error(result?.erro||'O Apps Script não confirmou a criação do modelo oficial.');
      }

      const check=await driveStatus(unit);

      if(!check?.exists||!check?.driveTemplateId){
        throw new Error('O Slides foi criado, mas não foi confirmado no Drive.');
      }

      lastDriveModel=check;
      addButton();

      const btn=document.getElementById('umOpenDriveModel');
      if(btn){
        btn.style.display='';
        btn.textContent='Abrir modelo no Drive ✓';
      }

      showDriveState('Modelo salvo e Slides oficial confirmado em Modelos do Núcleo > Padrões.','success');
      return check;
    }catch(e){
      showDriveState('Modelo salvo na base TESTE, mas não foi possível criar o Slides oficial: '+(e?.message||e),'error');
      throw e;
    }finally{
      syncPromise=null;
    }
  })();

  return syncPromise;
}

function addButton(){
  const dialog=document.getElementById('universalModelEditor');
  if(!dialog||dialog.querySelector('#umOpenDriveModel'))return;

  const save=dialog.querySelector('#umSave');
  if(!save)return;

  const btn=document.createElement('button');
  btn.id='umOpenDriveModel';
  btn.type='button';
  btn.className='btn secondary';
  btn.textContent='Abrir modelo no Drive';
  btn.style.display='none';

  btn.onclick=async()=>{
    try{
      const unit=dialog.querySelector('#umUnit')?.value||'matriz';
      const info=lastDriveModel?.exists?lastDriveModel:await driveStatus(unit);

      if(!info?.exists||!info?.driveTemplateUrl){
        alert('O modelo oficial ainda não foi confirmado no Drive.');
        return;
      }

      window.open(info.driveTemplateUrl,'_blank','noopener');
    }catch(e){
      alert('Não foi possível abrir o modelo do Drive: '+(e?.message||e));
    }
  };

  save.parentElement?.insertBefore(btn,save);
}

function install(){
  const current=window.nucleoAdminDriveMutation;
  if(typeof current!=='function')return;
  if(current.__roDriveOfficialAsync)return;

  const original=current;

  async function wrapped(action,params){
    const isRoSave=
      action==='nucleo_drive_process_formats' &&
      String(params?.kind||'')==='ro' &&
      !!params?.data;

    const result=await original.apply(this,arguments);

    if(isRoSave){
      const unit=String(params?.unit||'matriz');

      // Não bloqueia mais o retorno do salvamento.
      setTimeout(()=>{
        syncDriveOfficial(unit).catch(()=>{});
      },0);
    }

    return result;
  }

  wrapped.__roDriveOfficialAsync=true;
  wrapped.__roDriveOriginal=original;
  window.nucleoAdminDriveMutation=wrapped;
}

window.nucleoInstallRoDriveVerification=install;

setInterval(()=>{
  install();
  addButton();
},1000);

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{
    install();
    addButton();
  },{once:true});
}else{
  install();
  addButton();
}
})();