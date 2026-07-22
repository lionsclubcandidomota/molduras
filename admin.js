(() => {
  "use strict";

  const API_VERSION = "2022-11-28";
  const CONFIG_PATH = "molduras.js";
  const IMAGE_DIR = "assets/molduras";
  const MAX_RETRIES = 4;

  const state = {
    owner: "", repo: "", branch: "main", token: "",
    categorias: [], molduras: [], originalSnapshot: "",
    busy: false, dirty: false, editingId: "", pendingDelete: null,
    draggedCategory: null, draggedFrame: null,
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    formConnect: $("connectionForm"), owner: $("repoOwner"), repo: $("repoName"), branch: $("repoBranch"), token: $("githubToken"),
    toggleToken: $("toggleToken"), connect: $("connectBtn"), status: $("connectionStatus"), manager: $("managerCard"), refresh: $("refreshBtn"),
    flash: $("flashMessage"), form: $("frameForm"), originalId: $("editingOriginalId"), formTitle: $("formTitle"), cancelEdit: $("cancelEditBtn"),
    name: $("frameName"), id: $("frameId"), category: $("frameCategory"), categoryList: $("categoryList"), file: $("frameFile"),
    fileHint: $("fileHint"), active: $("frameActive"), isNew: $("frameNew"), preview: $("filePreview"), destination: $("destinationPath"), save: $("saveFrameBtn"),
    list: $("framesList"), count: $("frameCount"), search: $("adminSearch"), saveOrder: $("saveOrderBtn"), cancelOrder: $("cancelOrderBtn"),
    notice: $("orderNotice"), categories: $("categoriesOrderList"), dialog: $("confirmDialog"), confirmText: $("confirmText"), deleteFile: $("deleteImageFile"), confirmDelete: $("confirmDeleteBtn"),
  };

  class GitHubError extends Error { constructor(message, status = 0) { super(message); this.status = status; } }
  const slugify = (v) => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const esc = (v) => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function flash(message, type = "info") { el.flash.textContent = message; el.flash.className = `flash ${type}`; el.flash.hidden = false; }
  function status(message, type = "neutral") { el.status.textContent = message; el.status.className = `status ${type}`; }
  function setBusy(value, message = "Sincronizando...") {
    state.busy = value;
    [el.connect, el.refresh, el.save, el.confirmDelete, el.saveOrder, el.cancelOrder].forEach(x => { if (x) x.disabled = value; });
    if (value) status(message);
    updateDirtyUI();
  }

  function apiUrl(path) {
    const [pathname, query = ""] = path.split("?");
    const encoded = pathname.split("/").map(encodeURIComponent).join("/");
    const base = `https://api.github.com/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${encoded}`;
    return query ? `${base}?${query}` : base;
  }
  async function api(path, options = {}) {
    const response = await fetch(apiUrl(path), { ...options, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${state.token}`, "X-GitHub-Api-Version": API_VERSION, ...(options.headers || {}) } });
    let data = null; try { data = await response.json(); } catch {}
    if (!response.ok) throw new GitHubError(data?.message || `Erro ${response.status}`, response.status);
    return data;
  }
  const isConflict = e => e instanceof GitHubError && (e.status === 409 || e.status === 422 || /sha|does not match/i.test(e.message));
  const b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), c => c.charCodeAt(0)));
  const textToB64 = text => { const bytes = new TextEncoder().encode(text); let s=""; for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(s); };
  const bufferToB64 = buffer => { const bytes=new Uint8Array(buffer); let s=""; for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(s); };

  function extractArray(source, name) {
    const match = source.match(new RegExp(`(?:window\\.)?${name}\\s*=\\s*([\\s\\S]*?);(?:\\s|$)`));
    if (!match) return null;
    const value = JSON.parse(match[1]);
    if (!Array.isArray(value)) throw new Error(`${name} precisa ser uma lista JSON válida.`);
    return value;
  }

  function normalizeData(source) {
    const oldFrames = extractArray(source, "MOLDURAS") || [];
    const rawCategories = extractArray(source, "CATEGORIAS");
    let categorias;

    if (rawCategories?.length) {
      categorias = rawCategories.map((c, index) => ({
        id: slugify(c.id || c.nome || `categoria-${index + 1}`),
        nome: String(c.nome || c.id || "Sem categoria"),
        ordem: Number.isFinite(Number(c.ordem)) ? Number(c.ordem) : index + 1,
        ativo: c.ativo !== false,
      })).sort((a,b) => a.ordem-b.ordem);
    } else {
      const names = [];
      oldFrames.forEach(f => { const n=String(f.categoria || "Sem categoria").trim() || "Sem categoria"; if(!names.includes(n)) names.push(n); });
      categorias = names.map((nome,index) => ({ id: slugify(nome) || `categoria-${index+1}`, nome, ordem:index+1, ativo:true }));
    }

    const categoryByName = new Map(categorias.map(c => [c.nome.toLowerCase(), c]));
    const categoryById = new Map(categorias.map(c => [c.id, c]));
    const counters = new Map();
    const molduras = oldFrames.map((f,index) => {
      let categoriaId = f.categoriaId;
      if (!categoryById.has(categoriaId)) {
        const name = String(f.categoria || "Sem categoria").trim() || "Sem categoria";
        let cat = categoryByName.get(name.toLowerCase());
        if (!cat) { cat={id:slugify(name)||`categoria-${categorias.length+1}`,nome:name,ordem:categorias.length+1,ativo:true}; categorias.push(cat); categoryByName.set(name.toLowerCase(),cat); categoryById.set(cat.id,cat); }
        categoriaId = cat.id;
      }
      const n = (counters.get(categoriaId) || 0) + 1; counters.set(categoriaId,n);
      return { id:String(f.id||`moldura-${index+1}`), nome:String(f.nome||f.id||"Moldura"), categoriaId, ordem:Number.isFinite(Number(f.ordem))?Number(f.ordem):n, arquivo:f.arquivo, ativo:f.ativo!==false, novo:f.novo===true };
    });
    renumber(categorias, molduras);
    return { categorias, molduras };
  }

  function serialize(categorias, molduras) {
    return `// Gerenciado pelo Painel de Molduras Lions v3\nwindow.CATEGORIAS = ${JSON.stringify(categorias, null, 2)};\n\nwindow.MOLDURAS = ${JSON.stringify(molduras, null, 2)};\n`;
  }
  function renumber(categorias = state.categorias, molduras = state.molduras) {
    categorias.sort((a,b)=>a.ordem-b.ordem).forEach((c,i)=>c.ordem=i+1);
    for (const cat of categorias) molduras.filter(f=>f.categoriaId===cat.id).sort((a,b)=>a.ordem-b.ordem).forEach((f,i)=>f.ordem=i+1);
  }
  function snapshot() { return JSON.stringify({categorias:state.categorias,molduras:state.molduras}); }
  function markDirty() { state.dirty = snapshot() !== state.originalSnapshot; updateDirtyUI(); }
  function updateDirtyUI() {
    if (!el.saveOrder) return;
    el.saveOrder.disabled = state.busy || !state.dirty;
    el.cancelOrder.disabled = state.busy || !state.dirty;
    el.notice.hidden = !state.dirty;
  }

  async function getFile(path) { return api(`${path}?ref=${encodeURIComponent(state.branch)}`); }
  async function putFile(path, content, message, sha) { return api(path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,content,branch:state.branch,...(sha?{sha}:{})})}); }
  async function deleteFile(path,message,sha){ return api(path,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,sha,branch:state.branch})}); }

  async function saveConfig(message) {
    let last;
    for(let attempt=1;attempt<=MAX_RETRIES;attempt++){
      try {
        const latest=await getFile(CONFIG_PATH);
        await putFile(CONFIG_PATH,textToB64(serialize(state.categorias,state.molduras)),message,latest.sha);
        state.originalSnapshot=snapshot(); state.dirty=false; updateDirtyUI(); return;
      } catch(e){ last=e; if(!isConflict(e)||attempt===MAX_RETRIES)throw e; await wait(300*attempt); }
    }
    throw last;
  }
  async function uploadImage(file,path,message){
    let sha; try{sha=(await getFile(path)).sha;}catch(e){if(e.status!==404)throw e;}
    return putFile(path,bufferToB64(await file.arrayBuffer()),message,sha);
  }
  async function removeImage(path,message){ try{const f=await getFile(path); await deleteFile(path,message,f.sha);}catch(e){if(e.status!==404)throw e;} }

  function catName(id){ return state.categorias.find(c=>c.id===id)?.nome || "Sem categoria"; }
  function renderCategoryOptions(){
    el.categoryList.innerHTML=state.categorias.sort((a,b)=>a.ordem-b.ordem).map(c=>`<option value="${esc(c.nome)}"></option>`).join("");
  }
  function renderCategories(){
    const q=el.search.value.trim();
    el.categories.innerHTML=state.categorias.sort((a,b)=>a.ordem-b.ordem).map((c,index)=>`<div class="category-order-row" draggable="${!q}" data-category="${esc(c.id)}">
      <div class="category-order-controls"><button type="button" class="category-drag-handle">☰</button><span class="category-order-number">${index+1}</span><button type="button" class="category-order-arrow" data-category-action="up" ${index===0?"disabled":""}>↑</button><button type="button" class="category-order-arrow" data-category-action="down" ${index===state.categorias.length-1?"disabled":""}>↓</button></div>
      <div><div class="category-name">${esc(c.nome)}</div><div class="category-count">${state.molduras.filter(f=>f.categoriaId===c.id).length} moldura(s)</div></div>
      <div class="row-actions"><button type="button" class="button light" data-category-action="rename">Renomear</button><button type="button" class="button danger" data-category-action="delete">Excluir</button></div>
    </div>`).join("");
  }
  function renderFrames(){
    const q=el.search.value.toLowerCase().trim(); let total=0; let html="";
    for(const cat of state.categorias.sort((a,b)=>a.ordem-b.ordem)){
      const frames=state.molduras.filter(f=>f.categoriaId===cat.id).sort((a,b)=>a.ordem-b.ordem).filter(f=>!q||`${f.nome} ${f.id} ${cat.nome}`.toLowerCase().includes(q));
      if(!frames.length)continue; html+=`<div class="category-section-label"><span>${esc(cat.nome)}</span><small>${frames.length} moldura(s)</small></div>`;
      frames.forEach((f,index)=>{total++; html+=`<article class="frame-row" draggable="${!q}" data-id="${esc(f.id)}" data-category="${esc(cat.id)}">
        <div class="order-controls"><button type="button" class="drag-handle" data-action="drag">☰</button><span class="order-number">${index+1}</span><button type="button" class="order-arrow" data-action="up" ${index===0?"disabled":""}>↑</button><button type="button" class="order-arrow" data-action="down" ${index===frames.length-1?"disabled":""}>↓</button></div>
        <img class="frame-thumb" src="${esc(f.arquivo)}?v=${Date.now()}" alt=""><div class="frame-info"><h4>${esc(f.nome)}</h4><p>${esc(f.id)} · ordem ${f.ordem}</p><div class="badges"><span class="badge ${f.ativo!==false?"active":"inactive"}">${f.ativo!==false?"Visível":"Oculta"}</span>${f.novo?'<span class="badge new">Nova</span>':""}</div></div>
        <div class="row-actions"><button class="button light" data-action="edit">Editar</button><button class="button light" data-action="toggle">${f.ativo!==false?"Ocultar":"Exibir"}</button><button class="button danger" data-action="delete">Excluir</button></div></article>`;});
    }
    el.list.innerHTML=html||"<p>Nenhuma moldura encontrada.</p>"; el.count.textContent=`${total} moldura(s)`;
  }
  function render(){renumber();renderCategoryOptions();renderCategories();renderFrames();markDirty();}

  async function load(){
    const file=await getFile(CONFIG_PATH); const data=normalizeData(b64ToText(file.content)); state.categorias=data.categorias; state.molduras=data.molduras; state.originalSnapshot=snapshot(); state.dirty=false; render(); el.manager.hidden=false; status("Conectado","ok");
  }
  function resetForm(){state.editingId="";el.originalId.value="";el.form.reset();el.active.checked=true;el.isNew.checked=false;el.formTitle.textContent="Adicionar nova moldura";el.cancelEdit.hidden=true;el.preview.innerHTML="Prévia da imagem";el.fileHint.textContent="Obrigatório para uma nova moldura.";updateDestination();}
  function updateDestination(){const id=slugify(el.id.value||el.name.value);const ext=(el.file.files[0]?.name.split(".").pop()||"png").toLowerCase();el.destination.textContent=id?`${IMAGE_DIR}/${id}.${ext}`:`${IMAGE_DIR}/identificador.png`;}
  function categoryFromInput(name){
    const clean=String(name).trim(); let cat=state.categorias.find(c=>c.nome.toLowerCase()===clean.toLowerCase());
    if(!cat){cat={id:slugify(clean)||`categoria-${state.categorias.length+1}`,nome:clean,ordem:state.categorias.length+1,ativo:true};state.categorias.push(cat);} return cat;
  }

  el.formConnect.addEventListener("submit",async e=>{e.preventDefault();state.owner=el.owner.value.trim();state.repo=el.repo.value.trim();state.branch=el.branch.value.trim();state.token=el.token.value.trim();setBusy(true,"Conectando...");try{await load();flash("Dados carregados. O formato antigo será migrado ao salvar.","success");}catch(err){status("Erro","error");flash(err.message,"error");}finally{setBusy(false);if(!el.manager.hidden)status("Conectado","ok");}});
  el.toggleToken.addEventListener("click",()=>{el.token.type=el.token.type==="password"?"text":"password";el.toggleToken.textContent=el.token.type==="password"?"Mostrar":"Ocultar";});
  el.refresh.addEventListener("click",async()=>{if(state.dirty&&!confirm("Descartar alterações não salvas?"))return;setBusy(true);try{await load();flash("Lista atualizada.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}});
  el.search.addEventListener("input",()=>{renderCategories();renderFrames();});
  el.name.addEventListener("input",()=>{if(!state.editingId)el.id.value=slugify(el.name.value);updateDestination();}); el.id.addEventListener("input",updateDestination); el.file.addEventListener("change",()=>{updateDestination();const f=el.file.files[0];if(f){el.preview.innerHTML=`<img src="${URL.createObjectURL(f)}" alt="Prévia">`;}});
  el.cancelEdit.addEventListener("click",resetForm);

  el.form.addEventListener("submit",async e=>{e.preventDefault();const name=el.name.value.trim(),id=slugify(el.id.value),categoryName=el.category.value.trim(),file=el.file.files[0];if(!name||!id||!categoryName)return flash("Preencha nome, identificador e categoria.","error");const existing=state.molduras.find(f=>f.id===state.editingId);if(!existing&&!file)return flash("Escolha uma imagem.","error");if(state.molduras.some(f=>f.id===id&&f.id!==state.editingId))return flash("Identificador já utilizado.","error");setBusy(true,"Publicando...");try{const cat=categoryFromInput(categoryName);let path=existing?.arquivo;if(file){const ext=(file.name.split(".").pop()||"png").toLowerCase();path=`${IMAGE_DIR}/${id}.${ext}`;await uploadImage(file,path,`Atualiza imagem ${name}`);}const oldCat=existing?.categoriaId;if(existing){Object.assign(existing,{id,nome:name,categoriaId:cat.id,arquivo:path,ativo:el.active.checked,novo:el.isNew.checked});if(oldCat!==cat.id)existing.ordem=state.molduras.filter(f=>f.categoriaId===cat.id).length+1;}else state.molduras.push({id,nome:name,categoriaId:cat.id,ordem:state.molduras.filter(f=>f.categoriaId===cat.id).length+1,arquivo:path,ativo:el.active.checked,novo:el.isNew.checked});renumber();await saveConfig(`${existing?"Atualiza":"Adiciona"} moldura ${name}`);render();resetForm();flash("Moldura publicada.","success");}catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}});

  el.saveOrder.addEventListener("click",async()=>{setBusy(true,"Salvando ordenação...");try{renumber();await saveConfig("Atualiza ordem de categorias e molduras");render();flash("Ordenação salva e publicada.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}});
  el.cancelOrder.addEventListener("click",()=>{const data=JSON.parse(state.originalSnapshot);state.categorias=data.categorias;state.molduras=data.molduras;render();flash("Alterações descartadas.","info");});

  function applyCategoryOrder(orderedCategories) {
    orderedCategories.forEach((category, index) => {
      category.ordem = index + 1;
    });
    state.categorias = orderedCategories;
    render();
  }

  function moveCategory(id, delta) {
    const ordered = [...state.categorias].sort((a, b) => a.ordem - b.ordem);
    const currentIndex = ordered.findIndex(category => category.id === id);
    const targetIndex = currentIndex + delta;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;

    const [moved] = ordered.splice(currentIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    applyCategoryOrder(ordered);
  }
  function moveFrame(id,delta){const f=state.molduras.find(x=>x.id===id);if(!f)return;const a=state.molduras.filter(x=>x.categoriaId===f.categoriaId).sort((x,y)=>x.ordem-y.ordem),i=a.findIndex(x=>x.id===id),j=i+delta;if(i<0||j<0||j>=a.length)return;const oi=a[i].ordem;a[i].ordem=a[j].ordem;a[j].ordem=oi;renumber();render();}

  el.categories.addEventListener("click",e=>{const b=e.target.closest("button[data-category-action]");if(!b)return;const id=b.closest(".category-order-row")?.dataset.category,action=b.dataset.categoryAction,cat=state.categorias.find(c=>c.id===id);if(!cat)return;if(action==="up"||action==="down")return moveCategory(id,action==="up"?-1:1);if(action==="rename"){const name=prompt("Novo nome da categoria:",cat.nome)?.trim();if(name){cat.nome=name;render();}}if(action==="delete"){const used=state.molduras.filter(f=>f.categoriaId===id);if(used.length)return flash("Mova ou exclua as molduras desta categoria antes de apagá-la.","error");if(confirm(`Excluir a categoria “${cat.nome}”?`)){state.categorias=state.categorias.filter(c=>c.id!==id);render();}}});
  el.categories.addEventListener("dragstart",e=>{const row=e.target.closest(".category-order-row");if(!row||el.search.value.trim())return e.preventDefault();state.draggedCategory=row.dataset.category;row.classList.add("dragging");});
  el.categories.addEventListener("dragover",e=>{if(state.draggedCategory){e.preventDefault();e.target.closest(".category-order-row")?.classList.add("drag-over");}});
  el.categories.addEventListener("drop", e => {
    e.preventDefault();
    const targetId = e.target.closest(".category-order-row")?.dataset.category;

    if (targetId && targetId !== state.draggedCategory) {
      const ordered = [...state.categorias].sort((a, b) => a.ordem - b.ordem);
      const fromIndex = ordered.findIndex(category => category.id === state.draggedCategory);
      const targetIndex = ordered.findIndex(category => category.id === targetId);

      if (fromIndex >= 0 && targetIndex >= 0) {
        const [moved] = ordered.splice(fromIndex, 1);
        ordered.splice(targetIndex, 0, moved);
        applyCategoryOrder(ordered);
      }
    }

    state.draggedCategory = null;
    el.categories.querySelectorAll(".dragging, .drag-over").forEach(row => {
      row.classList.remove("dragging", "drag-over");
    });
  });

  el.categories.addEventListener("dragend", () => {
    state.draggedCategory = null;
    el.categories.querySelectorAll(".dragging, .drag-over").forEach(row => {
      row.classList.remove("dragging", "drag-over");
    });
  });

  el.list.addEventListener("click",async e=>{const b=e.target.closest("button[data-action]");if(!b)return;const id=b.closest(".frame-row")?.dataset.id,f=state.molduras.find(x=>x.id===id);if(!f)return;const action=b.dataset.action;if(action==="up"||action==="down")return moveFrame(id,action==="up"?-1:1);if(action==="edit"){state.editingId=id;el.originalId.value=id;el.name.value=f.nome;el.id.value=f.id;el.category.value=catName(f.categoriaId);el.active.checked=f.ativo!==false;el.isNew.checked=f.novo===true;el.formTitle.textContent=`Editar: ${f.nome}`;el.cancelEdit.hidden=false;el.fileHint.textContent="Opcional: escolha apenas para substituir a imagem.";el.preview.innerHTML=`<img src="${esc(f.arquivo)}" alt="Prévia">`;updateDestination();el.form.scrollIntoView({behavior:"smooth"});return;}if(action==="toggle"){f.ativo=f.ativo===false;setBusy(true,"Publicando...");try{await saveConfig(`${f.ativo?"Exibe":"Oculta"} moldura ${f.nome}`);render();flash("Visibilidade atualizada.","success");}catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}return;}if(action==="delete"){state.pendingDelete=f;el.confirmText.textContent=`A moldura “${f.nome}” será removida.`;el.dialog.showModal();}});
  el.list.addEventListener("dragstart",e=>{const row=e.target.closest(".frame-row");if(!row||el.search.value.trim())return e.preventDefault();state.draggedFrame=row.dataset.id;row.classList.add("dragging");});
  el.list.addEventListener("dragover",e=>{if(state.draggedFrame)e.preventDefault();});
  el.list.addEventListener("drop",e=>{e.preventDefault();const target=e.target.closest(".frame-row")?.dataset.id,from=state.molduras.find(f=>f.id===state.draggedFrame),to=state.molduras.find(f=>f.id===target);if(from&&to&&from.categoriaId===to.categoriaId&&from.id!==to.id){const a=state.molduras.filter(f=>f.categoriaId===from.categoriaId).sort((x,y)=>x.ordem-y.ordem),fi=a.findIndex(f=>f.id===from.id),ti=a.findIndex(f=>f.id===to.id),[item]=a.splice(fi,1);a.splice(ti,0,item);a.forEach((f,i)=>f.ordem=i+1);render();}state.draggedFrame=null;});

  el.dialog.addEventListener("close",async()=>{if(el.dialog.returnValue!=="confirm"||!state.pendingDelete)return;const f=state.pendingDelete;state.pendingDelete=null;setBusy(true,"Removendo...");try{state.molduras=state.molduras.filter(x=>x.id!==f.id);renumber();await saveConfig(`Remove moldura ${f.nome}`);if(el.deleteFile.checked)await removeImage(f.arquivo,`Remove imagem ${f.nome}`);render();resetForm();flash("Moldura removida.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}});

  updateDestination();
})();
