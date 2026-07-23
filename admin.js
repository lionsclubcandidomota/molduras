(() => {
  "use strict";

  const API_VERSION = "2022-11-28";
  const CONFIG_PATH = "molduras.js";
  const IMAGE_DIR = "assets/molduras";
  const MAX_RETRIES = 8;

  const state = {
    owner: "", repo: "", branch: "main", token: "",
    categorias: [], molduras: [], configuracoes: {}, originalSnapshot: "",
    busy: false, dirty: false, editingId: "", pendingDelete: null, intentionalNavigation: false,
    draggedCategory: null, draggedFrame: null,
    collapsedCategories: new Set(), selectedIds: new Set(), bulkFiles: [],
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    formConnect: $("connectionForm"), owner: $("repoOwner"), repo: $("repoName"), branch: $("repoBranch"), token: $("githubToken"),
    toggleToken: $("toggleToken"), connect: $("connectBtn"), status: $("connectionStatus"), manager: $("managerCard"), refresh: $("refreshBtn"),
    flash: $("flashMessage"), form: $("frameForm"), originalId: $("editingOriginalId"), formTitle: $("formTitle"), cancelEdit: $("cancelEditBtn"),
    name: $("frameName"), id: $("frameId"), category: $("frameCategory"), categoryList: $("categoryList"), file: $("frameFile"),
    fileHint: $("fileHint"), active: $("frameActive"), frameStatus: $("frameStatus"), preview: $("filePreview"), destination: $("destinationPath"), save: $("saveFrameBtn"),
    list: $("framesList"), count: $("frameCount"), search: $("adminSearch"), saveOrder: $("saveOrderBtn"), cancelOrder: $("cancelOrderBtn"),
    notice: $("orderNotice"), summaryTotal: $("summaryTotal"), summaryVisible: $("summaryVisible"), summaryHighlights: $("summaryHighlights"), summaryCategories: $("summaryCategories"), categories: $("categoriesOrderList"), dialog: $("confirmDialog"), confirmText: $("confirmText"), deleteFile: $("deleteImageFile"), confirmDelete: $("confirmDeleteBtn"),
    expandAll: $("expandAllCategoriesBtn"), collapseAll: $("collapseAllCategoriesBtn"),
    categoryManagerPanel: $("categoryManagerPanel"), categoryManagerToggle: $("categoryManagerToggle"), categoryManagerSummary: $("categoryManagerSummary"),
    editorToggle: $("editorToggleBtn"), editorModeHint: $("editorModeHint"), generateId: $("generateIdBtn"),
    bulkFiles: $("bulkFiles"), bulkCategory: $("bulkCategory"), bulkStatus: $("bulkStatus"), bulkActive: $("bulkActive"), bulkReview: $("bulkReview"), clearBulk: $("clearBulkBtn"), publishBulk: $("publishBulkBtn"),
    bulkBar: $("bulkActionBar"), bulkSelectedCount: $("bulkSelectedCount"), bulkAction: $("bulkActionSelect"), bulkMoveCategory: $("bulkMoveCategory"), applyBulk: $("applyBulkActionBtn"), clearSelection: $("clearSelectionBtn"),
    returnToSite: $("returnToSiteBtn"), quickNav: $("adminQuickNav"), scrollTop: $("scrollTopBtn"), clearSearch: $("clearSearchBtn"),
    bulkUploadPanel: $("bulkUploadPanel"), bulkUploadToggle: $("bulkUploadToggle"), bulkUploadSummary: $("bulkUploadSummary"),
    busyOverlay: $("pageBusyOverlay"), busyText: $("pageBusyText"),
    singleModeBtn: $("singleModeBtn"), bulkModeBtn: $("bulkModeBtn"), singleModeContainer: $("singleModeContainer"), bulkModeContainer: $("bulkModeContainer"),
    diagnoseBtn: $("diagnoseBtn"), exportBackupBtn: $("exportBackupBtn"), importBackupInput: $("importBackupInput"), historyBtn: $("historyBtn"), utilityResult: $("utilityResult"),
    pendingBar: $("pendingChangesBar"), publishPending: $("publishPendingBtn"), discardPending: $("discardPendingBtn"), editorBackdrop: $("editorBackdrop"),
    nameError: $("frameNameError"), idError: $("frameIdError"), categoryError: $("frameCategoryError"),
    framePublishAt: $("framePublishAt"), frameHideAt: $("frameHideAt"), bulkPublishAt: $("bulkPublishAt"), bulkHideAt: $("bulkHideAt"),
    managementToggle: $("managementToggle"), managementBody: $("managementBody"), newDurationValue: $("newDurationValue"), newDurationUnit: $("newDurationUnit"), updatedDurationValue: $("updatedDurationValue"), updatedDurationUnit: $("updatedDurationUnit"), saveManagement: $("saveManagementBtn"),
  };

  class GitHubError extends Error { constructor(message, status = 0) { super(message); this.status = status; } }
  const slugify = (v) => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const esc = (v) => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  function flash(message, type = "info") { el.flash.textContent = message; el.flash.className = `flash ${type}`; el.flash.hidden = false; if(type==="success") recordActivity(message); }
  function recordActivity(message){try{const key="lions-admin-history";const list=JSON.parse(localStorage.getItem(key)||"[]");list.unshift({message,date:new Date().toLocaleString("pt-BR")});localStorage.setItem(key,JSON.stringify(list.slice(0,30)));}catch{}}
  function status(message, type = "neutral") { el.status.textContent = message; el.status.className = `status ${type}`; }
  function setPanelOpen(panel, button, open, storageKey) {
    if (!panel || !button) return;
    panel.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch {}
  }
  function getStoredPanelState(key, fallback = true) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : value === "1"; } catch { return fallback; }
  }
  function setBusy(value, message = "Sincronizando...") {
    state.busy = value;
    [el.connect, el.refresh, el.save, el.confirmDelete, el.saveOrder, el.cancelOrder, el.publishBulk, el.applyBulk].forEach(x => { if (x) x.disabled = value; });
    if (value) status(message);
    if (el.busyOverlay) el.busyOverlay.hidden = !value;
    if (el.busyText && value) el.busyText.textContent = message;
    updateDirtyUI();
  }

  function apiUrl(path) {
    const [pathname, query = ""] = path.split("?");
    const encoded = pathname.split("/").map(encodeURIComponent).join("/");
    const base = `https://api.github.com/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${encoded}`;
    return query ? `${base}?${query}` : base;
  }
  async function api(path, options = {}) {
    const response = await fetch(apiUrl(path), { ...options, cache: "no-store", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${state.token}`, "X-GitHub-Api-Version": API_VERSION, ...(options.headers || {}) } });
    let data = null; try { data = await response.json(); } catch {}
    if (!response.ok) {
      const details = data?.message || `Erro ${response.status}`;
      console.error("[Lions Admin] Erro da API GitHub", { status: response.status, path, details, response: data });
      throw new GitHubError(details, response.status);
    }
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
      const legacyStatus = f.status || (f.novo===true ? "novo" : "normal");
      return { id:String(f.id||`moldura-${index+1}`), nome:String(f.nome||f.id||"Moldura"), categoriaId, ordem:Number.isFinite(Number(f.ordem))?Number(f.ordem):n, arquivo:f.arquivo, ativo:f.ativo!==false, status:["novo","atualizada"].includes(legacyStatus) && f.statusVisivel!==false ? legacyStatus : "normal", statusVisivel:f.statusVisivel!==false };
    });
    renumber(categorias, molduras);
    const configMatch = source.match(/window\.CONFIGURACOES\s*=\s*([\s\S]*?);\s*(?:window\.|$)/);
    let configuracoes = {};
    if (configMatch) { try { configuracoes = JSON.parse(configMatch[1]); } catch {} }
    configuracoes = { duracaoNovo:{valor:7,unidade:"dias"}, duracaoAtualizada:{valor:7,unidade:"dias"}, ...configuracoes };
    return { categorias, molduras, configuracoes };
  }

  function serialize(categorias, molduras, configuracoes = state.configuracoes) {
    return `// Gerenciado pelo Painel de Molduras Lions v48\nwindow.CONFIGURACOES = ${JSON.stringify(configuracoes, null, 2)};\n\nwindow.CATEGORIAS = ${JSON.stringify(categorias, null, 2)};\n\nwindow.MOLDURAS = ${JSON.stringify(molduras, null, 2)};\n`;
  }
  function renumber(categorias = state.categorias, molduras = state.molduras) {
    categorias.sort((a,b)=>a.ordem-b.ordem).forEach((c,i)=>c.ordem=i+1);
    for (const cat of categorias) molduras.filter(f=>f.categoriaId===cat.id).sort((a,b)=>a.ordem-b.ordem).forEach((f,i)=>f.ordem=i+1);
  }
  function snapshot() { return JSON.stringify({categorias:state.categorias,molduras:state.molduras,configuracoes:state.configuracoes}); }
  function markDirty() { state.dirty = snapshot() !== state.originalSnapshot; updateDirtyUI(); }
  function updateDirtyUI() {
    if (el.saveOrder) el.saveOrder.disabled = state.busy || !state.dirty;
    if (el.cancelOrder) el.cancelOrder.disabled = state.busy || !state.dirty;
    if (el.notice) el.notice.hidden = !state.dirty;
    if (el.pendingBar) el.pendingBar.hidden = !state.dirty;
    if (el.publishPending) el.publishPending.disabled = state.busy || !state.dirty;
    if (el.discardPending) el.discardPending.disabled = state.busy || !state.dirty;
  }

  async function getFile(path) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return api(`${path}?ref=${encodeURIComponent(state.branch)}&_=${encodeURIComponent(nonce)}`);
  }
  async function putFile(path, content, message, sha) { return api(path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,content,branch:state.branch,...(sha?{sha}:{})})}); }
  async function deleteFile(path,message,sha){ return api(path,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({message,sha,branch:state.branch})}); }

  let configSaveQueue = Promise.resolve();

  function saveConfig(message) {
    const content = textToB64(serialize(state.categorias, state.molduras, state.configuracoes));
    const savedSnapshot = snapshot();

    const operation = async () => {
      let last;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // O SHA é buscado imediatamente antes de cada PUT, sem cache.
          const latest = await getFile(CONFIG_PATH);
          await putFile(CONFIG_PATH, content, message, latest.sha);
          state.originalSnapshot = savedSnapshot;
          state.dirty = snapshot() !== savedSnapshot;
          updateDirtyUI();
          return;
        } catch (e) {
          last = e;
          if (!isConflict(e) || attempt === MAX_RETRIES) throw e;
          // Aguarda a API do GitHub refletir o commit mais recente e tenta novamente.
          await wait(Math.min(5000, 450 * attempt));
        }
      }
      throw last;
    };

    // Serializa alterações para impedir dois PUTs simultâneos usando o mesmo SHA.
    const queued = configSaveQueue.then(operation, operation);
    configSaveQueue = queued.catch(() => {});
    return queued;
  }
  async function uploadImage(file,path,message){
    let sha; try{sha=(await getFile(path)).sha;}catch(e){if(e.status!==404)throw e;}
    return putFile(path,bufferToB64(await file.arrayBuffer()),message,sha);
  }
  async function removeImage(path,message){ try{const f=await getFile(path); await deleteFile(path,message,f.sha);}catch(e){if(e.status!==404)throw e;} }

  function catName(id){ return state.categorias.find(c=>c.id===id)?.nome || "Sem categoria"; }
  function frameStatus(f){ return f?.statusVisivel===false ? "normal" : (["novo","atualizada"].includes(f?.status) ? f.status : "normal"); }
  function categoryStatus(id){
    const frames=state.molduras.filter(f=>f.categoriaId===id && f.ativo!==false);
    if(frames.some(f=>frameStatus(f)==="novo")) return "novo";
    if(frames.some(f=>frameStatus(f)==="atualizada")) return "atualizada";
    return "normal";
  }
  function statusLabel(value){ return value==="novo"?"Novo":value==="atualizada"?"Atualizada":"Sem destaque"; }
  const COLLAPSE_STORAGE_KEY = "lions-admin-categorias-contraidas-v1";
  function loadCollapsedCategories(){
    try{
      const saved=JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY)||"[]");
      state.collapsedCategories=new Set(Array.isArray(saved)?saved:[]);
    }catch{ state.collapsedCategories=new Set(); }
  }
  function saveCollapsedCategories(){
    try{ localStorage.setItem(COLLAPSE_STORAGE_KEY,JSON.stringify([...state.collapsedCategories])); }catch{}
  }
  function setCategoryCollapsed(id,collapsed){
    if(collapsed) state.collapsedCategories.add(id); else state.collapsedCategories.delete(id);
    saveCollapsedCategories();
  }
  function displayNameFromFile(filename){
    const base=String(filename).replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
    return base.replace(/\b\w/g,c=>c.toUpperCase()) || 'Moldura';
  }
  function extensionFromFile(file){
    const match=String(file?.name||'').match(/\.([a-zA-Z0-9]+)$/);
    return (match?.[1]||'png').toLowerCase();
  }
  function updateBulkBar(){
    const count=state.selectedIds.size;
    if(el.bulkBar) el.bulkBar.hidden=count===0;
    if(el.bulkSelectedCount) el.bulkSelectedCount.textContent=`${count} moldura${count===1?'':'s'} selecionada${count===1?'':'s'}`;
  }
  function clearSelection(){ state.selectedIds.clear(); updateBulkBar(); renderFrames(); }
  function renderBulkReview(){
    if(!el.bulkReview)return;
    if(!state.bulkFiles.length){el.bulkReview.hidden=true;el.bulkReview.innerHTML='';el.clearBulk.disabled=true;el.publishBulk.disabled=true;return;}
    el.bulkReview.hidden=false;el.clearBulk.disabled=false;el.publishBulk.disabled=false;
    el.bulkReview.innerHTML=`<table><thead><tr><th>Prévia</th><th>Arquivo</th><th>Nome exibido</th><th>Identificador</th><th>Destino</th><th></th></tr></thead><tbody>${state.bulkFiles.map((item,i)=>`<tr data-bulk-index="${i}"><td><img src="${esc(item.url)}" alt=""></td><td>${esc(item.file.name)}</td><td><input data-bulk-field="name" value="${esc(item.name)}"></td><td><input data-bulk-field="id" value="${esc(item.id)}" pattern="[a-z0-9-]+"></td><td><code>${esc(`${IMAGE_DIR}/${item.id}.${item.ext}`)}</code></td><td><button class="button danger" type="button" data-bulk-remove="${i}">Remover</button></td></tr>`).join('')}</tbody></table>`;
  }
  function renderSummary(){
    if(el.summaryTotal) el.summaryTotal.textContent=state.molduras.length;
    if(el.summaryVisible) el.summaryVisible.textContent=state.molduras.filter(f=>f.ativo!==false).length;
    if(el.summaryHighlights) el.summaryHighlights.textContent=state.molduras.filter(f=>frameStatus(f)!=="normal").length;
    if(el.summaryCategories) el.summaryCategories.textContent=state.categorias.length;
  }
  function renderCategoryOptions(){
    el.categoryList.innerHTML=state.categorias.sort((a,b)=>a.ordem-b.ordem).map(c=>`<option value="${esc(c.nome)}"></option>`).join("");
  }
  function renderCategories(){
    if (el.categoryManagerSummary) el.categoryManagerSummary.textContent = `${state.categorias.length} ${state.categorias.length === 1 ? "categoria" : "categorias"}`;
    const q=el.search.value.trim();
    el.categories.innerHTML=state.categorias.sort((a,b)=>a.ordem-b.ordem).map((c,index)=>{
      const catStatus=categoryStatus(c.id);
      const statusBadge=catStatus!=="normal"?`<span class="badge ${catStatus}">${statusLabel(catStatus)}</span>`:"";
      return `<div class="category-order-row" draggable="${!q}" data-category="${esc(c.id)}">
        <div class="category-order-controls"><button type="button" class="category-drag-handle drag-handle" title="Arrastar categoria" aria-label="Arrastar categoria"><svg class="drag-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M5 10h10M5 14h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button><span class="category-order-number">${index+1}</span><button type="button" class="category-order-arrow" data-category-action="up" ${index===0?"disabled":""}>↑</button><button type="button" class="category-order-arrow" data-category-action="down" ${index===state.categorias.length-1?"disabled":""}>↓</button></div>
        <div class="category-main"><div class="category-name-line"><div class="category-name">${esc(c.nome)}</div>${statusBadge}</div><div class="category-count">${state.molduras.filter(f=>f.categoriaId===c.id).length} moldura(s)</div></div>
        <div class="row-actions"><button type="button" class="button light" data-category-action="clear-status" ${catStatus==="normal"?"disabled":""}>Limpar destaques</button><button type="button" class="button light" data-category-action="rename">Renomear</button><button type="button" class="button danger" data-category-action="delete">Excluir</button></div>
      </div>`;
    }).join("");
  }
  function renderFrames(){
    const q=el.search.value.toLowerCase().trim(); let total=0; let html="";
    for(const cat of state.categorias.sort((a,b)=>a.ordem-b.ordem)){
      const allFrames=state.molduras.filter(f=>f.categoriaId===cat.id).sort((a,b)=>a.ordem-b.ordem);
      const frames=allFrames.filter(f=>!q||`${f.nome} ${f.id} ${cat.nome}`.toLowerCase().includes(q));
      if(!frames.length)continue;
      const forcedOpen=Boolean(q);
      const isOpen=forcedOpen || !state.collapsedCategories.has(cat.id);
      const catStatus=categoryStatus(cat.id);
      const statusBadge=catStatus!=="normal"?`<span class="badge ${catStatus}">${statusLabel(catStatus)}</span>`:"";
      total+=frames.length;
      html+=`<section class="category-accordion ${isOpen?"is-open":""}" data-accordion-category="${esc(cat.id)}">
        <div class="category-accordion-header">
          <button class="category-accordion-toggle" type="button" data-action="toggle-category" aria-expanded="${isOpen}" aria-controls="category-body-${esc(cat.id)}">
            <span class="category-chevron" aria-hidden="true">›</span>
            <span class="category-title-copy"><strong>${esc(cat.nome)}</strong><small>${allFrames.length} moldura(s)${q&&frames.length!==allFrames.length?` · ${frames.length} encontrada(s)`:""}</small></span>
          </button>
          <div class="category-accordion-meta">
            <label class="category-select-all"><input type="checkbox" data-select-category="${esc(cat.id)}" ${frames.every(f=>state.selectedIds.has(f.id))?"checked":""}><span>Selecionar</span></label>
            ${q?`<span class="search-active-note">Resultado da busca</span>`:""}${statusBadge}<span class="category-count-pill">${frames.length}</span>
          </div>
        </div>
        <div id="category-body-${esc(cat.id)}" class="category-accordion-body" ${isOpen?"":"hidden"}>`;
      frames.forEach((f,index)=>{const st=frameStatus(f);html+=`<article class="frame-row ${state.selectedIds.has(f.id)?"is-selected":""}" draggable="${!q&&!state.selectedIds.size}" data-id="${esc(f.id)}" data-category="${esc(cat.id)}">
        <label class="frame-select-wrap"><input class="frame-select" type="checkbox" data-select-frame="${esc(f.id)}" ${state.selectedIds.has(f.id)?"checked":""} aria-label="Selecionar ${esc(f.nome)}"></label><div class="order-controls"><button type="button" class="drag-handle" data-action="drag" title="Arrastar moldura" aria-label="Arrastar moldura"><svg class="drag-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M5 10h10M5 14h10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button><span class="order-number">${f.ordem}</span><button type="button" class="order-arrow" data-action="up" ${f.ordem===1?"disabled":""}>↑</button><button type="button" class="order-arrow" data-action="down" ${f.ordem===allFrames.length?"disabled":""}>↓</button></div>
        <img class="frame-thumb" src="${esc(f.arquivo)}?v=${Date.now()}" alt=""><div class="frame-info"><h4>${esc(f.nome)}</h4><p>${esc(f.id)} · ordem ${f.ordem}</p><div class="badges"><span class="badge ${f.ativo!==false?"active":"inactive"}">${f.ativo!==false?"Visível":"Oculta"}</span>${st!=="normal"?`<span class="badge ${st}">${statusLabel(st)}</span>`:""}</div></div>
        <div class="row-actions frame-actions"><button class="button light" data-action="edit">Editar</button><button class="button light" data-action="status-menu">Destaque</button><button class="button light" data-action="toggle">${f.ativo!==false?"Ocultar":"Exibir"}</button><button class="button danger" data-action="delete">Excluir</button></div></article>`;});
      html+=`</div></section>`;
    }
    el.list.innerHTML=html||'<p class="category-empty">Nenhuma moldura encontrada.</p>'; el.count.textContent=`${total} moldura(s)`; updateBulkBar();
  }
  function render(){renumber();renderCategoryOptions();renderCategories();renderFrames();renderSummary();markDirty();}

  async function load(){
    const file=await getFile(CONFIG_PATH); const data=normalizeData(b64ToText(file.content)); state.categorias=data.categorias; state.molduras=data.molduras; state.configuracoes=data.configuracoes || {}; fillManagementForm(); state.originalSnapshot=snapshot(); state.dirty=false; state.selectedIds.clear(); loadCollapsedCategories(); render(); el.manager.hidden=false;if(el.quickNav)el.quickNav.hidden=false; status("Conectado","ok");
  }
  const localDateTime = value => { if(!value)return ""; const d=new Date(value); if(Number.isNaN(d.getTime()))return ""; const z=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
  const isoOrEmpty = value => value ? new Date(value).toISOString() : "";
  const addDuration = (status) => { const cfg=status==="novo"?state.configuracoes.duracaoNovo:state.configuracoes.duracaoAtualizada; const amount=Math.max(1,Number(cfg?.valor)||7); return new Date(Date.now()+amount*(cfg?.unidade==="horas"?3600000:86400000)).toISOString(); };
  function applyStatusTiming(target,status){ target.status=status; target.statusVisivel=status!=="normal"; if(status==="normal"){delete target.statusDesde;delete target.statusAte;}else{target.statusDesde=new Date().toISOString();target.statusAte=addDuration(status);} }
  function fillManagementForm(){ const c=state.configuracoes||{}; if(el.newDurationValue)el.newDurationValue.value=c.duracaoNovo?.valor||7; if(el.newDurationUnit)el.newDurationUnit.value=c.duracaoNovo?.unidade||"dias"; if(el.updatedDurationValue)el.updatedDurationValue.value=c.duracaoAtualizada?.valor||7; if(el.updatedDurationUnit)el.updatedDurationUnit.value=c.duracaoAtualizada?.unidade||"dias"; }
  function resetForm(){document.body.classList.remove("editor-drawer-open");if(el.editorBackdrop)el.editorBackdrop.hidden=true;state.editingId="";el.originalId.value="";el.form.reset();el.active.checked=true;el.frameStatus.value="novo";if(el.framePublishAt)el.framePublishAt.value="";if(el.frameHideAt)el.frameHideAt.value="";el.formTitle.textContent="Adicionar nova moldura";el.cancelEdit.hidden=true;el.preview.innerHTML="Prévia da imagem";el.fileHint.textContent="Obrigatório para uma nova moldura.";updateDestination();}
  function updateDestination(){const id=slugify(el.id.value||el.name.value);const ext=(el.file.files[0]?.name.split(".").pop()||"png").toLowerCase();el.destination.textContent=id?`${IMAGE_DIR}/${id}.${ext}`:`${IMAGE_DIR}/identificador.png`;}
  function categoryFromInput(name){
    const clean=String(name).trim(); let cat=state.categorias.find(c=>c.nome.toLowerCase()===clean.toLowerCase());
    if(!cat){cat={id:slugify(clean)||`categoria-${state.categorias.length+1}`,nome:clean,ordem:state.categorias.length+1,ativo:true};state.categorias.push(cat);} return cat;
  }

  function setFieldError(input, output, message){ if(!input||!output)return; output.textContent=message||""; input.classList.toggle("is-invalid",Boolean(message)); input.setAttribute("aria-invalid",String(Boolean(message))); }
  function validateFrameForm(){
    const name=el.name.value.trim(), id=slugify(el.id.value), category=el.category.value.trim();
    const duplicate=state.molduras.some(f=>f.id===id && f.id!==state.editingId);
    setFieldError(el.name,el.nameError,name.length<3?"Informe um nome com pelo menos 3 caracteres.":"");
    setFieldError(el.id,el.idError,!id?"Informe um identificador.":duplicate?"Este identificador já está sendo usado.":el.id.value!==id?"Use apenas letras minúsculas, números e hífens.":"");
    setFieldError(el.category,el.categoryError,!category?"Escolha ou informe uma categoria.":"");
    const valid=name.length>=3 && id && !duplicate && el.id.value===id && category;
    if(el.save)el.save.disabled=state.busy||!valid;
    return Boolean(valid);
  }
  [el.name,el.id,el.category].forEach(input=>input?.addEventListener("input",validateFrameForm));

  el.formConnect.addEventListener("submit",async e=>{e.preventDefault();state.owner=el.owner.value.trim();state.repo=el.repo.value.trim();state.branch=el.branch.value.trim();state.token=el.token.value.trim();setBusy(true,"Conectando...");try{await load();flash("Dados carregados. O formato antigo será migrado ao salvar.","success");}catch(err){console.error("[Lions Admin] Falha ao conectar",err);status("Erro","error");let message=err?.message||"Não foi possível conectar ao GitHub.";if(err?.status===401)message="Token inválido, expirado ou sem autorização.";else if(err?.status===403)message="Acesso negado. Verifique as permissões do token e o acesso ao repositório.";else if(err?.status===404)message="Repositório, branch ou arquivo molduras.js não encontrado. Confira proprietário, repositório e branch.";flash(message,"error");}finally{setBusy(false);if(!el.manager.hidden)status("Conectado","ok");}});
  el.toggleToken.addEventListener("click",()=>{el.token.type=el.token.type==="password"?"text":"password";el.toggleToken.textContent=el.token.type==="password"?"Mostrar":"Ocultar";});
  el.refresh.addEventListener("click",async()=>{if(state.dirty&&!confirm("Descartar alterações não salvas?"))return;setBusy(true);try{await load();flash("Lista atualizada.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}});
  el.search.addEventListener("input",()=>{if(el.clearSearch)el.clearSearch.hidden=!el.search.value;renderCategories();renderFrames();});
  if(el.clearSearch)el.clearSearch.addEventListener("click",()=>{el.search.value="";el.clearSearch.hidden=true;renderCategories();renderFrames();el.search.focus();});
  el.expandAll?.addEventListener("click",()=>{state.collapsedCategories.clear();saveCollapsedCategories();renderFrames();});
  el.collapseAll?.addEventListener("click",()=>{state.collapsedCategories=new Set(state.categorias.map(c=>c.id));saveCollapsedCategories();renderFrames();});
  el.name.addEventListener("input",()=>{if(!state.editingId)el.id.value=slugify(el.name.value);updateDestination();}); el.id.addEventListener("input",updateDestination); el.file.addEventListener("change",()=>{updateDestination();const f=el.file.files[0];if(f){el.preview.innerHTML=`<img src="${URL.createObjectURL(f)}" alt="Prévia">`;}});
  el.cancelEdit.addEventListener("click",resetForm);

  el.bulkFiles?.addEventListener("change",()=>{
    state.bulkFiles=[...el.bulkFiles.files].map(file=>{const ext=extensionFromFile(file),name=displayNameFromFile(file.name),id=slugify(name);return{file,ext,name,id,url:URL.createObjectURL(file)};});
    renderBulkReview();
  });
  el.bulkReview?.addEventListener("input",e=>{
    const row=e.target.closest("tr[data-bulk-index]");if(!row)return;const item=state.bulkFiles[Number(row.dataset.bulkIndex)];if(!item)return;
    if(e.target.dataset.bulkField==="name")item.name=e.target.value;
    if(e.target.dataset.bulkField==="id")item.id=slugify(e.target.value);
    const code=row.querySelector("code");if(code)code.textContent=`${IMAGE_DIR}/${item.id}.${item.ext}`;
  });
  el.bulkReview?.addEventListener("click",e=>{const b=e.target.closest("button[data-bulk-remove]");if(!b)return;const i=Number(b.dataset.bulkRemove);URL.revokeObjectURL(state.bulkFiles[i]?.url);state.bulkFiles.splice(i,1);renderBulkReview();});
  el.clearBulk?.addEventListener("click",()=>{state.bulkFiles.forEach(x=>URL.revokeObjectURL(x.url));state.bulkFiles=[];el.bulkFiles.value="";renderBulkReview();});
  el.publishBulk?.addEventListener("click",async()=>{
    const categoryName=el.bulkCategory.value.trim();if(!categoryName)return flash("Escolha a categoria das molduras em lote.","error");
    if(!state.bulkFiles.length)return flash("Selecione pelo menos um arquivo.","error");
    const invalid=state.bulkFiles.find(x=>!x.name.trim()||!slugify(x.id));if(invalid)return flash("Revise os nomes e identificadores.","error");
    const ids=state.bulkFiles.map(x=>slugify(x.id));if(new Set(ids).size!==ids.length)return flash("Existem identificadores repetidos na seleção.","error");
    if(ids.some(id=>state.molduras.some(f=>f.id===id)))return flash("Um ou mais identificadores já estão cadastrados.","error");
    setBusy(true,`Enviando ${state.bulkFiles.length} molduras...`);
    try{
      const cat=categoryFromInput(categoryName),statusValue=["novo","atualizada"].includes(el.bulkStatus.value)?el.bulkStatus.value:"normal";
      let order=state.molduras.filter(f=>f.categoriaId===cat.id).length;
      for(let i=0;i<state.bulkFiles.length;i++){
        const item=state.bulkFiles[i],id=slugify(item.id),path=`${IMAGE_DIR}/${id}.${item.ext}`;
        status(`Enviando ${i+1} de ${state.bulkFiles.length}...`);
        await uploadImage(item.file,path,`Adiciona imagem ${item.name}`);
        const created={id,nome:item.name.trim(),categoriaId:cat.id,ordem:++order,arquivo:path,ativo:el.bulkActive.checked,publicarEm:isoOrEmpty(el.bulkPublishAt?.value),ocultarEm:isoOrEmpty(el.bulkHideAt?.value)};applyStatusTiming(created,statusValue);state.molduras.push(created);
      }
      renumber();await saveConfig(`Adiciona ${state.bulkFiles.length} molduras em lote`);render();el.clearBulk.click();flash("Molduras adicionadas e publicadas em lote.","success");
    }catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}
  });
  el.bulkAction?.addEventListener("change",()=>{el.bulkMoveCategory.hidden=el.bulkAction.value!=="move";});
  el.clearSelection?.addEventListener("click",clearSelection);
  el.applyBulk?.addEventListener("click",async()=>{
    const ids=[...state.selectedIds],action=el.bulkAction.value;if(!ids.length||!action)return flash("Selecione uma ação em lote.","error");
    const selected=state.molduras.filter(f=>state.selectedIds.has(f.id));
    if(!selected.length)return;
    if(action.startsWith("delete")&&!confirm(`Excluir ${selected.length} moldura(s)?${action==="delete-files"?" Os arquivos também serão apagados do repositório.":""}`))return;
    setBusy(true,"Aplicando manutenção em lote...");
    try{
      if(action==="move"){
        const name=el.bulkMoveCategory.value.trim();if(!name)throw new Error("Informe a categoria de destino.");const cat=categoryFromInput(name);let order=state.molduras.filter(f=>f.categoriaId===cat.id&&!state.selectedIds.has(f.id)).length;selected.forEach(f=>{f.categoriaId=cat.id;f.ordem=++order;});
      } else if(action.startsWith("status-")){
        const next=action.replace("status-","");selected.forEach(f=>{applyStatusTiming(f,next);});
      } else if(action==="show"||action==="hide") selected.forEach(f=>f.ativo=action==="show");
      else if(action==="delete-records"||action==="delete-files"){
        state.molduras=state.molduras.filter(f=>!state.selectedIds.has(f.id));
      }
      renumber();await saveConfig(`Manutenção em lote em ${selected.length} molduras`);
      if(action==="delete-files")for(let i=0;i<selected.length;i++){status(`Apagando arquivo ${i+1} de ${selected.length}...`);await removeImage(selected[i].arquivo,`Remove imagem ${selected[i].nome}`);}
      clearSelection();render();flash(`Operação aplicada a ${selected.length} moldura(s).`,"success");
    }catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}
  });

  el.form.addEventListener("submit",async e=>{
    e.preventDefault();
    const name=el.name.value.trim(),id=slugify(el.id.value),categoryName=el.category.value.trim(),file=el.file.files[0],selectedStatus=el.frameStatus.value;
    if(!name||!id||!categoryName)return flash("Preencha nome, identificador e categoria.","error");
    const existing=state.molduras.find(f=>f.id===state.editingId);
    if(!existing&&!file)return flash("Escolha uma imagem.","error");
    if(state.molduras.some(f=>f.id===id&&f.id!==state.editingId))return flash("Identificador já utilizado.","error");
    setBusy(true,"Publicando...");
    try{
      const cat=categoryFromInput(categoryName);let path=existing?.arquivo;
      if(file){const ext=(file.name.split(".").pop()||"png").toLowerCase();path=`${IMAGE_DIR}/${id}.${ext}`;await uploadImage(file,path,`Atualiza imagem ${name}`);}
      const oldCat=existing?.categoriaId;
      const statusValue=["novo","atualizada"].includes(selectedStatus)?selectedStatus:"normal";
      if(existing){Object.assign(existing,{id,nome:name,categoriaId:cat.id,arquivo:path,ativo:el.active.checked,publicarEm:isoOrEmpty(el.framePublishAt?.value),ocultarEm:isoOrEmpty(el.frameHideAt?.value)});applyStatusTiming(existing,statusValue);if(oldCat!==cat.id)existing.ordem=state.molduras.filter(f=>f.categoriaId===cat.id).length+1;}
      else { const created={id,nome:name,categoriaId:cat.id,ordem:state.molduras.filter(f=>f.categoriaId===cat.id).length+1,arquivo:path,ativo:el.active.checked,publicarEm:isoOrEmpty(el.framePublishAt?.value),ocultarEm:isoOrEmpty(el.frameHideAt?.value)};applyStatusTiming(created,statusValue);state.molduras.push(created); }
      renumber();await saveConfig(`${existing?"Atualiza":"Adiciona"} moldura ${name}`);render();resetForm();flash("Moldura publicada.","success");
    }catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}
  });

  el.saveOrder.addEventListener("click",async()=>{setBusy(true,"Salvando ordenação...");try{renumber();await saveConfig("Atualiza ordem de categorias e molduras");render();flash("Ordenação salva e publicada.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}});
  function discardPendingChanges() {
    if (!state.dirty || !state.originalSnapshot) return;
    if (!confirm("Descartar todas as alterações ainda não publicadas?")) return;
    const data = JSON.parse(state.originalSnapshot);
    state.categorias = data.categorias;
    state.molduras = data.molduras;
    state.configuracoes = data.configuracoes || state.configuracoes; fillManagementForm();
    state.selectedIds.clear();
    state.dirty = false;
    render();
    updateDirtyUI();
    flash("Alterações descartadas. A última versão carregada foi restaurada.", "info");
  }
  el.cancelOrder?.addEventListener("click", discardPendingChanges);

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

  el.categories.addEventListener("click",e=>{const b=e.target.closest("button[data-category-action]");if(!b)return;const id=b.closest(".category-order-row")?.dataset.category,action=b.dataset.categoryAction,cat=state.categorias.find(c=>c.id===id);if(!cat)return;if(action==="up"||action==="down")return moveCategory(id,action==="up"?-1:1);if(action==="clear-status"){const affected=state.molduras.filter(f=>f.categoriaId===id&&frameStatus(f)!=="normal");if(!affected.length)return;if(confirm(`Remover todos os destaques da categoria “${cat.nome}”?`)){affected.forEach(f=>{f.status="normal";f.statusVisivel=false;});setBusy(true,"Publicando...");saveConfig(`Remove destaques da categoria ${cat.nome}`).then(()=>{render();flash("Destaques da categoria removidos.","success");}).catch(e=>flash(e.message,"error")).finally(()=>{setBusy(false);status("Conectado","ok");});}return;}if(action==="rename"){const name=prompt("Novo nome da categoria:",cat.nome)?.trim();if(name){cat.nome=name;render();}}if(action==="delete"){const used=state.molduras.filter(f=>f.categoriaId===id);if(used.length)return flash("Mova ou exclua as molduras desta categoria antes de apagá-la.","error");if(confirm(`Excluir a categoria “${cat.nome}”?`)){state.categorias=state.categorias.filter(c=>c.id!==id);render();}}});
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

  el.list.addEventListener("change",e=>{
    const frameBox=e.target.closest("input[data-select-frame]");
    if(frameBox){if(frameBox.checked)state.selectedIds.add(frameBox.dataset.selectFrame);else state.selectedIds.delete(frameBox.dataset.selectFrame);renderFrames();return;}
    const catBox=e.target.closest("input[data-select-category]");
    if(catBox){const id=catBox.dataset.selectCategory;state.molduras.filter(f=>f.categoriaId===id).forEach(f=>catBox.checked?state.selectedIds.add(f.id):state.selectedIds.delete(f.id));renderFrames();}
  });

  el.list.addEventListener("click",async e=>{const b=e.target.closest("button[data-action]");if(!b)return;const action=b.dataset.action;
    if(action==="toggle-category"){
      if(el.search.value.trim())return;
      const section=b.closest(".category-accordion"),categoryId=section?.dataset.accordionCategory;
      if(!categoryId)return;
      const shouldCollapse=section.classList.contains("is-open");
      setCategoryCollapsed(categoryId,shouldCollapse);renderFrames();return;
    }
    const id=b.closest(".frame-row")?.dataset.id,f=state.molduras.find(x=>x.id===id);if(!f)return;if(action==="up"||action==="down")return moveFrame(id,action==="up"?-1:1);if(action==="edit"){setCreationMode("single", { scroll: false });state.editingId=id;el.originalId.value=id;el.name.value=f.nome;el.id.value=f.id;el.category.value=catName(f.categoriaId);el.active.checked=f.ativo!==false;el.frameStatus.value=frameStatus(f);if(el.framePublishAt)el.framePublishAt.value=localDateTime(f.publicarEm);if(el.frameHideAt)el.frameHideAt.value=localDateTime(f.ocultarEm);el.formTitle.textContent=`Editar: ${f.nome}`;el.cancelEdit.hidden=false;el.fileHint.textContent="Opcional: escolha apenas para substituir a imagem.";el.preview.innerHTML=`<img src="${esc(f.arquivo)}" alt="Prévia">`;el.form.classList.add("is-editing");document.body.classList.add("editor-drawer-open");if(el.editorBackdrop)el.editorBackdrop.hidden=false;validateFrameForm();if(el.editorModeHint){el.editorModeHint.hidden=false;el.editorModeHint.textContent="Editando moldura existente";}setPanelOpen(el.form,el.editorToggle,true,"lions-admin-editor-open");updateDestination();el.form.scrollIntoView({behavior:"smooth",block:"start"});setTimeout(()=>el.name.focus(),350);return;}if(action==="status-menu"){
      const current=frameStatus(f);
      const choice=prompt(`Destaque de “${f.nome}”:

Digite 1 para Novo
Digite 2 para Atualizada
Digite 0 para remover`,current==="novo"?"1":current==="atualizada"?"2":"0");
      if(choice===null)return;
      const next=choice.trim()==="1"?"novo":choice.trim()==="2"?"atualizada":"normal";
      applyStatusTiming(f,next);
      setBusy(true,"Publicando...");try{await saveConfig(`${next==="normal"?"Remove destaque":"Define destaque"} da moldura ${f.nome}`);render();flash(next==="normal"?"Destaque removido.":`Moldura marcada como ${statusLabel(next)}.`,"success");}catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}return;
    }if(action==="toggle"){f.ativo=f.ativo===false;setBusy(true,"Publicando...");try{await saveConfig(`${f.ativo?"Exibe":"Oculta"} moldura ${f.nome}`);render();flash("Visibilidade atualizada.","success");}catch(err){flash(err.message,"error");}finally{setBusy(false);status("Conectado","ok");}return;}if(action==="delete"){state.pendingDelete=f;el.confirmText.textContent=`A moldura “${f.nome}” será removida.`;el.dialog.showModal();}});
  el.list.addEventListener("dragstart",e=>{const row=e.target.closest(".frame-row");if(!row||el.search.value.trim())return e.preventDefault();state.draggedFrame=row.dataset.id;row.classList.add("dragging");});
  el.list.addEventListener("dragover",e=>{if(state.draggedFrame)e.preventDefault();});
  el.list.addEventListener("drop",e=>{e.preventDefault();const target=e.target.closest(".frame-row")?.dataset.id,from=state.molduras.find(f=>f.id===state.draggedFrame),to=state.molduras.find(f=>f.id===target);if(from&&to&&from.categoriaId===to.categoriaId&&from.id!==to.id){const a=state.molduras.filter(f=>f.categoriaId===from.categoriaId).sort((x,y)=>x.ordem-y.ordem),fi=a.findIndex(f=>f.id===from.id),ti=a.findIndex(f=>f.id===to.id),[item]=a.splice(fi,1);a.splice(ti,0,item);a.forEach((f,i)=>f.ordem=i+1);render();}state.draggedFrame=null;});

  el.dialog.addEventListener("close",async()=>{if(el.dialog.returnValue!=="confirm"||!state.pendingDelete)return;const f=state.pendingDelete;state.pendingDelete=null;setBusy(true,"Removendo...");try{state.molduras=state.molduras.filter(x=>x.id!==f.id);renumber();await saveConfig(`Remove moldura ${f.nome}`);if(el.deleteFile.checked)await removeImage(f.arquivo,`Remove imagem ${f.nome}`);render();resetForm();flash("Moldura removida.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}});

  if (el.categoryManagerToggle) {
    setPanelOpen(el.categoryManagerPanel, el.categoryManagerToggle, getStoredPanelState("lions-admin-category-manager-open", true), "lions-admin-category-manager-open");
    el.categoryManagerToggle.addEventListener("click", () => setPanelOpen(el.categoryManagerPanel, el.categoryManagerToggle, !el.categoryManagerPanel.classList.contains("is-open"), "lions-admin-category-manager-open"));
  }
  if (el.editorToggle) {
    setPanelOpen(el.form, el.editorToggle, getStoredPanelState("lions-admin-editor-open", false), "lions-admin-editor-open");
    el.editorToggle.addEventListener("click", () => setPanelOpen(el.form, el.editorToggle, !el.form.classList.contains("is-open"), "lions-admin-editor-open"));
  }
  if (el.generateId) el.generateId.addEventListener("click", () => { el.id.value = slugify(el.name.value); updateDestination(); el.id.focus(); });
  el.name.addEventListener("blur", () => { if (!state.editingId && !el.id.value.trim()) { el.id.value = slugify(el.name.value); updateDestination(); } });


  // v9.2 — navegação confiável e modos de inclusão separados
  function getPublicSiteUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length && /^(admin|painel)(?:[-_.].*)?(?:\.html?)?$/i.test(parts[parts.length - 1])) parts.pop();
    url.pathname = `/${parts.join("/")}${parts.length ? "/" : ""}`;
    return url.href;
  }
  if (el.returnToSite) {
    // Toda a área visual do botão é clicável. O redirecionamento explícito
    // evita interferência de elementos decorativos, CSS antigo ou beforeunload.
    el.returnToSite.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      state.intentionalNavigation = true;
      const target = new URL("./index.html", window.location.href);
      window.location.assign(target.href);
    });
  }

  function setCreationMode(mode, options = {}) {
    const bulk = mode === "bulk";
    if (el.singleModeContainer) { el.singleModeContainer.hidden = bulk; el.singleModeContainer.classList.toggle("is-active", !bulk); }
    if (el.bulkModeContainer) { el.bulkModeContainer.hidden = !bulk; el.bulkModeContainer.classList.toggle("is-active", bulk); }
    if (el.singleModeBtn) { el.singleModeBtn.classList.toggle("is-active", !bulk); el.singleModeBtn.setAttribute("aria-selected", String(!bulk)); }
    if (el.bulkModeBtn) { el.bulkModeBtn.classList.toggle("is-active", bulk); el.bulkModeBtn.setAttribute("aria-selected", String(bulk)); }
    try { localStorage.setItem("lions-admin-creation-mode", bulk ? "bulk" : "single"); } catch {}
    if (options.scroll !== false) {
      const target = bulk ? el.bulkModeContainer : el.singleModeContainer;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  let initialCreationMode = "single";
  try { initialCreationMode = localStorage.getItem("lions-admin-creation-mode") === "bulk" ? "bulk" : "single"; } catch {}
  setCreationMode(initialCreationMode, { scroll: false });
  el.singleModeBtn?.addEventListener("click", () => setCreationMode("single"));
  el.bulkModeBtn?.addEventListener("click", () => setCreationMode("bulk"));
  document.querySelectorAll("[data-admin-mode]").forEach(button => button.addEventListener("click", () => {
    setCreationMode(button.dataset.adminMode);
    document.querySelectorAll("#adminQuickNav a, #adminQuickNav button").forEach(nav => nav.classList.toggle("is-active", nav === button));
  }));



  // v4.2 — manutenção recolhida e navegação com foco coerente
  const maintenancePanel = document.getElementById("maintenancePanel");
  const maintenanceToggle = document.getElementById("maintenanceToggle");
  const maintenanceBody = document.getElementById("maintenanceBody");
  const setMaintenanceOpen = (open) => {
    if (!maintenancePanel || !maintenanceToggle || !maintenanceBody) return;
    maintenancePanel.classList.toggle("is-open", open);
    maintenanceToggle.setAttribute("aria-expanded", String(open));
    maintenanceBody.hidden = !open;
    try { localStorage.setItem("lions-admin-maintenance-open", open ? "1" : "0"); } catch {}
  };
  let maintenanceOpen = false;
  try { maintenanceOpen = localStorage.getItem("lions-admin-maintenance-open") === "1"; } catch {}
  setMaintenanceOpen(maintenanceOpen);
  maintenanceToggle?.addEventListener("click", () => setMaintenanceOpen(!maintenancePanel.classList.contains("is-open")));

  const navItems = [...document.querySelectorAll("#adminQuickNav a, #adminQuickNav button")];
  const activateNav = (item) => {
    navItems.forEach(nav => nav.classList.toggle("is-active", nav === item));
  };
  navItems.forEach(item => item.addEventListener("click", () => activateNav(item)));
  document.querySelector('#adminQuickNav a[href="#maintenancePanel"]')?.addEventListener("click", () => setMaintenanceOpen(true));

  if (el.scrollTop) {
    const updateScrollButton = () => { el.scrollTop.hidden = window.scrollY < 500; };
    window.addEventListener("scroll", updateScrollButton, { passive: true });
    el.scrollTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    updateScrollButton();
  }
  if (el.bulkUploadToggle && el.bulkUploadPanel) {
    setPanelOpen(el.bulkUploadPanel, el.bulkUploadToggle, getStoredPanelState("lions-admin-bulk-upload-open", false), "lions-admin-bulk-upload-open");
    el.bulkUploadToggle.addEventListener("click", () => setPanelOpen(el.bulkUploadPanel, el.bulkUploadToggle, !el.bulkUploadPanel.classList.contains("is-open"), "lions-admin-bulk-upload-open"));
  }
  const updateBulkSummary = () => {
    if (!el.bulkUploadSummary) return;
    const total = state.bulkFiles.length;
    el.bulkUploadSummary.textContent = total ? `${total} arquivo${total === 1 ? "" : "s"}` : "Nenhum arquivo";
  };
  if (el.bulkFiles) el.bulkFiles.addEventListener("change", () => setTimeout(updateBulkSummary, 0));
  if (el.clearBulk) el.clearBulk.addEventListener("click", () => setTimeout(updateBulkSummary, 0));
  if (el.bulkReview) el.bulkReview.addEventListener("click", () => setTimeout(updateBulkSummary, 0));
  el.publishPending?.addEventListener("click",()=>el.saveOrder?.click());
  el.discardPending?.addEventListener("click", discardPendingChanges);
  el.editorBackdrop?.addEventListener("click",()=>{if(!state.busy)resetForm();});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&document.body.classList.contains("editor-drawer-open")&&!state.busy)resetForm();});

  window.addEventListener("beforeunload", event => {
    if (state.intentionalNavigation) return;
    if (!state.dirty && !state.editingId && !state.bulkFiles.length) return;
    event.preventDefault();
    event.returnValue = "";
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (state.selectedIds.size && el.clearSelection) el.clearSelection.click();
      else if (state.editingId && el.cancelEdit) el.cancelEdit.click();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!el.saveOrder.disabled) el.saveOrder.click();
      else if (el.form.classList.contains("is-open") && !el.save.disabled) el.form.requestSubmit();
    }
  });
  updateBulkSummary();

  updateDestination();

  el.diagnoseBtn?.addEventListener("click",()=>{
    const issues=[];const ids=new Set(), files=new Set(), cats=new Set(state.categorias.map(c=>c.id));
    state.molduras.forEach(f=>{if(ids.has(f.id))issues.push(`ID duplicado: ${f.id}`);ids.add(f.id);if(!f.arquivo)issues.push(`Sem arquivo: ${f.nome}`);else if(files.has(f.arquivo))issues.push(`Arquivo repetido: ${f.arquivo}`);else files.add(f.arquivo);if(!cats.has(f.categoriaId))issues.push(`Categoria inexistente em: ${f.nome}`);});
    el.utilityResult.hidden=false;el.utilityResult.innerHTML=issues.length?`<strong>Foram encontrados ${issues.length} ponto(s):</strong><ul>${issues.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:`<strong>✅ Nenhum problema estrutural encontrado.</strong><p>${state.molduras.length} molduras e ${state.categorias.length} categorias verificadas.</p>`;
  });
  el.exportBackupBtn?.addEventListener("click",()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),categorias:state.categorias,molduras:state.molduras},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`backup-molduras-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);recordActivity("Backup exportado");});
  el.importBackupInput?.addEventListener("change",async()=>{const file=el.importBackupInput.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.categorias)||!Array.isArray(data.molduras))throw new Error("Backup inválido.");state.categorias=data.categorias;state.molduras=data.molduras;renumber();render();flash("Backup carregado para revisão. Use a barra de alterações pendentes para publicar.","success");}catch(e){flash(e.message,"error");}finally{el.importBackupInput.value="";}});
  el.historyBtn?.addEventListener("click",()=>{let list=[];try{list=JSON.parse(localStorage.getItem("lions-admin-history")||"[]");}catch{}el.utilityResult.hidden=false;el.utilityResult.innerHTML=list.length?`<strong>Últimas ações</strong><ol>${list.map(x=>`<li><b>${esc(x.message)}</b><small>${esc(x.date)}</small></li>`).join("")}</ol>`:"<strong>Nenhuma ação registrada neste navegador.</strong>";});

  // Gestão temporal e agendamentos
  if(el.managementToggle) el.managementToggle.addEventListener("click",()=>{const open=el.managementToggle.getAttribute("aria-expanded")!=="true";el.managementToggle.setAttribute("aria-expanded",String(open));el.managementBody.hidden=!open;});
  if(el.saveManagement) el.saveManagement.addEventListener("click",async()=>{
    state.configuracoes={...state.configuracoes,duracaoNovo:{valor:Math.max(1,Number(el.newDurationValue.value)||1),unidade:el.newDurationUnit.value},duracaoAtualizada:{valor:Math.max(1,Number(el.updatedDurationValue.value)||1),unidade:el.updatedDurationUnit.value}};
    setBusy(true,"Salvando configurações...");try{await saveConfig("Atualiza configurações gerenciais");render();flash("Configurações gerenciais publicadas.","success");}catch(e){flash(e.message,"error");}finally{setBusy(false);status("Conectado","ok");}
  });

})();
