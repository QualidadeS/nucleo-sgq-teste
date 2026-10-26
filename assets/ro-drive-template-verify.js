(function(){
'use strict';

let lastDriveModel=null;

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

function showConfirmed(info){
  lastDriveModel=info;

  addButton();
  const btn=document.getElementById('umOpenDriveModel');
  if(btn){
    btn.style.display='';
    btn.textContent='Abrir modelo no Drive ✓';
  }

  const status=document.getElementById('umStatus');
  if(status)status.textContent='Modelo salvo e Slides oficial confirmado no Drive.';

  const feedback=document.getElementById('umStandardFeedback');
  if(feedback){
    feedback.style.display='';
    feedback.textContent='✓ Modelo salvo e Slides oficial confirmado no Drive.';
    feedback.style.background='#ecfdf3';
    feedback.style.color='#067647';
  }
}

function install(){
  const current=window.nucleoAdminDriveMutation;
  if(typeof current!=='function')return;
  if(current.__roDriveSingleSave)return;

  const original=current;

  async function wrapped(action,params){
    const isRoSave=
      action==='nucleo_drive_process_formats' &&
      String(params?.kind||'')==='ro' &&
      !!params?.data;

    const result=await original.apply(this,arguments);

    if(isRoSave){
      const revision=String(result?.roDriveSaveRevision||'');
      const nested=result?.formats?.ro||{};
      const info={
        ...nested,
        driveTemplateId:String(result?.driveTemplateId||nested.driveTemplateId||''),
        driveTemplateUrl:String(result?.driveTemplateUrl||nested.driveTemplateUrl||''),
        driveTemplateUpdatedAt:String(result?.driveTemplateUpdatedAt||nested.driveTemplateUpdatedAt||'')
      };

      if(revision!=='v24-single-save-confirm'){
        throw new Error(
          'O Apps Script publicado ainda não é a revisão esperada do modelo oficial. '+
          'Revisão recebida: '+(revision||'nenhuma')+'. Publique uma nova versão da implantação /exec.'
        );
      }

      if(!info.driveTemplateId||!info.driveTemplateUrl){
        throw new Error(
          result?.erro ||
          'A revisão correta do Apps Script foi executada, mas o retorno não trouxe o ID/link do Slides oficial.'
        );
      }

      showConfirmed(info);
    }

    return result;
  }

  wrapped.__roDriveSingleSave=true;
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