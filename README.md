# Painel Administrativo v2 — Molduras Lions

Versão configurada para:

- Organização: `lionsclubcandidomota`
- Repositório: `molduras`
- Branch: `main`
- Arquivo de cadastro: `molduras.js`
- Pasta das imagens: `assets/molduras/`

## Instalação

Envie para a raiz do repositório, substituindo as versões anteriores:

- `admin.html`
- `admin.css`
- `admin.js`

Não substitua `molduras.js`, `app.js`, `index.html`, `styles.css` ou a pasta `assets`.

Painel:

`https://lionsclubcandidomota.github.io/molduras/admin.html`

Depois de atualizar, use `Ctrl + F5` para evitar cache antigo.

## Correções da versão 2

- Busca o SHA atual antes de toda alteração.
- Repete automaticamente operações quando o GitHub informa conflito de SHA.
- Nunca grava usando uma cópia antiga de `molduras.js`.
- Sincroniza a lista novamente após erros.
- Adicionar, editar, ocultar, exibir e excluir usam transações independentes.
- Upload e exclusão de imagens também consultam o SHA atual.

## Token

Use um token fine-grained limitado ao repositório `molduras`, com:

`Repository permissions > Contents > Read and write`

O token fica apenas na memória da aba e não é salvo pelo painel.
