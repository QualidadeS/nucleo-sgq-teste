/* Complementos da investigação e classificação de industrialização (base de teste). */
(function(){
  const route='nucleo_test_ro_investigation';
  const keyOf=ro=>String(ro?.numero||ro?.ro||ro?.id||'').split('::')[0];
  const admin=()=>nucleoPersonPermissions(getSession()).sgq===true;
  const sessionKey=()=>getSession()?.authToken;
  function mount(host,ro,editable=true){
    if(!host)return;
    const key=keyOf(ro);
    host.replaceChildren();
    if(!/^RO-(IN|EX)-\d+$/i.test(key))return;
    const title=document.createElement('h3');
    title.textContent='Complementos da investigação';
    host.append(title);
    const status=document.createElement('p');
    status.className='small';status.setAttribute('role','status');
    status.textContent='Consultando complementos...';
    host.append(status);
    const content=document.createElement('div');host.append(content);
    const token=sessionKey();
    const valid=()=>sessionKey()===token&&host.contains(content);
    async function request(mode,params={}){
      const result=await portalJsonp({acao:route,mode,ro:key,...params},60000);
      if(!result?.sucesso)throw new Error(result?.erro||'A base não confirmou a operação.');
      return result;
    }
    async function refresh(){
      const result=await request('list');
      if(!valid())return;
      content.replaceChildren();
      const industrial=document.createElement('p');
      industrial.className='small';
      industrial.textContent=result.industrialization?'Industrialização · unidade responsável: Matriz':'';
      content.append(industrial);
      if(editable&&admin()&&result.sourceUnit==='filial'){
        const toggle=document.createElement('button');
        toggle.className='btn secondary';toggle.type='button';
        toggle.textContent=result.industrialization?'Desfazer industrialização':'Marcar como industrialização';
        toggle.onclick=()=>perform(toggle,async()=>{
          if(!confirm(result.industrialization?'Retornar esta R.O. e SAC vinculado à Filial?':'Transferir a visualização desta R.O. e SAC vinculado para a Matriz?'))return;
          await request('industrialization',{enabled:result.industrialization?'0':'1'});
          const synced=await syncNow();
          await refresh();
          alert(synced?'Classificação confirmada.':'Classificação salva. A atualização das listas ainda não foi confirmada.');
        });
        content.append(toggle);
      }
      for(const item of result.items||[]){
        const article=document.createElement('article');
        article.style.cssText='padding:12px;margin:8px 0;border:1px solid var(--line);border-radius:8px';
        const heading=document.createElement('p');heading.className='small';
        heading.textContent=[item.author,formatDateTimeBR(item.updatedAt||item.createdAt)].filter(Boolean).join(' · ');
        article.append(heading);
        const text=document.createElement('div');text.style.whiteSpace='pre-wrap';text.textContent=item.text||'';article.append(text);
        if(item.hasPhoto){
          const photo=document.createElement('button');photo.type='button';photo.className='btn secondary';photo.textContent='Ver foto';
          photo.onclick=()=>perform(photo,async()=>{
            const response=await request('photo',{id:item.id});
            if(!valid())return;
            const img=document.createElement('img');img.style.cssText='display:block;max-width:100%;max-height:420px;margin-top:8px;object-fit:contain';
            img.alt=item.name||'Foto da investigação';img.src='data:'+response.mime+';base64,'+response.photo;
            photo.replaceWith(img);
          });
          article.append(photo);
        }
        if(editable&&admin()){
          const edit=document.createElement('button');edit.type='button';edit.className='btn secondary';edit.textContent='Editar informação';
          edit.onclick=()=>perform(edit,async()=>{
            const value=prompt('Informações da investigação',item.text||'');
            if(value===null)return;
            await request('edit',{id:item.id,text:value});await refresh();
          });
          const remove=document.createElement('button');remove.type='button';remove.className='btn secondary';remove.textContent='Excluir complemento';
          remove.onclick=()=>perform(remove,async()=>{
            if(!confirm('Excluir este complemento da investigação?'))return;
            await request('delete',{id:item.id});await refresh();
          });
          article.append(edit,remove);
        }
        content.append(article);
      }
      if(!(result.items||[]).length){const p=document.createElement('p');p.className='small';p.textContent='Nenhum complemento registrado.';content.append(p);}
      if(editable&&admin()){
        const note=document.createElement('textarea');note.rows=3;note.maxLength=3000;note.placeholder='Informações, detalhes e justificativas da investigação';note.style.width='100%';
        const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.multiple=true;
        const save=document.createElement('button');save.type='button';save.className='btn primary';save.textContent='Salvar complementos';
        let pendingRows=null,pendingSignature='';
        save.onclick=()=>perform(save,async()=>{
          const value=note.value.trim(),files=[...input.files];
          if(!value&&!files.length)throw new Error('Informe uma observação ou selecione fotos.');
          if(files.length>10)throw new Error('Selecione até dez fotos por vez.');
          const signature=JSON.stringify([value,...files.map(f=>[f.name,f.size,f.lastModified])]);
          if(!pendingRows||pendingSignature!==signature){
            const photos=await Promise.all(files.map(readPhoto));
            pendingRows=(photos.length?photos.map((p,i)=>({...p,text:i===0?value:''})): [{text:value}]).map(row=>({...row,id:'INV-'+crypto.randomUUID()}));
            pendingSignature=signature;
          }
          const confirmedItems=await request('list');
          for(const row of pendingRows){
            if(confirmedItems.items.some(item=>item.id===row.id))continue;
            if(row.photo){
              if(!portalPostForm({acao:route,mode:'add',ro:key,dados:JSON.stringify(row)}))throw new Error('Não foi possível iniciar o envio da foto.');
              let confirmed=false;
              for(let i=0;i<12;i++){
                await new Promise(resolve=>setTimeout(resolve,1000));
                const check=await request('list');
                if(check.items.some(x=>x.id===row.id)){confirmed=true;break;}
              }
              if(!confirmed)throw new Error('O envio da foto ainda não foi confirmado. Consulte os complementos antes de repetir.');
            }else{
              await request('add',{dados:JSON.stringify(row)});
            }
          }
          await refresh();alert('Complementos salvos.');
        });
        content.append(note,input,save);
      }
      status.textContent='';
    }
    async function perform(button,fn){
      if(button.disabled)return;
      button.disabled=true;
      const warn=event=>{event.preventDefault();event.returnValue='';};
      window.addEventListener('beforeunload',warn);
      status.textContent='Processando... aguarde a confirmação.';
      try{await withNucleoLoading('Processando investigação...',fn,'Aguarde');}
      catch(e){if(valid())status.textContent=e.message||String(e);alert(e.message||String(e));}
      finally{window.removeEventListener('beforeunload',warn);button.disabled=false;}
    }
    refresh().catch(error=>{if(valid())status.textContent=error.message||String(error);});
  }
  async function readPhoto(file){
    if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('Selecione imagens JPG, PNG ou WebP.');
    if(file.size>15*1024*1024)throw new Error('Imagem acima de 15 MB.');
    const bitmap=await createImageBitmap(file);
    try{
      const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const photo=canvas.toDataURL('image/jpeg',.83).split(',')[1];
      if(photo.length>1800000)throw new Error('Foto muito grande após o ajuste.');
      return {photo,mime:'image/jpeg',name:file.name};
    }finally{bitmap.close();}
  }
  function install(name,after){
    const original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(...args){const result=original.apply(this,args);after(...args);return result;};
  }
  install('fillDetail',()=>mount(document.getElementById('roInvestigationDetail'),selected));
  install('openPDCA',()=>{if(!document.getElementById('pdcaView')?.classList.contains('hidden'))mount(document.getElementById('roInvestigationPdca'),selected,false);});
  install('openTriageRecord',(id)=>mount(document.getElementById('roInvestigationTriage'),findRoByAnyNumber(String(id).split('::')[0])));
  install('openExternalRoControlModal',(id)=>mount(document.getElementById('roInvestigationSac'),getExternalRoControls().find(x=>String(x.id)===String(id))));
  install('openSacEditModal',(id)=>mount(document.getElementById('roInvestigationSacEdit'),getExternalRoControls().find(x=>String(x.id)===String(id))));
})();
