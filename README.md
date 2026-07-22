# Molduras Lions Club

Esta versão funciona tanto no GitHub Pages quanto abrindo o `index.html` diretamente no computador.

## Adicionar uma moldura

1. Coloque o PNG em `assets/molduras/`.
2. Abra `molduras.js`.
3. Copie um bloco existente e altere os dados.

Exemplo:

```javascript
{
  id: "visao",
  nome: "Visão",
  categoria: "Causas Globais",
  arquivo: "assets/molduras/visao.png",
  ativo: true,
  novo: true
}
```

Importante: mantenha uma vírgula entre os blocos.

## Ocultar uma moldura

Altere:

```javascript
ativo: true
```

para:

```javascript
ativo: false
```

## Remover definitivamente

Apague o bloco correspondente em `molduras.js` e também a imagem em `assets/molduras/`.

## Publicar no GitHub Pages

Envie os arquivos descompactados para a raiz do repositório. Em Settings → Pages, use `main` e `/(root)`.
