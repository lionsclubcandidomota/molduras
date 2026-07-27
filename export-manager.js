(() => {
  'use strict';

  class ExportManager {
    constructor(options = {}) {
      if (!options.canvas) throw new Error('ExportManager: canvas não informado.');
      this.canvas = options.canvas;
      this.getRevision = options.getRevision || (() => 0);
      this.onBusyChange = options.onBusyChange || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.profiles = options.profiles || {};
      this.cache = new Map();
      this.pending = new Map();
    }

    invalidate() { this.cache.clear(); }

    getProfile(profileKey) {
      const profile = this.profiles[profileKey];
      if (!profile) throw new Error('Qualidade de exportação inválida.');
      return profile;
    }

    async canvasToBlob(canvas, type, quality) {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.')), type, quality);
      });
    }

    createOutputCanvas(profile) {
      const maxDimension = profile.maxDimension || 1080;
      const ratio = Math.min(1, maxDimension / Math.max(this.canvas.width, this.canvas.height));
      const output = document.createElement('canvas');
      output.width = Math.max(1, Math.round(this.canvas.width * ratio));
      output.height = Math.max(1, Math.round(this.canvas.height * ratio));
      const context = output.getContext('2d', { alpha: false });
      if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, output.width, output.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(this.canvas, 0, 0, output.width, output.height);
      return output;
    }

    async prepare(profileKey, { silent = false } = {}) {
      const profile = this.getProfile(profileKey);
      const revision = this.getRevision();
      const cacheKey = `${revision}:${profileKey}`;
      if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
      if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);

      const job = (async () => {
        if (!silent) {
          this.onBusyChange(true);
          this.onStatus('Preparando imagem…', 'loading');
        }
        try {
          const output = this.createOutputCanvas(profile);
          const type = profile.type || 'image/jpeg';
          const blob = await this.canvasToBlob(output, type, profile.quality ?? .9);
          const result = { blob, revision, profileKey, type, extension: type === 'image/png' ? 'png' : 'jpg', quality: profile.quality, width: output.width, height: output.height, size: blob.size };
          this.cache.set(cacheKey, result);
          if (!silent) this.onStatus(`Imagem pronta · ${this.formatSize(blob.size)}`, 'success');
          return result;
        } catch (error) {
          if (!silent) this.onStatus(error.message || 'Falha ao preparar a imagem.', 'error');
          throw error;
        } finally {
          this.pending.delete(cacheKey);
          if (!silent) this.onBusyChange(false);
        }
      })();
      this.pending.set(cacheKey, job);
      return job;
    }

    async download(filename, profileKey) {
      const result = await this.prepare(profileKey);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename.replace(/\.[^.]+$/, `.${result.extension}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      return result;
    }

    async share(filename, profileKey) {
      const result = await this.prepare(profileKey);
      const finalName = filename.replace(/\.[^.]+$/, `.${result.extension}`);
      const file = new File([result.blob], finalName, { type: result.type, lastModified: Date.now() });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: '🦁 Nós Servimos!' });
        return { ...result, shared: true };
      }
      await this.download(finalName, profileKey);
      return { ...result, shared: false, downloaded: true };
    }

    formatSize(bytes) {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
  window.ExportManager = ExportManager;
})();
