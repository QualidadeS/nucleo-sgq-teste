(function(){
  'use strict';
  window.NucleoCore = window.NucleoCore || {};

  NucleoCore.api = {
    call(action, params, timeout){
      if(typeof portalJsonp !== 'function'){
        return Promise.reject(new Error('API central ainda não inicializada.'));
      }
      return portalJsonp({acao:action,...(params||{})}, timeout||30000);
    }
  };

  NucleoCore.session = {
    current(){ return typeof getSession==='function' ? getSession() : null; }
  };

  NucleoCore.permissions = {
    can(module, feature){
      if(feature && typeof nucleoPersonFeatureCan==='function') return !!nucleoPersonFeatureCan(module,feature);
      if(typeof nucleoPersonCan==='function') return !!nucleoPersonCan(module);
      return false;
    }
  };
})();
