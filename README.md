# Painel de Molduras Lions — categorias e molduras ordenáveis

Atualização do painel administrativo para o repositório:

- Organização: `lionsclubcandidomota`
- Repositório: `molduras`
- Branch: `main`

## Instalação

Substitua somente estes arquivos na raiz do repositório:

- `admin.html`
- `admin.css`
- `admin.js`

Não substitua `molduras.js`, `app.js`, `index.html`, `styles.css` ou a pasta `assets`.

Depois aguarde o GitHub Pages atualizar e abra:

`https://lionsclubcandidomota.github.io/molduras/admin.html`

Use `Ctrl + F5` no computador para evitar o cache da versão anterior.

## Como ordenar

1. Conecte o painel ao GitHub.
2. Na seção **Ordem das categorias**, arraste uma categoria ou use as setas.
3. Na seção **Ordem das molduras**, organize cada moldura dentro da própria categoria.
4. Clique em **Salvar ordenação**.

O painel grava uma lista única no `molduras.js`, agrupando as molduras pela ordem escolhida para as categorias e preservando a ordem interna de cada grupo.

Para mover uma moldura para outra categoria, use **Editar** e altere o campo Categoria. Depois, faça a ordenação novamente caso necessário.
