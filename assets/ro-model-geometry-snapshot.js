(function(){
'use strict';

const SNAPSHOT_PREFIX='ro_model_geometry:';

function captureGeometry(){
  const paper=document.getElementById('umPaper');
  if(!paper)return null;
  const pr=paper.getBoundingClientRect();
  if(!pr.width||!pr.height)return null;

  const regions={};
  ['header','body','footer'].forEach(region=>{
    const host=paper.querySelector(`[data-region-preview="${region}"]`);
    if(!host)return;
    const cells=[];
    host.querySelectorAll('[data-univ-cell]').forEach(el=>{
      const id=String(el.dataset.univCell||'').trim();
      if(!id)return;
      const r=el.getBoundingClientRect();
      cells.push({
        id,
        x:+((r.left-pr.left)/pr.width).toFixed(8),
        y:+((r.top-pr.top)/pr.height).toFixed(8),
        w:+(r.width/pr.width).toFixed(8),
        h:+(r.height/pr.height).toFixed(8)
      });
    });
    const hr=host.getBoundingClientRect();
    regions[region]={
      x:+((hr.left-pr.left)/pr.width).toFixed(8),
      y:+((hr.top-pr.top)/pr.height).toFixed(8),
      w:+(hr.width/pr.width).toFixed(8),
      h:+(hr.height/pr.height).toFixed(8),
      cells
    };
  });

  return {
    version:2,
    capturedAt:new Date().toISOString(),
    pageAspect:+(pr.width/pr.height).toFixed(8),
    regions
  };
}

async function persistGeometry(unit,snapshot){
  if(!snapshot)return false;
  const id=SNAPSHOT_PREFIX+String(unit||'matriz');
  const record={
    id,
    key:id,
    unit:String(unit||'matriz'),
    snapshot,
    updatedAt:new Date().toISOString(),
    updatedBy:(typeof getSession==='function'&&getSession()?.name)||'SGQ'
  };

  if(typeof portalBackendSaveConfirmedPost==='function'){
    await portalBackendSaveConfirmedPost('shared_state',id,record,120000);
    return true;
  }
  if(typeof portalJsonp==='function'){
    const result=await portalJsonp({
      acao:'portal_save',
      colecao:'shared_state',
      id,
      dados:JSON.stringify(record),
      ator:record.updatedBy
    },120000);
    if(result?.sucesso===false)throw new Error(result.erro||'Não foi possível salvar a geometria do modelo.');
    return true;
  }
  throw new Error('Persistência central indisponível para salvar a geometria do modelo.');
}

function install(){
  const current=window.nucleoAdminDriveMutation;
  if(typeof current!=='function')return;
  if(current.__roGeometryWrapped)return;

  const original=current;
  async function wrapped(action,params){
    const isRoSave=
      action==='nucleo_drive_process_formats' &&
      String(params?.kind||'')==='ro' &&
      !!params?.data;

    let snapshot=null;
    if(isRoSave){
      snapshot=captureGeometry();
    }

    const result=await original.apply(this,arguments);

    if(isRoSave&&snapshot){
      await persistGeometry(params.unit||'matriz',snapshot);
      try{
        if(result&&typeof result==='object'){
          result.geometrySnapshotSaved=true;
          result.geometrySnapshotCapturedAt=snapshot.capturedAt;
        }
      }catch(_){}
    }
    return result;
  }
  wrapped.__roGeometryWrapped=true;
  wrapped.__roGeometryOriginal=original;
  window.nucleoAdminDriveMutation=wrapped;
}

window.nucleoCaptureRoGeometrySnapshot=captureGeometry;
window.nucleoInstallRoGeometrySnapshot=install;

setInterval(install,1500);
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',install,{once:true});
}else{
  install();
}
})();
