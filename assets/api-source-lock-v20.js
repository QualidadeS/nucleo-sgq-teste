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

/* NÚCLEO | ACCESS UNITS TRIAGEM V29 | cadastro bruto antes dos filtros da Filial */
(function(){
  if(window.__nucleoAccessUnitsTriageV29)return;
  window.__nucleoAccessUnitsTriageV29=true;

  function norm(v){
    try{return typeof normalizeAnswer==='function'?normalizeAnswer(v):String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
    catch(_){return String(v||'').toLowerCase().trim();}
  }
  function normUnit(v){
    try{return typeof normalizePortalUnit==='function'?normalizePortalUnit(v):(/filial|linhares|seta es/i.test(String(v||''))?'filial':/todas/i.test(String(v||''))?'todas':'matriz');}
    catch(_){return /filial|linhares|seta es/i.test(String(v||''))?'filial':/todas/i.test(String(v||''))?'todas':'matriz';}
  }
  function userUnits(u){
    const raw=Array.isArray(u?.accessUnits)?u.accessUnits:[];
    if(raw.length){
      const out=[];
      raw.forEach(x=>{const n=normUnit(x);if(n==='todas'){out.push('matriz','filial')}else if(n)out.push(n)});
      return [...new Set(out)];
    }
    const primary=normUnit(u?.unit||u?.unidade||'');
    return primary==='todas'?['matriz','filial']:[primary||'matriz'];
  }
  function rawUsers(){
    const out=[];
    const add=list=>{if(Array.isArray(list))list.forEach(u=>{if(u&&typeof u==='object')out.push(u)})};
    try{
      if(typeof USERS_KEY!=='undefined')add(JSON.parse(localStorage.getItem(USERS_KEY)||'[]'));
    }catch(_){}
    ['ro-pdca-users-v4','nucleo-users','nucleo-portal-users'].forEach(k=>{
      try{add(JSON.parse(localStorage.getItem(k)||'[]'))}catch(_){}
    });
    try{add(JSON.parse(localStorage.getItem('nucleo-unit-contacts')||'[]'))}catch(_){}
    try{
      if(typeof getOperationalUsers==='function')add(getOperationalUsers()||[]);
    }catch(_){}
    const map=new Map();
    out.forEach(u=>{
      const key=String(u?.personId||u?.email||u?.name||'').trim().toLowerCase();
      if(!key)return;
      const prev=map.get(key)||{};
      map.set(key,{...prev,...u});
    });
    return [...map.values()];
  }
  function active(u){
    const approval=norm(u?.approvalStatus||'approved');
    const status=norm(u?.status||'');
    const enabled=u?.active!==false && !['nao','false','inativo'].includes(norm(u?.active||'sim'));
    return enabled && !['pending','rejected','inactive','disabled','recusado','inativo'].includes(approval) && !['inactive','inativo'].includes(status) && String(u?.email||'').trim();
  }
  function userSectorMatch(u,sector){
    const key=norm(sector);
    if(!key)return false;
    if(norm(u?.sector||u?.setor||'')===key)return true;
    return (u?.sectorMemberships||[]).some(m=>norm(m?.sector||'')===key);
  }
  function userHasUnitSectorV29(u,unit,sector){
    const target=normUnit(unit);
    const key=norm(sector);
    if(!key)return false;
    const exactMembership=(u?.sectorMemberships||[]).some(m=>{
      const mu=normUnit(m?.unit||'');
      return (mu===target||mu==='todas')&&norm(m?.sector||'')===key;
    });
    if(exactMembership)return true;
    return userUnits(u).includes(target) && userSectorMatch(u,sector);
  }
  function currentTriageUnit(){
    const select=document.getElementById('triageRoUnit');
    const fromSelect=normUnit(select?.value||'');
    if(fromSelect)return fromSelect;
    try{
      const session=typeof getSession==='function'?(getSession()||{}):{};
      if(String(session.role||'').toLowerCase()==='quality')return 'filial';
      const scoped=typeof adminScopeUnit==='function'?adminScopeUnit():'';
      const n=normUnit(scoped);
      if(n&&n!=='todas')return n;
    }catch(_){}
    return 'matriz';
  }
  function usersBySectorV29(sector){
    const unit=currentTriageUnit();
    return rawUsers()
      .filter(active)
      .filter(u=>userHasUnitSectorV29(u,unit,sector))
      .sort((a,b)=>String(a?.name||a?.email||'').localeCompare(String(b?.name||b?.email||''),'pt-BR'));
  }

  const originalConfigured=window.getConfiguredSectors;
  function getConfiguredSectorsV29(unit){
    const target=normUnit(unit || (typeof adminScopeUnit==='function'?adminScopeUnit():'matriz'));
    let base=[];
    try{base=typeof originalConfigured==='function'?(originalConfigured(unit)||[]):[]}catch(_){base=[]}
    if(!Array.isArray(base))base=[];
    const out=base.slice();
    const seen=new Set(out.map(norm));
    rawUsers().filter(active).forEach(u=>{
      if(!userUnits(u).includes(target))return;
      const candidates=[u?.sector||u?.setor||''];
      (u?.sectorMemberships||[]).forEach(m=>{
        const mu=normUnit(m?.unit||'');
        if(mu===target||mu==='todas')candidates.push(m?.sector||'');
      });
      candidates.forEach(sec=>{
        sec=String(sec||'').trim();const k=norm(sec);
        if(sec&&k&&!seen.has(k)){seen.add(k);out.push(sec)}
      });
    });
    return out.sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
  }

  function apply(){
    window.userHasUnitSector=userHasUnitSectorV29;
    window.usersBySector=usersBySectorV29;
    window.getConfiguredSectors=getConfiguredSectorsV29;
    try{
      if(typeof refreshTriageResponsibleUsers==='function')refreshTriageResponsibleUsers();
      const picker=document.getElementById('triageSectorPicker');
      if(picker && !picker.closest('.hidden')){
        const current=picker.value;
        const sectors=getConfiguredSectorsV29(currentTriageUnit());
        picker.innerHTML='<option value="">Selecione um setor...</option>'+sectors.map(sec=>'<option value="'+(typeof escapeHtml==='function'?escapeHtml(sec):sec)+'">'+(typeof escapeHtml==='function'?escapeHtml(sec):sec)+'</option>').join('');
        if(sectors.includes(current))picker.value=current;
      }
    }catch(e){console.warn('[NÚCLEO V29] atualização visual da triagem:',e)}
  }

  apply();
  window.addEventListener('load',()=>setTimeout(apply,0),{once:true});
  document.addEventListener('click',()=>setTimeout(apply,0),true);
  let tries=0;const timer=setInterval(()=>{apply();if(++tries>120)clearInterval(timer)},250);
  console.info('[NÚCLEO] AccessUnits Triagem V29 ativo.');
})();
