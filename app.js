(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('editorCanvas');
  const ctx = canvas.getContext('2d');
  const photoLayer = document.createElement('canvas');
  photoLayer.width = photoLayer.height = 1080;
  const photoCtx = photoLayer.getContext('2d');
  const wrap = $('canvasWrap');
  const undoBtn=$('undoBtn'), redoBtn=$('redoBtn'), resolutionWarning=$('resolutionWarning');
  const controls = $('controls');
  const photoInput = $('photoInput');
  const photoButton = $('photoButton');
  const emptyState = $('emptyState');
  const zoomRange = $('zoomRange');
  const zoomNumber = $('zoomNumber');
  const rotationRange = $('rotationRange');
  const rotationNumber = $('rotationNumber');
  const frameGallery = $('frameGallery');
  const frameSearch = $('frameSearch');
  const clearSearchBtn = $('clearSearchBtn');
  const categoryFilters = $('categoryFilters');
  const categoryViewActions = $('categoryViewActions');
  const expandAllCategoriesBtn = $('expandAllCategoriesBtn');
  const collapseAllCategoriesBtn = $('collapseAllCategoriesBtn');
  const mobileViewMenuBtn = $('mobileViewMenuBtn');
  const mobileViewMenu = $('mobileViewMenu');
  const mobileExpandAllBtn = $('mobileExpandAllBtn');
  const mobileCollapseAllBtn = $('mobileCollapseAllBtn');
  const scrollTopBtn = $('scrollTopBtn');
  const mobileEndTopBtn = $('mobileEndTopBtn');
  const selectedFrameName = $('selectedFrameName');
  const frameMessage = $('frameMessage');
  const photoStatus = $('photoStatus');
  const editorSubtitle = $('editorSubtitle');
  const uploadTitle = $('uploadTitle');
  const uploadDescription = $('uploadDescription');
  const adjustHint = $('adjustHint');
  const mobileActionBar = $('mobileActionBar');
  const downloadBtn = $('downloadBtn');
  const mobileDownloadBtn = $('mobileDownloadBtn');
  const shareBtn = $('shareBtn');
  const fitBtn = $('fitBtn');
  const centerBtn = $('centerBtn');
  const resetBtn = $('resetBtn');
  const newCreationBtn = $('newCreationBtn');
  const advancedPanel = $('advancedPanel');
  const cropOptions = $('cropOptions');
  const resetFiltersBtn = $('resetFiltersBtn');
  const brightnessRange = $('brightnessRange');
  const contrastRange = $('contrastRange');
  const saturationRange = $('saturationRange');
  const warmthRange = $('warmthRange');
  const ROTATION_SNAP = 3;
  const STORAGE_KEY = 'lions-molduras-editor-v13';
  const FAVORITES_KEY = 'lions-molduras-favoritas';
  const RECENTS_KEY = 'lions-molduras-recentes';
  const CATEGORY_VIEW_KEY = 'lions-molduras-categorias-v1';
  const PUBLIC_CONFIG = window.CONFIGURACOES || {};
  const STATUS_COLORS = {novo:'#2f9e72',atualizada:'#d99a16',visivel:'#2d8fd5',oculta:'#7b8794',...(PUBLIC_CONFIG.cores||{})};
  Object.entries(STATUS_COLORS).forEach(([k,v])=>document.documentElement.style.setProperty(`--status-${k}`,v));
  const favoritesFilterBtn = $('favoritesFilterBtn');
  const recentFilterBtn = $('recentFilterBtn');
  const restoreNotice = $('restoreNotice');
  const dismissRestoreBtn = $('dismissRestoreBtn');
  const mobileVisualToolbar = $('mobileVisualToolbar');
  const mobileEditToggle = $('mobileEditToggle');
  const editorSection = $('editor');
  const mobileZoomOutBtn = $('mobileZoomOutBtn');
  const mobileZoomInBtn = $('mobileZoomInBtn');
  const mobileZoomValue = $('mobileZoomValue');
  const mobileRotateLeftBtn = $('mobileRotateLeftBtn');
  const mobileRotateRightBtn = $('mobileRotateRightBtn');
  const mobileRotationValue = $('mobileRotationValue');
  const mobileCenterBtn = $('mobileCenterBtn');
  const mobileFitBtn = $('mobileFitBtn');
  const mobileAdjustmentsBtn = $('mobileAdjustmentsBtn');
  const mobileUndoBtn = $('mobileUndoBtn');
  const mobileRedoBtn = $('mobileRedoBtn');
  const mobileRemoveBtn = $('mobileRemoveBtn');

  const state = {
    categories: [], frames: [], filteredFrames: [], activeCategory: 'todas', personalFilter: 'all', selectedFrame: null,
    photo: null, frameImage: null, x: 540, y: 540, scale: 1, rotation: 0, baseScale: 1,
    brightness: 100, contrast: 100, saturation: 100, warmth: 0, grayscale: 0, hue: 0,
    pointers: new Map(), lastPointer: null, pinchDistance: null, pinchScale: 1,
    favorites: new Set(), recents: [], history: [], future: [],
    categoryView: { collapsed: {}, expanded: {} }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalizeSearchText = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const slug = value => normalizeSearchText(value).replace(/\s+/g, '-');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
  const categoryName = frame => state.categories.find(c => c.id === frame.categoriaId)?.nome || frame.categoriaNome || frame.categoria || 'Outras';
  const toTime = value => { const time = value ? Date.parse(value) : NaN; return Number.isFinite(time) ? time : null; };
  const durationMs = (value, unit) => Math.max(0, Number(value) || 0) * (unit === 'horas' ? 3600000 : 86400000);
  const isFrameAvailable = (frame, now = Date.now()) => {
    if (frame.ativo === false) return false;
    const publishAt = toTime(frame.publicarEm);
    const hideAt = toTime(frame.ocultarEm);
    return !(publishAt && now < publishAt) && !(hideAt && now >= hideAt);
  };
  const statusOf = frame => {
    if (frame.statusVisivel === false) return 'normal';
    const status = ['novo','atualizada'].includes(frame.status) ? frame.status : frame.novo ? 'novo' : 'normal';
    if (status === 'normal') return status;
    const explicitEnd = toTime(frame.statusAte);
    if (explicitEnd && Date.now() >= explicitEnd) return 'normal';
    if (!explicitEnd && frame.statusDesde) {
      const cfg = status === 'novo' ? PUBLIC_CONFIG.duracaoNovo : PUBLIC_CONFIG.duracaoAtualizada;
      const start = toTime(frame.statusDesde);
      if (start && cfg && Date.now() >= start + durationMs(cfg.valor, cfg.unidade)) return 'normal';
    }
    return status;
  };
  const statusLabel = status => status === 'novo' ? (PUBLIC_CONFIG.mostrarNovo===false?'':'NOVO') : status === 'atualizada' ? (PUBLIC_CONFIG.mostrarAtualizada===false?'':'ATUALIZADA') : '';
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch { return fallback; } }
  function savePersonalLists() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); localStorage.setItem(RECENTS_KEY, JSON.stringify(state.recents.slice(0,12))); } catch {}
  }
  function loadCategoryView() {
    const saved = readJson(CATEGORY_VIEW_KEY, {});
    state.categoryView = {
      collapsed: saved && typeof saved.collapsed === 'object' ? saved.collapsed : {},
      expanded: saved && typeof saved.expanded === 'object' ? saved.expanded : {}
    };
  }
  function saveCategoryView() {
    try { localStorage.setItem(CATEGORY_VIEW_KEY, JSON.stringify(state.categoryView)); } catch {}
  }
  function previewLimit() {
    if (window.matchMedia('(max-width: 760px)').matches) return 4;
    if (window.matchMedia('(max-width: 980px)').matches) return 8;
    return 10;
  }
  function isSearching() { return Boolean(normalizeSearchText(frameSearch?.value || '')); }
  function visibleCategoryIds() {
    const ids = new Set(state.filteredFrames.map(frame => frame.categoriaId));
    return state.categories.filter(category => ids.has(category.id)).map(category => category.id);
  }
  function updateCategoryViewActions() {
    if (!categoryViewActions) return;
    const ids = visibleCategoryIds();
    const searching = isSearching();
    categoryViewActions.hidden = !ids.length;
    categoryViewActions.classList.toggle('is-searching', searching);

    const allOpenAndExpanded = ids.length > 0 && ids.every(id =>
      !state.categoryView.collapsed[id] && Boolean(state.categoryView.expanded[id])
    );
    const allCollapsed = ids.length > 0 && ids.every(id => Boolean(state.categoryView.collapsed[id]));

    if (expandAllCategoriesBtn) {
      expandAllCategoriesBtn.disabled = searching || allOpenAndExpanded;
      expandAllCategoriesBtn.setAttribute('aria-pressed', String(allOpenAndExpanded));
    }
    if (collapseAllCategoriesBtn) {
      collapseAllCategoriesBtn.disabled = searching || allCollapsed;
      collapseAllCategoriesBtn.setAttribute('aria-pressed', String(allCollapsed));
    }
  }
  function setAllCategoriesView(expand) {
    visibleCategoryIds().forEach(id => {
      state.categoryView.collapsed[id] = !expand;
      state.categoryView.expanded[id] = expand;
    });
    saveCategoryView();
    renderFrames();
    requestAnimationFrame(() => frameGallery.scrollIntoView({behavior:'smooth', block:'start'}));
  }
  function saveEditorState() {
    if (!state.selectedFrame) return;
    const data = { frameId: state.selectedFrame.id, activeCategory: state.activeCategory, transform: transformSnapshot(), savedAt: Date.now() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }
  let saveTimer = 0;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveEditorState, 180); }
  function restoreEditorState() {
    const saved = readJson(STORAGE_KEY, null); if (!saved?.frameId) return false;
    const frame = state.frames.find(f => f.id === saved.frameId); if (!frame) return false;
    selectFrame(frame, false, false);
    if (saved.transform) Object.assign(state, saved.transform);
    updateTransformControls(); updateFilterOutputs();
    if (restoreNotice) restoreNotice.hidden = false;
    return true;
  }
  function toggleFavorite(id) { state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id); savePersonalLists(); renderFrames(); }
  function addRecent(id) { state.recents = [id, ...state.recents.filter(x => x !== id)].slice(0,12); savePersonalLists(); }

  function normalizeData() {
    const rawCategories = Array.isArray(window.CATEGORIAS) ? window.CATEGORIAS : [];
    const rawFrames = Array.isArray(window.MOLDURAS) ? window.MOLDURAS : [];
    state.categories = rawCategories.filter(c => c && c.ativo !== false).map((c,i) => ({id:String(c.id || slug(c.nome) || `categoria-${i+1}`), nome:String(c.nome || 'Outras'), ordem:Number(c.ordem) || i+1})).sort((a,b)=>a.ordem-b.ordem);
    state.frames = rawFrames.filter(f => f && isFrameAvailable(f) && f.id && f.nome && (f.arquivo || f.imagem || f.src)).map((f,i) => ({...f, arquivo:f.arquivo || f.imagem || f.src, categoriaId:String(f.categoriaId || ''), ordem:Number(f.ordem) || i+1}));
    const byId = new Map(state.categories.map(c => [c.id,c]));
    const byName = new Map(state.categories.map(c => [c.nome.toLowerCase(),c]));
    state.frames.forEach(frame => {
      let category = byId.get(frame.categoriaId);
      const legacy = String(frame.categoriaNome || frame.categoria || '').trim();
      if (!category && legacy) category = byName.get(legacy.toLowerCase());
      if (!category) {
        const nome = legacy || 'Outras'; let id = slug(nome) || `categoria-${state.categories.length+1}`; let n=2;
        while (byId.has(id)) id = `${slug(nome) || 'categoria'}-${n++}`;
        category = {id,nome,ordem:state.categories.length+1}; state.categories.push(category); byId.set(id,category); byName.set(nome.toLowerCase(),category);
      }
      frame.categoriaId = category.id;
    });
  }

  function categoryStatus(id) {
    const frames = state.frames.filter(f => f.categoriaId === id);
    return frames.some(f => statusOf(f)==='novo') ? 'novo' : frames.some(f => statusOf(f)==='atualizada') ? 'atualizada' : 'normal';
  }

  function buildCategories() {
    const available = state.categories.filter(c => state.frames.some(f => f.categoriaId === c.id));
    categoryFilters.innerHTML = [{id:'todas',nome:'Todas'},...available].map(c => {
      const status = c.id === 'todas' ? 'normal' : categoryStatus(c.id);
      return `<button type="button" class="category-chip${c.id==='todas'?' is-active':''}" data-category="${escapeHtml(c.id)}"><span>${escapeHtml(c.nome)}</span>${status!=='normal'&&statusLabel(status)?`<small class="${status}">${statusLabel(status)}</small>`:''}</button>`;
    }).join('');
  }

  function applyFilters() {
    const rawQuery = frameSearch.value.trim();
    const query = normalizeSearchText(rawQuery);
    clearSearchBtn.hidden = !rawQuery;
    const queryTerms = query.split(' ').filter(Boolean);

    state.filteredFrames = state.frames.filter(frame => {
      const inCategory = state.activeCategory === 'todas' || frame.categoriaId === state.activeCategory;
      const inPersonal = state.personalFilter === 'favorites' ? state.favorites.has(frame.id) : state.personalFilter === 'recent' ? state.recents.includes(frame.id) : true;
      const searchableText = normalizeSearchText([
        frame.nome,
        categoryName(frame),
        frame.id,
        frame.arquivo,
        ...(Array.isArray(frame.tags) ? frame.tags : [frame.tags || ''])
      ].join(' '));

      const matchesSearch = !queryTerms.length || queryTerms.every(term => searchableText.includes(term));
      return inCategory && inPersonal && matchesSearch;
    });
    renderFrames();
  }

  function renderFrames() {
    if (!state.filteredFrames.length) {
      frameGallery.innerHTML = '';
      frameMessage.hidden = false;
      frameMessage.textContent = 'Nenhuma moldura encontrada. Tente outra pesquisa ou categoria.';
      updateCategoryViewActions();
      return;
    }

    frameMessage.hidden = true;
    const searching = isSearching();
    const limit = previewLimit();
    const categories = state.activeCategory === 'todas'
      ? state.categories
      : state.categories.filter(c => c.id === state.activeCategory);

    frameGallery.innerHTML = categories.map(category => {
      const frames = state.filteredFrames
        .filter(f => f.categoriaId === category.id)
        .sort((a,b) => state.personalFilter === 'recent'
          ? state.recents.indexOf(a.id) - state.recents.indexOf(b.id)
          : a.ordem - b.ordem);

      if (!frames.length) return '';

      const collapsed = !searching && Boolean(state.categoryView.collapsed[category.id]);
      const expanded = searching || Boolean(state.categoryView.expanded[category.id]);
      const visibleFrames = expanded ? frames : frames.slice(0, limit);
      const hasMore = frames.length > limit;
      const hiddenCount = Math.max(0, frames.length - visibleFrames.length);
      const status = categoryStatus(category.id);
      const groupId = `grupo-${slug(category.id)}`;

      const cards = visibleFrames.map(frame => {
        const selected = state.selectedFrame?.id === frame.id;
        const frameStatus = statusOf(frame);
        return `<div class="frame-card-wrap"><button class="frame-option${selected?' is-selected':''}" type="button" data-frame-id="${escapeHtml(frame.id)}" aria-pressed="${selected}"><span class="frame-thumb"><img src="${escapeHtml(frame.arquivo)}" alt="Prévia de ${escapeHtml(frame.nome)}" loading="lazy"></span><span class="frame-info"><strong>${escapeHtml(frame.nome)}</strong><small>${escapeHtml(category.nome)}</small></span>${frameStatus!=='normal'&&statusLabel(frameStatus)?`<em class="frame-badge ${frameStatus}">${statusLabel(frameStatus)}</em>`:''}<i aria-hidden="true">✓</i></button><button class="favorite-button${state.favorites.has(frame.id)?' is-favorite':''}" type="button" data-favorite-id="${escapeHtml(frame.id)}" aria-label="${state.favorites.has(frame.id)?'Remover dos favoritos':'Adicionar aos favoritos'}">${state.favorites.has(frame.id)?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4 10.55 19.1C5.4 14.5 2 11.45 2 7.7 2 4.65 4.4 2.25 7.45 2.25c1.72 0 3.37.8 4.55 2.05a6.12 6.12 0 0 1 4.55-2.05C19.6 2.25 22 4.65 22 7.7c0 3.75-3.4 6.8-8.55 11.4L12 20.4Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.55 3.25c-1.72 0-3.37.8-4.55 2.05a6.12 6.12 0 0 0-4.55-2.05C4.4 3.25 2 5.65 2 8.7c0 3.75 3.4 6.8 8.55 11.4L12 21.4l1.45-1.3C18.6 15.5 22 12.45 22 8.7c0-3.05-2.4-5.45-5.45-5.45Zm-4.45 15.2-.1.1-.1-.1C7.14 14.2 4 11.4 4 8.7c0-1.9 1.55-3.45 3.45-3.45 1.46 0 2.88.94 3.38 2.24h2.34c.5-1.3 1.92-2.24 3.38-2.24C18.45 5.25 20 6.8 20 8.7c0 2.7-3.14 5.5-7.9 9.75Z"/></svg>'}</button></div>`;
      }).join('');

      const counter = PUBLIC_CONFIG.mostrarContadorCategoria === false
        ? ''
        : `<b><span class="category-count-number">${frames.length}</span><span class="category-count-label"> ${frames.length===1?'moldura':'molduras'}</span></b>`;

      const footer = !collapsed && hasMore && !searching
        ? `<div class="frame-group-footer"><button type="button" class="category-more-button" data-category-expand="${escapeHtml(category.id)}" aria-expanded="${expanded}">${expanded ? '<span>Mostrar menos</span><small>Voltar para a visualização resumida</small>' : `<span>Ver todas as ${frames.length}</span><small>${hiddenCount} ${hiddenCount===1?'moldura restante':'molduras restantes'}</small>`}<i aria-hidden="true">${expanded?'↑':'↓'}</i></button></div>`
        : '';

      return `<section class="frame-group${collapsed?' is-collapsed':''}" data-category-group="${escapeHtml(category.id)}"><div class="frame-group-header"><button type="button" class="category-collapse-button" data-category-collapse="${escapeHtml(category.id)}" aria-expanded="${!collapsed}" aria-controls="${groupId}"><span class="category-chevron" aria-hidden="true">⌄</span><span class="category-title"><span><h3>${escapeHtml(category.nome)}</h3>${status!=='normal'&&statusLabel(status)?`<small class="category-badge ${status}">${statusLabel(status)}</small>`:''}</span><small>${collapsed ? '' : expanded || searching ? 'Todas as molduras estão visíveis' : `Exibindo ${visibleFrames.length} de ${frames.length}`} </small></span></button><div class="category-count">${counter}</div></div><div class="frame-group-body" id="${groupId}"${collapsed?' hidden':''}><div class="frame-grid">${cards}</div>${footer}</div></section>`;
    }).join('');
    updateCategoryViewActions();
  }

  function updateProgress() {
    const step = state.photo ? 3 : state.selectedFrame ? 2 : 1;
    document.querySelectorAll('[data-progress]').forEach(el => {
      const n = Number(el.dataset.progress); el.classList.toggle('is-active', n === step); el.classList.toggle('is-done', n < step);
    });
  }

  function setFrameReady(ready) {
    photoInput.disabled = !ready;
    photoButton.classList.toggle('is-disabled', !ready);
    photoButton.setAttribute('aria-disabled', String(!ready));
    if (!ready) {
      uploadTitle.textContent = 'Selecione uma moldura primeiro'; uploadDescription.textContent = 'A foto será processada somente no seu aparelho.';
      photoStatus.textContent = 'Aguardando moldura'; editorSubtitle.textContent = 'Primeiro, selecione uma moldura acima.';
      emptyState.querySelector('span').textContent = '＋'; emptyState.querySelector('strong').textContent = 'Escolha uma moldura'; emptyState.querySelector('small').textContent = 'Depois, toque aqui para selecionar sua foto.'; emptyState.classList.remove('is-clickable');
    } else if (!state.photo) {
      uploadTitle.textContent = 'Agora escolha sua foto'; uploadDescription.textContent = `Moldura selecionada: ${state.selectedFrame.nome}`;
      photoStatus.textContent = 'Moldura escolhida ✓'; editorSubtitle.textContent = 'Ótimo! Agora envie uma foto e ajuste como preferir.';
      emptyState.querySelector('span').textContent = '＋'; emptyState.querySelector('strong').textContent = 'Selecionar foto'; emptyState.querySelector('small').textContent = 'Toque em qualquer ponto desta área para escolher uma imagem.'; emptyState.classList.add('is-clickable');
    }
    updateProgress();
  }

  function setPhotoEnabled(enabled) {
    [zoomRange,zoomNumber,rotationRange,rotationNumber,downloadBtn,mobileDownloadBtn,shareBtn,fitBtn,centerBtn,resetBtn,brightnessRange,contrastRange,saturationRange,warmthRange,resetFiltersBtn].forEach(el => { if (el) el.disabled = !enabled; });
    document.querySelectorAll('#filterPresets button').forEach(button => button.disabled = !enabled);
    controls.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    wrap.classList.toggle('is-awaiting-photo', !enabled);
    if(undoBtn) undoBtn.disabled=!enabled||!state.history.length; if(redoBtn) redoBtn.disabled=!enabled||!state.future.length;
    emptyState.hidden = enabled;
    adjustHint.hidden = !enabled;
    photoButton.textContent = enabled ? '🔄 Trocar foto' : 'Escolher foto';
    photoStatus.textContent = enabled ? 'Foto carregada ✓' : state.selectedFrame ? 'Moldura escolhida ✓' : 'Aguardando moldura';
    photoStatus.classList.toggle('is-ready', enabled);
    uploadTitle.textContent = enabled ? 'Foto adicionada' : state.selectedFrame ? 'Agora escolha sua foto' : 'Selecione uma moldura primeiro';
    uploadDescription.textContent = enabled ? 'Use os controles para posicionar e ajustar.' : state.selectedFrame ? `Moldura selecionada: ${state.selectedFrame.nome}` : 'A foto será processada somente no seu aparelho.';
    mobileActionBar.hidden = !enabled; mobileActionBar.classList.toggle('is-visible', enabled);
    if (mobileEditToggle) mobileEditToggle.hidden = !enabled;
    if (mobileVisualToolbar) mobileVisualToolbar.hidden = true;
    if (mobileEditToggle) {
      mobileEditToggle.setAttribute('aria-expanded','false');
      mobileEditToggle.classList.remove('is-active');
      mobileEditToggle.innerHTML = '<span>🎛️</span> Ajustar foto';
    }
    editorSection?.classList.toggle('photo-ready', enabled);
    editorSection?.classList.remove('adjustments-open');
    if (advancedPanel) advancedPanel.open = false;
    placeAdjustmentPanels();
    document.body.classList.toggle('has-mobile-bar', enabled);
    document.body.classList.toggle('is-editing-photo', enabled);
    updateProgress();
  }

  function selectFrame(frame, scroll=true, trackRecent=true) {
    state.selectedFrame = frame;
    if (trackRecent) addRecent(frame.id);
    selectedFrameName.textContent = `✓ ${frame.nome}`;
    loadFrame(frame.arquivo);
    renderFrames(); setFrameReady(true);
    const url = new URL(location.href); url.searchParams.set('moldura',frame.id); history.replaceState({},'',url);
    scheduleSave();
    if (scroll) $('editor').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function loadFrame(src) {
    const image = new Image();
    image.onload = () => { state.frameImage = image; draw(); };
    image.onerror = () => { state.frameImage = null; draw(); alert('Não foi possível carregar esta moldura.'); };
    image.src = src;
  }

  function updateTransformControls() {
    const zoomPercent = Math.round(state.scale * 100);
    const rotationDegrees = Math.round(state.rotation);
    zoomRange.value = String(state.scale); zoomNumber.value = String(zoomPercent);
    rotationRange.value = String(state.rotation); rotationNumber.value = String(rotationDegrees);
    if (mobileZoomValue) mobileZoomValue.textContent = `${zoomPercent}%`;
    if (mobileRotationValue) mobileRotationValue.textContent = `${rotationDegrees}°`;
  }

  function coverScale(image) { return Math.max(1080/image.naturalWidth,1080/image.naturalHeight); }
  function transformSnapshot(){return {scale:state.scale,rotation:state.rotation,x:state.x,y:state.y,brightness:state.brightness,contrast:state.contrast,saturation:state.saturation,warmth:state.warmth,grayscale:state.grayscale,hue:state.hue};}
  function updateHistoryButtons(){if(undoBtn)undoBtn.disabled=!state.photo||!state.history.length;if(redoBtn)redoBtn.disabled=!state.photo||!state.future.length;if(mobileUndoBtn)mobileUndoBtn.disabled=!state.photo||!state.history.length;if(mobileRedoBtn)mobileRedoBtn.disabled=!state.photo||!state.future.length;if(mobileRemoveBtn)mobileRemoveBtn.disabled=!state.photo;}
  function rememberState(){if(!state.photo)return;state.history.push(transformSnapshot());if(state.history.length>40)state.history.shift();state.future=[];updateHistoryButtons();}
  function restoreSnapshot(v){if(!v)return;Object.assign(state,v);updateTransformControls();brightnessRange.value=state.brightness;contrastRange.value=state.contrast;saturationRange.value=state.saturation;warmthRange.value=state.warmth;updateFilterOutputs();draw();}
  function resetPhotoPosition() { if (!state.photo) return; state.baseScale=coverScale(state.photo); state.scale=1; state.rotation=0; state.x=540; state.y=540; updateTransformControls(); draw(); }
  function setZoom(value) { state.scale=clamp(Number(value)||1,.2,4); updateTransformControls(); draw(); }
  function setRotation(value,snap=false) { let v=clamp(Number(value)||0,-180,180); if(snap && Math.abs(v)<=ROTATION_SNAP)v=0; state.rotation=v; updateTransformControls(); draw(); }


  function drawPhotoLayer() {
    photoCtx.clearRect(0, 0, 1080, 1080);
    if (!state.photo) return;

    photoCtx.save();
    photoCtx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%) sepia(${state.warmth}%) grayscale(${state.grayscale}%) hue-rotate(${state.hue}deg)`;
    photoCtx.translate(state.x, state.y);
    photoCtx.rotate(state.rotation * Math.PI / 180);
    const scale = state.baseScale * state.scale;
    const width = state.photo.naturalWidth * scale;
    const height = state.photo.naturalHeight * scale;
    photoCtx.drawImage(state.photo, -width / 2, -height / 2, width, height);
    photoCtx.restore();
    photoCtx.filter = 'none';
  }

  function draw() {
    ctx.clearRect(0, 0, 1080, 1080);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 1080, 1080);
    drawPhotoLayer();
    ctx.drawImage(photoLayer, 0, 0);
    if (state.frameImage) ctx.drawImage(state.frameImage, 0, 0, 1080, 1080);
    if (state.selectedFrame) scheduleSave();
  }

  function updateFilterOutputs() {
    $('brightnessOutput').textContent=`${state.brightness}%`; $('contrastOutput').textContent=`${state.contrast}%`; $('saturationOutput').textContent=`${state.saturation}%`; $('warmthOutput').textContent=`${state.warmth}%`;
  }
  function applyPreset(name) {
    const presets = {
      original: {brightness:100, contrast:100, saturation:100, warmth:0, grayscale:0, hue:0},
      vivid: {brightness:105, contrast:112, saturation:138, warmth:5, grayscale:0, hue:0},
      warm: {brightness:104, contrast:102, saturation:112, warmth:32, grayscale:0, hue:0},
      bw: {brightness:105, contrast:118, saturation:0, warmth:0, grayscale:100, hue:0},
      soft: {brightness:108, contrast:88, saturation:85, warmth:8, grayscale:0, hue:0},
      bright: {brightness:120, contrast:96, saturation:108, warmth:2, grayscale:0, hue:0},
      dramatic: {brightness:94, contrast:142, saturation:120, warmth:4, grayscale:0, hue:0},
      vintage: {brightness:102, contrast:94, saturation:78, warmth:42, grayscale:0, hue:-8},
      sepia: {brightness:103, contrast:104, saturation:70, warmth:78, grayscale:0, hue:-12},
      cool: {brightness:103, contrast:106, saturation:108, warmth:0, grayscale:0, hue:172}
    };
    const p = presets[name] || presets.original;
    Object.assign(state, p);
    brightnessRange.value = String(p.brightness);
    contrastRange.value = String(p.contrast);
    saturationRange.value = String(p.saturation);
    warmthRange.value = String(Math.min(70, p.warmth));
    updateFilterOutputs();
    document.querySelectorAll('#filterPresets button').forEach(b=>b.classList.toggle('is-active',b.dataset.preset===name));
    draw();
  }
  function resetAdvanced() { applyPreset('original'); }

  function mobileStep(change) {
    if (!state.photo) return;
    rememberState();
    change();
    scheduleSave();
  }
  function placeAdjustmentPanels() {
    if (!advancedPanel || !mobileVisualToolbar) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    if (mobile) {
      const canvasColumn = mobileEditToggle?.parentElement;
      if (canvasColumn && advancedPanel.parentElement !== canvasColumn) {
        canvasColumn.insertBefore(advancedPanel, mobileVisualToolbar);
      }
    } else if (controls?.parentElement && advancedPanel.parentElement !== controls.parentElement) {
      controls.parentElement.insertBefore(advancedPanel, controls);
    }
  }

  mobileEditToggle?.addEventListener('click', () => {
    if (!state.photo || !editorSection) return;
    const opening = !editorSection.classList.contains('adjustments-open');
    placeAdjustmentPanels();
    editorSection.classList.toggle('adjustments-open', opening);
    mobileEditToggle.setAttribute('aria-expanded', String(opening));
    mobileEditToggle.classList.toggle('is-active', opening);
    mobileEditToggle.innerHTML = opening ? '<span>×</span> Fechar ajustes' : '<span>🎛️</span> Ajustar foto';
    if (mobileVisualToolbar) mobileVisualToolbar.hidden = !opening;
    if (!opening && advancedPanel) advancedPanel.open = false;
    if (opening) {
      requestAnimationFrame(() => {
        const target = window.matchMedia('(max-width: 760px)').matches ? advancedPanel : mobileEditToggle;
        target?.scrollIntoView({behavior:'smooth', block:'nearest'});
      });
    }
  });
  window.addEventListener('resize', () => {
    if (editorSection?.classList.contains('adjustments-open')) placeAdjustmentPanels();
  });
  mobileZoomOutBtn?.addEventListener('click', () => mobileStep(() => setZoom(state.scale - 0.05)));
  mobileZoomInBtn?.addEventListener('click', () => mobileStep(() => setZoom(state.scale + 0.05)));
  mobileRotateLeftBtn?.addEventListener('click', () => mobileStep(() => setRotation(state.rotation - 5, false)));
  mobileRotateRightBtn?.addEventListener('click', () => mobileStep(() => setRotation(state.rotation + 5, false)));
  mobileCenterBtn?.addEventListener('click', () => mobileStep(() => { state.x = 540; state.y = 540; draw(); }));
  mobileFitBtn?.addEventListener('click', () => mobileStep(resetPhotoPosition));
  mobileUndoBtn?.addEventListener('click', () => undoBtn?.click());
  mobileRedoBtn?.addEventListener('click', () => redoBtn?.click());
  mobileRemoveBtn?.addEventListener('click', () => resetBtn?.click());

  mobileAdjustmentsBtn?.addEventListener('click', () => {
    if (!state.photo) return;
    advancedPanel.open = true;
    requestAnimationFrame(() => advancedPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  });

  // Em celulares e computadores, toda a área da moldura abre a seleção de foto
  // enquanto uma moldura estiver escolhida e ainda não houver fotografia carregada.
  wrap.addEventListener('click', event => {
    if (!state.selectedFrame || state.photo || photoInput.disabled) return;
    event.preventDefault();
    photoInput.click();
  });
  emptyState.addEventListener('click', event => {
    if (!state.selectedFrame || state.photo || photoInput.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    photoInput.click();
  });

  photoInput.addEventListener('change', event => {
    const file=event.target.files?.[0]; if(!file)return;
    if(!file.type.startsWith('image/')) return alert('Escolha um arquivo de imagem válido.');
    const reader=new FileReader(); reader.onload=()=>{const image=new Image(); image.onload=()=>{state.photo=image;state.history=[];state.future=[];resetPhotoPosition();setPhotoEnabled(true);wrap.classList.remove('is-awaiting-photo');if(resolutionWarning)resolutionWarning.hidden=Math.min(image.naturalWidth,image.naturalHeight)>=900;};image.onerror=()=>alert('Não foi possível abrir esta imagem.');image.src=reader.result;};reader.readAsDataURL(file);
  });
  zoomRange.addEventListener('input',()=>setZoom(zoomRange.value)); zoomNumber.addEventListener('input',()=>{if(zoomNumber.value!=='')setZoom(Number(zoomNumber.value)/100);}); zoomNumber.addEventListener('change',()=>setZoom(Number(zoomNumber.value||100)/100));
  rotationRange.addEventListener('input',()=>setRotation(rotationRange.value,false)); rotationRange.addEventListener('change',()=>setRotation(rotationRange.value,true)); rotationNumber.addEventListener('input',()=>{if(rotationNumber.value!=='')setRotation(rotationNumber.value);}); rotationNumber.addEventListener('change',()=>setRotation(rotationNumber.value||0));
  undoBtn?.addEventListener('click',()=>{if(!state.history.length)return;state.future.push(transformSnapshot());restoreSnapshot(state.history.pop());updateHistoryButtons();});
  redoBtn?.addEventListener('click',()=>{if(!state.future.length)return;state.history.push(transformSnapshot());restoreSnapshot(state.future.pop());updateHistoryButtons();});
  fitBtn.addEventListener('click',()=>{rememberState();resetPhotoPosition();}); centerBtn.addEventListener('click',()=>{rememberState();state.x=540;state.y=540;draw();});
  resetBtn.addEventListener('click',clearPhoto); newCreationBtn.addEventListener('click',()=>{clearPhoto();$('galeria').scrollIntoView({behavior:'smooth'});});
  function clearPhoto(){photoInput.value='';state.photo=null;if(resolutionWarning)resolutionWarning.hidden=true;state.history=[];state.future=[];resetAdvanced();setPhotoEnabled(false);setFrameReady(Boolean(state.selectedFrame));draw();}

  document.querySelectorAll('#filterPresets button').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset)));
  [[brightnessRange,'brightness'],[contrastRange,'contrast'],[saturationRange,'saturation'],[warmthRange,'warmth']].forEach(([range,key])=>range.addEventListener('input',()=>{state[key]=Number(range.value); state.grayscale=0; state.hue=0; updateFilterOutputs();document.querySelectorAll('#filterPresets button').forEach(b=>b.classList.remove('is-active'));draw();}));
  resetFiltersBtn.addEventListener('click',resetAdvanced);
  advancedPanel.addEventListener('toggle', draw);

  frameGallery.addEventListener('click', event => {
    const collapseButton = event.target.closest('[data-category-collapse]');
    if (collapseButton) {
      const id = collapseButton.dataset.categoryCollapse;
      state.categoryView.collapsed[id] = !Boolean(state.categoryView.collapsed[id]);
      saveCategoryView();
      renderFrames();
      return;
    }

    const expandButton = event.target.closest('[data-category-expand]');
    if (expandButton) {
      const id = expandButton.dataset.categoryExpand;
      state.categoryView.expanded[id] = !Boolean(state.categoryView.expanded[id]);
      saveCategoryView();
      renderFrames();
      requestAnimationFrame(() => {
        document.querySelector(`[data-category-group="${CSS.escape(id)}"]`)?.scrollIntoView({behavior:'smooth', block:'nearest'});
      });
      return;
    }

    const favorite = event.target.closest('[data-favorite-id]');
    if (favorite) {
      event.stopPropagation();
      toggleFavorite(favorite.dataset.favoriteId);
      return;
    }

    const button = event.target.closest('[data-frame-id]');
    if (!button) return;
    const frame = state.frames.find(f => f.id === button.dataset.frameId);
    if (frame) selectFrame(frame);
  });
  categoryFilters.addEventListener('click',event=>{
    const button=event.target.closest('[data-category]');
    if(!button)return;

    // Ao navegar por uma categoria, sai automaticamente dos filtros pessoais.
    // Assim Favoritas e Recentes não deixam a galeria presa em um estado oculto.
    state.personalFilter='all';
    favoritesFilterBtn?.classList.remove('is-active');
    recentFilterBtn?.classList.remove('is-active');

    const categoryId = button.dataset.category;
    state.activeCategory = categoryId;

    // Ao escolher uma categoria específica, ela sempre abre por completo.
    // Isso evita que o usuário encontre uma categoria fechada ou resumida.
    if (categoryId !== 'todas') {
      state.categoryView.collapsed[categoryId] = false;
      state.categoryView.expanded[categoryId] = true;
      saveCategoryView();
    }

    categoryFilters.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active',b===button));
    applyFilters();

    if (categoryId !== 'todas') {
      requestAnimationFrame(() => {
        document.querySelector(`[data-category-group="${CSS.escape(categoryId)}"]`)?.scrollIntoView({behavior:'smooth', block:'start'});
      });
    }
  });
  expandAllCategoriesBtn?.addEventListener('click',()=>setAllCategoriesView(true));
  collapseAllCategoriesBtn?.addEventListener('click',()=>setAllCategoriesView(false));
  mobileExpandAllBtn?.addEventListener('click',()=>{ setAllCategoriesView(true); closeMobileViewMenu(); });
  mobileCollapseAllBtn?.addEventListener('click',()=>{ setAllCategoriesView(false); closeMobileViewMenu(); });
  function closeMobileViewMenu(){
    if (!mobileViewMenu || !mobileViewMenuBtn) return;
    mobileViewMenu.hidden = true;
    mobileViewMenuBtn.setAttribute('aria-expanded','false');
  }
  function openMobileViewMenu(){
    if (!mobileViewMenu || !mobileViewMenuBtn) return;
    mobileViewMenu.hidden = false;
    mobileViewMenuBtn.setAttribute('aria-expanded','true');
  }
  mobileViewMenuBtn?.addEventListener('click',(event)=>{
    event.stopPropagation();
    if (mobileViewMenu.hidden) openMobileViewMenu(); else closeMobileViewMenu();
  });
  mobileViewMenu?.addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('click',closeMobileViewMenu);
  document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeMobileViewMenu(); });

  function updateScrollTopButton(){
    if (!scrollTopBtn) return;
    scrollTopBtn.classList.toggle('is-visible', window.scrollY > 300);
  }
  const goToPageTop = ()=>window.scrollTo({top:0,behavior:'smooth'});
  scrollTopBtn?.addEventListener('click',goToPageTop);
  mobileEndTopBtn?.addEventListener('click',goToPageTop);
  window.addEventListener('scroll',updateScrollTopButton,{passive:true});
  updateScrollTopButton();
  frameSearch.addEventListener('input',applyFilters); clearSearchBtn.addEventListener('click',()=>{frameSearch.value='';applyFilters();frameSearch.focus();});

  favoritesFilterBtn?.addEventListener('click',()=>{state.personalFilter=state.personalFilter==='favorites'?'all':'favorites';favoritesFilterBtn.classList.toggle('is-active',state.personalFilter==='favorites');recentFilterBtn?.classList.remove('is-active');applyFilters();});
  recentFilterBtn?.addEventListener('click',()=>{state.personalFilter=state.personalFilter==='recent'?'all':'recent';recentFilterBtn.classList.toggle('is-active',state.personalFilter==='recent');favoritesFilterBtn?.classList.remove('is-active');applyFilters();});
  dismissRestoreBtn?.addEventListener('click',()=>{restoreNotice.hidden=true;});

  function canvasPoint(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*1080/rect.width,y:(event.clientY-rect.top)*1080/rect.height};}
  wrap.addEventListener('pointerdown',event=>{if(!state.photo)return;wrap.setPointerCapture(event.pointerId);const p=canvasPoint(event);state.pointers.set(event.pointerId,p);if(state.pointers.size===1)state.lastPointer=p;if(state.pointers.size===2){const[a,b]=[...state.pointers.values()];state.pinchDistance=Math.hypot(b.x-a.x,b.y-a.y);state.pinchScale=state.scale;}});
  wrap.addEventListener('pointermove',event=>{if(!state.photo||!state.pointers.has(event.pointerId))return;const p=canvasPoint(event);state.pointers.set(event.pointerId,p);if(state.pointers.size===1&&state.lastPointer){state.x+=p.x-state.lastPointer.x;state.y+=p.y-state.lastPointer.y;state.lastPointer=p;draw();}else if(state.pointers.size===2&&state.pinchDistance){const[a,b]=[...state.pointers.values()];setZoom(state.pinchScale*Math.hypot(b.x-a.x,b.y-a.y)/state.pinchDistance);}});
  function release(event){state.pointers.delete(event.pointerId);state.lastPointer=state.pointers.size===1?[...state.pointers.values()][0]:null;if(state.pointers.size<2)state.pinchDistance=null;}
  wrap.addEventListener('pointerup',release);wrap.addEventListener('pointercancel',release);wrap.addEventListener('wheel',event=>{if(!state.photo)return;event.preventDefault();setZoom(state.scale*(event.deltaY<0?1.05:.95));},{passive:false});

  function makeBlob(){return new Promise((resolve,reject)=>{draw();canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar a imagem.')),'image/png');});}
  function filename(){return `foto-${slug(state.selectedFrame?.nome)||'moldura-lions'}.png`;}
  async function downloadImage(){if(!state.photo)return;const text=downloadBtn.innerHTML;downloadBtn.disabled=true;mobileDownloadBtn.disabled=true;downloadBtn.textContent='Gerando…';try{const blob=await makeBlob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){alert(e.message);}finally{downloadBtn.disabled=false;mobileDownloadBtn.disabled=false;downloadBtn.innerHTML=text;}}
  async function shareImage(){if(!state.photo)return;try{const blob=await makeBlob(),file=new File([blob],filename(),{type:'image/png'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Minha foto com moldura do Lions'});}else await downloadImage();}catch(e){if(e.name!=='AbortError')await downloadImage();}}
  downloadBtn.addEventListener('click',downloadImage);mobileDownloadBtn.addEventListener('click',downloadImage);shareBtn.addEventListener('click',shareImage);

  const helpDialog=$('helpDialog'); function openHelp(){helpDialog.showModal();} function closeHelp(){helpDialog.close();}
  $('openHelpBtn').addEventListener('click',openHelp);$('heroHelpBtn').addEventListener('click',openHelp);$('closeHelpBtn').addEventListener('click',closeHelp);$('startFromHelpBtn').addEventListener('click',()=>{closeHelp();$('galeria').scrollIntoView({behavior:'smooth'});});helpDialog.addEventListener('click',event=>{if(event.target===helpDialog)closeHelp();});

  function init(){
    try{normalizeData();state.favorites=new Set(readJson(FAVORITES_KEY,[]));state.recents=readJson(RECENTS_KEY,[]);loadCategoryView();if(!state.frames.length)throw new Error('Nenhuma moldura ativa encontrada.');buildCategories();applyFilters();const requested=new URLSearchParams(location.search).get('moldura');const frame=requested?state.frames.find(f=>f.id===requested):null;if(frame)selectFrame(frame,false);else if(!restoreEditorState())setFrameReady(false);}catch(error){console.error(error);frameMessage.hidden=false;frameMessage.textContent='Não foi possível carregar as molduras. Confira o arquivo molduras.js.';selectedFrameName.textContent='Erro ao carregar';}
    updateTransformControls();updateFilterOutputs();setPhotoEnabled(false);draw();
  }
  init();
})();