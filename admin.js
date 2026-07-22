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

  async function loadFrames({ announce = false } = {}) {
    clearFlash();
    setBusy(true, "Carregando...");
    try {
      const latest = await readLatestFrames();
      state.frames = latest.frames;
      renderCategories();
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
    const categories = [...new Set(state.frames.map((frame) => frame.categoria).filter(Boolean))].sort();
    els.categoryList.innerHTML = categories
      .map((category) => `<option value="${escapeHtml(category)}"></option>`)
      .join("");
  }

  function renderFrames() {
    const query = els.search.value.trim().toLowerCase();
    const filtered = state.frames.filter((frame) =>
      `${frame.nome} ${frame.categoria} ${frame.id}`.toLowerCase().includes(query),
    );

    els.count.textContent = `${state.frames.length} ${state.frames.length === 1 ? "moldura" : "molduras"}`;

    if (!filtered.length) {
      els.list.innerHTML = "<p>Nenhuma moldura encontrada.</p>";
      return;
    }

    const cacheBuster = Date.now();
    els.list.innerHTML = filtered.map((frame) => `
      <article class="frame-row" data-id="${escapeHtml(frame.id)}">
        <img class="frame-thumb" src="${escapeHtml(frame.arquivo)}?v=${cacheBuster}" alt="Prévia de ${escapeHtml(frame.nome)}" onerror="this.style.opacity=.25">
        <div class="frame-info">
          <h4>${escapeHtml(frame.nome)}</h4>
          <p>${escapeHtml(frame.categoria)} · <code>${escapeHtml(frame.id)}</code></p>
          <p>${escapeHtml(frame.arquivo)}</p>
          <div class="badges">
            <span class="badge ${frame.ativo !== false ? "active" : "inactive"}">${frame.ativo !== false ? "Visível" : "Oculta"}</span>
            ${frame.novo ? '<span class="badge new">Nova</span>' : ""}
          </div>
        </div>
        <div class="row-actions">
          <button class="button light" data-action="edit" type="button">Editar</button>
          <button class="button light" data-action="toggle" type="button">${frame.ativo !== false ? "Ocultar" : "Exibir"}</button>
          <button class="button danger" data-action="delete" type="button">Remover</button>
        </div>
      </article>
    `).join("");
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

  els.list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || state.operationInProgress) return;

    const row = button.closest(".frame-row");
    const id = row?.dataset.id;
    const frame = state.frames.find((item) => item.id === id);
    if (!frame) return;

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
