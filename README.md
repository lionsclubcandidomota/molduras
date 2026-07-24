# v7.5 — ExportManager e compressão inteligente

- Exportação em JPEG com qualidade inicial de 90%.
- Segunda tentativa em 84% somente quando o arquivo ultrapassa 1,5 MB.
- Limite de dimensão configurado em 1600 px, sem ampliar imagens menores.
- Cache reutilizado entre baixar e compartilhar enquanto a edição não muda.
- Bloqueio de cliques duplicados durante o processamento.
- Indicador discreto de preparação, otimização e conclusão.
- Compartilhamento usa o mesmo arquivo otimizado; quando indisponível, faz download.