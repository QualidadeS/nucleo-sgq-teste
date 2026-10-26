(function(){
'use strict';

let lastDriveModel=null;

async function checkStatus(original,unit){
  return await original('nucleo_drive_ro_template_status',{unit});
}

async function syncModel(original,unit){
  return await original('nucleo_drive_ro_template_sync',{
    unit,
    eventoId:'RO-MODEL-SYNC-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)
  });
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
      let info=lastDriveModel;
      if(!info?.exists&&typeof window.nucleoAdminDriveMutation==='function'){
        info=await window.nucleoAdminDriveMutation('nucleo_drive_ro_template_status',{unit});
      }
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
  if(current.__roDriveVerified)return;

  const original=current;

  async function wrapped(action,params){
    const isRoSave=
      action==='nucleo_drive_process_formats' &&
      String(params?.kind||'')==='ro' &&
      !!params?.data;

    const result=await original.apply(this,arguments);

    if(isRoSave){
      const unit=String(params?.unit||'matriz');

      let driveId=String(result?.formats?.ro?.driveTemplateId||'').trim();
      let info=null;

      // Mesmo que o salvamento principal não tenha trazido o ID,
      // força uma sincronização explícita do Slides oficial.
      if(!driveId){
        await syncModel(original,unit);
      }

      info=await checkStatus(original,unit);

      if(!info?.exists||!info?.driveTemplateId){
        throw new Error(
          'O modelo foi salvo na base central, mas o Google Slides oficial não foi criado no Drive.'
        );
      }

      lastDriveModel=info;

      try{
        if(result?.formats?.ro){
          result.formats.ro.driveTemplateId=info.driveTemplateId;
          result.formats.ro.driveTemplateUrl=info.driveTemplateUrl;
          result.formats.ro.driveTemplateVerified=true;
        }
      }catch(_){}

      setTimeout(()=>{
        addButton();
        const btn=document.getElementById('umOpenDriveModel');
        if(btn){
          btn.style.display='';
          btn.textContent='Abrir modelo no Drive ✓';
        }
        const status=document.getElementById('umStatus');
        if(status){
          status.textContent='Modelo salvo, Slides oficial criado e confirmado no Drive.';
        }
      },0);
    }

    return result;
  }

  wrapped.__roDriveVerified=true;
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