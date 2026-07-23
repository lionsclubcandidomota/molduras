(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('editorCanvas');
  const ctx = canvas.getContext('2d');
  const wrap = $('canvasWrap');
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

  const state = {
    categories: [], frames: [], filteredFrames: [], activeCategory: 'todas', selectedFrame: null,
    photo: null, frameImage: null, x: 540, y: 540, scale: 1, rotation: 0, baseScale: 1,
    cropShape: 'full', brightness: 100, contrast: 100, saturation: 100, warmth: 0,
    pointers: new Map(), lastPointer: null, pinchDistance: null, pinchScale: 1
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const slug = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
  const categoryName = frame => state.categories.find(c => c.id === frame.categoriaId)?.nome || frame.categoriaNome || frame.categoria || 'Outras';
  const statusOf = frame => frame.statusVisivel === false ? 'normal' : (['novo','atualizada'].includes(frame.status) ? frame.status : frame.novo ? 'novo' : 'normal');
  const statusLabel = status => status === 'novo' ? 'NOVO' : status === 'atualizada' ? 'ATUALIZADA' : '';

  function normalizeData() {
    const rawCategories = Array.isArray(window.CATEGORIAS) ? window.CATEGORIAS : [];
    const rawFrames = Array.isArray(window.MOLDURAS) ? window.MOLDURAS : [];
    state.categories = rawCategories.filter(c => c && c.ativo !== false).map((c,i) => ({id:String(c.id || slug(c.nome) || `categoria-${i+1}`), nome:String(c.nome || 'Outras'), ordem:Number(c.ordem) || i+1})).sort((a,b)=>a.ordem-b.ordem);
    state.frames = rawFrames.filter(f => f && f.ativo !== false && f.id && f.nome && (f.arquivo || f.imagem || f.src)).map((f,i) => ({...f, arquivo:f.arquivo || f.imagem || f.src, categoriaId:String(f.categoriaId || ''), ordem:Number(f.ordem) || i+1}));
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
      return `<button type="button" class="category-chip${c.id==='todas'?' is-active':''}" data-category="${escapeHtml(c.id)}"><span>${escapeHtml(c.nome)}</span>${status!=='normal'?`<small class="${status}">${statusLabel(status)}</small>`:''}</button>`;
    }).join('');
  }

  function applyFilters() {
    const query = frameSearch.value.trim().toLocaleLowerCase('pt-BR');
    clearSearchBtn.hidden = !query;
    state.filteredFrames = state.frames.filter(frame => {
      const inCategory = state.activeCategory === 'todas' || frame.categoriaId === state.activeCategory;
      const text = `${frame.nome} ${categoryName(frame)} ${(frame.tags || []).join(' ')}`.toLocaleLowerCase('pt-BR');
      return inCategory && (!query || text.includes(query));
    });
    renderFrames();
  }

  function renderFrames() {
    if (!state.filteredFrames.length) {
      frameGallery.innerHTML = ''; frameMessage.hidden = false; frameMessage.textContent = 'Nenhuma moldura encontrada. Tente outra pesquisa ou categoria.'; return;
    }
    frameMessage.hidden = true;
    const categories = state.activeCategory === 'todas' ? state.categories : state.categories.filter(c => c.id === state.activeCategory);
    frameGallery.innerHTML = categories.map(category => {
      const frames = state.filteredFrames.filter(f => f.categoriaId === category.id).sort((a,b)=>a.ordem-b.ordem);
      if (!frames.length) return '';
      const status = categoryStatus(category.id);
      return `<section class="frame-group"><div class="frame-group-header"><div><span>🗂️</span><h3>${escapeHtml(category.nome)}</h3>${status!=='normal'?`<small class="category-badge ${status}">${statusLabel(status)}</small>`:''}</div><b>${frames.length} ${frames.length===1?'moldura':'molduras'}</b></div><div class="frame-grid">${frames.map(frame => {
        const selected = state.selectedFrame?.id === frame.id; const frameStatus = statusOf(frame);
        return `<button class="frame-option${selected?' is-selected':''}" type="button" data-frame-id="${escapeHtml(frame.id)}" aria-pressed="${selected}"><span class="frame-thumb"><img src="${escapeHtml(frame.arquivo)}" alt="Prévia de ${escapeHtml(frame.nome)}" loading="lazy"></span><span class="frame-info"><strong>${escapeHtml(frame.nome)}</strong><small>${escapeHtml(category.nome)}</small></span>${frameStatus!=='normal'?`<em class="frame-badge ${frameStatus}">${statusLabel(frameStatus)}</em>`:''}<i aria-hidden="true">✓</i></button>`;
      }).join('')}</div></section>`;
    }).join('');
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
      emptyState.querySelector('span').textContent = '🖼️'; emptyState.querySelector('strong').textContent = 'Escolha uma moldura'; emptyState.querySelector('small').textContent = 'Depois você poderá adicionar sua foto.';
    } else if (!state.photo) {
      uploadTitle.textContent = 'Agora escolha sua foto'; uploadDescription.textContent = `Moldura selecionada: ${state.selectedFrame.nome}`;
      photoStatus.textContent = 'Moldura escolhida ✓'; editorSubtitle.textContent = 'Ótimo! Agora envie uma foto e ajuste como preferir.';
      emptyState.querySelector('span').textContent = '📷'; emptyState.querySelector('strong').textContent = 'Adicione sua foto'; emptyState.querySelector('small').textContent = 'Toque em “Escolher foto” para continuar.';
    }
    updateProgress();
  }

  function setPhotoEnabled(enabled) {
    [zoomRange,zoomNumber,rotationRange,rotationNumber,downloadBtn,mobileDownloadBtn,shareBtn,fitBtn,centerBtn,resetBtn,brightnessRange,contrastRange,saturationRange,warmthRange,resetFiltersBtn].forEach(el => { if (el) el.disabled = !enabled; });
    cropOptions.disabled = !enabled;
    document.querySelectorAll('#filterPresets button').forEach(button => button.disabled = !enabled);
    controls.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    wrap.classList.toggle('is-awaiting-photo', !enabled);
    emptyState.hidden = enabled;
    adjustHint.hidden = !enabled;
    photoButton.textContent = enabled ? '🔄 Trocar foto' : 'Escolher foto';
    photoStatus.textContent = enabled ? 'Foto carregada ✓' : state.selectedFrame ? 'Moldura escolhida ✓' : 'Aguardando moldura';
    photoStatus.classList.toggle('is-ready', enabled);
    uploadTitle.textContent = enabled ? 'Foto adicionada' : state.selectedFrame ? 'Agora escolha sua foto' : 'Selecione uma moldura primeiro';
    uploadDescription.textContent = enabled ? 'Use os controles para posicionar e ajustar.' : state.selectedFrame ? `Moldura selecionada: ${state.selectedFrame.nome}` : 'A foto será processada somente no seu aparelho.';
    mobileActionBar.hidden = !enabled; mobileActionBar.classList.toggle('is-visible', enabled);
    document.body.classList.toggle('has-mobile-bar', enabled);
    updateProgress();
  }

  function selectFrame(frame, scroll=true) {
    state.selectedFrame = frame;
    selectedFrameName.textContent = `✓ ${frame.nome}`;
    loadFrame(frame.arquivo);
    renderFrames(); setFrameReady(true);
    const url = new URL(location.href); url.searchParams.set('moldura',frame.id); history.replaceState({},'',url);
    if (scroll) $('editor').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function loadFrame(src) {
    const image = new Image();
    image.onload = () => { state.frameImage = image; draw(); };
    image.onerror = () => { state.frameImage = null; draw(); alert('Não foi possível carregar esta moldura.'); };
    image.src = src;
  }

  function updateTransformControls() {
    zoomRange.value = String(state.scale); zoomNumber.value = String(Math.round(state.scale*100));
    rotationRange.value = String(state.rotation); rotationNumber.value = String(Math.round(state.rotation));
  }

  function coverScale(image) { return Math.max(1080/image.naturalWidth,1080/image.naturalHeight); }
  function resetPhotoPosition() { if (!state.photo) return; state.baseScale=coverScale(state.photo); state.scale=1; state.rotation=0; state.x=540; state.y=540; updateTransformControls(); draw(); }
  function setZoom(value) { state.scale=clamp(Number(value)||1,.2,4); updateTransformControls(); draw(); }
  function setRotation(value,snap=false) { let v=clamp(Number(value)||0,-180,180); if(snap && Math.abs(v)<=ROTATION_SNAP)v=0; state.rotation=v; updateTransformControls(); wrap.classList.toggle('is-rotation-snapped',snap&&v===0); draw(); }

  function createCropPath(shape) {
    if (shape === 'full') return;
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(540,540,455,0,Math.PI*2);
    else if (shape === 'square') ctx.rect(90,90,900,900);
    else if (shape === 'rounded') {
      const x=90,y=90,w=900,h=900,r=100;
      ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);
    }
    ctx.closePath(); ctx.clip();
  }

  function draw() {
    ctx.clearRect(0,0,1080,1080); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1080,1080);
    if (state.photo) {
      ctx.save(); createCropPath(state.cropShape);
      ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturation}%) sepia(${state.warmth}%)`;
      ctx.translate(state.x,state.y); ctx.rotate(state.rotation*Math.PI/180);
      const s=state.baseScale*state.scale,w=state.photo.naturalWidth*s,h=state.photo.naturalHeight*s;
      ctx.drawImage(state.photo,-w/2,-h/2,w,h); ctx.restore(); ctx.filter='none';
    }
    if (state.frameImage) ctx.drawImage(state.frameImage,0,0,1080,1080);
  }

  function updateFilterOutputs() {
    $('brightnessOutput').textContent=`${state.brightness}%`; $('contrastOutput').textContent=`${state.contrast}%`; $('saturationOutput').textContent=`${state.saturation}%`; $('warmthOutput').textContent=`${state.warmth}%`;
  }
  function applyPreset(name) {
    const presets={original:[100,100,100,0],vivid:[105,112,135,5],warm:[104,102,112,35],bw:[105,115,0,0],soft:[108,88,85,8]};
    const p=presets[name]||presets.original; [state.brightness,state.contrast,state.saturation,state.warmth]=p;
    [brightnessRange.value,contrastRange.value,saturationRange.value,warmthRange.value]=p.map(String); updateFilterOutputs();
    document.querySelectorAll('#filterPresets button').forEach(b=>b.classList.toggle('is-active',b.dataset.preset===name)); draw();
  }
  function resetAdvanced() { state.cropShape='full'; document.querySelector('input[name="cropShape"][value="full"]').checked=true; applyPreset('original'); }

  photoInput.addEventListener('change', event => {
    const file=event.target.files?.[0]; if(!file)return;
    if(!file.type.startsWith('image/')) return alert('Escolha um arquivo de imagem válido.');
    const reader=new FileReader(); reader.onload=()=>{const image=new Image(); image.onload=()=>{state.photo=image;resetPhotoPosition();setPhotoEnabled(true);};image.onerror=()=>alert('Não foi possível abrir esta imagem.');image.src=reader.result;};reader.readAsDataURL(file);
  });
  zoomRange.addEventListener('input',()=>setZoom(zoomRange.value)); zoomNumber.addEventListener('input',()=>{if(zoomNumber.value!=='')setZoom(Number(zoomNumber.value)/100);}); zoomNumber.addEventListener('change',()=>setZoom(Number(zoomNumber.value||100)/100));
  rotationRange.addEventListener('input',()=>setRotation(rotationRange.value,true)); rotationRange.addEventListener('change',()=>wrap.classList.remove('is-rotation-snapped')); rotationNumber.addEventListener('input',()=>{if(rotationNumber.value!=='')setRotation(rotationNumber.value);}); rotationNumber.addEventListener('change',()=>setRotation(rotationNumber.value||0));
  fitBtn.addEventListener('click',resetPhotoPosition); centerBtn.addEventListener('click',()=>{state.x=540;state.y=540;draw();});
  resetBtn.addEventListener('click',clearPhoto); newCreationBtn.addEventListener('click',()=>{clearPhoto();$('galeria').scrollIntoView({behavior:'smooth'});});
  function clearPhoto(){photoInput.value='';state.photo=null;resetAdvanced();setPhotoEnabled(false);setFrameReady(Boolean(state.selectedFrame));draw();}

  document.querySelectorAll('input[name="cropShape"]').forEach(input=>input.addEventListener('change',()=>{state.cropShape=input.value;draw();}));
  document.querySelectorAll('#filterPresets button').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset)));
  [[brightnessRange,'brightness'],[contrastRange,'contrast'],[saturationRange,'saturation'],[warmthRange,'warmth']].forEach(([range,key])=>range.addEventListener('input',()=>{state[key]=Number(range.value);updateFilterOutputs();document.querySelectorAll('#filterPresets button').forEach(b=>b.classList.remove('is-active'));draw();}));
  resetFiltersBtn.addEventListener('click',resetAdvanced);

  frameGallery.addEventListener('click',event=>{const button=event.target.closest('[data-frame-id]');if(!button)return;const frame=state.frames.find(f=>f.id===button.dataset.frameId);if(frame)selectFrame(frame);});
  categoryFilters.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;state.activeCategory=button.dataset.category;categoryFilters.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active',b===button));applyFilters();});
  frameSearch.addEventListener('input',applyFilters); clearSearchBtn.addEventListener('click',()=>{frameSearch.value='';applyFilters();frameSearch.focus();});

  function canvasPoint(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*1080/rect.width,y:(event.clientY-rect.top)*1080/rect.height};}
  wrap.addEventListener('pointerdown',event=>{if(!state.photo)return;wrap.setPointerCapture(event.pointerId);const p=canvasPoint(event);state.pointers.set(event.pointerId,p);if(state.pointers.size===1)state.lastPointer=p;if(state.pointers.size===2){const[a,b]=[...state.pointers.values()];state.pinchDistance=Math.hypot(b.x-a.x,b.y-a.y);state.pinchScale=state.scale;}});
  wrap.addEventListener('pointermove',event=>{if(!state.photo||!state.pointers.has(event.pointerId))return;const p=canvasPoint(event);state.pointers.set(event.pointerId,p);if(state.pointers.size===1&&state.lastPointer){state.x+=p.x-state.lastPointer.x;state.y+=p.y-state.lastPointer.y;state.lastPointer=p;draw();}else if(state.pointers.size===2&&state.pinchDistance){const[a,b]=[...state.pointers.values()];setZoom(state.pinchScale*Math.hypot(b.x-a.x,b.y-a.y)/state.pinchDistance);}});
  function release(event){state.pointers.delete(event.pointerId);state.lastPointer=state.pointers.size===1?[...state.pointers.values()][0]:null;if(state.pointers.size<2)state.pinchDistance=null;}
  wrap.addEventListener('pointerup',release);wrap.addEventListener('pointercancel',release);wrap.addEventListener('wheel',event=>{if(!state.photo)return;event.preventDefault();setZoom(state.scale*(event.deltaY<0?1.05:.95));},{passive:false});

  function makeBlob(){return new Promise((resolve,reject)=>{draw();canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar a imagem.')),'image/png');});}
  function filename(){return `foto-${slug(state.selectedFrame?.nome)||'moldura-lions'}.png`;}
  async function downloadImage(){if(!state.photo)return;const text=downloadBtn.innerHTML;downloadBtn.disabled=true;mobileDownloadBtn.disabled=true;downloadBtn.textContent='Gerando…';try{const blob=await makeBlob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){alert(e.message);}finally{downloadBtn.disabled=false;mobileDownloadBtn.disabled=false;downloadBtn.innerHTML=text;}}
  async function shareImage(){if(!state.photo)return;try{const blob=await makeBlob(),file=new File([blob],filename(),{type:'image/png'});if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Minha foto com moldura do Lions'});else await downloadImage();}catch(e){if(e.name!=='AbortError')await downloadImage();}}
  downloadBtn.addEventListener('click',downloadImage);mobileDownloadBtn.addEventListener('click',downloadImage);shareBtn.addEventListener('click',shareImage);

  const helpDialog=$('helpDialog'); function openHelp(){helpDialog.showModal();} function closeHelp(){helpDialog.close();}
  $('openHelpBtn').addEventListener('click',openHelp);$('heroHelpBtn').addEventListener('click',openHelp);$('closeHelpBtn').addEventListener('click',closeHelp);$('startFromHelpBtn').addEventListener('click',()=>{closeHelp();$('galeria').scrollIntoView({behavior:'smooth'});});helpDialog.addEventListener('click',event=>{if(event.target===helpDialog)closeHelp();});

  function init(){
    try{normalizeData();if(!state.frames.length)throw new Error('Nenhuma moldura ativa encontrada.');buildCategories();applyFilters();const requested=new URLSearchParams(location.search).get('moldura');const frame=requested?state.frames.find(f=>f.id===requested):null;if(frame)selectFrame(frame,false);else setFrameReady(false);}catch(error){console.error(error);frameMessage.hidden=false;frameMessage.textContent='Não foi possível carregar as molduras. Confira o arquivo molduras.js.';selectedFrameName.textContent='Erro ao carregar';}
    updateTransformControls();updateFilterOutputs();setPhotoEnabled(false);draw();
  }
  init();
})();
