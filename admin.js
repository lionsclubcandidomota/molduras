(() => {
  "use strict";

  const API_VERSION = "2022-11-28";
  const MAX_CONFLICT_RETRIES = 4;
  const CONFIG_PATH = "molduras.js";
  const IMAGE_DIR = "assets/molduras";

  const state = {
    owner: "",
    repo: "",
    branch: "main",
    token: "",
    frames: [],
    pendingDelete: null,
    operationInProgress: false,
    orderDirty: false,
    originalOrder: [],
    categoryOrder: [],
    originalCategoryOrder: [],
    draggedId: null,
    draggedCategory: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    connectionForm: $("connectionForm"),
    owner: $("repoOwner"),
    repo: $("repoName"),
    branch: $("repoBranch"),
    token: $("githubToken"),
    toggleToken: $("toggleToken"),
    connectBtn: $("connectBtn"),
    connectionStatus: $("connectionStatus"),
    managerCard: $("managerCard"),
    refreshBtn: $("refreshBtn"),
    flash: $("flashMessage"),
    frameForm: $("frameForm"),
    originalId: $("editingOriginalId"),
    formTitle: $("formTitle"),
    cancelEdit: $("cancelEditBtn"),
    frameName: $("frameName"),
    frameId: $("frameId"),
    category: $("frameCategory"),
    categoryList: $("categoryList"),
    frameFile: $("frameFile"),
    fileHint: $("fileHint"),
    active: $("frameActive"),
    isNew: $("frameNew"),
    preview: $("filePreview"),
    destination: $("destinationPath"),
    saveBtn: $("saveFrameBtn"),
    list: $("framesList"),
    count: $("frameCount"),
    search: $("adminSearch"),
    saveOrder: $("saveOrderBtn"),
    cancelOrder: $("cancelOrderBtn"),
    orderNotice: $("orderNotice"),
    categoriesOrderList: $("categoriesOrderList"),
    dialog: $("confirmDialog"),
    confirmText: $("confirmText"),
    deleteFile: $("deleteImageFile"),
    confirmDelete: $("confirmDeleteBtn"),
  };

  class GitHubError extends Error {
    constructor(message, status = 0, data = null) {
      super(message);
      this.name = "GitHubError";
      this.status = status;
      this.data = data;
    }
  }

  function slugify(value) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));
  }

  function setStatus(text, type = "neutral") {
    els.connectionStatus.textContent = text;
    els.connectionStatus.className = `status ${type}`;
  }

  function flash(message, type = "info") {
    els.flash.textContent = message;
    els.flash.className = `flash ${type}`;
    els.flash.hidden = false;
    els.flash.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearFlash() {
    els.flash.hidden = true;
  }

  function setBusy(isBusy, label = "Sincronizando...") {
    state.operationInProgress = isBusy;
    els.refreshBtn.disabled = isBusy;
    els.connectBtn.disabled = isBusy;
    els.saveBtn.disabled = isBusy;
    els.confirmDelete.disabled = isBusy;
    els.saveOrder.disabled = isBusy || !state.orderDirty;
    els.cancelOrder.disabled = isBusy || !state.orderDirty;
    if (isBusy) setStatus(label, "neutral");
  }

  function headers() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.token}`,
      "X-GitHub-Api-Version": API_VERSION,
    };
  }

  function apiUrl(path) {
    const question = path.indexOf("?");
    const pathname = question >= 0 ? path.slice(0, question) : path;
    const query = question >= 0 ? path.slice(question + 1) : "";
    const encodedPath = pathname.split("/").map(encodeURIComponent).join("/");
    const base = `https://api.github.com/repos/${encodeURIComponent(state.owner)}/${encodeURIComponent(state.repo)}/contents/${encodedPath}`;
    return query ? `${base}?${query}` : base;
  }

  async function api(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        ...headers(),
        ...(options.headers || {}),
      },
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      // Algumas respostas podem não conter JSON.
    }

    if (!response.ok) {
      throw new GitHubError(data?.message || `Erro ${response.status} ao acessar o GitHub.`, response.status, data);
    }

    return data;
  }

  function isConflict(error) {
    if (!(error instanceof GitHubError)) return false;
    const message = error.message.toLowerCase();
    return error.status === 409 || error.status === 422 || message.includes("does not match") || message.includes("sha");
  }

  function isNotFound(error) {
    return error instanceof GitHubError && error.status === 404;
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToUtf8(base64) {
    const binary = atob(base64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function serializeFrames(frames) {
    return `window.MOLDURAS = ${JSON.stringify(frames, null, 2)};\n`;
  }

  function parseFrames(source) {
    const match = source.match(/(?:window\.)?MOLDURAS\s*=\s*([\s\S]*?)\s*;\s*$/);
    if (!match) {
      throw new Error("O arquivo molduras.js não está no formato esperado: window.MOLDURAS = [...];");
    }

    try {
      const parsed = JSON.parse(match[1]);
      if (!Array.isArray(parsed)) throw new Error();
      return parsed;
    } catch {
      throw new Error("O conteúdo de molduras.js precisa ser uma lista JSON válida.");
    }
  }

  async function getContent(path) {
    return api(`${path}?ref=${encodeURIComponent(state.branch)}`);
  }

  async function putContent(path, content, message, sha) {
    return api(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content,
        branch: state.branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  async function deleteContent(path, message, sha) {
    return api(path, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha, branch: state.branch }),
    });
  }

  async function readLatestFrames() {
    const file = await getContent(CONFIG_PATH);
    return {
      sha: file.sha,
      frames: parseFrames(base64ToUtf8(file.content)),
    };
  }

  async function mutateFrames(message, mutator) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
      try {
        const latest = await readLatestFrames();
        const working = structuredClone(latest.frames);
        const result = await mutator(working);
        const nextFrames = result?.frames || working;

        await putContent(
          CONFIG_PATH,
          utf8ToBase64(serializeFrames(nextFrames)),
          message,
          latest.sha,
        );

        state.frames = nextFrames;
        return result;
      } catch (error) {
        lastError = error;
        if (!isConflict(error) || attempt === MAX_CONFLICT_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }

    throw lastError;
  }

  async function uploadFile(file, path, message) {
    const content = arrayBufferToBase64(await file.arrayBuffer());
    let lastError;

    for (let attempt = 1; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
      try {
        let sha;
        try {
          sha = (await getContent(path)).sha;
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
        return await putContent(path, content, message, sha);
      } catch (error) {
        lastError = error;
        if (!isConflict(error) || attempt === MAX_CONFLICT_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }

    throw lastError;
  }

  async function removeFile(path, message) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
      try {
        const latest = await getContent(path);
        return await deleteContent(path, message, latest.sha);
      } catch (error) {
        if (isNotFound(error)) return null;
        lastError = error;
        if (!isConflict(error) || attempt === MAX_CONFLICT_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      }
    }

    throw lastError;
  }

  function getCategoryOrder(frames = state.frames) {
    const seen = new Set();
    const order = [];
    for (const frame of frames) {
      const category = String(frame.categoria || "Sem categoria").trim() || "Sem categoria";
      if (!seen.has(category)) {
        seen.add(category);
        order.push(category);
      }
    }
    return order;
  }

  function regroupFramesByCategories() {
    const grouped = new Map();
    for (const category of state.categoryOrder) grouped.set(category, []);
    for (const frame of state.frames) {
      const category = String(frame.categoria || "Sem categoria").trim() || "Sem categoria";
      if (!grouped.has(category)) {
        grouped.set(category, []);
        state.categoryOrder.push(category);
      }
      grouped.get(category).push(frame);
    }
    state.frames = state.categoryOrder.flatMap((category) => grouped.get(category) || []);
  }

  function renderCategoryOrder() {
    const query = els.search.value.trim();
    const disabled = Boolean(query) || state.operationInProgress;
    els.categoriesOrderList.innerHTML = state.categoryOrder.map((category, index) => {
      const count = state.frames.filter((frame) => (frame.categoria || "Sem categoria") === category).length;
      return `
        <article class="category-order-row ${state.orderDirty ? "ordering" : ""}" data-category="${escapeHtml(category)}" draggable="${!disabled}">
          <div class="category-order-controls">
            <button class="category-drag-handle" data-category-action="drag" type="button" title="Arraste para reordenar">☰</button>
            <span class="category-order-number">${index + 1}</span>
            <button class="category-order-arrow" data-category-action="up" type="button" ${disabled || index === 0 ? "disabled" : ""}>↑</button>
            <button class="category-order-arrow" data-category-action="down" type="button" ${disabled || index === state.categoryOrder.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div class="category-name">${escapeHtml(category)}</div>
          <div class="category-count">${count} ${count === 1 ? "moldura" : "molduras"}</div>
        </article>`;
    }).join("");
  }

  function moveCategory(category, direction) {
    const index = state.categoryOrder.indexOf(category);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.categoryOrder.length) return;
    [state.categoryOrder[index], state.categoryOrder[target]] = [state.categoryOrder[target], state.categoryOrder[index]];
    regroupFramesByCategories();
    markOrderDirty();
  }

  function moveCategoryBefore(draggedCategory, targetCategory) {
    if (!draggedCategory || !targetCategory || draggedCategory === targetCategory) return;
    const from = state.categoryOrder.indexOf(draggedCategory);
    const to = state.categoryOrder.indexOf(targetCategory);
    if (from < 0 || to < 0) return;
    const [moved] = state.categoryOrder.splice(from, 1);
    const adjusted = state.categoryOrder.indexOf(targetCategory);
    state.categoryOrder.splice(adjusted, 0, moved);
    regroupFramesByCategories();
    markOrderDirty();
  }

  async function loadFrames({ announce = false } = {}) {
    clearFlash();
    setBusy(true, "Carregando...");
    try {
      const latest = await readLatestFrames();
      state.frames = latest.frames;
      state.originalOrder = latest.frames.map((frame) => frame.id);
      state.categoryOrder = getCategoryOrder(latest.frames);
      state.originalCategoryOrder = [...state.categoryOrder];
      state.orderDirty = false;
      state.draggedId = null;
      state.draggedCategory = null;
      renderCategories();
      renderCategoryOrder();
      renderFrames();
      setStatus("Conectado", "ok");
      els.managerCard.hidden = false;
      if (announce) flash("Lista sincronizada com o GitHub.", "success");
    } finally {
      setBusy(false);
      if (state.frames.length || !els.managerCard.hidden) setStatus("Conectado", "ok");
    }
  }

  function renderCategories() {
    const categories = [...state.categoryOrder];
    els.categoryList.innerHTML = categories
      .map((category) => `<option value="${escapeHtml(category)}"></option>`)
      .join("");
  }

  function renderFrames() {
    renderCategoryOrder();
    const query = els.search.value.trim().toLowerCase();
    const filtered = state.frames.filter((frame) =>
      `${frame.nome} ${frame.categoria} ${frame.id}`.toLowerCase().includes(query),
    );

    els.count.textContent = `${state.frames.length} ${state.frames.length === 1 ? "moldura" : "molduras"}`;
    els.saveOrder.disabled = state.operationInProgress || !state.orderDirty;
    els.cancelOrder.disabled = state.operationInProgress || !state.orderDirty;
    els.orderNotice.hidden = !state.orderDirty;
    els.search.disabled = state.orderDirty;

    if (!filtered.length) {
      els.list.innerHTML = "<p>Nenhuma moldura encontrada.</p>";
      return;
    }

    const cacheBuster = Date.now();
    const dragEnabled = !query && !state.operationInProgress;
    let lastCategory = null;
    els.list.innerHTML = filtered.map((frame) => {
      const index = state.frames.findIndex((item) => item.id === frame.id);
      const category = frame.categoria || "Sem categoria";
      const categoryFrames = state.frames.filter((item) => (item.categoria || "Sem categoria") === category);
      const categoryIndex = categoryFrames.findIndex((item) => item.id === frame.id);
      const showCategory = category !== lastCategory;
      lastCategory = category;
      return `${showCategory ? `<div class="category-section-label"><span>${escapeHtml(category)}</span><small>${categoryFrames.length} ${categoryFrames.length === 1 ? "moldura" : "molduras"}</small></div>` : ""}
      <article class="frame-row ${state.orderDirty ? "ordering" : ""} ${showCategory ? "category-first" : ""}" data-id="${escapeHtml(frame.id)}" data-category="${escapeHtml(category)}" draggable="${dragEnabled}">
        <div class="order-controls" aria-label="Ordenação de ${escapeHtml(frame.nome)}">
          <button class="drag-handle" data-action="drag" type="button" title="Arraste dentro da categoria" aria-label="Arraste dentro da categoria">☰</button>
          <span class="order-number">${categoryIndex + 1}</span>
          <button class="order-arrow" data-action="up" type="button" title="Mover para cima" ${categoryIndex === 0 ? "disabled" : ""}>↑</button>
          <button class="order-arrow" data-action="down" type="button" title="Mover para baixo" ${categoryIndex === categoryFrames.length - 1 ? "disabled" : ""}>↓</button>
        </div>
        <img class="frame-thumb" src="${escapeHtml(frame.arquivo)}?v=${cacheBuster}" alt="Prévia de ${escapeHtml(frame.nome)}" onerror="this.style.opacity=.25">
        <div class="frame-info">
          <h4>${escapeHtml(frame.nome)}</h4>
          <p>${escapeHtml(category)} · <code>${escapeHtml(frame.id)}</code></p>
          <p>${escapeHtml(frame.arquivo)}</p>
          <div class="badges">
            <span class="badge ${frame.ativo !== false ? "active" : "inactive"}">${frame.ativo !== false ? "Visível" : "Oculta"}</span>
            ${frame.novo ? '<span class="badge new">Nova</span>' : ""}
          </div>
        </div>
        <div class="row-actions">
          <button class="button light" data-action="edit" type="button" ${state.orderDirty ? "disabled" : ""}>Editar</button>
          <button class="button light" data-action="toggle" type="button" ${state.orderDirty ? "disabled" : ""}>${frame.ativo !== false ? "Ocultar" : "Exibir"}</button>
          <button class="button danger" data-action="delete" type="button" ${state.orderDirty ? "disabled" : ""}>Remover</button>
        </div>
      </article>`;
    }).join("");
  }

  function markOrderDirty() {
    state.orderDirty = true;
    renderFrames();
  }

  function moveFrame(id, direction) {
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;
    const category = frame.categoria || "Sem categoria";
    const indexes = state.frames.map((item, index) => ({ item, index }))
      .filter(({ item }) => (item.categoria || "Sem categoria") === category)
      .map(({ index }) => index);
    const localIndex = indexes.indexOf(state.frames.findIndex((item) => item.id === id));
    const targetLocal = localIndex + direction;
    if (localIndex < 0 || targetLocal < 0 || targetLocal >= indexes.length) return;
    const from = indexes[localIndex];
    const to = indexes[targetLocal];
    [state.frames[from], state.frames[to]] = [state.frames[to], state.frames[from]];
    markOrderDirty();
  }

  function moveFrameBefore(draggedId, targetId) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const dragged = state.frames.find((frame) => frame.id === draggedId);
    const target = state.frames.find((frame) => frame.id === targetId);
    if (!dragged || !target || (dragged.categoria || "Sem categoria") !== (target.categoria || "Sem categoria")) {
      flash("As molduras só podem ser arrastadas dentro da mesma categoria. Use Editar para trocar a categoria.", "info");
      return;
    }
    const from = state.frames.findIndex((frame) => frame.id === draggedId);
    const [moved] = state.frames.splice(from, 1);
    const adjustedTarget = state.frames.findIndex((frame) => frame.id === targetId);
    state.frames.splice(adjustedTarget, 0, moved);
    markOrderDirty();
  }

  function resetForm() {
    els.frameForm.reset();
    els.originalId.value = "";
    els.frameId.dataset.edited = "";
    els.active.checked = true;
    els.isNew.checked = true;
    els.formTitle.textContent = "Adicionar nova moldura";
    els.saveBtn.textContent = "Adicionar e publicar moldura";
    els.cancelEdit.hidden = true;
    els.fileHint.textContent = "Obrigatório para uma nova moldura.";
    els.preview.innerHTML = "<span>Prévia da moldura</span>";
    updateDestination();
  }

  function updateDestination() {
    const file = els.frameFile.files[0];
    const original = state.frames.find((frame) => frame.id === els.originalId.value);
    const extension = file?.name.split(".").pop()?.toLowerCase()
      || original?.arquivo.split(".").pop()
      || "png";
    const id = slugify(els.frameId.value) || "arquivo";
    els.destination.textContent = `${IMAGE_DIR}/${id}.${extension}`;
  }

  function editFrame(id) {
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;

    els.originalId.value = frame.id;
    els.frameName.value = frame.nome;
    els.frameId.value = frame.id;
    els.frameId.dataset.edited = "1";
    els.category.value = frame.categoria;
    els.active.checked = frame.ativo !== false;
    els.isNew.checked = Boolean(frame.novo);
    els.formTitle.textContent = `Editar: ${frame.nome}`;
    els.saveBtn.textContent = "Salvar alterações";
    els.cancelEdit.hidden = false;
    els.fileHint.textContent = "Opcional. Selecione somente para substituir a imagem.";
    els.preview.innerHTML = `<img src="${escapeHtml(frame.arquivo)}?v=${Date.now()}" alt="Prévia">`;
    updateDestination();
    els.frameForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  els.connectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.owner = els.owner.value.trim();
    state.repo = els.repo.value.trim();
    state.branch = els.branch.value.trim();
    state.token = els.token.value.trim();

    try {
      await loadFrames();
      flash("Conexão realizada. O painel está sincronizado com o repositório.", "success");
    } catch (error) {
      setStatus("Erro", "error");
      flash(error.message, "error");
    }
  });

  els.toggleToken.addEventListener("click", () => {
    const show = els.token.type === "password";
    els.token.type = show ? "text" : "password";
    els.toggleToken.textContent = show ? "Ocultar" : "Mostrar";
  });

  els.refreshBtn.addEventListener("click", async () => {
    try {
      await loadFrames({ announce: true });
    } catch (error) {
      flash(error.message, "error");
    }
  });

  els.frameName.addEventListener("input", () => {
    if (!els.originalId.value && !els.frameId.dataset.edited) {
      els.frameId.value = slugify(els.frameName.value);
      updateDestination();
    }
  });

  els.frameId.addEventListener("input", () => {
    els.frameId.dataset.edited = "1";
    els.frameId.value = slugify(els.frameId.value);
    updateDestination();
  });

  els.frameFile.addEventListener("change", () => {
    const file = els.frameFile.files[0];
    updateDestination();
    if (!file) return;
    const url = URL.createObjectURL(file);
    els.preview.innerHTML = `<img src="${url}" alt="Prévia da nova moldura">`;
  });

  els.cancelEdit.addEventListener("click", resetForm);
  els.search.addEventListener("input", renderFrames);

  els.saveOrder.addEventListener("click", async () => {
    if (!state.orderDirty || state.operationInProgress) return;
    const desiredOrder = state.frames.map((frame) => frame.id);
    const desiredCategoryOrder = [...state.categoryOrder];
    setBusy(true, "Salvando ordem...");
    try {
      await mutateFrames("Atualiza ordenação das categorias e molduras", (latestFrames) => {
        const byId = new Map(latestFrames.map((frame) => [frame.id, frame]));
        const ordered = [];
        for (const id of desiredOrder) {
          const frame = byId.get(id);
          if (frame) {
            ordered.push(frame);
            byId.delete(id);
          }
        }
        // Molduras adicionadas em outra sessão são preservadas na categoria correspondente.
        const remaining = [...byId.values()];
        for (const category of desiredCategoryOrder) {
          const insertAt = ordered.reduce((last, frame, index) =>
            (frame.categoria || "Sem categoria") === category ? index + 1 : last, 0);
          const additions = remaining.filter((frame) => (frame.categoria || "Sem categoria") === category);
          if (additions.length) ordered.splice(insertAt, 0, ...additions);
        }
        ordered.push(...remaining.filter((frame) => !ordered.some((item) => item.id === frame.id)));
        return { frames: ordered };
      });
      state.originalOrder = state.frames.map((frame) => frame.id);
      state.categoryOrder = getCategoryOrder(state.frames);
      state.originalCategoryOrder = [...state.categoryOrder];
      state.orderDirty = false;
      renderFrames();
      flash("Nova ordenação publicada com sucesso.", "success");
    } catch (error) {
      flash(`Não foi possível salvar a ordenação: ${error.message}`, "error");
      try { await loadFrames(); } catch { /* mantém o erro original */ }
    } finally {
      setBusy(false);
      setStatus("Conectado", "ok");
      renderFrames();
    }
  });

  els.cancelOrder.addEventListener("click", () => {
    if (!state.orderDirty) return;
    const byId = new Map(state.frames.map((frame) => [frame.id, frame]));
    state.frames = state.originalOrder.map((id) => byId.get(id)).filter(Boolean);
    for (const frame of byId.values()) {
      if (!state.originalOrder.includes(frame.id)) state.frames.push(frame);
    }
    state.categoryOrder = [...state.originalCategoryOrder];
    regroupFramesByCategories();
    state.orderDirty = false;
    state.draggedId = null;
    state.draggedCategory = null;
    renderFrames();
    flash("Alterações de ordem descartadas.", "info");
  });

  els.frameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    const originalId = els.originalId.value;
    const localExisting = originalId ? state.frames.find((frame) => frame.id === originalId) : null;
    const file = els.frameFile.files[0];
    const id = slugify(els.frameId.value);
    const name = els.frameName.value.trim();
    const category = els.category.value.trim();

    if (!localExisting && !file) {
      flash("Escolha o arquivo da moldura.", "error");
      return;
    }

    if (!id || !name || !category) {
      flash("Preencha nome, identificador e categoria.", "error");
      return;
    }

    setBusy(true, "Publicando...");
    els.saveBtn.textContent = "Publicando...";

    try {
      let newPath = localExisting?.arquivo;

      if (file) {
        const extension = (file.name.split(".").pop() || "png").toLowerCase();
        newPath = `${IMAGE_DIR}/${id}.${extension}`;
        await uploadFile(file, newPath, `${localExisting ? "Atualiza" : "Adiciona"} imagem da moldura ${name}`);
      }

      await mutateFrames(`${localExisting ? "Atualiza" : "Adiciona"} moldura ${name}`, (frames) => {
        const currentIndex = originalId ? frames.findIndex((frame) => frame.id === originalId) : -1;
        const duplicateIndex = frames.findIndex((frame) => frame.id === id && frame.id !== originalId);

        if (duplicateIndex >= 0) {
          throw new Error("Já existe uma moldura com esse identificador.");
        }

        const latestExisting = currentIndex >= 0 ? frames[currentIndex] : null;
        if (originalId && !latestExisting) {
          throw new Error("Essa moldura foi alterada ou removida em outra sessão. Atualize a lista e tente novamente.");
        }

        const frame = {
          id,
          nome: name,
          categoria: category,
          arquivo: newPath || latestExisting?.arquivo,
          ativo: els.active.checked,
          novo: els.isNew.checked,
        };

        if (currentIndex >= 0) frames[currentIndex] = frame;
        else frames.push(frame);
      });

      state.categoryOrder = getCategoryOrder(state.frames);
      renderCategories();
      renderFrames();
      resetForm();
      flash("Moldura publicada com sucesso. O GitHub Pages pode levar alguns instantes para atualizar.", "success");
    } catch (error) {
      flash(`Não foi possível publicar: ${error.message}`, "error");
      try { await loadFrames(); } catch { /* mantém o erro original */ }
    } finally {
      setBusy(false);
      setStatus("Conectado", "ok");
      if (els.originalId.value) els.saveBtn.textContent = "Salvar alterações";
      else els.saveBtn.textContent = "Adicionar e publicar moldura";
    }
  });

  els.categoriesOrderList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category-action]");
    if (!button || state.operationInProgress || els.search.value.trim()) return;
    const row = button.closest(".category-order-row");
    const category = row?.dataset.category;
    if (!category) return;
    if (button.dataset.categoryAction === "up") moveCategory(category, -1);
    if (button.dataset.categoryAction === "down") moveCategory(category, 1);
  });

  els.categoriesOrderList.addEventListener("dragstart", (event) => {
    if (els.search.value.trim() || state.operationInProgress) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest(".category-order-row");
    if (!row) return;
    state.draggedCategory = row.dataset.category;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedCategory);
  });

  els.categoriesOrderList.addEventListener("dragover", (event) => {
    if (!state.draggedCategory) return;
    event.preventDefault();
    const row = event.target.closest(".category-order-row");
    els.categoriesOrderList.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
    if (row && row.dataset.category !== state.draggedCategory) row.classList.add("drag-over");
  });

  els.categoriesOrderList.addEventListener("drop", (event) => {
    event.preventDefault();
    const row = event.target.closest(".category-order-row");
    if (row && state.draggedCategory) moveCategoryBefore(state.draggedCategory, row.dataset.category);
    state.draggedCategory = null;
    els.categoriesOrderList.querySelectorAll(".dragging,.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
  });

  els.categoriesOrderList.addEventListener("dragend", () => {
    state.draggedCategory = null;
    els.categoriesOrderList.querySelectorAll(".dragging,.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
  });

  els.list.addEventListener("dragstart", (event) => {
    if (els.search.value.trim() || state.operationInProgress) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest(".frame-row");
    if (!row) return;
    state.draggedId = row.dataset.id;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedId);
  });

  els.list.addEventListener("dragover", (event) => {
    if (!state.draggedId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const row = event.target.closest(".frame-row");
    els.list.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
    const draggedRow = els.list.querySelector(`.frame-row[data-id="${CSS.escape(state.draggedId)}"]`);
    if (row && draggedRow && row.dataset.id !== state.draggedId && row.dataset.category === draggedRow.dataset.category) row.classList.add("drag-over");
  });

  els.list.addEventListener("drop", (event) => {
    event.preventDefault();
    const row = event.target.closest(".frame-row");
    if (row && state.draggedId) moveFrameBefore(state.draggedId, row.dataset.id);
    state.draggedId = null;
    els.list.querySelectorAll(".dragging,.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
  });

  els.list.addEventListener("dragend", () => {
    state.draggedId = null;
    els.list.querySelectorAll(".dragging,.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
  });

  els.list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || state.operationInProgress) return;

    const row = button.closest(".frame-row");
    const id = row?.dataset.id;
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;

    if (button.dataset.action === "up") { moveFrame(id, -1); return; }
    if (button.dataset.action === "down") { moveFrame(id, 1); return; }
    if (button.dataset.action === "drag") return;

    if (button.dataset.action === "edit") {
      editFrame(id);
      return;
    }

    if (button.dataset.action === "delete") {
      state.pendingDelete = frame;
      els.confirmText.textContent = `A moldura “${frame.nome}” será removida da lista.`;
      els.deleteFile.checked = true;
      els.dialog.showModal();
      return;
    }

    if (button.dataset.action === "toggle") {
      setBusy(true, frame.ativo !== false ? "Ocultando..." : "Exibindo...");
      try {
        let resultingFrame;
        await mutateFrames(`${frame.ativo !== false ? "Oculta" : "Exibe"} moldura ${frame.nome}`, (frames) => {
          const latest = frames.find((item) => item.id === id);
          if (!latest) throw new Error("A moldura não existe mais no repositório.");
          latest.ativo = latest.ativo === false;
          resultingFrame = latest;
        });
        renderFrames();
        flash(`Moldura ${resultingFrame.ativo !== false ? "exibida" : "ocultada"} com sucesso.`, "success");
      } catch (error) {
        flash(`Não foi possível alterar a visibilidade: ${error.message}`, "error");
        try { await loadFrames(); } catch { /* mantém o erro original */ }
      } finally {
        setBusy(false);
        setStatus("Conectado", "ok");
      }
    }
  });

  els.dialog.addEventListener("close", async () => {
    if (els.dialog.returnValue !== "confirm" || !state.pendingDelete) return;

    const frame = state.pendingDelete;
    state.pendingDelete = null;
    setBusy(true, "Removendo...");

    try {
      await mutateFrames(`Remove moldura ${frame.nome}`, (frames) => {
        const index = frames.findIndex((item) => item.id === frame.id);
        if (index < 0) throw new Error("A moldura já foi removida em outra sessão.");
        frames.splice(index, 1);
      });

      let fileWarning = "";
      if (els.deleteFile.checked) {
        try {
          await removeFile(frame.arquivo, `Remove imagem da moldura ${frame.nome}`);
        } catch (error) {
          fileWarning = ` A moldura saiu da lista, mas o arquivo de imagem não pôde ser apagado: ${error.message}`;
        }
      }

      state.categoryOrder = getCategoryOrder(state.frames);
      renderCategories();
      renderFrames();
      resetForm();
      flash(fileWarning ? `Moldura removida.${fileWarning}` : "Moldura removida com sucesso.", fileWarning ? "error" : "success");
    } catch (error) {
      flash(`Não foi possível remover: ${error.message}`, "error");
      try { await loadFrames(); } catch { /* mantém o erro original */ }
    } finally {
      setBusy(false);
      setStatus("Conectado", "ok");
    }
  });

  updateDestination();
})();
