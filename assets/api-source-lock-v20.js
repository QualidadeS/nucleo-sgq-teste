/* NÚCLEO | API EDITÁVEL v21
   A URL do Web App pode ser alterada pela Administração na tela de Integração.
   O valor salvo passa a ser a fonte ativa. nucleo-runtime-config.js permanece
   apenas como fallback inicial/recuperação.
*/
(function(){
  'use strict';

  const INTEGRATION_KEY='nucleo-integration-settings-v1';
  const ADMIN_KEY='ro-pdca-admin-config-v1';
  const RO_SYNC_KEY='ro-sync-settings';

  function normalizeUrl(url){
    return String(url||'').trim().replace(/\/+$/,'');
  }

  function validApiUrl(url){
    const value=normalizeUrl(url);
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value)?value:'';
  }

  function fallbackApiUrl(){
    return validApiUrl(window.NUCLEO_RUNTIME_CONFIG?.apiUrl||'');
  }

  function readObj(key){
    try{return JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(_){return {};}
  }

  function writeObj(key,obj){
    try{localStorage.setItem(key,JSON.stringify(obj||{}));}catch(_){}
  }

  function storedApiUrl(){
    const sources=[
      readObj(INTEGRATION_KEY)?.apiUrl,
      readObj(ADMIN_KEY)?.apiUrl,
      readObj(RO_SYNC_KEY)?.apiUrl
    ];
    for(const value of sources){
      const valid=validApiUrl(value);
      if(valid)return valid;
    }
    return '';
  }

  window.nucleoPersistedApiUrl=function(){
    return storedApiUrl();
  };

  window.portalApiBase=function(){
    return storedApiUrl() || fallbackApiUrl();
  };

  window.portalBackendEnabled=function(){
    return !!window.portalApiBase();
  };

  const originalGetSaved=window.getSavedIntegrationSettings;
  window.getSavedIntegrationSettings=function(){
    let previous={};
    try{
      previous=typeof originalGetSaved==='function'?(originalGetSaved()||{}):{};
    }catch(_){}
    return {
      ...previous,
      apiUrl:storedApiUrl() || fallbackApiUrl()
    };
  };


  function directJsonp(url, params={}, timeoutMs=25000){
    return new Promise((resolve,reject)=>{
      const base=validApiUrl(url);
      if(!base){reject(new Error('URL inválida.'));return;}

      const cb='nucleoApiTestV59_'+Date.now()+'_'+Math.floor(Math.random()*100000);
      const script=document.createElement('script');
      let done=false;
      let timer=null;

      function cleanup(){
        if(timer)clearTimeout(timer);
        try{delete window[cb];}catch(_){window[cb]=undefined;}
        try{script.remove();}catch(_){}
      }
      function finish(err,data){
        if(done)return;
        done=true;
        cleanup();
        err?reject(err):resolve(data);
      }

      window[cb]=(data)=>finish(null,data);

      const parts=[];
      Object.entries(params||{}).forEach(([k,v])=>{
        if(v!==undefined&&v!==null&&String(v)!==''){
          parts.push(encodeURIComponent(k)+'='+encodeURIComponent(String(v)));
        }
      });
      parts.push('callback='+encodeURIComponent(cb));
      parts.push('_='+Date.now());

      script.async=true;
      script.src=base+'?'+parts.join('&');
      script.onerror=()=>finish(new Error('A URL /exec abriu, mas não devolveu JSONP utilizável ao Núcleo.'));
      timer=setTimeout(()=>finish(new Error('A API não respondeu dentro do tempo limite.')),timeoutMs);
      document.head.appendChild(script);
    });
  }

  async function probeApi(candidate){
    const url=validApiUrl(candidate);
    if(!url)throw new Error('Informe uma URL válida do Web App / API terminando em /exec.');

    // 1) Tenta a rota curta moderna.
    try{
      const data=await directJsonp(url,{acao:'portal_public_config',nucleoAction:'portal_public_config'},20000);
      if(data?.sucesso){
        return {url,result:data,probe:'portal_public_config'};
      }
    }catch(_){}

    // 2) Fallback compatível: testa o próprio /exec sem ação.
    // Backends antigos do Núcleo respondem com portal_load nesse caso.
    const root=await directJsonp(url,{},30000);
    if(root?.sucesso && (
      root?.config ||
      Array.isArray(root?.dados) ||
      Number.isFinite(Number(root?.quantidade))
    )){
      return {url,result:root,probe:'root'};
    }

    throw new Error('O Apps Script respondeu, mas a resposta não foi reconhecida como uma API do Núcleo.');
  }

  window.nucleoEnsureApiConfigured=async function(candidateUrl){
    const current=validApiUrl(candidateUrl || document.getElementById('apiUrl')?.value || window.portalApiBase());
    const checked=await probeApi(current);
    try{window.nucleoConfirmedApiUrl=current;}catch(_){}
    return checked;
  };

  window.saveIntegrationSettings=function(silent=false,forcedApiUrl){
    if(typeof window.requireIntegrationUnlock==='function'&&!window.requireIntegrationUnlock())return false;

    let current={};
    try{current=window.getSavedIntegrationSettings?.()||{};}catch(_){}

    const typed=forcedApiUrl!==undefined
      ? forcedApiUrl
      : document.getElementById('apiUrl')?.value;

    const apiUrl=validApiUrl(typed || current.apiUrl || fallbackApiUrl());
    if(!apiUrl){
      if(!silent)alert('Informe uma URL válida do Web App / API terminando em /exec.');
      return false;
    }

    const apiKey=String(document.getElementById('apiKey')?.value||current.apiKey||'').trim();
    const autoSync=document.getElementById('autoSync')?.value||current.autoSync||'0';
    const roSyncPeriod=document.getElementById('roSyncPeriod')?.value||current.roSyncPeriod||'all';
    const roSyncDateFrom=document.getElementById('roSyncDateFrom')?.value||current.roSyncDateFrom||'';
    const roSyncDateTo='';

    if(roSyncPeriod==='custom'&&!roSyncDateFrom){
      if(!silent)alert('Informe a data inicial da busca.');
      return false;
    }

    const sync={
      apiUrl,
      apiKey,
      autoSync,
      roSyncPeriod,
      roSyncDateFrom,
      roSyncDateTo,
      savedAt:new Date().toISOString()
    };

    writeObj(INTEGRATION_KEY,sync);
    writeObj(RO_SYNC_KEY,sync);

    const cfg=readObj(ADMIN_KEY);
    cfg.apiUrl=apiUrl;
    cfg.apiKey=apiKey;
    cfg.autoSync=autoSync;
    cfg.roSyncPeriod=roSyncPeriod;
    cfg.roSyncDateFrom=roSyncDateFrom;
    cfg.roSyncDateTo=roSyncDateTo;
    cfg.__savedAt=new Date().toLocaleString('pt-BR');
    writeObj(ADMIN_KEY,cfg);

    const input=document.getElementById('apiUrl');
    if(input)input.value=apiUrl;

    if(!silent)alert('Integração salva. A nova API já está ativa neste navegador.');
    return sync;
  };

  window.saveIntegrationSettingsConfirmed=async function(){
    if(typeof window.isAdmin==='function'&&!window.isAdmin()){
      alert('Configuração indisponível.');
      return false;
    }
    if(typeof window.requireIntegrationUnlock==='function'&&!window.requireIntegrationUnlock())return false;

    const input=document.getElementById('apiUrl');
    const candidate=validApiUrl(input?.value||'');
    const st=document.getElementById('configSavedState');

    if(!candidate){
      alert('Informe uma URL válida do Web App / API terminando em /exec.');
      return false;
    }

    try{
      await window.nucleoEnsureApiConfigured(candidate);
      const saved=window.saveIntegrationSettings(true,candidate);
      if(!saved)return false;

      if(st){
        st.classList.remove('hidden');
        st.textContent='API confirmada e integração salva.';
      }

      alert('API confirmada e salva. A nova URL já está ativa.');
      return true;
    }catch(e){
      if(st){
        st.classList.remove('hidden');
        st.textContent='Não foi possível confirmar a API informada.';
      }
      alert('Não foi possível confirmar a API: '+(e?.message||e));
      return false;
    }
  };


  window.testConnection=async function(){
    if(typeof window.requireIntegrationUnlock==='function'&&!window.requireIntegrationUnlock())return;
    if(typeof window.isAdmin==='function'&&!window.isAdmin()){
      alert('Configuração indisponível.');
      return;
    }

    const input=document.getElementById('apiUrl');
    const result=document.getElementById('testResult');
    const candidate=validApiUrl(input?.value||'');

    if(result){
      result.className='statusline';
      result.classList.remove('hidden');
    }

    if(!candidate){
      if(result)result.textContent='Informe uma URL /exec válida do Apps Script.';
      return;
    }

    if(result)result.textContent='Testando exatamente a URL digitada...';

    try{
      const checked=await probeApi(candidate);
      if(result){
        result.className='statusline okline';
        result.classList.remove('hidden');
        result.textContent=
          checked.probe==='portal_public_config'
            ? 'API conectada e confirmada pelo teste curto.'
            : 'API conectada. O /exec respondeu corretamente ao Núcleo.';
      }
      return true;
    }catch(err){
      if(result){
        result.className='statusline';
        result.classList.remove('hidden');
        result.textContent='Falha ao testar esta URL: '+(err?.message||err);
      }
      return false;
    }
  };

  function enableApiField(){
    const input=document.getElementById('apiUrl');
    if(!input)return;

    input.readOnly=false;
    input.removeAttribute('readonly');
    input.removeAttribute('aria-readonly');
    input.title='URL do Web App / API usada pelo Núcleo.';
    input.style.background='';

    // Só preenche automaticamente se o usuário não estiver editando.
    if(document.activeElement!==input){
      const current=storedApiUrl()||fallbackApiUrl();
      if(current && input.value!==current)input.value=current;
    }

    const parent=input.parentElement;
    const oldNote=parent?.querySelector('[data-nucleo-api-lock-note]');
    if(oldNote)oldNote.remove();
  }

  enableApiField();

  // A tela pode ser recriada dinamicamente; apenas garante que o campo continue editável.
  const observer=new MutationObserver(enableApiField);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  console.info('[NÚCLEO] API editável pela Administração ativa.');
})();

/* NÚCLEO | Diretório compartilhado Matriz/Filial V31
   Usa portal_pending_users, rota já consolidada, para evitar depender de uma
   ação nova do Apps Script. A triagem monta setor + pessoa por accessUnits.
*/
(function(){
  'use strict';
  if(window.__nucleoAccessUnitsTriageV31)return;
  window.__nucleoAccessUnitsTriageV31=true;

  const CACHE_KEY='nucleo-shared-directory-v31';
  const originalUsersBySector=window.usersBySector;
  const originalGetConfiguredSectors=window.getConfiguredSectors;
  const originalOpenTriageRecord=window.openTriageRecord;
  const originalShowTriage=window.showTriage;

  function norm(v){
    try{return typeof normalizeAnswer==='function'?normalizeAnswer(v):String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
    catch(_){return String(v||'').toLowerCase().trim();}
  }
  function normUnit(v){
    try{if(typeof normalizePortalUnit==='function'){const n=normalizePortalUnit(v);if(n)return n;}}catch(_){}
    const x=norm(v);
    if(/filial|linhares|seta es/.test(x))return 'filial';
    if(/todas|ambas/.test(x))return 'todas';
    if(/matriz|sao bento|seta sc/.test(x))return 'matriz';
    return '';
  }
  function userUnits(u){
    const raw=Array.isArray(u?.accessUnits)?u.accessUnits:[];
    const out=[];
    const add=v=>{const n=normUnit(v);if(n==='todas'){if(!out.includes('matriz'))out.push('matriz');if(!out.includes('filial'))out.push('filial');}else if(n&&!out.includes(n))out.push(n)};
    raw.forEach(add);
    if(!out.length)add(u?.unit||u?.unidade||'');
    return out;
  }
  function currentUnit(){
    const modal=normUnit(document.getElementById('triageRoUnit')?.value||'');
    if(modal&&modal!=='todas')return modal;
    try{
      const s=typeof getSession==='function'?(getSession()||{}):{};
      if(String(s.role||'').toLowerCase()==='quality')return 'filial';
      const u=normUnit(s.unit||'');
      if(u&&u!=='todas')return u;
    }catch(_){}
    return 'matriz';
  }
  function approved(u){
    const st=norm(u?.approvalStatus||'approved');
    const state=norm(u?.status||'');
    return !!String(u?.email||'').trim() && u?.active!==false &&
      !['pending','rejected','inactive','disabled','recusado','inativo'].includes(st) &&
      !['inactive','inativo'].includes(state);
  }
  function sectorsForUser(u,unit){
    const out=[];
    const add=v=>{v=String(v||'').trim();if(v&&!out.some(x=>norm(x)===norm(v)))out.push(v)};
    if(userUnits(u).includes(unit))add(u?.sector||u?.setor||'');
    (Array.isArray(u?.sectorMemberships)?u.sectorMemberships:[]).forEach(m=>{
      const mu=normUnit(m?.unit||'');
      if(mu===unit||mu==='todas')add(m?.sector||'');
    });
    return out;
  }
  function readCache(){
    try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')||null}catch(_){return null}
  }
  function writeCache(x){try{localStorage.setItem(CACHE_KEY,JSON.stringify(x||{}))}catch(_){} }
  function directory(unit){
    unit=normUnit(unit)||currentUnit();
    const live=window.__nucleoSharedDirectoryV31;
    if(live&&live.unit===unit)return live;
    const cached=readCache();
    if(cached&&cached.unit===unit)return cached;
    return {unit,users:[],sectors:[]};
  }
  function buildDirectory(allUsers,unit){
    const users=(Array.isArray(allUsers)?allUsers:[]).filter(approved).filter(u=>userUnits(u).includes(unit)||sectorsForUser(u,unit).length);
    const sectors=[];
    const add=v=>{v=String(v||'').trim();if(v&&!sectors.some(x=>norm(x)===norm(v)))sectors.push(v)};
    users.forEach(u=>sectorsForUser(u,unit).forEach(add));
    return {unit,users,sectors:sectors.sort((a,b)=>a.localeCompare(b,'pt-BR')),loadedAt:new Date().toISOString()};
  }
  function usersBySectorV31(sector){
    const unit=currentUnit(),key=norm(sector),dir=directory(unit);
    let users=(dir.users||[]).filter(u=>sectorsForUser(u,unit).some(s=>norm(s)===key));
    if(!users.length&&typeof originalUsersBySector==='function'){
      try{users=originalUsersBySector(sector)||[]}catch(_){}
    }
    const map=new Map();
    users.forEach(u=>{const k=String(u?.personId||u?.email||u?.name||'').trim().toLowerCase();if(k)map.set(k,u)});
    return [...map.values()].sort((a,b)=>String(a?.name||a?.email||'').localeCompare(String(b?.name||b?.email||''),'pt-BR'));
  }
  function getConfiguredSectorsV31(unit){
    const target=normUnit(unit)||currentUnit();
    const out=[];
    const add=v=>{v=String(v||'').trim();if(v&&!out.some(x=>norm(x)===norm(v)))out.push(v)};
    try{(typeof originalGetConfiguredSectors==='function'?(originalGetConfiguredSectors(unit)||[]):[]).forEach(add)}catch(_){}
    (directory(target).sectors||[]).forEach(add);
    return out.sort((a,b)=>a.localeCompare(b,'pt-BR'));
  }
  function refreshUi(unit){
    try{
      const picker=document.getElementById('triageSectorPicker');
      if(picker){
        const current=picker.value||'';
        const sectors=getConfiguredSectorsV31(unit);
        picker.innerHTML='<option value="">Selecione um setor...</option>'+sectors.map(sec=>'<option value="'+(typeof escapeHtml==='function'?escapeHtml(sec):sec)+'">'+(typeof escapeHtml==='function'?escapeHtml(sec):sec)+'</option>').join('');
        const match=sectors.find(s=>norm(s)===norm(current));if(match)picker.value=match;
      }
      if(typeof refreshTriageResponsibleUsers==='function')refreshTriageResponsibleUsers();
      if(typeof populateTriageSectors==='function')populateTriageSectors();
    }catch(e){console.warn('[NÚCLEO V31] atualizar triagem',e)}
  }
  let inflight=null;
  async function loadDirectory(force=false){
    const unit=currentUnit();
    if(!force){const cached=directory(unit);if((cached.users||[]).length){refreshUi(unit);return cached;}}
    if(inflight)return inflight;
    inflight=(async()=>{
      try{
        if(typeof portalJsonp!=='function')throw new Error('Conexão com a base central indisponível.');
        const res=await portalJsonp({acao:'portal_pending_users'},30000);
        if(!res?.sucesso)throw new Error(res?.erro||'Base de usuários não retornada.');
        const data=buildDirectory(res.users||[],unit);
        window.__nucleoSharedDirectoryV31=data;
        writeCache(data);
        refreshUi(unit);
        return data;
      }catch(e){
        console.error('[NÚCLEO V31] falha ao carregar usuários compartilhados',e);
        return directory(unit);
      }finally{inflight=null}
    })();
    return inflight;
  }

  window.usersBySector=usersBySectorV31;
  window.getConfiguredSectors=getConfiguredSectorsV31;
  window.nucleoLoadSharedDirectoryV31=loadDirectory;

  if(typeof originalOpenTriageRecord==='function'){
    window.openTriageRecord=function(){
      const result=originalOpenTriageRecord.apply(this,arguments);
      setTimeout(()=>loadDirectory(true),0);
      return result;
    };
  }
  if(typeof originalShowTriage==='function'){
    window.showTriage=function(){
      const result=originalShowTriage.apply(this,arguments);
      setTimeout(()=>loadDirectory(false),0);
      return result;
    };
  }
  document.addEventListener('change',ev=>{if(ev.target&&ev.target.id==='triageRoUnit')loadDirectory(true)},true);
  setTimeout(()=>loadDirectory(false),300);
  window.addEventListener('load',()=>setTimeout(()=>loadDirectory(false),0),{once:true});
  console.info('[NÚCLEO] Matriz/Filial V31 via portal_pending_users ativo.');
})();
