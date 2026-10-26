(function(){
'use strict';

let lastDriveModel=null;
let pollToken=0;

function feedback(message,type='info'){
  const status=document.getElementById('umStatus');
  if(status)status.textContent=message;

  const box=document.getElementById('umStandardFeedback');
  if(box){
    box.style.display='';
    box.textContent=message;
    box.style.background=type==='error'?'#fef2f2':type==='success'?'#ecfdf3':'#eff6ff';
    box.style.color=type==='error'?'#b42318':type==='success'?'#067647':'#1d4ed8';
  }
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

  btn.onclick=()=>{
    if(!lastDriveModel?.driveTemplateUrl){
      alert('O modelo oficial ainda não foi confirmado no Drive.');
      return;
    }
    window.open(lastDriveModel.driveTemplateUrl,'_blank','noopener');
  };

  save.parentElement?.insertBefore(btn,save);
}

function confirmed(info){
  lastDriveModel=info;
  addButton();

  const btn=document.getElementById('umOpenDriveModel');
  if(btn){
    btn.style.display='';
    btn.textContent='Abrir modelo no Drive ✓';
  }

  feedback('✓ Modelo salvo e Slides oficial confirmado no Drive.','success');
}

async function pollDrive(unit,requestedAt){
  const token=++pollToken;
  const until=Date.now()+180000;

  while(token===pollToken && Date.now()<until){
    await new Promise(r=>setTimeout(r,3000));

    let r;
    try{
      r=await portalJsonp({
        acao:'nucleo_drive_process_formats',
        unit
      },30000);
    }catch(_){
      continue;
    }

    const ro=r?.formats?.ro||{};

    if(ro.driveTemplateSyncError){
      feedback('Modelo salvo, mas o Slides oficial não pôde ser atualizado: '+ro.driveTemplateSyncError,'error');
      return;
    }

    const finished=Date.parse(ro.driveTemplateSyncFinishedAt||ro.driveTemplateUpdatedAt||'')||0;
    const requested=Date.parse(requestedAt||'')||0;

    if(ro.driveTemplateId && ro.driveTemplateUrl && finished>=requested){
      confirmed(ro);
      return;
    }
  }

  feedback('Modelo salvo. A atualização do Slides oficial ainda está em processamento; você pode continuar usando o Núcleo.','info');
}

function install(){
  const current=window.nucleoAdminDriveMutation;
  if(typeof current!=='function')return;
  if(current.__roDriveQueuedSave)return;

  const original=current;

  async function wrapped(action,params){
    const isRoSave=
      action==='nucleo_drive_process_formats' &&
      String(params?.kind||'')==='ro' &&
      !!params?.data;

    const result=await original.apply(this,arguments);

    if(isRoSave){
      const ro=result?.formats?.ro||{};
      const revision=String(result?.roDriveSaveRevision||'');

      if(revision!=='v27-queued-sync'){
        feedback(
          'Modelo salvo, mas o Apps Script publicado não é a revisão esperada. Revisão recebida: '+
          (revision||'nenhuma')+'.',
          'error'
        );
        return result;
      }

      feedback('✓ Modelo salvo na base TESTE. Atualizando o Slides oficial no Drive…','info');
      pollDrive(String(params?.unit||'matriz'),ro.driveTemplateSyncRequestedAt||new Date().toISOString());
    }

    return result;
  }

  wrapped.__roDriveQueuedSave=true;
  wrapped.__roDriveOriginal=original;
  window.nucleoAdminDriveMutation=wrapped;
}

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