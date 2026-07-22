(() => {
  "use strict";

  const API_VERSION = "2022-11-28";
  const state = { owner:"", repo:"", branch:"main", token:"", frames:[], configSha:null, pendingDelete:null };
  const $ = (id) => document.getElementById(id);
  const els = {
    connectionForm: $("connectionForm"), owner: $("repoOwner"), repo: $("repoName"), branch: $("repoBranch"), token: $("githubToken"),
    toggleToken: $("toggleToken"), connectBtn: $("connectBtn"), connectionStatus: $("connectionStatus"), managerCard: $("managerCard"),
    refreshBtn: $("refreshBtn"), flash: $("flashMessage"), frameForm: $("frameForm"), originalId: $("editingOriginalId"),
    formTitle: $("formTitle"), cancelEdit: $("cancelEditBtn"), frameName: $("frameName"), frameId: $("frameId"), category: $("frameCategory"),
    categoryList: $("categoryList"), frameFile: $("frameFile"), fileHint: $("fileHint"), active: $("frameActive"), isNew: $("frameNew"),
    preview: $("filePreview"), destination: $("destinationPath"), saveBtn: $("saveFrameBtn"), list: $("framesList"), count: $("frameCount"),
    search: $("adminSearch"), dialog: $("confirmDialog"), confirmText: $("confirmText"), deleteFile: $("deleteImageFile"), confirmDelete: $("confirmDeleteBtn")
  };

  function slugify(value){ return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
  function escapeHtml(value){ return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function setStatus(text,type="neutral"){ els.connectionStatus.textContent=text; els.connectionStatus.className=`status ${type}`; }
  function flash(message,type="info"){ els.flash.textContent=message; els.flash.className=`flash ${type}`; els.flash.hidden=false; els.flash.scrollIntoView({behavior:"smooth",block:"nearest"}); }
  function clearFlash(){ els.flash.hidden=true; }
  function headers(){ return { Accept:"application/vnd.github+json", Authorization:`Bearer ${state.token}`, "X-GitHub-Api-Version":API_VERSION }; }
  function apiUrl(path){ return `https://api.github.com/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`; }
  async function api(path, options={}){
    const response=await fetch(apiUrl(path),{...options,headers:{...headers(),...(options.headers||{})}});
    let data=null; try{ data=await response.json(); }catch{}
    if(!response.ok) throw new Error(data?.message || `Erro ${response.status} ao acessar o GitHub.`);
    return data;
  }
  function utf8ToBase64(text){ const bytes=new TextEncoder().encode(text); let binary=""; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary); }
  function base64ToUtf8(base64){ const binary=atob(base64.replace(/\n/g,"")); const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)); return new TextDecoder().decode(bytes); }
  function arrayBufferToBase64(buffer){ const bytes=new Uint8Array(buffer); let binary=""; for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary); }
  function serializeFrames(){ return `window.MOLDURAS = ${JSON.stringify(state.frames,null,2)};\n`; }
  function parseFrames(source){ const match=source.match(/window\.MOLDURAS\s*=\s*([\s\S]*?)\s*;\s*$/); if(!match) throw new Error("O arquivo molduras.js não está no formato esperado."); try{return JSON.parse(match[1]);}catch{ throw new Error("O molduras.js precisa estar no formato JSON da nova versão."); } }
  async function getContent(path){ return api(path+`?ref=${encodeURIComponent(state.branch)}`); }
  async function putContent(path,content,message,sha){ return api(path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,content,branch:state.branch,...(sha?{sha}:{})})}); }
  async function deleteContent(path,message,sha){ return api(path,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,sha,branch:state.branch})}); }

  async function loadFrames(){
    clearFlash(); setStatus("Carregando...","neutral");
    const file=await getContent("molduras.js");
    state.configSha=file.sha; state.frames=parseFrames(base64ToUtf8(file.content));
    renderCategories(); renderFrames(); setStatus("Conectado","ok"); els.managerCard.hidden=false;
  }
  function renderCategories(){ const categories=[...new Set(state.frames.map(f=>f.categoria).filter(Boolean))].sort(); els.categoryList.innerHTML=categories.map(c=>`<option value="${escapeHtml(c)}"></option>`).join(""); }
  function renderFrames(){
    const q=els.search.value.trim().toLowerCase();
    const filtered=state.frames.filter(f=>`${f.nome} ${f.categoria} ${f.id}`.toLowerCase().includes(q));
    els.count.textContent=`${state.frames.length} ${state.frames.length===1?"moldura":"molduras"}`;
    if(!filtered.length){ els.list.innerHTML='<p>Nenhuma moldura encontrada.</p>'; return; }
    els.list.innerHTML=filtered.map(frame=>`
      <article class="frame-row" data-id="${escapeHtml(frame.id)}">
        <img class="frame-thumb" src="${escapeHtml(frame.arquivo)}?v=${Date.now()}" alt="Prévia de ${escapeHtml(frame.nome)}" onerror="this.style.opacity=.25">
        <div class="frame-info"><h4>${escapeHtml(frame.nome)}</h4><p>${escapeHtml(frame.categoria)} · <code>${escapeHtml(frame.id)}</code></p><p>${escapeHtml(frame.arquivo)}</p>
          <div class="badges"><span class="badge ${frame.ativo?"active":"inactive"}">${frame.ativo?"Visível":"Oculta"}</span>${frame.novo?'<span class="badge new">Nova</span>':''}</div>
        </div>
        <div class="row-actions">
          <button class="button light" data-action="edit" type="button">Editar</button>
          <button class="button light" data-action="toggle" type="button">${frame.ativo?"Ocultar":"Exibir"}</button>
          <button class="button danger" data-action="delete" type="button">Remover</button>
        </div>
      </article>`).join("");
  }
  function resetForm(){ els.frameForm.reset(); els.originalId.value=""; els.active.checked=true; els.isNew.checked=true; els.formTitle.textContent="Adicionar nova moldura"; els.saveBtn.textContent="Adicionar e publicar moldura"; els.cancelEdit.hidden=true; els.fileHint.textContent="Obrigatório para uma nova moldura."; els.preview.innerHTML="<span>Prévia da moldura</span>"; updateDestination(); }
  function updateDestination(){ const file=els.frameFile.files[0]; const original=state.frames.find(f=>f.id===els.originalId.value); const ext=file?.name.split(".").pop()?.toLowerCase() || original?.arquivo.split(".").pop() || "png"; const id=slugify(els.frameId.value)||"arquivo"; els.destination.textContent=`assets/molduras/${id}.${ext}`; }
  function editFrame(id){ const f=state.frames.find(x=>x.id===id); if(!f)return; els.originalId.value=f.id; els.frameName.value=f.nome; els.frameId.value=f.id; els.category.value=f.categoria; els.active.checked=f.ativo!==false; els.isNew.checked=!!f.novo; els.formTitle.textContent=`Editar: ${f.nome}`; els.saveBtn.textContent="Salvar alterações"; els.cancelEdit.hidden=false; els.fileHint.textContent="Opcional. Selecione somente para substituir a imagem."; els.preview.innerHTML=`<img src="${escapeHtml(f.arquivo)}?v=${Date.now()}" alt="Prévia">`; updateDestination(); els.frameForm.scrollIntoView({behavior:"smooth",block:"start"}); }
  async function saveConfig(message){ const latest=await getContent("molduras.js"); state.configSha=latest.sha; const result=await putContent("molduras.js",utf8ToBase64(serializeFrames()),message,state.configSha); state.configSha=result.content.sha; }
  async function uploadFile(file,path,message){ let sha; try{sha=(await getContent(path)).sha;}catch(error){ if(!/Not Found/i.test(error.message)) throw error; } return putContent(path,arrayBufferToBase64(await file.arrayBuffer()),message,sha); }

  els.connectionForm.addEventListener("submit",async e=>{ e.preventDefault(); state.owner=els.owner.value.trim(); state.repo=els.repo.value.trim(); state.branch=els.branch.value.trim(); state.token=els.token.value.trim(); els.connectBtn.disabled=true; try{await loadFrames(); flash("Conexão realizada. Você já pode administrar as molduras.","success");}catch(err){setStatus("Erro","error");flash(err.message,"error");}finally{els.connectBtn.disabled=false;} });
  els.toggleToken.addEventListener("click",()=>{ const show=els.token.type==="password"; els.token.type=show?"text":"password"; els.toggleToken.textContent=show?"Ocultar":"Mostrar"; });
  els.refreshBtn.addEventListener("click",async()=>{try{await loadFrames();flash("Lista atualizada.","success");}catch(err){flash(err.message,"error");}});
  els.frameName.addEventListener("input",()=>{ if(!els.originalId.value || !els.frameId.dataset.edited){els.frameId.value=slugify(els.frameName.value);updateDestination();} });
  els.frameId.addEventListener("input",()=>{els.frameId.dataset.edited="1";els.frameId.value=slugify(els.frameId.value);updateDestination();});
  els.frameFile.addEventListener("change",()=>{ const file=els.frameFile.files[0]; updateDestination(); if(!file)return; const url=URL.createObjectURL(file); els.preview.innerHTML=`<img src="${url}" alt="Prévia da nova moldura">`; });
  els.cancelEdit.addEventListener("click",resetForm); els.search.addEventListener("input",renderFrames);

  els.frameForm.addEventListener("submit",async e=>{
    e.preventDefault(); clearFlash();
    const originalId=els.originalId.value; const existing=originalId?state.frames.find(f=>f.id===originalId):null; const file=els.frameFile.files[0];
    if(!existing && !file){flash("Escolha o arquivo da moldura.","error");return;}
    const id=slugify(els.frameId.value); if(state.frames.some(f=>f.id===id && f.id!==originalId)){flash("Já existe uma moldura com esse identificador.","error");return;}
    els.saveBtn.disabled=true; els.saveBtn.textContent="Publicando...";
    try{
      let path=existing?.arquivo;
      if(file){ const ext=(file.name.split(".").pop()||"png").toLowerCase(); path=`assets/molduras/${id}.${ext}`; await uploadFile(file,path,`${existing?"Atualiza":"Adiciona"} imagem da moldura ${els.frameName.value.trim()}`); }
      const frame={id,nome:els.frameName.value.trim(),categoria:els.category.value.trim(),arquivo:path,ativo:els.active.checked,novo:els.isNew.checked};
      if(existing){ state.frames[state.frames.findIndex(f=>f.id===originalId)]=frame; } else state.frames.push(frame);
      await saveConfig(`${existing?"Atualiza":"Adiciona"} moldura ${frame.nome}`);
      renderCategories();renderFrames();resetForm();flash("Moldura publicada com sucesso. O GitHub Pages pode levar alguns instantes para atualizar.","success");
    }catch(err){flash(`Não foi possível publicar: ${err.message}`,"error"); try{await loadFrames();}catch{} }
    finally{els.saveBtn.disabled=false;if(!els.originalId.value)els.saveBtn.textContent="Adicionar e publicar moldura";}
  });

  els.list.addEventListener("click",async e=>{
    const button=e.target.closest("button[data-action]"); if(!button)return; const id=button.closest(".frame-row").dataset.id; const frame=state.frames.find(f=>f.id===id); if(!frame)return;
    if(button.dataset.action==="edit") return editFrame(id);
    if(button.dataset.action==="delete"){ state.pendingDelete=frame; els.confirmText.textContent=`A moldura “${frame.nome}” será removida da lista.`; els.deleteFile.checked=true; els.dialog.showModal(); return; }
    if(button.dataset.action==="toggle"){
      button.disabled=true; try{frame.ativo=!frame.ativo;await saveConfig(`${frame.ativo?"Exibe":"Oculta"} moldura ${frame.nome}`);renderFrames();flash(`Moldura ${frame.ativo?"exibida":"ocultada"} com sucesso.`,"success");}catch(err){frame.ativo=!frame.ativo;flash(err.message,"error");}finally{button.disabled=false;}
    }
  });

  els.dialog.addEventListener("close",async()=>{
    if(els.dialog.returnValue!=="confirm" || !state.pendingDelete)return; const frame=state.pendingDelete; state.pendingDelete=null; els.confirmDelete.disabled=true;
    try{
      state.frames=state.frames.filter(f=>f.id!==frame.id); await saveConfig(`Remove moldura ${frame.nome}`);
      if(els.deleteFile.checked){ try{const img=await getContent(frame.arquivo);await deleteContent(frame.arquivo,`Remove imagem da moldura ${frame.nome}`,img.sha);}catch(err){flash(`A moldura saiu da lista, mas o arquivo não pôde ser apagado: ${err.message}`,"error");renderFrames();return;} }
      renderCategories();renderFrames();resetForm();flash("Moldura removida com sucesso.","success");
    }catch(err){flash(`Não foi possível remover: ${err.message}`,"error");try{await loadFrames();}catch{}}
    finally{els.confirmDelete.disabled=false;}
  });
  updateDestination();
})();
