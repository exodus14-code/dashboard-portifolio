// ============================================================
// PAINEL FINANCEIRO — App principal
// Armazena dados em localStorage, busca preços via CoinGecko
// e dispara notificações do navegador quando alvos são atingidos.
// ============================================================

const COINS = {
  BTC:  { id: 'bitcoin',     label: 'Bitcoin'     },
  ETH:  { id: 'ethereum',    label: 'Ethereum'    },
  SOL:  { id: 'solana',      label: 'Solana'      },
  HYPE: { id: 'hyperliquid', label: 'Hyperliquid' },
};

const PRICE_API = `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINS).map(c=>c.id).join(',')}&vs_currencies=usd,brl&include_24hr_change=true`;
const FX_API = 'https://economia.awesomeapi.com.br/last/USD-BRL';

const POLL_MS = 60_000; // 60s — fica dentro do free tier

// Default state — usado na primeira execução
const DEFAULT_STRATEGIES = [
  { id: 's1', asset: 'BTC',  condition: 'below', target: 75000,  action: 'COMPRA TÁTICA',          reasoning: 'Suporte forte da MA-100',          active: true, triggered: false },
  { id: 's2', asset: 'BTC',  condition: 'above', target: 83110,  action: 'BREAKOUT — HOLD/ADD',    reasoning: 'Quebra MA-200 EMA',                active: true, triggered: false },
  { id: 's3', asset: 'ETH',  condition: 'above', target: 2420,   action: 'ADICIONAR POSIÇÃO',      reasoning: 'Confirmação rompimento MA50/MA200', active: true, triggered: false },
  { id: 's4', asset: 'ETH',  condition: 'below', target: 2211,   action: 'ALERTA — possível stop', reasoning: 'Perda expõe $2.108 e $1.909',      active: true, triggered: false },
  { id: 's5', asset: 'SOL',  condition: 'below', target: 79,     action: 'STOP — SAIR',            reasoning: 'Bear flag confirmado',             active: true, triggered: false },
  { id: 's6', asset: 'HYPE', condition: 'above', target: 44,     action: 'ADICIONAR MAIS',         reasoning: 'Breakout do wedge descendente',    active: true, triggered: false },
  { id: 's7', asset: 'HYPE', condition: 'below', target: 38.5,   action: 'STOP — SAIR',            reasoning: 'Stop sugerido da entrada $41',     active: true, triggered: false },
  { id: 's8', asset: 'USD',  condition: 'above', target: 5.40,   action: 'CONVERTER MAIS PARA USDC', reasoning: 'Dólar valorizando rapidamente',  active: true, triggered: false },
  { id: 's9', asset: 'USD',  condition: 'below', target: 4.80,   action: 'OPORTUNIDADE — converter mais BRL', reasoning: 'Dólar abaixo da média',  active: true, triggered: false },
];

const DEFAULT_BRIEFING = {
  date: new Date().toISOString().slice(0, 10),
  macro1Title: 'Conflito EUA-Irã no Estreito de Ormuz',
  macro1Body:  'Petróleo Brent +5,8% para US$114. Ameaça de choque de oferta global e pressão inflacionária.',
  macro2Title: 'FMI rebaixa crescimento global a 3,1%',
  macro2Body:  'Inflação global elevada para 4,4%. Zona do euro no menor patamar de sentimento desde nov/2020.',
  micro1Title: 'IPCA Brasil estoura projeção (4,89%)',
  micro1Body:  'Inflação sobe pela 8ª semana seguida acima do teto da meta. Selic alta por mais tempo.',
  micro2Title: 'FMI eleva PIB do Brasil de 1,6% para 1,9%',
  micro2Body:  'Brasil entre poucos países com revisão positiva, impulsionado por commodities.',
  opp1Title:   'Aerodrome USDC/USDT (Base)',
  opp1Body:    'Stable pool com 8-15% APY via emissões AERO. Auto-compound via Beefy. IL ~0% em condições normais.',
  opp2Title:   'Hyperliquid HLP Vault',
  opp2Body:    'Vault USDC histórico ~17-20% APY. Sem IL tradicional. Risco market maker em eventos extremos.',
};

// ============================================================
// STORE — wrapper sobre localStorage
// ============================================================
const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

// State em memória
let state = {
  prices: {},   // { BTC: {usd, brl, change}, ... }
  fx: { USD: { brl: null, change: null } },
  strategies: Store.get('strategies', DEFAULT_STRATEGIES),
  positions:  Store.get('positions', []),
  briefing:   Store.get('briefing', DEFAULT_BRIEFING),
  triggeredHistory: Store.get('triggeredHistory', []),
};

// ============================================================
// FORMATAÇÃO
// ============================================================
const fmt = {
  usd(n) { return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  brl(n) { return n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  pct(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; },
  num(n, d=4) { return n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d }); },
  time(d) { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); },
};

// Preço atual de um ativo (USD ou BRL conforme contexto)
function priceOf(symbol, currency = 'USD') {
  if (symbol === 'USD') {
    return currency === 'BRL' ? state.fx.USD.brl : 1;
  }
  const p = state.prices[symbol];
  if (!p) return null;
  return currency === 'BRL' ? p.brl : p.usd;
}

// ============================================================
// FETCH DE PREÇOS
// ============================================================
async function fetchPrices() {
  try {
    const [coinRes, fxRes] = await Promise.all([
      fetch(PRICE_API),
      fetch(FX_API).catch(() => null),
    ]);

    if (coinRes.ok) {
      const data = await coinRes.json();
      Object.entries(COINS).forEach(([symbol, info]) => {
        const row = data[info.id];
        if (row) {
          state.prices[symbol] = {
            usd: row.usd,
            brl: row.brl,
            change: row.usd_24h_change,
          };
        }
      });
    }

    if (fxRes && fxRes.ok) {
      const fxData = await fxRes.json();
      const usd = fxData.USDBRL;
      if (usd) {
        state.fx.USD = {
          brl: parseFloat(usd.bid),
          change: parseFloat(usd.pctChange),
        };
      }
    }

    document.getElementById('lastUpdate').textContent = 'Atualizado às ' + fmt.time(new Date());
    render();
    checkAlerts();
  } catch (err) {
    console.error('Erro ao buscar preços:', err);
    document.getElementById('lastUpdate').textContent = 'Falha ao atualizar — tentando de novo em 60s';
  }
}

// ============================================================
// VERIFICAÇÃO DE ALERTAS
// ============================================================
function checkAlerts() {
  const now = Date.now();
  let needsSave = false;

  state.strategies.forEach(s => {
    if (!s.active) return;
    const price = priceOf(s.asset, s.asset === 'USD' ? 'BRL' : 'USD');
    if (price == null) return;

    const hit = s.condition === 'above' ? price >= s.target : price <= s.target;

    if (hit && !s.triggered) {
      s.triggered = true;
      s.triggeredAt = now;
      needsSave = true;

      const msg = `${s.asset} ${s.condition === 'above' ? 'rompeu' : 'caiu abaixo de'} ${s.asset === 'USD' ? fmt.brl(s.target) : fmt.usd(s.target)} → ${s.action}`;
      fireNotification(`🎯 Alerta: ${s.asset}`, msg);
      showToast(msg);

      state.triggeredHistory.unshift({
        ...s,
        priceAtTrigger: price,
        timestamp: now,
      });
      state.triggeredHistory = state.triggeredHistory.slice(0, 30);
    } else if (!hit && s.triggered) {
      // Re-arma se o preço voltou — útil para alertas recorrentes
      s.triggered = false;
      needsSave = true;
    }
  });

  if (needsSave) {
    Store.set('strategies', state.strategies);
    Store.set('triggeredHistory', state.triggeredHistory);
  }
}

function fireNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, {
        body, icon: 'icon.svg', badge: 'icon.svg', tag: 'painel-' + Date.now(), vibrate: [200, 100, 200],
      });
    });
  } else {
    new Notification(title, { body });
  }
}

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ============================================================
// RENDER — Dashboard
// ============================================================
function renderPrices() {
  const grid = document.getElementById('priceGrid');
  const cards = [];

  Object.keys(COINS).forEach(sym => {
    const p = state.prices[sym];
    if (!p) {
      cards.push(`<div class="price-card"><span class="symbol">${sym}</span><span class="price">—</span></div>`);
      return;
    }
    const cls = (p.change || 0) >= 0 ? 'up' : 'down';
    cards.push(`
      <div class="price-card">
        <span class="symbol">${sym}</span>
        <span class="price">${fmt.usd(p.usd)}</span>
        <span class="change ${cls}">${fmt.pct(p.change)}</span>
      </div>
    `);
  });

  const fx = state.fx.USD;
  const fxCls = (fx.change || 0) >= 0 ? 'up' : 'down';
  cards.push(`
    <div class="price-card">
      <span class="symbol">USD/BRL</span>
      <span class="price">${fmt.brl(fx.brl)}</span>
      <span class="change ${fxCls}">${fmt.pct(fx.change)}</span>
    </div>
  `);

  grid.innerHTML = cards.join('');
}

function renderCloseAlerts() {
  const wrap = document.getElementById('closeAlerts');
  const withDist = state.strategies
    .filter(s => s.active)
    .map(s => {
      const price = priceOf(s.asset, s.asset === 'USD' ? 'BRL' : 'USD');
      if (price == null) return null;
      const dist = Math.abs(price - s.target) / s.target;
      return { ...s, price, dist };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 5);

  if (withDist.length === 0) {
    wrap.innerHTML = '<p class="muted">Sem alertas próximos.</p>';
    return;
  }

  wrap.innerHTML = withDist.map(s => {
    const closeClass = s.dist < 0.03 ? 'close' : '';
    const triggeredClass = s.triggered ? 'triggered' : '';
    const valFmt = s.asset === 'USD' ? fmt.brl : fmt.usd;
    return `
      <div class="strategy-card ${closeClass} ${triggeredClass}">
        <span class="badge">${s.asset}</span>
        <div class="info">
          <div class="title">${s.action}</div>
          <div class="reason">${s.reasoning}</div>
          <div class="target">Alvo: ${s.condition === 'above' ? '↑ acima de' : '↓ abaixo de'} ${valFmt(s.target)} · Atual: ${valFmt(s.price)} (${(s.dist*100).toFixed(2)}% de distância)</div>
        </div>
        <span class="badge">${s.triggered ? '🎯 ATINGIDO' : (s.dist < 0.03 ? 'PRÓXIMO' : 'AGUARDANDO')}</span>
      </div>
    `;
  }).join('');
}

function renderPortfolioSummary() {
  const wrap = document.getElementById('portfolioSummary');
  const totals = computeTotals();

  wrap.innerHTML = `
    <div class="summary-card">
      <div class="label">Total investido</div>
      <div class="value">${fmt.brl(totals.invested)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Valor atual</div>
      <div class="value ${totals.pnl >= 0 ? 'up' : 'down'}">${fmt.brl(totals.current)}</div>
      <div class="sub">${fmt.pct(totals.pnlPct)} (${totals.pnl >= 0 ? '+' : ''}${fmt.brl(totals.pnl)})</div>
    </div>
    <div class="summary-card">
      <div class="label">Renda passiva mensal estimada</div>
      <div class="value up">${fmt.brl(totals.monthlyYield)}</div>
      <div class="sub">${fmt.brl(totals.yearlyYield)} ao ano</div>
    </div>
    <div class="summary-card">
      <div class="label">Posições ativas</div>
      <div class="value">${state.positions.length}</div>
    </div>
  `;
}

// ============================================================
// PORTFÓLIO
// ============================================================
function computeTotals() {
  let invested = 0, current = 0, monthlyYield = 0;
  const fx = state.fx.USD.brl || 5;

  state.positions.forEach(pos => {
    const entryBRL = pos.currency === 'BRL' ? pos.entryPrice : pos.entryPrice * fx;
    invested += entryBRL * pos.amount;

    const cur = currentValueBRL(pos);
    current += cur;

    const apy = pos.apy || 0;
    monthlyYield += cur * (apy / 100) / 12;
  });

  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
  return { invested, current, pnl, pnlPct, monthlyYield, yearlyYield: monthlyYield * 12 };
}

function currentValueBRL(pos) {
  const fx = state.fx.USD.brl || 5;
  // Tenta resolver o ativo como crypto/USD
  const upper = (pos.asset || '').toUpperCase().replace(/[^A-Z]/g, '');
  for (const sym of Object.keys(COINS)) {
    if (upper.startsWith(sym)) {
      const usd = state.prices[sym]?.usd;
      if (usd) return pos.amount * usd * fx;
    }
  }
  // Stablecoin → 1 USD
  if (['USDC', 'USDT', 'DAI'].some(s => upper.startsWith(s))) {
    return pos.amount * fx;
  }
  // Renda fixa / outros → assume preço de entrada como par (ainda no nominal)
  // Aqui acumulamos o yield acumulado linearmente desde a entrada
  const entryBRL = pos.currency === 'BRL' ? pos.entryPrice : pos.entryPrice * fx;
  const principal = pos.amount * entryBRL;
  if (!pos.createdAt || !pos.apy) return principal;
  const months = (Date.now() - pos.createdAt) / (1000 * 60 * 60 * 24 * 30.44);
  return principal * (1 + (pos.apy / 100) * (months / 12));
}

function renderPortfolio() {
  const totals = computeTotals();
  const totalsEl = document.getElementById('portfolioTotals');
  totalsEl.innerHTML = `
    <div class="summary-card">
      <div class="label">Total investido</div>
      <div class="value">${fmt.brl(totals.invested)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Valor atual</div>
      <div class="value ${totals.pnl >= 0 ? 'up' : 'down'}">${fmt.brl(totals.current)}</div>
      <div class="sub">${fmt.pct(totals.pnlPct)} · ${totals.pnl >= 0 ? '+' : ''}${fmt.brl(totals.pnl)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Renda passiva mensal estimada</div>
      <div class="value up">${fmt.brl(totals.monthlyYield)}</div>
      <div class="sub">${fmt.brl(totals.yearlyYield)} / ano</div>
    </div>
    <div class="summary-card">
      <div class="label">Renda anual / Investido</div>
      <div class="value">${totals.invested ? ((totals.yearlyYield/totals.invested)*100).toFixed(2) + '%' : '—'}</div>
      <div class="sub">Yield aparente do portfólio</div>
    </div>
  `;

  // breakdown
  const byCat = {};
  state.positions.forEach(pos => {
    const cur = currentValueBRL(pos);
    byCat[pos.category] = (byCat[pos.category] || 0) + cur;
  });
  const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
  const labels = {
    crypto: 'Cripto', defi: 'DeFi', rendaFixaUSD: 'Renda Fixa USD',
    rendaFixaBR: 'Renda Fixa BR', acoes: 'Ações / BDR', outro: 'Outro',
  };
  const breakdown = document.getElementById('categoryBreakdown');
  breakdown.innerHTML = Object.entries(byCat).map(([cat, val]) => {
    const pct = (val / total) * 100;
    return `
      <div class="category-row">
        <div class="cat-label">${labels[cat] || cat}</div>
        <div class="cat-value">${fmt.brl(val)} <span class="cat-pct">${pct.toFixed(1)}%</span></div>
        <div class="cat-bar"><div class="cat-fill" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
    `;
  }).join('') || '<p class="muted">Sem posições.</p>';

  // tabela de posições
  const tbody = document.getElementById('positionTableBody');
  if (state.positions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="muted" style="text-align:center; padding:24px">Nenhuma posição. Clique em "Nova Posição".</td></tr>';
    return;
  }

  tbody.innerHTML = state.positions.map(pos => {
    const fx = state.fx.USD.brl || 5;
    const entryBRL = pos.currency === 'BRL' ? pos.entryPrice : pos.entryPrice * fx;
    const investedBRL = pos.amount * entryBRL;
    const cur = currentValueBRL(pos);
    const pnl = cur - investedBRL;
    const pnlPct = (pnl / investedBRL) * 100;
    const monthly = cur * ((pos.apy || 0) / 100) / 12;
    const monthlyTxt = pos.apy ? fmt.brl(monthly) : '—';
    const cls = pnl >= 0 ? 'up' : 'down';

    return `
      <tr>
        <td><strong>${pos.asset}</strong></td>
        <td>${labels[pos.category] || pos.category}</td>
        <td>${fmt.num(pos.amount, 6)}</td>
        <td>${pos.currency === 'BRL' ? fmt.brl(pos.entryPrice) : fmt.usd(pos.entryPrice)}</td>
        <td>${fmt.brl(cur / pos.amount)}</td>
        <td>${fmt.brl(cur)}</td>
        <td class="${cls}">${fmt.pct(pnlPct)}<br><small>${pnl >= 0 ? '+' : ''}${fmt.brl(pnl)}</small></td>
        <td>${monthlyTxt}</td>
        <td><button class="btn-danger" data-del-pos="${pos.id}">Excluir</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-del-pos]').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Excluir esta posição?')) return;
      state.positions = state.positions.filter(p => p.id !== btn.dataset.delPos);
      Store.set('positions', state.positions);
      render();
    };
  });
}

// ============================================================
// ESTRATÉGIAS / ALERTAS
// ============================================================
function renderStrategies() {
  const list = document.getElementById('strategyList');
  if (state.strategies.length === 0) {
    list.innerHTML = '<p class="muted">Nenhum alerta. Clique em "Novo Alerta".</p>';
    return;
  }

  list.innerHTML = state.strategies.map(s => {
    const price = priceOf(s.asset, s.asset === 'USD' ? 'BRL' : 'USD');
    const valFmt = s.asset === 'USD' ? fmt.brl : fmt.usd;
    const dist = price ? ((Math.abs(price - s.target) / s.target) * 100).toFixed(2) + '%' : '—';
    return `
      <div class="strategy-card ${s.triggered ? 'triggered' : ''}">
        <span class="badge">${s.asset}</span>
        <div class="info">
          <div class="title">${s.action} ${!s.active ? '<small style="color:var(--muted)">(pausado)</small>' : ''}</div>
          <div class="reason">${s.reasoning || ''}</div>
          <div class="target">Quando ${s.condition === 'above' ? '↑ ' : '↓ '}${valFmt(s.target)} · atual ${price ? valFmt(price) : '—'} · ${dist}</div>
        </div>
        <div class="strategy-actions">
          <button data-toggle="${s.id}">${s.active ? 'Pausar' : 'Ativar'}</button>
          <button data-del="${s.id}">Excluir</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteStrategy(b.dataset.del));
  list.querySelectorAll('[data-toggle]').forEach(b => b.onclick = () => toggleStrategy(b.dataset.toggle));
}

function deleteStrategy(id) {
  if (!confirm('Excluir alerta?')) return;
  state.strategies = state.strategies.filter(s => s.id !== id);
  Store.set('strategies', state.strategies);
  render();
}

function toggleStrategy(id) {
  const s = state.strategies.find(x => x.id === id);
  if (!s) return;
  s.active = !s.active;
  s.triggered = false;
  Store.set('strategies', state.strategies);
  render();
}

// ============================================================
// BRIEFING
// ============================================================
function renderBriefing() {
  const b = state.briefing;
  document.getElementById('briefingDate').textContent = b.date || '—';
  document.getElementById('briefingMacro').innerHTML = `
    <div class="news-card"><h4>${b.macro1Title || ''}</h4><p>${b.macro1Body || ''}</p></div>
    <div class="news-card"><h4>${b.macro2Title || ''}</h4><p>${b.macro2Body || ''}</p></div>
  `;
  document.getElementById('briefingMicro').innerHTML = `
    <div class="news-card"><h4>${b.micro1Title || ''}</h4><p>${b.micro1Body || ''}</p></div>
    <div class="news-card"><h4>${b.micro2Title || ''}</h4><p>${b.micro2Body || ''}</p></div>
  `;
  document.getElementById('briefingOpps').innerHTML = `
    <div class="news-card"><h4>${b.opp1Title || ''}</h4><p>${b.opp1Body || ''}</p></div>
    <div class="news-card"><h4>${b.opp2Title || ''}</h4><p>${b.opp2Body || ''}</p></div>
  `;
}

// ============================================================
// RENDER MASTER
// ============================================================
function render() {
  renderPrices();
  renderCloseAlerts();
  renderPortfolioSummary();
  renderStrategies();
  renderPortfolio();
  renderBriefing();
}

// ============================================================
// EVENTS
// ============================================================
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('tab-' + t.dataset.tab).classList.add('active');
    };
  });
}

function setupNotifications() {
  const btn = document.getElementById('enableNotify');
  if (!('Notification' in window)) {
    btn.textContent = '🔕 Sem suporte';
    btn.disabled = true;
    return;
  }
  const update = () => {
    if (Notification.permission === 'granted') btn.textContent = '🔔 Alertas ativos';
    else if (Notification.permission === 'denied') btn.textContent = '🔕 Alertas bloqueados';
    else btn.textContent = '🔔 Ativar Alertas';
  };
  update();
  btn.onclick = async () => {
    const perm = await Notification.requestPermission();
    update();
    if (perm === 'granted') showToast('Notificações ativas. Você será avisado quando algum alvo for atingido.');
  };
}

function setupStrategyDialog() {
  const dlg = document.getElementById('strategyDialog');
  const form = document.getElementById('strategyForm');
  document.getElementById('addStrategyBtn').onclick = () => { form.reset(); dlg.showModal(); };
  document.getElementById('cancelStrategy').onclick = () => dlg.close();
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    state.strategies.push({
      id: 's' + Date.now(),
      asset: fd.get('asset'),
      condition: fd.get('condition'),
      target: parseFloat(fd.get('target')),
      action: fd.get('action'),
      reasoning: fd.get('reasoning'),
      active: true, triggered: false,
    });
    Store.set('strategies', state.strategies);
    dlg.close();
    render();
  };
}

function setupPositionDialog() {
  const dlg = document.getElementById('positionDialog');
  const form = document.getElementById('positionForm');
  document.getElementById('addPositionBtn').onclick = () => { form.reset(); dlg.showModal(); };
  document.getElementById('cancelPosition').onclick = () => dlg.close();
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    state.positions.push({
      id: 'p' + Date.now(),
      createdAt: Date.now(),
      category: fd.get('category'),
      asset: fd.get('asset'),
      amount: parseFloat(fd.get('amount')),
      entryPrice: parseFloat(fd.get('entryPrice')),
      currency: fd.get('currency'),
      apy: parseFloat(fd.get('apy')) || 0,
      notes: fd.get('notes') || '',
    });
    Store.set('positions', state.positions);
    dlg.close();
    render();
  };
}

function setupBriefingDialog() {
  const dlg = document.getElementById('briefingDialog');
  const form = document.getElementById('briefingForm');
  document.getElementById('editBriefingBtn').onclick = () => {
    Object.keys(state.briefing).forEach(k => {
      const f = form.elements[k];
      if (f) f.value = state.briefing[k];
    });
    dlg.showModal();
  };
  document.getElementById('cancelBriefing').onclick = () => dlg.close();
  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    Object.keys(state.briefing).forEach(k => {
      if (fd.has(k)) state.briefing[k] = fd.get(k);
    });
    state.briefing.date = new Date().toISOString().slice(0, 10);
    Store.set('briefing', state.briefing);
    dlg.close();
    render();
  };
}

// ============================================================
// SERVICE WORKER
// ============================================================
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW falhou:', err));
}

// ============================================================
// BOOT
// ============================================================
function init() {
  setupTabs();
  setupNotifications();
  setupStrategyDialog();
  setupPositionDialog();
  setupBriefingDialog();
  registerSW();
  render();
  fetchPrices();
  setInterval(fetchPrices, POLL_MS);
}

init();
