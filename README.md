# Painel administrativo — Molduras Lions

Este pacote contém somente o painel administrativo e não substitui `molduras.js`, `app.js`, `index.html`, `styles.css` ou a pasta `assets` do site.

## Instalação

Envie para a raiz do repositório `lionsclubcandidomota/molduras` apenas:

- `admin.html`
- `admin.css`
- `admin.js`

O painel ficará em:

`https://lionsclubcandidomota.github.io/molduras/admin.html`

Os campos já vêm preenchidos com:

- Organização: `lionsclubcandidomota`
- Repositório: `molduras`
- Branch: `main`

Informe um token fine-grained com acesso somente a esse repositório e permissão `Contents: Read and write`.

## Importante

Não substitua o seu `molduras.js` atual pelo arquivo de demonstração de versões anteriores. O painel sempre lê e atualiza o `molduras.js` que já está no repositório.


## Correção desta versão

Corrige a montagem da URL da API do GitHub para que `?ref=main` seja enviado como parâmetro de consulta, e não como parte do nome do arquivo.
