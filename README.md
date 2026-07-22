# Painel de Molduras Lions v3

## O que mudou

- Categorias têm `id`, `nome` e `ordem` próprios.
- Molduras usam `categoriaId` e uma `ordem` independente dentro da categoria.
- O painel lê o formato antigo (`categoria: "Nome"`) e o migra automaticamente na primeira publicação.
- O site público ordena primeiro por categoria e depois pela ordem da moldura.
- Categorias podem ser renomeadas, reordenadas e excluídas quando vazias.

## Arquivos para substituir no repositório

- `admin.html`
- `admin.css`
- `admin.js`
- `app.js`

Não substitua o seu `molduras.js` pelo arquivo de exemplo. O painel fará a migração preservando as molduras existentes.

## Primeira utilização

1. Envie os quatro arquivos ao repositório.
2. Abra `admin.html` e conecte ao GitHub.
3. Confira as categorias e molduras.
4. Faça uma pequena alteração ou clique em salvar ordenação.
5. O `molduras.js` será regravado no formato v3.

Use `Ctrl + F5` depois da publicação para evitar cache antigo.
