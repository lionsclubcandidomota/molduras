(() => {
  'use strict';

  class ExportManager {
    constructor(options = {}) {
      if (!options.canvas) throw new Error('ExportManager: canvas não informado.');
      this.canvas = options.canvas;
      this.getRevision = options.getRevision || (() => 0);
      this.maxDimension = options.maxDimension || 1600;
      this.firstQuality = options.firstQuality || 0.90;
      this.fallbackQuality = options.fallbackQuality || 0.84;
      this.fallbackThreshold = options.fallbackThreshold || (1.5 * 1024 * 1024);
      this.onBusyChange = options.onBusyChange || (() => {});
      this.onStatus = options.onStatus || (() => {});
      this.cache = null;
      this.pending = null;
    }

    invalidate() {
      this.cache = null;
    }

    async canvasToBlob(canvas, type, quality) {
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Não foi possível gerar a imagem.'));
        }, type, quality);
      });
    }

    createOutputCanvas() {
      const ratio = Math.min(1, this.maxDimension / Math.max(this.canvas.width, this.canvas.height));
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

    async prepare() {
      const revision = this.getRevision();
      if (this.cache && this.cache.revision === revision) return this.cache;
      if (this.pending) return this.pending;

      this.pending = (async () => {
        this.onBusyChange(true);
        this.onStatus('Preparando imagem…', 'loading');

        try {
          const output = this.createOutputCanvas();
          let quality = this.firstQuality;
          let blob = await this.canvasToBlob(output, 'image/jpeg', quality);

          if (blob.size > this.fallbackThreshold) {
            this.onStatus('Otimizando qualidade…', 'loading');
            quality = this.fallbackQuality;
            blob = await this.canvasToBlob(output, 'image/jpeg', quality);
          }

          const result = {
            blob,
            revision,
            type: 'image/jpeg',
            extension: 'jpg',
            quality,
            width: output.width,
            height: output.height,
            size: blob.size
          };

          this.cache = result;
          this.onStatus(`Imagem pronta · ${this.formatSize(blob.size)}`, 'success');
          return result;
        } catch (error) {
          this.onStatus(error.message || 'Falha ao preparar a imagem.', 'error');
          throw error;
        } finally {
          this.pending = null;
          this.onBusyChange(false);
        }
      })();

      return this.pending;
    }

    async download(filename) {
      const result = await this.prepare();
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      return result;
    }

    async share(filename, shareData = {}) {
      const result = await this.prepare();
      const file = new File([result.blob], filename, {
        type: result.type,
        lastModified: Date.now()
      });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
        return { ...result, shared: true };
      }

      await this.download(filename);
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
