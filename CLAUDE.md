# Painel Financeiro - Instrucoes do Projeto

## Repositorio GitHub
- URL: https://github.com/exodus14-code/dashboard-portifolio
- Branch principal: `main`
- Diretorio local: `G:\Meu Drive\Claude-Code\Dash Portifolio`

## Comando de deploy no GitHub

Quando o usuario disser **"salve"**, **"suba"**, ou **"atualize no github"** (ou variacoes), voce deve:

1. Perguntar qual foi a mudanca principal (se nao estiver claro no contexto)
2. Determinar o tipo de versao:
   - **patch** (v1.0.X): correcoes de bug, ajustes pequenos
   - **minor** (v1.X.0): novas funcionalidades
   - **major** (vX.0.0): mudancas grandes na estrutura
3. Ler a versao atual no CHANGELOG.md
4. Atualizar o CHANGELOG.md com a nova versao e descricao das mudancas
5. Rodar os seguintes comandos git:
   ```
   git add -A
   git commit -m "tipo(escopo): descricao curta
   
   - detalhe 1
   - detalhe 2"
   git tag vX.Y.Z -m "versao X.Y.Z - descricao"
   git push origin main --tags
   ```
6. Confirmar o push bem-sucedido e informar a URL da versao no GitHub

## Arquivos principais

| Arquivo | Descricao |
|---------|-----------|
| `index.html` | Versao principal (PWA completa) |
| `painel-v3.html` | Versao 3 do painel |
| `painel-v2.html` | Versao 2 do painel |
| `painel.html` | Versao base |
| `app.js` | JavaScript separado |
| `style.css` | CSS separado |
| `manifest.json` | Configuracao PWA |
| `sw.js` | Service Worker |

## Convencoes de commit

- `feat:` nova funcionalidade
- `fix:` correcao de bug
- `style:` mudancas visuais/CSS
- `refactor:` refatoracao sem mudanca funcional
- `docs:` documentacao
- `chore:` manutencao geral

## Tecnologias

- HTML/CSS/JS puro (sem framework)
- CoinGecko API - precos de cripto
- AwesomeAPI - taxa USD/BRL
- localStorage - persistencia de dados
- Web Notifications API - alertas
- PWA (Progressive Web App)
