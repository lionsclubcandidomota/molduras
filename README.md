# Molduras Lions Club — com painel administrativo

## Publicação
Envie todos os arquivos e pastas para a raiz do repositório do GitHub Pages, sem ZIP.

## Site público
Abra `index.html` normalmente pelo endereço do GitHub Pages.

## Painel administrativo
Acesse:

`https://SEU-USUARIO.github.io/SEU-REPOSITORIO/admin.html`

O painel permite adicionar, editar, ocultar, exibir e remover molduras diretamente no repositório.

## Token recomendado
Crie um Fine-grained personal access token no GitHub:

- acesso somente ao repositório das molduras;
- permissão `Contents: Read and write`;
- defina uma data de expiração curta ou moderada;
- nunca coloque o token dentro de `admin.js`, `molduras.js` ou qualquer arquivo do repositório.

O painel não salva o token. Ele permanece apenas na memória da aba e é perdido ao fechar ou atualizar a página.

## Arquivos importantes
- `index.html`: site público;
- `admin.html`: painel de manutenção;
- `molduras.js`: cadastro das molduras;
- `assets/molduras/`: arquivos das molduras.

## Observação
O painel utiliza a API oficial de conteúdo do GitHub. Cada manutenção cria commits na branch selecionada e o GitHub Pages republica o site automaticamente.
