(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const canvas = byId('editorCanvas');
  const ctx = canvas.getContext('2d');
  const wrap = byId('canvasWrap');
  const photoInput = byId('photoInput');
  const emptyState = byId('emptyState');
  const zoomRange = byId('zoomRange');
  const rotationRange = byId('rotationRange');
  const downloadBtn = byId('downloadBtn');
  const mobileDownloadBtn = byId('mobileDownloadBtn');
  const shareBtn = byId('shareBtn');
  const fitBtn = byId('fitBtn');
  const centerBtn = byId('centerBtn');
  const resetBtn = byId('resetBtn');
  const frameGallery = byId('frameGallery');
  const selectedFrameName = byId('selectedFrameName');
  const photoButton = byId('photoButton');
  const photoStatus = byId('photoStatus');
  const adjustHint = byId('adjustHint');
  const frameSearch = byId('frameSearch');
  const categoryFilters = byId('categoryFilters');
  const frameMessage = byId('frameMessage');
  const mobileActionBar = byId('mobileActionBar');
  const newCreationBtn = byId('newCreationBtn');

  const state = {
    categories: [], frames: [], filteredFrames: [], selectedFrame: null, activeCategory: 'todas',
    photo: null, frameImage: null, x: 540, y: 540, scale: 1, rotation: 0, baseScale: 1,
    pointers: new Map(), lastPointer: null, pinchDistance: null, pinchScale: 1
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const slug = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const categoryName = frame => frame.categoriaNome || frame.categoria || state.categories.find(c => c.id === frame.categoriaId)?.nome || 'Outras';

  function normalizeData() {
    const rawFrames = Array.isArray(window.MOLDURAS) ? window.MOLDURAS : [];
    const rawCategories = Array.isArray(window.CATEGORIAS) ? window.CATEGORIAS : [];
    state.categories = rawCategories.filter(c => c && c.ativo !== false).map((c, i) => ({ id: c.id || slug(c.nome), nome: c.nome || 'Outras', ordem: Number(c.ordem) || i + 1 })).sort((a,b) => a.ordem - b.ordem);
    state.frames = rawFrames.filter(f => f && f.ativo !== false && f.id && f.nome && f.arquivo).map((f, i) => ({...f, ordem: Number(f.ordem) || i + 1}));
    if (!state.categories.length) {
      const seen = [];
      state.frames.forEach(f => { const nome = f.categoria || 'Outras'; if (!seen.includes(nome)) seen.push(nome); });
      state.categories = seen.map((nome, i) => ({ id: slug(nome) || `categoria-${i+1}`, nome, ordem: i + 1 }));
    }
    state.frames.forEach(f => {
      if (!f.categoriaId) f.categoriaId = state.categories.find(c => c.nome === (f.categoria || 'Outras'))?.id || state.categories[0]?.id;
    });
  }

  function loadFrames() {
    try {
      normalizeData();
      if (!state.frames.length) throw new Error('Nenhuma moldura ativa encontrada.');
      buildCategories();
      applyFilters();
      const requested = new URLSearchParams(location.search).get('moldura');
      selectFrame(state.frames.find(f => f.id === requested) || state.frames[0], false);
    } catch (error) {
      console.error(error);
      frameMessage.hidden = false;
      frameMessage.textContent = 'Não foi possível carregar as molduras. Confira o arquivo molduras.js.';
      selectedFrameName.textContent = 'Erro ao carregar';
    }
  }

  function buildCategories() {
    const available = state.categories.filter(c => state.frames.some(f => f.categoriaId === c.id));
    const buttons = [{id:'todas', nome:'Todas'}, ...available];
    categoryFilters.innerHTML = buttons.map(c => `<button type="button" class="category-chip${c.id === 'todas' ? ' is-active' : ''}" data-category="${escapeHtml(c.id)}">${escapeHtml(c.nome)}</button>`).join('');
  }

  categoryFilters.addEventListener('click', event => {
    const button = event.target.closest('[data-category]'); if (!button) return;
    state.activeCategory = button.dataset.category;
    categoryFilters.querySelectorAll('.category-chip').forEach(item => item.classList.toggle('is-active', item === button));
    applyFilters();
  });
  frameSearch.addEventListener('input', applyFilters);

  function applyFilters() {
    const query = frameSearch.value.trim().toLocaleLowerCase('pt-BR');
    state.filteredFrames = state.frames.filter(frame => {
      const cat = categoryName(frame);
      const inCategory = state.activeCategory === 'todas' || frame.categoriaId === state.activeCategory;
      const searchable = `${frame.nome} ${cat} ${(frame.tags || []).join(' ')}`.toLocaleLowerCase('pt-BR');
      return inCategory && (!query || searchable.includes(query));
    });
    renderFrames();
  }

  function renderFrames() {
    if (!state.filteredFrames.length) {
      frameGallery.innerHTML = ''; frameMessage.hidden = false;
      frameMessage.textContent = 'Nenhuma moldura encontrada. Tente outra palavra ou categoria.'; return;
    }
    frameMessage.hidden = true;
    const categoryList = state.activeCategory === 'todas' ? state.categories : state.categories.filter(c => c.id === state.activeCategory);
    frameGallery.innerHTML = categoryList.map(category => {
      const frames = state.filteredFrames.filter(f => f.categoriaId === category.id).sort((a,b) => a.ordem - b.ordem);
      if (!frames.length) return '';
      return `<section class="frame-group" aria-labelledby="cat-${escapeHtml(category.id)}">
        <div class="frame-group-header"><h3 id="cat-${escapeHtml(category.id)}">${escapeHtml(category.nome)}</h3><span class="frame-count">${frames.length}</span></div>
        <div class="frame-grid" role="list">${frames.map(frame => `
          <button type="button" class="frame-option${state.selectedFrame?.id === frame.id ? ' is-selected' : ''}" data-frame-id="${escapeHtml(frame.id)}" role="listitem" aria-pressed="${state.selectedFrame?.id === frame.id}">
            <span class="frame-thumb"><img src="${escapeHtml(frame.arquivo)}" alt="Prévia de ${escapeHtml(frame.nome)}" loading="lazy"></span>
            <span class="frame-name">${escapeHtml(frame.nome)}</span>
            <span class="frame-meta">${escapeHtml(category.nome)}</span>
            ${frame.novo ? '<span class="new-badge">NOVA</span>' : ''}<span class="frame-check" aria-hidden="true">✓</span>
          </button>`).join('')}</div></section>`;
    }).join('');
  }

  frameGallery.addEventListener('click', event => {
    const button = event.target.closest('[data-frame-id]'); if (!button) return;
    const frame = state.frames.find(item => item.id === button.dataset.frameId); if (frame) selectFrame(frame, true);
  });

  function selectFrame(frame, scroll) {
    state.selectedFrame = frame; selectedFrameName.textContent = `Selecionada: ${frame.nome}`; renderFrames(); loadFrame(frame.arquivo);
    const url = new URL(location.href); url.searchParams.set('moldura', frame.id); history.replaceState({}, '', url);
    if (scroll && matchMedia('(max-width: 780px)').matches) byId('editor').scrollIntoView({behavior:'smooth', block:'start'});
  }

  function loadFrame(source) {
    const img = new Image();
    img.onload = () => { state.frameImage = img; draw(); };
    img.onerror = () => { state.frameImage = null; draw(); alert('Não foi possível carregar esta moldura.'); };
    img.src = source;
  }

  function setEnabled(enabled) {
    [zoomRange, rotationRange, downloadBtn, shareBtn, fitBtn, centerBtn, resetBtn]
      .filter(Boolean)
      .forEach(el => { el.disabled = !enabled; });

    if (emptyState) emptyState.hidden = enabled;
    if (adjustHint) adjustHint.hidden = !enabled;
    if (photoStatus) {
      photoStatus.textContent = enabled ? 'Foto carregada ✓' : 'Aguardando foto';
      photoStatus.classList.toggle('is-ready', enabled);
    }
    if (photoButton) photoButton.textContent = enabled ? '🔄 Trocar foto' : '📷 Escolher foto';

    const controls = byId('controls');
    if (controls) controls.setAttribute('aria-disabled', enabled ? 'false' : 'true');

    if (mobileActionBar) {
      mobileActionBar.classList.toggle('is-visible', enabled);
      mobileActionBar.hidden = !enabled;
    }
    document.body.classList.toggle('has-mobile-bar', Boolean(enabled && mobileActionBar));
  }

  const coverScale = img => Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
  function resetPhotoPosition() {
    if (!state.photo) return;
    state.baseScale = coverScale(state.photo); state.scale = 1; state.rotation = 0; state.x = 540; state.y = 540;
    zoomRange.value = '1'; rotationRange.value = '0'; draw();
  }
  function draw() {
    ctx.clearRect(0,0,1080,1080); ctx.fillStyle='#fff'; ctx.fillRect(0,0,1080,1080);
    if (state.photo) {
      ctx.save(); ctx.translate(state.x,state.y); ctx.rotate(state.rotation*Math.PI/180);
      const s=state.baseScale*state.scale,w=state.photo.naturalWidth*s,h=state.photo.naturalHeight*s;
      ctx.drawImage(state.photo,-w/2,-h/2,w,h); ctx.restore();
    }
    if (state.frameImage) ctx.drawImage(state.frameImage,0,0,1080,1080);
  }

  photoInput.addEventListener('change', event => {
    const file=event.target.files?.[0]; if(!file)return;
    if(!file.type.startsWith('image/')) return alert('Escolha um arquivo de imagem válido.');
    const reader=new FileReader(); reader.onload=()=>{const img=new Image();img.onload=()=>{state.photo=img;resetPhotoPosition();setEnabled(true);byId('editor').scrollIntoView({behavior:'smooth',block:'start'});};img.onerror=()=>alert('Não foi possível abrir esta imagem.');img.src=reader.result;}; reader.readAsDataURL(file);
  });
  zoomRange.addEventListener('input',()=>{state.scale=Number(zoomRange.value);draw();});
  rotationRange.addEventListener('input',()=>{state.rotation=Number(rotationRange.value);draw();});
  fitBtn.addEventListener('click',resetPhotoPosition);
  centerBtn.addEventListener('click',()=>{state.x=540;state.y=540;draw();});
  resetBtn.addEventListener('click',clearPhoto); newCreationBtn.addEventListener('click',()=>{clearPhoto();scrollTo({top:0,behavior:'smooth'});});
  function clearPhoto(){photoInput.value='';state.photo=null;setEnabled(false);draw();}

  function canvasPoint(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*1080/rect.width,y:(event.clientY-rect.top)*1080/rect.height};}
  wrap.addEventListener('pointerdown',event=>{if(!state.photo)return;wrap.setPointerCapture(event.pointerId);state.pointers.set(event.pointerId,canvasPoint(event));if(state.pointers.size===1)state.lastPointer=canvasPoint(event);if(state.pointers.size===2){const[a,b]=[...state.pointers.values()];state.pinchDistance=Math.hypot(b.x-a.x,b.y-a.y);state.pinchScale=state.scale;}});
  wrap.addEventListener('pointermove',event=>{if(!state.photo||!state.pointers.has(event.pointerId))return;const point=canvasPoint(event);state.pointers.set(event.pointerId,point);if(state.pointers.size===1&&state.lastPointer){state.x+=point.x-state.lastPointer.x;state.y+=point.y-state.lastPointer.y;state.lastPointer=point;draw();}else if(state.pointers.size===2&&state.pinchDistance){const[a,b]=[...state.pointers.values()];state.scale=Math.min(4,Math.max(.2,state.pinchScale*Math.hypot(b.x-a.x,b.y-a.y)/state.pinchDistance));zoomRange.value=String(state.scale);draw();}});
  function releasePointer(event){state.pointers.delete(event.pointerId);state.lastPointer=state.pointers.size===1?[...state.pointers.values()][0]:null;if(state.pointers.size<2)state.pinchDistance=null;}
  wrap.addEventListener('pointerup',releasePointer);wrap.addEventListener('pointercancel',releasePointer);
  wrap.addEventListener('wheel',event=>{if(!state.photo)return;event.preventDefault();state.scale=Math.min(4,Math.max(.2,state.scale*(event.deltaY<0?1.05:.95)));zoomRange.value=String(state.scale);draw();},{passive:false});

  function makeBlob(){return new Promise((resolve,reject)=>{draw();canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar a imagem.')),'image/png');});}
  function filename(){return `foto-${slug(state.selectedFrame?.nome)||'moldura-lions'}.png`;}
  async function downloadImage(){if(!state.photo)return;const original=downloadBtn.innerHTML;downloadBtn.disabled=true;mobileDownloadBtn.disabled=true;downloadBtn.textContent='Gerando…';try{const blob=await makeBlob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename();document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){alert(e.message);}finally{downloadBtn.disabled=false;mobileDownloadBtn.disabled=false;downloadBtn.innerHTML=original;}}
  async function shareImage(){if(!state.photo)return;try{const blob=await makeBlob();const file=new File([blob],filename(),{type:'image/png'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Minha foto com moldura do Lions'});}else{await downloadImage();}}catch(e){if(e.name!=='AbortError')alert('O compartilhamento não está disponível neste navegador. A imagem será baixada.');}}
  downloadBtn.addEventListener('click',downloadImage);mobileDownloadBtn.addEventListener('click',downloadImage);shareBtn.addEventListener('click',shareImage);

  // Carrega a galeria mesmo que algum controle opcional do editor não exista.
  loadFrames();
  setEnabled(false);
  draw();
})();
