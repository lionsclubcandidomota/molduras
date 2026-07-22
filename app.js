(() => {
  const canvas = document.getElementById('editorCanvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvasWrap');
  const photoInput = document.getElementById('photoInput');
  const emptyState = document.getElementById('emptyState');
  const zoomRange = document.getElementById('zoomRange');
  const rotationRange = document.getElementById('rotationRange');
  const downloadBtn = document.getElementById('downloadBtn');
  const fitBtn = document.getElementById('fitBtn');
  const centerBtn = document.getElementById('centerBtn');
  const resetBtn = document.getElementById('resetBtn');
  const frameGallery = document.getElementById('frameGallery');
  const selectedFrameName = document.getElementById('selectedFrameName');
  const photoButton = document.getElementById('photoButton');
  const photoStatus = document.getElementById('photoStatus');
  const adjustHint = document.getElementById('adjustHint');
  const stepFrames = document.getElementById('stepFrames');
  const stepPhoto = document.getElementById('stepPhoto');
  const frameSearch = document.getElementById('frameSearch');
  const categoryFilters = document.getElementById('categoryFilters');
  const frameMessage = document.getElementById('frameMessage');

  const state = {
    frames: [], filteredFrames: [], selectedFrame: null, activeCategory: 'Todas',
    photo: null, frame: null, x: 540, y: 540, scale: 1, rotation: 0, baseScale: 1,
    pointers: new Map(), lastPointer: null, pinchDistance: null, pinchScale: 1
  };

  const escapeHtml = value => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function loadFrames() {
    try {
      const data = Array.isArray(window.MOLDURAS) ? window.MOLDURAS : [];
      state.frames = data.filter(frame => frame.ativo !== false && frame.id && frame.nome && frame.arquivo);
      if (!state.frames.length) throw new Error('Nenhuma moldura ativa encontrada.');
      buildCategories();
      applyFilters();
      selectFrame(state.frames[0]);
    } catch (error) {
      console.error(error);
      frameMessage.hidden = false;
      frameMessage.textContent = 'Não foi possível carregar molduras.js. Confirme se o arquivo está na raiz do site e se a lista está válida.';
      selectedFrameName.textContent = 'Erro ao carregar';
    }
  }

  function buildCategories() {
    const categories = ['Todas', ...new Set(state.frames.map(frame => frame.categoria || 'Outras'))];
    categoryFilters.innerHTML = categories.map((category, index) =>
      `<button type="button" class="category-chip${index === 0 ? ' is-active' : ''}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    ).join('');
    categoryFilters.addEventListener('click', event => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      state.activeCategory = button.dataset.category;
      categoryFilters.querySelectorAll('.category-chip').forEach(item => item.classList.toggle('is-active', item === button));
      applyFilters();
    });
  }

  function applyFilters() {
    const query = frameSearch.value.trim().toLocaleLowerCase('pt-BR');
    state.filteredFrames = state.frames.filter(frame => {
      const category = frame.categoria || 'Outras';
      const categoryMatch = state.activeCategory === 'Todas' || category === state.activeCategory;
      const textMatch = !query || `${frame.nome} ${category}`.toLocaleLowerCase('pt-BR').includes(query);
      return categoryMatch && textMatch;
    });
    renderFrames();
  }

  function renderFrames() {
    if (!state.filteredFrames.length) {
      frameGallery.innerHTML = '';
      frameMessage.hidden = false;
      frameMessage.textContent = 'Nenhuma moldura encontrada nessa pesquisa.';
      return;
    }
    frameMessage.hidden = true;
    frameGallery.innerHTML = state.filteredFrames.map(frame => `
      <button type="button" class="frame-option${state.selectedFrame?.id === frame.id ? ' is-selected' : ''}" data-frame-id="${escapeHtml(frame.id)}" role="listitem" aria-pressed="${state.selectedFrame?.id === frame.id}">
        <span class="frame-thumb"><img src="${escapeHtml(frame.arquivo)}" alt="Prévia da moldura ${escapeHtml(frame.nome)}" loading="lazy"></span>
        <span class="frame-name">${escapeHtml(frame.nome)}</span>
        ${frame.novo ? '<span class="new-badge">Nova</span>' : ''}
        <span class="frame-check" aria-hidden="true">✓</span>
      </button>`).join('');
  }

  frameGallery.addEventListener('click', event => {
    const button = event.target.closest('[data-frame-id]');
    if (!button) return;
    const frame = state.frames.find(item => item.id === button.dataset.frameId);
    if (frame) selectFrame(frame);
  });
  frameSearch.addEventListener('input', applyFilters);

  function selectFrame(frame) {
    state.selectedFrame = frame;
    selectedFrameName.textContent = frame.nome;
    renderFrames();
    loadFrame(frame.arquivo);
  }

  function loadFrame(source) {
    const img = new Image();
    img.onload = () => { state.frame = img; draw(); };
    img.onerror = () => {
      state.frame = null;
      draw();
      alert(`Não foi possível carregar a moldura “${state.selectedFrame?.nome || ''}”. Verifique o caminho no molduras.js.`);
    };
    img.src = source;
  }

  function setEnabled(enabled) {
    [zoomRange, rotationRange, downloadBtn, fitBtn, centerBtn, resetBtn].forEach(el => el.disabled = !enabled);
    emptyState.hidden = enabled;
    adjustHint.hidden = !enabled;
    photoStatus.textContent = enabled ? 'Foto carregada ✓' : 'Aguardando foto';
    photoStatus.classList.toggle('is-ready', enabled);
    photoButton.innerHTML = enabled ? '<span aria-hidden="true">🔄</span> Trocar foto' : '<span aria-hidden="true">📷</span> Escolher foto';
    stepFrames.classList.toggle('is-active', !enabled);
    stepPhoto.classList.toggle('is-active', enabled);
    document.getElementById('controls').setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  function coverScale(img) { return Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight); }
  function resetPhoto() {
    if (!state.photo) return;
    state.baseScale = coverScale(state.photo); state.scale = 1; state.rotation = 0; state.x = 540; state.y = 540;
    zoomRange.value = '1'; rotationRange.value = '0'; draw();
  }
  function draw() {
    ctx.clearRect(0, 0, 1080, 1080); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1080, 1080);
    if (state.photo) {
      ctx.save(); ctx.translate(state.x, state.y); ctx.rotate(state.rotation * Math.PI / 180);
      const scale = state.baseScale * state.scale;
      const width = state.photo.naturalWidth * scale, height = state.photo.naturalHeight * scale;
      ctx.drawImage(state.photo, -width / 2, -height / 2, width, height); ctx.restore();
    }
    if (state.frame) ctx.drawImage(state.frame, 0, 0, 1080, 1080);
  }

  photoInput.addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Escolha um arquivo de imagem válido.');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { state.photo = img; resetPhoto(); setEnabled(true); stepPhoto.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      img.onerror = () => alert('Não foi possível abrir esta imagem.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  zoomRange.addEventListener('input', () => { state.scale = Number(zoomRange.value); draw(); });
  rotationRange.addEventListener('input', () => { state.rotation = Number(rotationRange.value); draw(); });
  fitBtn.addEventListener('click', resetPhoto);
  centerBtn.addEventListener('click', () => { state.x = 540; state.y = 540; draw(); });
  resetBtn.addEventListener('click', () => { photoInput.value = ''; state.photo = null; setEnabled(false); draw(); });

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * 1080 / rect.width, y: (event.clientY - rect.top) * 1080 / rect.height };
  }
  wrap.addEventListener('pointerdown', event => {
    if (!state.photo) return;
    wrap.setPointerCapture(event.pointerId); state.pointers.set(event.pointerId, canvasPoint(event));
    if (state.pointers.size === 1) state.lastPointer = canvasPoint(event);
    if (state.pointers.size === 2) {
      const [a,b] = [...state.pointers.values()]; state.pinchDistance = Math.hypot(b.x-a.x,b.y-a.y); state.pinchScale = state.scale;
    }
  });
  wrap.addEventListener('pointermove', event => {
    if (!state.photo || !state.pointers.has(event.pointerId)) return;
    const point = canvasPoint(event); state.pointers.set(event.pointerId, point);
    if (state.pointers.size === 1 && state.lastPointer) {
      state.x += point.x - state.lastPointer.x; state.y += point.y - state.lastPointer.y; state.lastPointer = point; draw();
    } else if (state.pointers.size === 2 && state.pinchDistance) {
      const [a,b] = [...state.pointers.values()];
      state.scale = Math.min(4, Math.max(.2, state.pinchScale * Math.hypot(b.x-a.x,b.y-a.y) / state.pinchDistance));
      zoomRange.value = String(state.scale); draw();
    }
  });
  function releasePointer(event) {
    state.pointers.delete(event.pointerId); state.lastPointer = state.pointers.size === 1 ? [...state.pointers.values()][0] : null;
    if (state.pointers.size < 2) state.pinchDistance = null;
  }
  wrap.addEventListener('pointerup', releasePointer); wrap.addEventListener('pointercancel', releasePointer);
  wrap.addEventListener('wheel', event => {
    if (!state.photo) return; event.preventDefault();
    state.scale = Math.min(4, Math.max(.2, state.scale * (event.deltaY < 0 ? 1.05 : .95)));
    zoomRange.value = String(state.scale); draw();
  }, { passive: false });

  downloadBtn.addEventListener('click', () => {
    if (!state.photo || !state.selectedFrame) return;
    draw(); const filename = `foto-${slug(state.selectedFrame.nome) || 'moldura'}.png`;
    const original = downloadBtn.innerHTML; downloadBtn.disabled = true; downloadBtn.textContent = 'Gerando...';
    canvas.toBlob(async blob => {
      try {
        if (!blob) throw new Error('Falha ao gerar imagem');
        const file = new File([blob], filename, { type: 'image/png' });
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Minha foto com moldura' });
        } else {
          const url = URL.createObjectURL(blob); const link = document.createElement('a');
          link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }
      } catch (error) {
        if (error?.name !== 'AbortError') alert('Não foi possível baixar. Tente usar Chrome, Edge ou Safari atualizado.');
      } finally { downloadBtn.disabled = false; downloadBtn.innerHTML = original; }
    }, 'image/png');
  });

  setEnabled(false); draw(); loadFrames();
})();
