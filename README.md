# Molduras Lions v5 — Destaques e Admin moderno

## Arquivos para substituir

Na raiz do repositório:

- `admin.html`
- `admin.css`
- `admin.js`
- `app.js`
- `styles.css`

Adicione `logo-lions.png` na raiz **ou** ajuste o caminho no `admin.html` caso seu logo já esteja em `assets/logo-lions.png`.

## Destaques

Cada moldura pode ficar como:

- Sem destaque
- Novo
- Atualizada

O painel permite remover o destaque a qualquer momento, individualmente pelo botão **Destaque** ou em massa pelo botão **Limpar destaques** da categoria.

O selo da categoria é calculado automaticamente:

1. Se houver pelo menos uma moldura `Novo`, a categoria mostra `NOVO`.
2. Caso contrário, se houver uma moldura `Atualizada`, mostra `ATUALIZADA`.
3. Sem molduras destacadas, nenhum selo aparece.

Depois de publicar, use `Ctrl + F5` no site e no painel.
