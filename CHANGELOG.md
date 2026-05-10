# Changelog - Painel Financeiro

Todas as versoes significativas sao documentadas aqui.
Formato: [vX.Y.Z] - YYYY-MM-DD

---

## [v1.1.0] - 2026-05-10

### Adicionado
- Arquivo `painel.html` integrado ao repositorio (versao enviada pelo usuario)
- CHANGELOG.md para rastreamento de versoes
- CLAUDE.md com instrucoes do projeto

### Versoes existentes no repo
- `index.html` - versao principal com PWA (service worker, manifest)
- `painel-v3.html` - painel completo com alertas, portfolio e briefing
- `painel-v2.html` - versao anterior
- `painel-windows.html` - versao adaptada para Windows
- `painel.html` - versao base

---

## [v1.0.0] - 2026-05-05

### Adicionado
- Dashboard financeiro inicial
- Cotacoes ao vivo via CoinGecko (BTC, ETH, SOL, HYPE)
- Taxa USD/BRL via AwesomeAPI
- Sistema de alertas com notificacoes do navegador
- Portfolio com calculo de P&L
- Briefing de noticias editavel
- Dados persistidos no localStorage
- PWA com service worker
