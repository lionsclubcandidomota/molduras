// Exemplo do novo formato. O painel migra automaticamente o formato antigo.
window.CATEGORIAS = [
  { "id": "institucional", "nome": "Institucional", "ordem": 1, "ativo": true },
  { "id": "diretoria", "nome": "Diretoria", "ordem": 2, "ativo": true }
];

window.MOLDURAS = [
  { "id": "orgulho-leao", "nome": "Orgulho de ser Leão", "categoriaId": "institucional", "ordem": 1, "arquivo": "assets/molduras/orgulho.png", "ativo": true, "novo": false },
  { "id": "presidente", "nome": "Presidente de Clube", "categoriaId": "diretoria", "ordem": 1, "arquivo": "assets/molduras/presidente.png", "ativo": true, "novo": true }
];
