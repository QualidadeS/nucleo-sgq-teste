(function(){
  'use strict';
  const modules = {"users":{"name":"Usuários e acessos","version":"1.0.0","status":"protected","owns":["cadastros de usuários","status de login","permissões individuais","gestão de setores por usuário"],"collections":["users"],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":["sac","audit5s","equipment","pdca","ro"]},"ro":{"name":"R.O.","version":"1.0.0","status":"protected","owns":["cadastro de R.O.","triagem","direcionamento","contestações"],"collections":["triage","external_ro_controls"],"dependsOn":["core.auth","core.permissions","core.api","users"],"forbiddenDirectDependencies":["audit5s","equipment"]},"pdca":{"name":"PDCA e ações","version":"1.0.0","status":"protected","owns":["PDCA","ações","apresentação","despacho"],"collections":["pdca_files","pdca_dispatches","pdca_sent","pdca_actions"],"dependsOn":["core.auth","core.permissions","core.api","ro"],"forbiddenDirectDependencies":["audit5s","equipment"]},"sac":{"name":"SAC","version":"1.0.0","status":"protected","owns":["controle de SAC","tratativa","anexos","PDF do SAC","acompanhamento"],"collections":["external_ro_controls"],"dependsOn":["core.auth","core.permissions","core.api","ro"],"forbiddenDirectDependencies":["audit5s","equipment","training"]},"audit5s":{"name":"Auditoria 5S","version":"1.0.0","status":"protected","owns":["cronograma","auditorias","ações 5S","histórico","resultado do ciclo","vínculo de auditores"],"collections":["audit_5s_schedule","audit_5s_audits","audit_5s_actions","shared_state"],"dependsOn":["core.auth","core.permissions","core.api","users"],"forbiddenDirectDependencies":["sac","equipment","training","pdca"]},"equipment":{"name":"Equipamentos","version":"1.0.0","status":"protected","owns":["cadastro de equipamentos","calibração","laudos","alertas"],"collections":["admin_modules"],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":["sac","audit5s","pdca"]},"training":{"name":"Treinamentos","version":"1.0.0","status":"protected","owns":["treinamentos","reciclagens","histórico de competências"],"collections":["admin_modules"],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":["sac","audit5s"]},"documents":{"name":"Documentos","version":"1.0.0","status":"protected","owns":["documentos padrão","solicitações","entregas","histórico"],"collections":["standard_documents","document_templates","requested_documents","document_deliveries"],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":["audit5s","equipment"]},"processes":{"name":"Gestão de processos","version":"1.0.0","status":"protected","owns":["processos","documentos internos","modelos","nomenclaturas"],"collections":["admin_modules"],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":["sac","audit5s"]},"nc":{"name":"RNC / Não conformidades","version":"1.0.0","status":"protected","owns":["RNC","tratamento","fornecedores","evidências"],"collections":["admin_modules"],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":["audit5s"]},"indicators":{"name":"Indicadores","version":"1.0.0","status":"protected","owns":["indicadores","painéis de resultados"],"collections":[],"dependsOn":["core.auth","core.permissions","core.api"],"forbiddenDirectDependencies":[]},"announcements":{"name":"Comunicados","version":"1.0.0","status":"protected","owns":["comunicados","ciência de leitura","anexos de comunicado"],"collections":["announcements"],"dependsOn":["core.auth","core.permissions","core.api","users"],"forbiddenDirectDependencies":[]}};

  const core = {
    version: '1.0.0',
    architecture: 'modular-monolith',
    phase: 1,
    productionSafe: true
  };

  window.NUCLEO_ARCHITECTURE = {
    core,
    modules,
    getModule(key){ return modules[key] || null; },
    list(){ return Object.entries(modules).map(([key,value])=>({key,...value})); },
    assertModule(key){
      if(!modules[key]) throw new Error('Módulo não registrado: '+key);
      return modules[key];
    }
  };

  window.NUCLEO_MODULE_VERSION = function(key){
    return modules[key]?.version || 'unknown';
  };
})();
