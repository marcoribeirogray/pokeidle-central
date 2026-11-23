// ==UserScript==
// @name         PokeIdle Central
// @namespace    https://github.com/marcoribeirogray
// @version      2.6.0
// @description  Painel do PokeIdle para computador e celular: visão geral das contas, troca automática de hunt por XP ou ouro, reposição de estoque, venda no mercado e chances de shiny.
// @author       Marco Ribeiro
// @homepageURL  https://github.com/marcoribeirogray/pokeidle-central
// @updateURL    https://raw.githubusercontent.com/marcoribeirogray/pokeidle-central/main/pokeidle-central.user.js
// @downloadURL  https://raw.githubusercontent.com/marcoribeirogray/pokeidle-central/main/pokeidle-central.user.js
// @match        https://pokeidle.io/app*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @sandbox      raw
// @inject-into  page
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const PW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (PW.__pokeidleCentral) return;
  PW.__pokeidleCentral = true;

  const VERSAO = '2.6.0';
  const URL_SCRIPT = 'https://raw.githubusercontent.com/marcoribeirogray/pokeidle-central/main/pokeidle-central.user.js';
  const URL_PROJETO = 'https://github.com/marcoribeirogray/pokeidle-central';
  const VERSAO_JOGO_VALIDADA = '1.465.1';
  const JANELA_MS = 30 * 60000;
  const PUBLICAR_MS = 3000;
  const OFFLINE_MS = 150000;
  const PARADO_MS = 120000;
  const COOLDOWN_COMPRA_MS = 20000;
  const CMD_VALIDADE_MS = 30000;
  const MAX_QTD = 9999;
  const FATOR_PIOR_CASO = 4.4681;
  const BEAST = 5;
  const PITY_BEAST_POR_HORA = 50;
  const TROCA_TIMEOUT_MS = 5 * 60000;
  const TROCA_INTERVALO_MS = 2500;
  const SEM_COMBATE_MS = 3200;
  const MEDIR_MIN_MS = 10 * 60000;
  const MS_ONDA = 2600;
  const MAX_MOBS = 16;
  const MS_ENTRE_ALVOS = 2600;
  const ITENS_PADRAO = [
    { id: 200, nome: 'Small Potion', preco: 50, cat: 'heal' },
    { id: 201, nome: 'Great Potion', preco: 150, cat: 'heal' },
    { id: 202, nome: 'Ultra Potion', preco: 400, cat: 'heal' },
    { id: 203, nome: 'Hyper Potion', preco: 800, cat: 'heal' },
    { id: 204, nome: 'Ultimate Potion', preco: 1500, cat: 'heal' },
    { id: 205, nome: 'Revive', preco: 600, cat: 'revive' },
    { id: 206, nome: 'Max Revive', preco: 2500, cat: 'revive' },
  ];
  const NOMES_TIPO = {
    NORMAL: 'Normal', FIRE: 'Fogo', WATER: 'Água', GRASS: 'Planta', ELECTRIC: 'Elétrico', ICE: 'Gelo', FIGHTING: 'Lutador',
    POISON: 'Veneno', GROUND: 'Terra', FLYING: 'Voador', PSYCHIC: 'Psíquico', BUG: 'Inseto', ROCK: 'Pedra', GHOST: 'Fantasma',
    DRAGON: 'Dragão', DARK: 'Sombrio', STEEL: 'Aço', FAIRY: 'Fada',
  };
  const DIAGONAL_DE_TIPOS = { FIRE: 0.5, WATER: 0.5, ELECTRIC: 0.5, GRASS: 0.5, ICE: 0.5, POISON: 0.5, PSYCHIC: 0.5, DARK: 0.5, STEEL: 0.5, GHOST: 2, DRAGON: 2 };
  const K = {
    main: 'pc.main',
    cat: 'pc.cat',
    ui: 'pc.ui',
    hunt: 'pc.hunt',
    st: (n) => `pc.st.${n}`,
    cmd: (n) => `pc.cmd.${n}`,
    cfg: (n) => `pc.cfg.${n}`,
    hist: (n) => `pc.hist.${n}`,
    auto: (n) => `pc.auto.${n}`,
  };

  const temGM = (() => {
    try {
      return typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
    } catch {
      return false;
    }
  })();
  const LS = 'pcx:';
  const ouvintesLocais = new Map();
  const avisarLocal = (k, v, remoto) => {
    for (const fn of ouvintesLocais.get(k) ?? []) {
      try {
        fn(v, remoto);
      } catch {}
    }
  };
  if (!temGM) {
    window.addEventListener('storage', (ev) => {
      if (!ev.key?.startsWith(LS)) return;
      let v;
      try {
        v = ev.newValue == null ? undefined : JSON.parse(ev.newValue);
      } catch {}
      avisarLocal(ev.key.slice(LS.length), v, true);
    });
  }
  const gmGet = (k, d) => {
    try {
      if (temGM) {
        const v = GM_getValue(k);
        return v === undefined ? d : v;
      }
      const t = localStorage.getItem(LS + k);
      return t == null ? d : JSON.parse(t);
    } catch {
      return d;
    }
  };
  const gmSet = (k, v) => {
    try {
      if (temGM) GM_setValue(k, v);
      else {
        localStorage.setItem(LS + k, JSON.stringify(v));
        avisarLocal(k, v, false);
      }
    } catch {}
  };
  const gmDel = (k) => {
    try {
      if (temGM) GM_deleteValue(k);
      else localStorage.removeItem(LS + k);
    } catch {}
  };
  const gmList = () => {
    try {
      if (temGM) return GM_listValues();
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(LS)) out.push(k.slice(LS.length));
      }
      return out;
    } catch {
      return [];
    }
  };
  const gmOuvir = (k, fn) => {
    try {
      if (temGM && typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(k, (chave, antigo, novo, remoto) => fn(novo, remoto));
        return;
      }
    } catch {}
    if (!ouvintesLocais.has(k)) ouvintesLocais.set(k, []);
    ouvintesLocais.get(k).push(fn);
  };
  const CELULAR = (() => {
    try {
      return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
    } catch {
      return false;
    }
  })();


  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mediana = (arr) => {
    const v = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, casas = 0) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas }) : '—');
  const curto = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${num(n / 1e9, 1)}B`;
    if (abs >= 1e6) return `${num(n / 1e6, 1)}M`;
    if (abs >= 1e3) return `${num(n / 1e3, 1)}k`;
    return num(n);
  };
  const tempoH = (h) => {
    if (!Number.isFinite(h) || h <= 0) return '∞';
    if (h < 1 / 60) return '<1 min';
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${num(h, 1)} h`;
    return `${num(h / 24, 1)} dias`;
  };
  const haQuanto = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)} min`;
    return `${num(s / 3600, 1)} h`;
  };

  const XP_ANCORA = 0.6 * 150 ** 2;
  const xpDoNivel = (n) => (n <= 150 ? Math.floor((6 * n * n) / 10) + 8 : Math.round(XP_ANCORA * (n / 150) ** 1.25));
  const EXP_OURO = Math.log(6000 / 36) / Math.log(5000);
  const TETO_OURO_KILL = Math.round(36 * 25000 ** EXP_OURO);
  const ouroPorKillDoNivel = (n) => Math.min(TETO_OURO_KILL, Math.max(1, Math.round(36 * Math.max(1, Number(n) || 1) ** EXP_OURO)));
  const ouroPorDerrota = (n) => {
    const nn = Math.max(1, Number(n) || 1);
    const base = nn <= 25000 ? ouroPorKillDoNivel(nn) : TETO_OURO_KILL * (nn / 25000) ** 0.3;
    return Math.round(base * 1.15);
  };
  const hpPadrao = (base, nivel) => Math.floor((2 * base * nivel) / 100) + nivel + 10;
  const defPadrao = (base, nivel) => Math.floor((2 * base * nivel) / 100) + 5;
  const multTipo = (atq, def, linha) => (def === atq ? (DIAGONAL_DE_TIPOS[atq] ?? 1) : (linha?.[def] ?? 1));
  const efetividade = (atq, d1, d2, tabela) => {
    const a = String(atq).toUpperCase();
    const linha = tabela?.[a] ?? {};
    let v = multTipo(a, String(d1).toUpperCase(), linha);
    if (d2 && d2 !== d1) v *= multTipo(a, String(d2).toUpperCase(), linha);
    return v;
  };
  const ampliar = (v, a = 1.5) => (v > 1 ? 1 + (v - 1) * a : v < 1 && v > 0 ? v / a : v);

  const ag = {
    ws: null,
    nick: null,
    eu: {},
    catalogo: gmGet(K.cat, null),
    versaoJogo: null,
    cena: null,
    mobs: new Map(),
    eventos: [],
    tot: { throw: 0, cap: 0, shinyVisto: 0, shinyCap: 0, kill: 0 },
    inicio: Date.now(),
    ultimaBatalha: 0,
    ultimoAtaque: 0,
    ultimoGolpeJog: 0,
    intervalos: [],
    golpes: [],
    merc: { dados: null, ts: 0, pedindo: false, pedidoEm: 0, log: [], porHora: [], trava: {}, ultimoDoItem: {}, pendente: null, ultimoCiclo: 0, vendidosAnunciados: 0 },
    tomados: [],
    xpMult: [],
    ouroMult: [],
    idasCentro: 0,
    estavaNoCentro: null,
    ultimaHunt: null,
    acc: null,
    hist: null,
    histSalvoEm: 0,
    centroLivreEm: 0,
    offsetServ: 0,
    trocaLivreEm: 0,
    troca: null,
    trocaResultado: null,
    compras: [],
    ultimaCompra: {},
    gastoCompras: [],
    cmdsFeitos: new Set(),
    avisos: [],
    ultimoPublicar: 0,
    ultimaReposicao: 0,
    estadoReposicao: { ligada: false },
    ouvindoCmd: false,
  };

  const aviso = (txt) => {
    ag.avisos.push({ t: Date.now(), txt });
    if (ag.avisos.length > 8) ag.avisos.shift();
  };
  const empurrar = (arr, v, max) => {
    arr.push(v);
    if (arr.length > max) arr.splice(0, arr.length - max);
  };

  const registrar = (k, v = 1, id = null) => {
    ag.eventos.push({ t: Date.now(), k, v: Number(v) || 0, id });
    if (k in ag.tot) ag.tot[k] += Number(v) || 0;
  };
  const podar = () => {
    const lim = Date.now() - JANELA_MS;
    let i = 0;
    while (i < ag.eventos.length && ag.eventos[i].t < lim) i += 1;
    if (i) ag.eventos.splice(0, i);
  };
  const baseJanela = () => Math.max(60000, Math.min(JANELA_MS, Date.now() - ag.inicio));
  const porHora = (k) => {
    let s = 0;
    for (const e of ag.eventos) if (e.k === k) s += e.v;
    return (s * 3600000) / baseJanela();
  };
  const usoPorHora = (k) => {
    const m = {};
    for (const e of ag.eventos) if (e.k === k) m[e.id] = (m[e.id] || 0) + e.v;
    const f = 3600000 / baseJanela();
    for (const id of Object.keys(m)) m[id] *= f;
    return m;
  };

  const cat = () => ag.catalogo ?? gmGet(K.cat, null);
  const bolaDoCat = (id) => cat()?.bolas?.find((b) => b.id === Number(id));
  const itemDoCat = (id) => cat()?.itens?.find((i) => i.id === Number(id));
  const huntPorSlug = (slug) => cat()?.hunts?.find((h) => h.slug === slug) ?? null;
  const precoDe = (kind, id) => (kind === 'ball'
    ? (bolaDoCat(id)?.compravel ? bolaDoCat(id).preco : null)
    : itemDoCat(id)?.preco ?? null);
  const nomeDe = (kind, id) => (kind === 'ball' ? bolaDoCat(id)?.nome : itemDoCat(id)?.nome) ?? `#${id}`;
  const grupoDe = (chave) => (chave.startsWith('ball:') ? 'reporBolas' : 'reporCura');
  const itensCompraveis = () => [
    ...(cat()?.bolas ?? []).filter((b) => b.compravel && b.preco > 0).map((b) => ({ chave: `ball:${b.id}`, nome: b.nome, preco: b.preco })),
    ...(cat()?.itens ?? []).filter((i) => i.preco > 0).sort((a, b) => a.id - b.id).map((i) => ({ chave: `item:${i.id}`, nome: i.nome, preco: i.preco, cat: i.cat })),
  ];

  const enviar = (obj) => {
    if (!ag.ws || ag.ws.readyState !== 1) return false;
    ag.ws._pcSend(JSON.stringify(obj));
    return true;
  };

  const registrarCompra = (kind, id, qty, total, origem, res) => {
    ag.compras.push({ t: Date.now(), kind, id, nome: nomeDe(kind, id), qty, total, origem, res });
    if (ag.compras.length > 12) ag.compras.shift();
    publicar(true);
  };

  const comprar = (kind, idBruto, qtyBruta, origem) => {
    const id = Number(idBruto);
    const qty = Math.floor(Number(qtyBruta));
    if (!['ball', 'item'].includes(kind) || !(qty >= 1 && qty <= MAX_QTD)) return registrarCompra(kind, id, qty, 0, origem, 'pedido inválido');
    const preco = Number(precoDe(kind, id));
    if (!(preco > 0)) return registrarCompra(kind, id, qty, 0, origem, 'não vendido no NPC');
    const total = preco * qty;
    if (Number(ag.eu.gold) < total) return registrarCompra(kind, id, qty, total, origem, 'ouro insuficiente');
    if (!enviar({ t: 'shop.buy', kind, id, qty })) return registrarCompra(kind, id, qty, total, origem, 'sem conexão');
    ag.ultimaCompra[`${kind}:${id}`] = Date.now();
    ag.gastoCompras.push({ t: Date.now(), v: total });
    return registrarCompra(kind, id, qty, total, origem, 'enviada');
  };

  const cfgPadrao = () => ({ reporBolas: false, reporCura: false, reservaOuro: 0, tetoHora: 0, regras: {} });
  const lerCfg = (nick) => {
    const c = gmGet(K.cfg(nick), null);
    const cfg = { ...cfgPadrao(), ...(c && typeof c === 'object' ? c : {}), regras: { ...(c?.regras ?? {}) } };
    if (c && c.autoRepor === true && c.reporBolas === undefined && c.reporCura === undefined) {
      cfg.reporBolas = true;
      cfg.reporCura = true;
    }
    delete cfg.autoRepor;
    return cfg;
  };
  const regraPadrao = (chave) => {
    const revive = chave.startsWith('item:') && itemDoCat(Number(chave.split(':')[1]))?.cat === 'revive';
    if (chave.startsWith('ball:')) return { ativo: false, min: 100, lote: 500 };
    return revive ? { ativo: false, min: 10, lote: 50 } : { ativo: false, min: 50, lote: 200 };
  };

  const garantirRegras = () => {
    if (!ag.nick || !cat()) return;
    const cfg = lerCfg(ag.nick);
    const a = ag.eu.automation ?? {};
    let mudou = !gmGet(K.cfg(ag.nick), null);
    const usadas = new Set([
      ...(a.ballIds ?? []).map((id) => `ball:${id}`),
      ...(a.potionIds ?? []).map((id) => `item:${id}`),
      ...(a.reviveIds ?? []).map((id) => `item:${id}`),
    ]);
    for (const it of itensCompraveis()) {
      if (cfg.regras[it.chave]) continue;
      cfg.regras[it.chave] = { ...regraPadrao(it.chave), ativo: usadas.has(it.chave) };
      mudou = true;
    }
    if (mudou) gmSet(K.cfg(ag.nick), cfg);
  };

  const avaliarReposicao = (forcar = false) => {
    if (!ag.nick || !cat()) return;
    const agora = Date.now();
    if (!forcar && agora - ag.ultimaReposicao < 3000) return;
    ag.ultimaReposicao = agora;
    const cfg = lerCfg(ag.nick);
    if (!cfg.reporBolas && !cfg.reporCura) {
      ag.estadoReposicao = { ligada: false };
      return;
    }
    ag.gastoCompras = ag.gastoCompras.filter((g) => agora - g.t < 3600000);
    let gastoHora = ag.gastoCompras.reduce((s, g) => s + g.v, 0);
    const bloqueios = [];
    for (const [chave, r] of Object.entries(cfg.regras)) {
      if (!r?.ativo || !cfg[grupoDe(chave)]) continue;
      const [kind, idTxt] = chave.split(':');
      const id = Number(idTxt);
      const qtd = Number(kind === 'ball' ? ag.eu.balls?.[id] : ag.eu.items?.[id]) || 0;
      if (qtd >= Number(r.min)) continue;
      if (agora - (ag.ultimaCompra[chave] || 0) < COOLDOWN_COMPRA_MS) continue;
      const preco = Number(precoDe(kind, id));
      if (!(preco > 0)) continue;
      const lote = clamp(Math.floor(Number(r.lote) || 0), 1, MAX_QTD);
      const total = preco * lote;
      const gold = Number(ag.eu.gold) || 0;
      if (gold - total < (Number(cfg.reservaOuro) || 0)) {
        bloqueios.push(`${nomeDe(kind, id)}: ouro abaixo da reserva`);
        continue;
      }
      if (Number(cfg.tetoHora) > 0 && gastoHora + total > Number(cfg.tetoHora)) {
        bloqueios.push(`${nomeDe(kind, id)}: teto de gasto por hora`);
        continue;
      }
      comprar(kind, id, lote, 'auto');
      gastoHora += total;
    }
    ag.estadoReposicao = { ligada: true, gastoHora, bloqueios };
  };

  const ativoAtual = () => {
    const p = (ag.eu.pokemons ?? []).find((x) => x.id === ag.eu.activeId);
    if (!p) return null;
    return {
      id: p.id,
      nome: p.nome ?? p.especie ?? '',
      speciesId: Number(p.speciesId ?? p.pokeId) || null,
      level: Number(p.level) || 0,
      maxHp: Number(p.maxHp) || 0,
      tipos: (Array.isArray(p.tipos) ? p.tipos : []).map((t) => String(t).toUpperCase()),
      shiny: !!p.shiny,
    };
  };

  const carregarHist = () => {
    if (!ag.nick || ag.hist) return;
    const h = gmGet(K.hist(ag.nick), null);
    ag.hist = { medidas: { ...(h?.medidas ?? {}) }, perigo: { ...(h?.perigo ?? {}) }, fraqObs: { ...(h?.fraqObs ?? {}) } };
  };
  const salvarHist = (forcar = false) => {
    if (!ag.nick || !ag.hist) return;
    if (!forcar && Date.now() - ag.histSalvoEm < 60000) return;
    ag.histSalvoEm = Date.now();
    gmSet(K.hist(ag.nick), ag.hist);
  };

  const gravarMedida = (acc) => {
    const dur = Date.now() - acc.t0;
    if (dur < MEDIR_MIN_MS || acc.kills <= 0 || !ag.hist) return false;
    const f = 3600000 / dur;
    ag.hist.medidas[acc.slug] = { xpH: acc.xp * f, ouroH: acc.ouro * f, killsH: acc.kills * f, nivelPok: acc.nivelPok, min: Math.round(dur / 60000), ts: Date.now() };
    return true;
  };
  const acompanharHunt = () => {
    const slug = ag.eu.huntSlug && !ag.eu.noCentro && !ag.eu.safari?.dentro && !ag.eu.boss?.arena ? ag.eu.huntSlug : null;
    if (ag.acc?.slug === slug) return;
    if (ag.acc && gravarMedida(ag.acc)) salvarHist(true);
    ag.acc = slug ? { slug, t0: Date.now(), xp: 0, ouro: 0, kills: 0, nivelPok: ativoAtual()?.level ?? 0 } : null;
    if (slug) ag.ultimaHunt = slug;
  };

  const montarCalib = () => {
    const grupos = new Map();
    for (const g of ag.golpes) {
      const k = `${g.nome ?? `#${g.id}`}|${g.nv}`;
      if (!grupos.has(k)) grupos.set(k, { nome: g.nome, id: g.id ?? null, nv: g.nv, mhp: [], dano: [], ef: [] });
      const x = grupos.get(k);
      x.mhp.push(g.mhp);
      x.dano.push(g.dano);
      x.ef.push(g.ef);
    }
    return {
      amostras: ag.golpes.length,
      alvos: [...grupos.values()].map((x) => ({ nome: x.nome, id: x.id, nv: x.nv, mhp: mediana(x.mhp), dano: mediana(x.dano), ef: mediana(x.ef), n: x.dano.length })),
      intervalo: mediana(ag.intervalos),
      xpMult: mediana(ag.xpMult),
      ouroMult: mediana(ag.ouroMult),
      recebido: mediana(ag.tomados.slice(-80).map((x) => x.dano / Math.max(0.05, x.ef) / x.nv)),
      recebidoN: ag.tomados.length,
    };
  };

  const soItensDoCatalogo = (items) => {
    const out = {};
    for (const i of cat()?.itens ?? []) if (items?.[i.id] != null) out[i.id] = items[i.id];
    return out;
  };

  const MERC = { ciclo: 60000, confirmar: 20000, trava: 3 * 60000, dadosValidos: 90000, entreAnuncios: 30 * 60000 };
  const mercPadrao = () => ({ ativo: false, maxHora: 6, itens: {} });
  const lerMerc = (nick) => ({ ...mercPadrao(), ...(lerCfg(nick).mercado ?? {}) });
  const regraMercPadrao = () => ({ ativo: false, acumular: 20, guardar: 0, modo: 'media', minPreco: 0 });
  const nomeItem = (id) => gmGet('pc.nomesItens', {})?.[id] ?? itemDoCat(id)?.nome ?? `Item ${id}`;

  const mercLog = (txt, tipo = 'info') => {
    ag.merc.log.push({ t: Date.now(), txt, tipo });
    if (ag.merc.log.length > 30) ag.merc.log.splice(0, ag.merc.log.length - 30);
  };

  const precoDeMercado = (id, regra) => {
    const d = ag.merc.dados;
    if (!d) return null;
    const media = Number(d.medias?.[id]?.gold?.media) || null;
    const menor = Number(d.resumo?.[id]?.minGold) || null;
    let p = regra.modo === 'menor' ? (menor ? menor - 1 : media) : (media ?? menor);
    if (!p) return null;
    p = Math.max(Math.round(p), Number(regra.minPreco) || 0, 2);
    return { preco: p, media, menor };
  };

  const aoMercado = (m) => {
    if (m.aba !== 'itens') return;
    ag.merc.dados = { resumo: m.resumo ?? {}, medias: m.medias ?? {} };
    ag.merc.ts = Date.now();
    ag.merc.pedindo = false;
  };

  const aoAvisoMercado = (msg) => {
    const p = ag.merc.pendente;
    if (msg === 'market.travaItemAberto') {
      if (p) mercLog(`${nomeItem(p.id)}: anúncio aceito, fica retido 2 min antes de abrir para compra`, 'ok');
      return;
    }
    mercLog(`Jogo respondeu: ${msg}`, 'erro');
    if (p) {
      ag.merc.trava[p.id] = Date.now();
      ag.merc.pendente = null;
    }
  };

  const cicloMercado = () => {
    if (!ag.nick || !ag.ws || ag.ws.readyState !== 1) return;
    const agora = Date.now();
    const p = ag.merc.pendente;
    if (p && agora - p.t > MERC.confirmar) {
      const qtdAgora = Number(ag.eu.items?.[p.id]) || 0;
      if (qtdAgora <= p.antes - p.qtd) {
        ag.merc.vendidosAnunciados += p.qtd;
        ag.merc.ultimoDoItem[p.id] = agora;
        mercLog(`Anunciou ${num(p.qtd)} ${nomeItem(p.id)} a ${num(p.preco)} de ouro cada`, 'ok');
      } else {
        ag.merc.trava[p.id] = agora;
        mercLog(`${nomeItem(p.id)}: o anúncio não saiu da mochila; tento de novo em 3 min`, 'erro');
      }
      ag.merc.pendente = null;
    }
    if (ag.merc.pendente) return;
    if (gmGet(K.main, null) === ag.nick) return;
    const cfg = lerMerc(ag.nick);
    if (!cfg.ativo) return;
    if (agora - ag.merc.ultimoCiclo < MERC.ciclo) return;
    ag.merc.porHora = ag.merc.porHora.filter((t) => agora - t < 3600000);
    if (ag.merc.porHora.length >= (Number(cfg.maxHora) || 6)) return;
    const candidatos = Object.entries(cfg.itens)
      .filter(([, r]) => r?.ativo)
      .map(([id, r]) => {
        const tem = Number(ag.eu.items?.[id]) || 0;
        return { id: Number(id), r: { ...regraMercPadrao(), ...r }, tem, vender: tem - (Number(r.guardar) || 0) };
      })
      .filter((c) => c.vender >= Math.max(5, Number(c.r.acumular) || 20) && !(ag.merc.trava[c.id] && agora - ag.merc.trava[c.id] < MERC.trava) && !(ag.merc.ultimoDoItem[c.id] && agora - ag.merc.ultimoDoItem[c.id] < MERC.entreAnuncios))
      .sort((a, b) => b.vender - a.vender);
    if (!candidatos.length) {
      ag.merc.ultimoCiclo = agora;
      return;
    }
    if (!ag.merc.dados || agora - ag.merc.ts > MERC.dadosValidos) {
      if (!ag.merc.pedindo || agora - ag.merc.pedidoEm > 10000) {
        ag.merc.pedindo = true;
        ag.merc.pedidoEm = agora;
        ag.ws._pcSend(JSON.stringify({ t: 'market.itens' }));
      }
      return;
    }
    ag.merc.ultimoCiclo = agora;
    const c = candidatos[0];
    const pr = precoDeMercado(c.id, c.r);
    if (!pr) {
      ag.merc.trava[c.id] = agora;
      mercLog(`${nomeItem(c.id)}: sem preço no mercado agora`, 'erro');
      return;
    }
    const qtd = Math.min(c.vender, MAX_QTD);
    mercLog(`Enviando anúncio: ${num(qtd)} ${nomeItem(c.id)} a ${num(pr.preco)} cada (tinha ${num(c.tem)})`);
    ag.ws._pcSend(JSON.stringify({ t: 'market.criar', tipo: 'item', itemId: c.id, casaId: null, bicicletaId: null, qtd, preco: pr.preco, moeda: 'gold', dias: null }));
    ag.merc.pendente = { id: c.id, qtd, preco: pr.preco, antes: c.tem, t: agora };
    ag.merc.porHora.push(agora);
  };

  const montarStatus = () => {
    podar();
    const eu = ag.eu;
    const a = eu.automation ?? {};
    const h = huntPorSlug(eu.huntSlug);
    return {
      v: VERSAO,
      nick: ag.nick,
      ts: Date.now(),
      conectado: !!(ag.ws && ag.ws.readyState === 1),
      gold: eu.gold ?? null,
      nivel: Number(eu.level) || 0,
      vip: !!eu.loja?.vip,
      huntSlug: eu.huntSlug ?? null,
      huntNivel: h?.nivel ?? null,
      noCentro: !!eu.noCentro,
      safari: !!eu.safari?.dentro,
      boss: !!eu.boss?.arena,
      casa: !!eu.casa?.dentro,
      ultimaBatalha: ag.ultimaBatalha,
      mochila: Object.fromEntries(Object.entries(eu.items ?? {}).filter(([, q]) => Number(q) > 0)),
      merc: {
        log: ag.merc.log.slice(-12),
        precos: ag.merc.dados ? Object.fromEntries(Object.keys(eu.items ?? {}).filter((id) => ag.merc.dados.resumo?.[id] || ag.merc.dados.medias?.[id]).map((id) => [id, { media: Number(ag.merc.dados.medias?.[id]?.gold?.media) || null, menor: Number(ag.merc.dados.resumo?.[id]?.minGold) || null }])) : null,
        precosEm: ag.merc.ts,
        anunciados: ag.merc.vendidosAnunciados,
        naHora: ag.merc.porHora.filter((t) => Date.now() - t < 3600000).length,
      },
      huntAcc: ag.acc ? { slug: ag.acc.slug, t0: ag.acc.t0, xp: ag.acc.xp, ouro: ag.acc.ouro, kills: ag.acc.kills } : null,
      xpTrein: Number(eu.xp ?? eu.exp ?? eu.experiencia ?? eu.xpTreinador) || null,
      xpProx: Number(eu.xpProximo ?? eu.xpNext ?? eu.xpProxNivel ?? eu.xpParaProximo ?? eu.proximoNivelXp ?? eu.xpMax) || null,
      auto: {
        ateCapturar: !!a.autoBallAteCapturar,
        semParar: !!(a.autoBallSemParar || a.autoBall),
        ballIds: Array.isArray(a.ballIds) ? a.ballIds : [],
        potionIds: Array.isArray(a.potionIds) ? a.potionIds : [],
        reviveIds: Array.isArray(a.reviveIds) ? a.reviveIds : [],
        autoPotion: typeof a.autoPotion === 'boolean' ? a.autoPotion : null,
        autoRevive: typeof a.autoRevive === 'boolean' ? a.autoRevive : null,
      },
      balls: eu.balls ?? {},
      items: soItensDoCatalogo(eu.items),
      boosts: { shiny: Number(eu.loja?.boosts?.shiny) || 0, captura: Number(eu.loja?.boosts?.captura) || 0 },
      rate: { kills: porHora('kill'), throws: porHora('throw'), caps: porHora('cap'), gold: porHora('gold'), xp: porHora('xp') },
      tot: { ...ag.tot, desde: ag.inicio },
      usoBola: usoPorHora('ball'),
      usoItem: { ...usoPorHora('cura'), ...usoPorHora('rev') },
      idasCentro: ag.idasCentro,
      compras: ag.compras.slice(-8),
      avisos: ag.avisos.slice(-5),
      reposicao: ag.estadoReposicao,
      versaoJogo: ag.versaoJogo,
      ativo: ativoAtual(),
      calib: montarCalib(),
      hist: ag.hist,
      troca: ag.troca ? { slug: ag.troca.slug, nome: ag.troca.nome, msg: ag.troca.msg, tentativas: ag.troca.tentativas, inicio: ag.troca.inicio } : null,
      trocaResultado: ag.trocaResultado,
    };
  };

  const publicar = (forcar = false) => {
    if (!ag.nick) return;
    const agora = Date.now();
    if (!forcar && agora - ag.ultimoPublicar < PUBLICAR_MS) return;
    ag.ultimoPublicar = agora;
    if (ag.acc && gravarMedida(ag.acc)) salvarHist();
    gmSet(K.st(ag.nick), montarStatus());
  };

  const concluirTroca = (resultado) => {
    if (!ag.troca) return;
    ag.trocaResultado = { slug: ag.troca.slug, nome: ag.troca.nome, resultado, t: Date.now(), tentativas: ag.troca.tentativas };
    aviso(resultado === 'ok' ? `🗺️ Hunt trocada para ${ag.troca.nome}.` : `🗺️ Troca para ${ag.troca.nome} não concluída: ${resultado}.`);
    ag.troca = null;
    publicar(true);
  };

  const processarTroca = () => {
    const tr = ag.troca;
    if (!tr) return;
    const agora = Date.now();
    if (ag.eu.huntSlug === tr.slug && !ag.eu.noCentro) {
      concluirTroca('ok');
      return;
    }
    if (agora - tr.inicio > TROCA_TIMEOUT_MS) {
      concluirTroca('tempo esgotado (5 min sem brecha)');
      return;
    }
    if (!ag.ws || ag.ws.readyState !== 1) {
      tr.msg = 'sem conexão — aguardando';
      return;
    }
    if (ag.eu.boss?.arena || ag.eu.mistico || ag.eu.safari?.dentro || ag.eu.casa?.dentro) {
      tr.msg = 'aguardando sair de boss/Safari/casa';
      return;
    }
    const servAgora = agora - ag.offsetServ;
    const porta = Math.max(0, (Number(ag.trocaLivreEm) || 0) - servAgora);
    if (porta > 0) {
      tr.msg = `o jogo libera a troca em ${Math.ceil(porta / 1000)}s`;
      return;
    }
    const semMobVivo = ![...ag.mobs.values()].some((m) => !m.morto && !m.trein && !m.bon);
    const semCombate = agora - ag.ultimoAtaque > SEM_COMBATE_MS;
    const livreServidor = Number(ag.centroLivreEm) > 0 && Number(ag.centroLivreEm) <= servAgora;
    if (!(ag.eu.noCentro || !ag.eu.huntSlug || semMobVivo || semCombate || livreServidor)) {
      tr.msg = `em combate — esperando uma brecha${tr.tentativas ? ` (tentativa ${tr.tentativas})` : ''}`;
      return;
    }
    if (agora - tr.ultimaTentativa < TROCA_INTERVALO_MS) return;
    tr.ultimaTentativa = agora;
    tr.tentativas += 1;
    tr.msg = `pedindo a troca (tentativa ${tr.tentativas})`;
    enviar({ t: 'hunt.select', slug: tr.slug });
  };

  const iniciarTroca = (slug) => {
    const h = huntPorSlug(slug);
    if (!h) {
      aviso('🗺️ Hunt desconhecida.');
      return;
    }
    if (Number(ag.eu.level) < h.nivel) {
      aviso(`🗺️ ${h.nome} pede treinador Nv ${h.nivel}.`);
      return;
    }
    if (ag.eu.huntSlug === slug) {
      aviso(`🗺️ Já está em ${h.nome}.`);
      return;
    }
    ag.troca = { slug, nome: h.nome, inicio: Date.now(), ultimaTentativa: 0, tentativas: 0, msg: 'preparando' };
    ag.trocaResultado = null;
    processarTroca();
    publicar(true);
  };

  const executarCmd = (cmd) => {
    if (!cmd || typeof cmd !== 'object' || ag.cmdsFeitos.has(cmd.id)) return;
    if (Date.now() - Number(cmd.ts) > CMD_VALIDADE_MS) return;
    ag.cmdsFeitos.add(cmd.id);
    if (cmd.tipo === 'buy') comprar(cmd.kind, cmd.itemId, cmd.qty, 'manual');
    else if (cmd.tipo === 'hunt') iniciarTroca(cmd.slug);
    else if (cmd.tipo === 'cancelarHunt' && ag.troca) concluirTroca('cancelada por você');
    else if (cmd.tipo === 'mercPrecos' && ag.ws?.readyState === 1) {
      ag.merc.pedindo = true;
      ag.merc.pedidoEm = Date.now();
      ag.ws._pcSend(JSON.stringify({ t: 'market.itens' }));
    }
  };

  const ouvirComandos = () => {
    if (ag.ouvindoCmd || !ag.nick) return;
    ag.ouvindoCmd = true;
    gmOuvir(K.cmd(ag.nick), (cmd) => executarCmd(cmd));
    executarCmd(gmGet(K.cmd(ag.nick), null));
  };

  const carregarItensDoJogo = async () => {
    let itens = null;
    try {
      const r = await fetch('/assets/items.json', { cache: 'no-store' });
      const j = await r.json();
      const nomes = {};
      for (const i of j.items ?? []) if (i?.id != null && i.name) nomes[i.id] = i.name;
      if (Object.keys(nomes).length) gmSet('pc.nomesItens', nomes);
      itens = (j.items ?? [])
        .filter((i) => (i.category === 'heal' || i.category === 'revive') && Number(i.npcPrice) > 0)
        .map((i) => ({ id: i.id, nome: i.name, preco: Number(i.npcPrice), cat: i.category }));
    } catch {}
    if (!itens?.length) itens = ITENS_PADRAO.map((i) => ({ ...i }));
    if (!ag.catalogo) return;
    const porId = new Map((ag.catalogo.itens ?? []).map((i) => [i.id, i]));
    for (const i of itens) porId.set(i.id, { ...porId.get(i.id), ...i });
    ag.catalogo.itens = [...porId.values()].sort((a, b) => a.id - b.id);
    gmSet(K.cat, ag.catalogo);
    garantirRegras();
    publicar(true);
  };

  const mesclarEstado = (atual, novo) => {
    if (!novo || typeof novo !== 'object') return atual;
    const r = { ...atual };
    for (const [k, v] of Object.entries(novo)) {
      if (['balls', 'items', 'automation', 'loja'].includes(k) && v && typeof v === 'object' && !Array.isArray(v)) {
        r[k] = { ...(atual[k] ?? {}), ...v };
      } else {
        r[k] = v;
      }
    }
    return r;
  };

  const verificarCentro = () => {
    const agora = !!ag.eu.noCentro;
    if (ag.estavaNoCentro === false && agora) {
      ag.idasCentro += 1;
      aviso('🏥 Foi para o Centro Pokémon.');
      const lutando = Date.now() - ag.ultimoAtaque < 15000;
      if (ag.ultimaHunt && lutando && ag.hist && !ag.troca) {
        ag.hist.perigo[ag.ultimaHunt] = { nivelPok: ativoAtual()?.level ?? 0, t: Date.now() };
        salvarHist(true);
      }
    }
    ag.estavaNoCentro = agora;
  };

  const aplicarMobs = (m) => {
    for (const b of m.mobs ?? []) {
      if (b?.s === undefined) continue;
      const e = ag.mobs.get(b.s) ?? {};
      if (b.n !== undefined) e.nome = b.n;
      if (b.nv !== undefined) e.nv = b.nv;
      if (b.mhp !== undefined) e.mhp = b.mhp;
      if (b.x !== undefined) e.morto = !!b.x;
      if (b.tr !== undefined) e.trein = !!b.tr;
      if (b.bn !== undefined) e.bon = !!b.bn;
      ag.mobs.set(b.s, e);
    }
    for (const slot of m.fora ?? []) ag.mobs.delete(slot);
  };

  const nivelDaHuntAtual = () => huntPorSlug(ag.eu.huntSlug)?.nivel ?? null;

  const aoEventoBatalha = (e) => {
    if (!e || typeof e !== 'object') return;
    ag.ultimaBatalha = Date.now();
    if (e.k === 'aviso' && String(e.msg ?? '').startsWith('market.')) aoAvisoMercado(String(e.msg));
    switch (e.k) {
      case 'ataque': {
        const agora = Date.now();
        ag.ultimoAtaque = agora;
        const mob = ag.mobs.get(e.slot);
        if (e.por === 'jogador') {
          const gap = agora - ag.ultimoGolpeJog;
          if (gap > 200 && gap < 10000) empurrar(ag.intervalos, gap, 80);
          ag.ultimoGolpeJog = agora;
          const h = huntPorSlug(ag.eu.huntSlug);
          const unica = h?.especies?.length === 1 ? Number(h.especies[0].id) || null : null;
          const nome = mob?.nome ?? null;
          const nv = Number(mob?.nv ?? h?.nivel) || 0;
          if ((nome || unica) && nv > 0 && Number(e.dano) > 0 && !mob?.trein && !mob?.bon) {
            empurrar(ag.golpes, { nome, id: nome ? null : unica, nv, mhp: Number(mob?.mhp) || 0, dano: Number(e.dano), ef: Number(e.ef) || 1 }, 200);
          }
        } else if (e.por === 'selvagem' && Number(e.dano) > 0) {
          const h = huntPorSlug(ag.eu.huntSlug);
          const unica = h?.especies?.length === 1 ? Number(h.especies[0].id) || null : null;
          const chave = mob?.nome ?? (unica ? `#${unica}` : null);
          const nv = Number(mob?.nv ?? h?.nivel) || 0;
          const ef = Number(e.ef) || 1;
          if (nv > 0) empurrar(ag.tomados, { nome: chave, nv, dano: Number(e.dano), ef }, 200);
          if (chave && ag.hist) {
            const antes = ag.hist.fraqObs[chave];
            if (!antes || ef > antes.ef || Date.now() - antes.t > 3 * 86400000) ag.hist.fraqObs[chave] = { ef, t: Date.now() };
          }
        }
        break;
      }
      case 'morte': {
        if (e.quem !== 'selvagem') break;
        const xp = Number(e.xpTreinador ?? e.xp) || 0;
        const ouro = Number(e.ouro) || 0;
        registrar('kill');
        registrar('gold', ouro);
        registrar('xp', xp);
        const nv = Number(e.nivel ?? e.level ?? ag.mobs.get(e.slot)?.nv ?? nivelDaHuntAtual());
        if (nv > 0 && xp > 0) empurrar(ag.xpMult, xp / xpDoNivel(nv), 60);
        if (nv > 0 && ouro > 0) empurrar(ag.ouroMult, ouro / ouroPorDerrota(nv), 60);
        if (ag.acc) {
          ag.acc.kills += 1;
          ag.acc.xp += xp;
          ag.acc.ouro += ouro;
        }
        break;
      }
      case 'bola':
        registrar('throw');
        registrar('ball', 1, Number(e.ballId));
        if (e.shiny) {
          registrar('shinyVisto');
          aviso('✨ Shiny visto!');
        }
        break;
      case 'capturado':
        registrar('cap');
        if (e.pokemon?.shiny) {
          registrar('shinyCap');
          aviso(`🎉 Shiny capturado: ${e.pokemon.nome ?? ''}`);
        }
        break;
      case 'cura':
        registrar('cura', 1, Number(e.itemId));
        break;
      case 'revive':
        registrar('rev', 1, Number(e.itemId));
        break;
      case 'hunt':
        if (e.trocaLivreEm) ag.trocaLivreEm = Number(e.trocaLivreEm);
        if (ag.troca && e.nome && String(e.nome) === String(ag.troca.nome)) concluirTroca('ok');
        break;
      default:
        break;
    }
  };

  const aoReceber = (m) => {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome': {
        ag.eu = m.estado && typeof m.estado === 'object' ? m.estado : {};
        if (!ag.nick && typeof ag.eu.nick === 'string') ag.nick = ag.eu.nick;
        if (ag.eu.servidorAgora) ag.offsetServ = Date.now() - Number(ag.eu.servidorAgora);
        if (Array.isArray(m.catalogoBolas)) {
          ag.catalogo = {
            bolas: m.catalogoBolas.map((b) => ({ id: b.id, nome: b.nome, preco: Number(b.priceGold) || 0, ef: Number(b.catchRate) || 0, compravel: !!b.compravel })),
            itens: cat()?.itens?.length ? cat().itens : ITENS_PADRAO.map((i) => ({ ...i })),
            chanceShiny: Number(m.chanceShiny) || 0,
            captura: m.captura ?? { base: 0.0075, piso: 0.003, teto: 0.1 },
            tabelaTipos: m.tabelaTipos ?? {},
            ampliacao: Number(m.ampliacaoHunt) || 1.5,
            hunts: (m.hunts ?? []).map((h) => ({
              slug: h.slug,
              nome: h.nome,
              nivel: Number(h.nivel) || 0,
              especies: (h.especies ?? []).map((x) => ({ id: Number(x.pokeId), pontos: Number(x.pontos) || 1 })),
            })),
          };
          gmSet(K.cat, ag.catalogo);
          carregarItensDoJogo();
        } else {
          aviso('⚠️ O jogo mudou o formato da entrada (catálogo ausente).');
        }
        ag.estavaNoCentro = !!ag.eu.noCentro;
        if (ag.nick && !gmGet(K.main, null)) gmSet(K.main, ag.nick);
        carregarHist();
        garantirRegras();
        ouvirComandos();
        acompanharHunt();
        publicar(true);
        break;
      }
      case 'estado':
        ag.eu = mesclarEstado(ag.eu, m.estado);
        if (m.estado?.servidorAgora) ag.offsetServ = Date.now() - Number(m.estado.servidorAgora);
        if (m.estado?.centroLivreEm !== undefined) ag.centroLivreEm = Number(m.estado.centroLivreEm) || 0;
        verificarCentro();
        acompanharHunt();
        if (ag.troca) processarTroca();
        avaliarReposicao();
        publicar();
        break;
      case 'campo.init':
        ag.cena = m.sl ?? null;
        ag.mobs.clear();
        aplicarMobs(m);
        break;
      case 'campo':
        if ((m.sl ?? null) === ag.cena) aplicarMobs(m);
        break;
      case 'batalha':
        for (const e of m.ev ?? []) aoEventoBatalha(e);
        publicar();
        break;
      case 'market':
        aoMercado(m);
        break;
      case 'erro':
        if (String(m.chave ?? m.msg ?? '').startsWith('market.')) aoAvisoMercado(String(m.chave ?? m.msg));
        aviso(`Servidor: ${m.chave ?? m.msg ?? 'erro'}`);
        if (ag.troca) ag.troca.msg = `o jogo recusou (${m.chave ?? m.msg ?? 'erro'}) — tentando de novo`;
        break;
      default:
        break;
    }
  };

  const interceptarSaida = (data) => {
    if (typeof data === 'string' && data.includes('"hello"')) {
      try {
        const m = JSON.parse(data);
        if (m?.t === 'hello' && typeof m.nick === 'string') ag.nick = m.nick;
      } catch {}
    }
    return data;
  };

  const WSOriginal = PW.WebSocket;
  const sendDoPrototipo = WSOriginal.prototype.send;
  const REG_MAX = 250;
  const REG_IGNORAR = /^(batalha|campo|campo\.init|ping|pong|chat|chat\..*|online|tick)$/i;
  const REG_MERCADO = /merc|market|anunc|oferta|listing|venda|vender|comerc|trade|retid|escrow|leil/i;
  const reg = { itens: [], ultimoMercado: 0, sujo: false };
  const registrar_ = (dir, obj, bruto) => {
    const t = String(obj?.t ?? obj?.type ?? '?');
    const agora = Date.now();
    const deMercado = dir === 'http' || REG_MERCADO.test(t) || REG_MERCADO.test(bruto.slice(0, 400));
    if (dir === 'enviou' && deMercado) reg.ultimoMercado = agora;
    const perto = agora - reg.ultimoMercado < 8000;
    if (!deMercado && !perto && REG_IGNORAR.test(t)) return;
    if (!deMercado && dir === 'recebeu' && /^(estado|welcome)$/.test(t)) return;
    reg.itens.push({ ts: agora, dir, t, dados: bruto.length > 4000 ? `${bruto.slice(0, 4000)}…` : bruto });
    if (reg.itens.length > REG_MAX) reg.itens.splice(0, reg.itens.length - REG_MAX);
    reg.sujo = true;
  };
  setInterval(() => {
    if (!reg.sujo || !ag.nick) return;
    reg.sujo = false;
    gmSet(`pc.reg.${ag.nick}`, reg.itens.slice(-REG_MAX).map((x) => ({ ...x, dados: String(x.dados).replace(/"token"\s*:\s*"[^"]*"/g, '"token":"***"') })));
  }, 3000);

  try {
    const fetchOriginal = PW.fetch.bind(PW);
    PW.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : input?.url ?? '');
      const r = await fetchOriginal(input, init);
      if (!/\/assets\/|\.(png|jpe?g|gif|webp|svg|css|js|woff2?|mp3|ogg)(\?|$)/i.test(url)) {
        try {
          const corpo = typeof init?.body === 'string' ? init.body : '';
          const txt = await r.clone().text();
          reg.ultimoMercado = REG_MERCADO.test(url) ? Date.now() : reg.ultimoMercado;
          registrar_('http', { t: `${init?.method ?? 'GET'} ${url}` }, `${init?.method ?? 'GET'} ${url}\nENVIO: ${corpo.slice(0, 1500)}\nRESPOSTA ${r.status}: ${txt.slice(0, 2500)}`);
        } catch {}
      }
      return r;
    };
  } catch {}

  try {
    const XHR = PW.XMLHttpRequest.prototype;
    const abrir = XHR.open;
    const enviar = XHR.send;
    XHR.open = function (metodo, url, ...resto) {
      this._pcReq = { metodo, url: String(url) };
      return abrir.call(this, metodo, url, ...resto);
    };
    XHR.send = function (corpo) {
      const req = this._pcReq;
      if (req && !/\/assets\/|\.(png|jpe?g|gif|webp|svg|css|js)(\?|$)/i.test(req.url)) {
        this.addEventListener('loadend', () => {
          try {
            registrar_('http', { t: `${req.metodo} ${req.url}` }, `${req.metodo} ${req.url}\nENVIO: ${String(corpo ?? '').slice(0, 1500)}\nRESPOSTA ${this.status}: ${String(this.responseText ?? '').slice(0, 2500)}`);
          } catch {}
        });
      }
      return enviar.call(this, corpo);
    };
  } catch {}

  const engancharSocket = (ws) => {
    if (ws._pcHook) return;
    Object.defineProperty(ws, '_pcHook', { value: true });
    const sendOriginal = sendDoPrototipo.bind(ws);
    Object.defineProperty(ws, '_pcSend', { value: sendOriginal });
    ws.send = function (data) {
      try {
        registrar_('enviou', JSON.parse(data), String(data));
      } catch {}
      interceptarSaida(data);
      return sendOriginal(data);
    };
    ag.ws = ws;
    ws.addEventListener('message', (ev) => {
      try {
        const m = JSON.parse(ev.data);
        try {
          registrar_('recebeu', m, String(ev.data));
        } catch {}
        aoReceber(m);
      } catch {}
    });
    ws.addEventListener('close', () => {
      if (ag.ws === ws) publicar(true);
    });
  };
  class WSCentral extends WSOriginal {
    constructor(...args) {
      super(...args);
      if (String(args[0] ?? '').includes('pokeidle.io')) engancharSocket(this);
    }
  }
  PW.WebSocket = WSCentral;

  const reconectarSeJaAberto = () => {
    WSOriginal.prototype.send = function (data) {
      WSOriginal.prototype.send = sendDoPrototipo;
      const r = sendDoPrototipo.call(this, data);
      if (!this._pcHook && String(this.url).includes('pokeidle.io')) setTimeout(() => this.close(), 50);
      return r;
    };
  };

  const conferirVersaoDoJogo = () => {
    const src = [...document.scripts].map((s) => s.src).find((u) => /\/app\.js\?v=/.test(u));
    ag.versaoJogo = src?.match(/v=([\d.]+)/)?.[1] ?? ag.versaoJogo;
  };

  const motor = { especies: null, porNome: null, carregando: false, erro: null };
  const carregarEspecies = async () => {
    if (motor.especies || motor.carregando) return;
    motor.carregando = true;
    const lista = [];
    const pegar = async (url) => {
      try {
        const r = await fetch(url, { cache: 'force-cache' });
        const j = await r.json();
        const arr = Array.isArray(j) ? j : (j.creatures ?? j.lista ?? Object.values(j).find(Array.isArray) ?? []);
        if (Array.isArray(arr)) lista.push(...arr);
      } catch {}
    };
    await pegar('/assets/creatures.json');
    await pegar('/assets/creatures-novos.json');
    await pegar('/assets/creatures-outland-novos.json');
    await pegar('/assets/creatures-formas.json');
    const mapa = new Map();
    const porNome = new Map();
    for (const c of lista) {
      const id = Number(c?.pokeId);
      if (!id || mapa.has(id)) continue;
      const atk = new Set([c.type1, c.type2].filter(Boolean).map((t) => String(t).toUpperCase()));
      for (const g of c.attacks ?? []) if (g?.type && Number(g.power) > 0) atk.add(String(g.type).toUpperCase());
      const e = {
        nome: c.name,
        hp: Number(c.baseHp) || 50,
        def: Number(c.baseDef) || 50,
        spdef: Number(c.baseSpDef) || 50,
        t1: c.type1 ? String(c.type1).toUpperCase() : null,
        t2: c.type2 ? String(c.type2).toUpperCase() : null,
        atk: [...atk],
      };
      mapa.set(id, e);
      if (c.name && !porNome.has(c.name)) porNome.set(c.name, e);
    }
    motor.carregando = false;
    if (mapa.size) {
      motor.especies = mapa;
      motor.porNome = porNome;
      motor.porNomeMin = new Map([...porNome].map(([k, v]) => [String(k).toLowerCase(), v]));
    } else {
      motor.erro = 'não consegui carregar as espécies do jogo';
    }
  };

  const SEG_PADRAO = { ttkMax: 8, fraqMax: 2, margem: 20, comprovada: true, riscoMax: 20 };
  const huntCfgPadrao = () => ({ metas: {}, seg: {} });
  const lerHuntCfg = () => {
    const c = gmGet(K.hunt, null);
    const base = c && typeof c === 'object' ? c : {};
    const antigo = {};
    for (const k of ['ttkMax', 'fraqMax', 'margem']) if (base[k] != null) antigo[k] = base[k];
    return { metas: { ...(base.metas ?? {}) }, auto: { ...(base.auto ?? {}) }, seg: { ...(base.seg ?? {}) }, antigo };
  };
  const segDe = (hc, nick) => ({ ...SEG_PADRAO, ...hc.antigo, ...(hc.seg[nick] ?? {}) });

  const recomendar = (s) => {
    const hcAll = lerHuntCfg();
    const meta = hcAll.metas[s.nick] ?? 'off';
    const hc = segDe(hcAll, s.nick);
    const c = cat();
    if (!motor.especies) return { meta, erro: motor.erro ?? 'carregando os dados das espécies…' };
    if (!s.ativo || !s.ativo.tipos?.length) return { meta, erro: 'sem dados do Pokémon ativo' };
    const cal = s.calib ?? { amostras: 0, alvos: [] };
    const tabela = c?.tabelaTipos ?? {};
    const amp = c?.ampliacao ?? 1.5;
    const nossos = s.ativo.tipos;
    const intervalo = clamp(cal.intervalo ?? 900, 400, 6000) / 1000;
    const xpMult = cal.xpMult ?? 1;
    const ouroMult = cal.ouroMult ?? 1;
    let kHp = c?.multHpSelvagem ?? 5;
    let forca = null;
    let fonte = null;
    const hAtualCal = (c?.hunts ?? []).find((h) => h.slug === s.huntSlug);
    const espAtual = hAtualCal?.especies?.length ? [...hAtualCal.especies].sort((a, b) => b.pontos - a.pontos)[0] : null;
    const acharEsp = (a) => (a.nome ? motor.porNome.get(a.nome) ?? motor.porNomeMin?.get(String(a.nome).toLowerCase()) : null)
      ?? (a.id ? motor.especies.get(Number(a.id)) : null)
      ?? (espAtual ? motor.especies.get(espAtual.id) : null);
    if (cal.amostras >= 12) {
      kHp = mediana(cal.alvos.map((a) => {
        const e = acharEsp(a);
        return e && a.mhp > 0 && a.nv > 0 ? a.mhp / hpPadrao(e.hp, a.nv) : NaN;
      })) ?? kHp;
      forca = mediana(cal.alvos.map((a) => {
        const e = acharEsp(a);
        return e && a.dano > 0 && a.nv > 0 ? (a.dano / Math.max(0.05, a.ef || 1)) * ((defPadrao(e.def, a.nv) + defPadrao(e.spdef, a.nv)) / 2) : NaN;
      }));
      if (forca) fonte = 'golpes';
    }
    const ttkMedioCom = (h, f) => {
      let pontos = 0;
      let soma = 0;
      for (const sp of h.especies ?? []) {
        const e = motor.especies.get(sp.id);
        if (!e) return NaN;
        const ef = Math.max(...nossos.map((t) => ampliar(efetividade(t, e.t1, e.t2, tabela), amp)), 0);
        const dano = ef > 0 ? (f * ef) / ((defPadrao(e.def, h.nivel) + defPadrao(e.spdef, h.nivel)) / 2) : 0;
        if (!(dano > 0)) return Infinity;
        soma += (kHp * hpPadrao(e.hp, h.nivel) / dano) * intervalo * sp.pontos;
        pontos += sp.pontos;
      }
      return pontos ? soma / pontos : NaN;
    };
    if (!forca) {
      const hAtual = (c?.hunts ?? []).find((h) => h.slug === s.huntSlug);
      const killsH = Number(s.rate?.kills) || 0;
      const tempoNaHunt = Date.now() - (s.huntAcc?.slug === s.huntSlug ? s.huntAcc.t0 : (s.tot?.desde || Date.now()));
      if (hAtual && killsH > 0 && tempoNaHunt > 60000 && !s.noCentro) {
        const porOnda = Math.min(MAX_MOBS, (hAtual.especies ?? []).reduce((a, x) => a + (x.pontos || 0), 0)) || 1;
        const alvo = 3600 / killsH - MS_ENTRE_ALVOS / 1000 - MS_ONDA / 1000 / porOnda;
        {
          const ref = ttkMedioCom(hAtual, 1000);
          if (Number.isFinite(ref) && ref > 0) {
            forca = (1000 * ref) / Math.max(alvo, intervalo);
            fonte = 'ritmo';
          }
        }
      }
    }
    if (!forca) return { meta, erro: cal.amostras >= 12 ? 'golpes medidos, mas não reconheci a espécie da hunt atual; estimando pelo ritmo de derrotas após 1 min' : `aprendendo com a luta atual (${cal.amostras}/12 golpes medidos)` };
    const lista = [];
    for (const h of c?.hunts ?? []) {
      if (!h.especies?.length || s.nivel < h.nivel) continue;
      let pontos = 0;
      let ttkPond = 0;
      let ttkPior = 0;
      let fraqPior = 0;
      let fraqTipo = null;
      let desconhecida = false;
      for (const sp of h.especies) {
        const e = motor.especies.get(sp.id);
        if (!e) {
          desconhecida = true;
          break;
        }
        const hp = kHp * hpPadrao(e.hp, h.nivel);
        const ef = Math.max(...nossos.map((t) => ampliar(efetividade(t, e.t1, e.t2, tabela), amp)), 0);
        const dano = ef > 0 ? (forca * ef) / ((defPadrao(e.def, h.nivel) + defPadrao(e.spdef, h.nivel)) / 2) : 0;
        const ttk = dano > 0 ? Math.ceil(hp / dano) * intervalo : Infinity;
        for (const t of [e.t1, e.t2].filter(Boolean)) {
          const v = efetividade(t, nossos[0], nossos[1], tabela);
          if (v > fraqPior) {
            fraqPior = v;
            fraqTipo = t;
          }
        }
        const obs = s.hist?.fraqObs?.[e.nome] ?? s.hist?.fraqObs?.[`#${sp.id}`];
        if (obs && Date.now() - obs.t < 3 * 86400000) {
          const v = obs.ef > 1 ? 1 + (obs.ef - 1) / amp : obs.ef < 1 ? obs.ef * amp : obs.ef;
          if (v > fraqPior + 0.01) {
            fraqPior = Math.round(v * 2) / 2;
            fraqTipo = 'golpe visto';
          }
        }
        pontos += sp.pontos;
        ttkPond += ttk * sp.pontos;
        if (ttk > ttkPior) ttkPior = ttk;
      }
      if (desconhecida || !pontos) continue;
      const ttkMedio = ttkPond / pontos;
      const porOnda = Math.min(MAX_MOBS, pontos);
      const killsH = Number.isFinite(ttkMedio) ? (porOnda / (porOnda * (ttkMedio + MS_ENTRE_ALVOS / 1000) + MS_ONDA / 1000)) * 3600 : 0;
      let xpH = killsH * xpDoNivel(h.nivel) * xpMult;
      let ouroH = killsH * ouroPorDerrota(h.nivel) * ouroMult;
      const med = s.hist?.medidas?.[h.slug];
      const medidaValida = !!med && Math.abs((med.nivelPok ?? 0) - s.ativo.level) <= 10 && Date.now() - med.ts < 3 * 86400000;
      if (medidaValida) {
        xpH = med.xpH;
        ouroH = med.ouroH;
      }
      const perigo = s.hist?.perigo?.[h.slug];
      const perigosa = !!perigo && (perigo.nivelPok ?? 0) >= s.ativo.level - 4 && Date.now() - perigo.t < 3 * 86400000;
      const maxHp = Number(s.ativo.maxHp) || 0;
      const risco = cal.recebido && cal.recebidoN >= 8 && maxHp > 0 ? (cal.recebido * h.nivel * ampliar(Math.max(fraqPior, 1), amp)) / maxHp : null;
      lista.push({ slug: h.slug, nome: h.nome, nivel: h.nivel, ttkMedio, ttkPior, fraqPior, fraqTipo, killsH, xpH, ouroH, medida: medidaValida, perigosa, risco });
    }
    const atualBruta = lista.find((x) => x.slug === s.huntSlug) ?? null;
    const naHuntDesde = s.huntAcc?.slug === s.huntSlug ? s.huntAcc.t0 : (s.tot?.desde || Date.now());
    const prova = hc.comprovada && atualBruta && !atualBruta.perigosa && !s.noCentro && Date.now() - naHuntDesde > 10 * 60000 ? atualBruta : null;
    const limTtk = Math.max(hc.ttkMax, prova && Number.isFinite(prova.ttkPior) ? prova.ttkPior * 1.1 : 0);
    const limFraq = hc.fraqMax >= 99 ? Infinity : Math.max(hc.fraqMax, prova ? prova.fraqPior : 0);
    for (const x of lista) {
      x.motivos = [];
      if (!(x.ttkPior <= limTtk)) x.motivos.push(Number.isFinite(x.ttkPior) ? `levaria ${num(x.ttkPior, 1)} s para derrotar` : 'não consegue causar dano');
      if (x.fraqPior > limFraq) x.motivos.push(`fraco ×${num(x.fraqPior)} contra ${NOMES_TIPO[x.fraqTipo] ?? x.fraqTipo}`);
      if (x.perigosa) x.motivos.push('a conta já caiu aqui');
      if (x.risco != null && x.risco > hc.riscoMax / 100 && !(prova && x.slug === prova.slug)) x.motivos.push(`cada golpe tiraria ~${num(x.risco * 100)}% da vida`);
      x.seguro = x.motivos.length === 0;
    }
    const valor = (x) => (meta === 'ouro' ? x.ouroH : x.xpH);
    const seguras = lista.filter((x) => x.seguro).sort((a, b) => valor(b) - valor(a));
    const atual = lista.find((x) => x.slug === s.huntSlug) ?? null;
    const melhor = seguras[0] ?? null;
    const ganho = melhor && atual && valor(atual) > 0 ? valor(melhor) / valor(atual) - 1 : null;
    const sugerir = !!melhor && melhor.slug !== s.huntSlug && (ganho == null || ganho >= hc.margem / 100);
    const barradas = lista.filter((x) => !x.seguro).sort((a, b) => valor(b) - valor(a)).slice(0, 3);
    return { meta, fonte, atual, melhor, ganho, sugerir, seguras: seguras.slice(0, 5), barradas, total: lista.length, valor, seg: hc, prova, limTtk, limFraq };
  };

  const AUTO = { espera: 30 * 60000, conferir: 20 * 60000, minNaHunt: 5 * 60000, ganhoMin: 0.2, bloqueio: 6 * 3600000, minAbates: 40, tolerancia: 0.85 };
  const lerAuto = (nick) => ({ log: [], bloq: {}, ...(gmGet(K.auto(nick), null) ?? {}) });
  const valorMedido = (s, meta) => {
    const a = s.huntAcc;
    if (!a || a.slug !== s.huntSlug) return null;
    const dur = Date.now() - a.t0;
    if (dur < 5 * 60000) return null;
    return ((meta === 'ouro' ? a.ouro : a.xp) * 3600000) / dur;
  };
  const autoEstado = (s) => {
    const hc = lerHuntCfg();
    const ligado = !!hc.auto[s.nick];
    const meta = hc.metas[s.nick] ?? 'off';
    const reg = lerAuto(s.nick);
    const ult = reg.log[reg.log.length - 1] ?? null;
    return { ligado, meta, reg, ult };
  };
  const autoTrocar = (contas) => {
    const agora = Date.now();
    for (const s of contas) {
      const { ligado, meta, reg, ult } = autoEstado(s);
      if (!ligado || meta === 'off' || !online(s) || !s.conectado || s.troca || s.noCentro || s.boss || s.safari || s.casa) continue;
      let mudou = false;
      if (ult && !ult.conferido && ult.para === s.huntSlug && s.huntAcc?.slug === ult.para && agora - s.huntAcc.t0 >= AUTO.conferir && (s.huntAcc.kills ?? 0) >= AUTO.minAbates) {
        const medido = valorMedido(s, ult.meta);
        ult.conferido = true;
        ult.medido = medido;
        mudou = true;
        if (medido != null && ult.antesMedido && ult.antes > 0 && medido < ult.antes * AUTO.tolerancia && ult.de) {
          reg.bloq[ult.para] = agora;
          reg.log.push({ t: agora, de: ult.para, para: ult.de, meta, antes: medido, conferido: true, motivo: 'voltou: rendeu menos que a anterior' });
          enviarCmd(s.nick, { tipo: 'hunt', slug: ult.de });
        }
      }
      if (!mudou && s.hist?.perigo?.[s.huntSlug] && agora - s.hist.perigo[s.huntSlug].t < 10 * 60000 && ult?.de && ult.para === s.huntSlug && !ult.caiu) {
        ult.caiu = true;
        reg.bloq[s.huntSlug] = agora;
        reg.log.push({ t: agora, de: s.huntSlug, para: ult.de, meta, conferido: true, motivo: 'voltou: a conta caiu' });
        enviarCmd(s.nick, { tipo: 'hunt', slug: ult.de });
        mudou = true;
      }
      if (!mudou && (!ult || agora - ult.t >= AUTO.espera)) {
        const naHunt = s.huntAcc?.slug === s.huntSlug ? agora - s.huntAcc.t0 : 0;
        const r = recomendar(s);
        const alvo = r.sugerir && r.melhor && !(reg.bloq[r.melhor.slug] && agora - reg.bloq[r.melhor.slug] < AUTO.bloqueio) ? r.melhor : null;
        if (alvo && naHunt >= AUTO.minNaHunt && r.ganho != null && r.ganho >= Math.max(AUTO.ganhoMin, (r.seg?.margem ?? 0) / 100)) {
          const antesMed = valorMedido(s, meta);
          reg.log.push({ t: agora, de: s.huntSlug, para: alvo.slug, nome: alvo.nome, meta, antes: antesMed ?? r.valor(r.atual), antesMedido: antesMed != null, previsto: r.valor(alvo), conferido: false, motivo: `${num(r.ganho * 100)}% a mais` });
          enviarCmd(s.nick, { tipo: 'hunt', slug: alvo.slug });
          mudou = true;
        }
      }
      if (mudou) {
        reg.log = reg.log.slice(-20);
        gmSet(K.auto(s.nick), reg);
      }
    }
  };

  const ui = {
    raiz: null,
    aba: 'geral',
    abaRenderizada: null,
    aberto: gmGet(K.ui, {})?.aberto ?? true,
    pendente: null,
    expandidas: new Set(),
    topHunts: new Set(),
    segAberta: new Set(),
    contaShiny: null,
    pos: gmGet(K.ui, {})?.pos ?? null,
    arraste: null,
    arrastou: false,
    repAberta: null,
    mercAberta: null,
    alertasAntes: 0,
  };
  const uiCfg = () => ({ som: false, ...(gmGet(K.ui, {}) ?? {}) });
  const salvarUi = (patch) => gmSet(K.ui, { ...uiCfg(), ...patch });
  ui.aba = uiCfg().aba ?? 'geral';

  const lerContas = () => {
    const contas = [];
    for (const k of gmList()) {
      if (!k.startsWith('pc.st.')) continue;
      const s = gmGet(k, null);
      if (s && s.nick) contas.push(s);
    }
    const main = gmGet(K.main, null);
    return contas.sort((a, b) => (a.nick === main ? -1 : b.nick === main ? 1 : a.nick.localeCompare(b.nick)));
  };

  const ehOutland = (h) => !!h && h.especies.length > 0 && h.especies.every((sp) => sp.id >= 2001 && sp.id <= 2999);
  const huntDe = (s) => huntPorSlug(s.huntSlug);
  const online = (s) => Date.now() - s.ts <= OFFLINE_MS;

  const statusDaConta = (s) => {
    const agora = Date.now();
    if (!online(s)) return { ic: '⚪', txt: `sem sinal há ${haQuanto(agora - s.ts)}`, nivel: 2 };
    if (!s.conectado) return { ic: '🔌', txt: 'desconectada', nivel: 2 };
    if (s.noCentro) return { ic: '🏥', txt: 'no Centro', nivel: 1 };
    if (s.boss) return { ic: '👹', txt: 'em boss', nivel: 0 };
    if (s.safari) return { ic: '🦒', txt: 'no Safari', nivel: 0 };
    if (s.casa) return { ic: '🏠', txt: 'em casa', nivel: 0 };
    const ultima = s.ultimaBatalha || s.tot?.desde || agora;
    if (s.huntSlug && agora - ultima > PARADO_MS) return { ic: '⚠️', txt: `parada há ${haQuanto(agora - ultima)}`, nivel: 2 };
    if (s.huntSlug) return { ic: '🟢', txt: 'caçando', nivel: 0 };
    return { ic: '💤', txt: 'sem hunt', nivel: 1 };
  };

  const GRUPOS = [
    { id: 'bolas', nome: 'Pokébolas', kind: 'ball', lote: 500, lista: (s) => s.auto.ballIds ?? [], ativo: (s) => !!(s.auto.semParar || s.auto.ateCapturar), daRegra: (k) => k.startsWith('ball:') },
    { id: 'pocoes', nome: 'Poções', kind: 'item', lote: 200, lista: (s) => s.auto.potionIds ?? [], ativo: (s) => s.auto.autoPotion !== false && (s.auto.potionIds ?? []).length > 0, daRegra: (k) => k.startsWith('item:') && itemDoCat(Number(k.split(':')[1]))?.cat === 'heal' },
    { id: 'revives', nome: 'Revives', kind: 'item', lote: 50, lista: (s) => s.auto.reviveIds ?? [], ativo: (s) => s.auto.autoRevive !== false && (s.auto.reviveIds ?? []).length > 0, daRegra: (k) => k.startsWith('item:') && itemDoCat(Number(k.split(':')[1]))?.cat === 'revive' },
  ];

  const grupoDaConta = (s, g) => {
    const cfg = lerCfg(s.nick);
    const lista = g.lista(s).map(Number);
    const extras = Object.entries(cfg.regras).filter(([k, r]) => r?.ativo && cfg[grupoDe(k)] && g.daRegra(k)).map(([k]) => Number(k.split(':')[1]));
    const ids = [...new Set([...lista, ...extras])];
    const itens = ids.map((id) => {
      const chave = `${g.kind}:${id}`;
      const regra = cfg.regras[chave];
      return {
        id,
        chave,
        nome: nomeDe(g.kind, id),
        qtd: Number(g.kind === 'ball' ? s.balls?.[id] : s.items?.[id]) || 0,
        uso: Number(g.kind === 'ball' ? s.usoBola?.[id] : s.usoItem?.[id]) || 0,
        preco: precoDe(g.kind, id),
        regra,
        repoe: !!(regra?.ativo && cfg[grupoDe(chave)]),
        naLista: lista.includes(id),
      };
    });
    const base = itens.filter((i) => i.naLista).length ? itens.filter((i) => i.naLista) : itens;
    const total = base.reduce((a, i) => a + i.qtd, 0);
    const uso = itens.reduce((a, i) => a + i.uso, 0);
    const eta = uso > 0 ? total / uso : Infinity;
    const auto = itens.some((i) => i.repoe);
    const bloqueio = (s.reposicao?.bloqueios ?? []).find((b) => itens.some((i) => b.startsWith(`${i.nome}:`))) ?? null;
    const ativo = g.ativo(s) && ids.length > 0;
    let nivel = 0;
    if (ativo) {
      if (total === 0) nivel = 2;
      else if (eta < 0.5) nivel = 2;
      else if (eta < 1.5) nivel = 1;
      if (nivel && auto && !bloqueio) nivel = total === 0 ? 1 : 0;
    }
    const alvo = base.find((i) => i.preco > 0 && i.qtd > 0) ?? base.find((i) => i.preco > 0) ?? null;
    const lote = alvo?.regra?.lote ?? g.lote;
    return { g, ativo, itens, total, uso, eta, nivel, auto, bloqueio, alvo, lote };
  };

  const resumoGrupo = (gr) => {
    if (!gr.ativo) return 'não usa';
    if (gr.total === 0) return 'acabou';
    if (gr.uso > 0) return `${num(gr.total)} · ${tempoH(gr.eta)}`;
    return num(gr.total);
  };

  const enviarCmd = (nick, cmd) => {
    const c = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), ...cmd };
    if (nick === ag.nick) executarCmd(c);
    else gmSet(K.cmd(nick), c);
  };

  const corDaConta = (s) => Math.max(statusDaConta(s).nivel, ...(online(s) ? GRUPOS.map((g) => grupoDaConta(s, g).nivel) : [0]), 0);
  const custoHora = (s) => {
    let t = 0;
    for (const [id, q] of Object.entries(s.usoBola ?? {})) t += (Number(q) || 0) * (precoDe('ball', id) || 0);
    for (const [id, q] of Object.entries(s.usoItem ?? {})) t += (Number(q) || 0) * (precoDe('item', id) || 0);
    return t;
  };
  const horasProxNivel = (s) => {
    const falta = s.xpProx && s.xpTrein != null ? s.xpProx - s.xpTrein : null;
    const xpH = Number(s.rate?.xp) || 0;
    return falta > 0 && xpH > 0 ? falta / xpH : null;
  };

  const pendencias = (contas) => {
    const out = [];
    for (const s of contas) {
      const st = statusDaConta(s);
      if (st.nivel === 2) out.push({ nivel: 2, nick: s.nick, txt: st.txt, dica: 'Confira a aba dessa conta.' });
      else if (s.noCentro) out.push({ nivel: 1, nick: s.nick, txt: 'está no Centro Pokémon' });
      if (!online(s)) continue;
      for (const g of GRUPOS) {
        const gr = grupoDaConta(s, g);
        if (!gr.nivel) continue;
        let txt = gr.total === 0 ? `${g.nome.toLowerCase()} acabaram` : `${g.nome.toLowerCase()} acabam em ${tempoH(gr.eta)}`;
        if (gr.auto && gr.bloqueio) txt += ` (reposição parada: ${gr.bloqueio.split(': ')[1]})`;
        else if (gr.auto) txt += ' (a reposição automática vai comprar)';
        out.push({ nivel: gr.nivel, nick: s.nick, txt, compra: gr.alvo ? { chave: `${s.nick}|${gr.alvo.chave}|${gr.lote}`, nome: gr.alvo.nome, qtd: gr.lote, total: gr.lote * gr.alvo.preco, gold: s.gold } : null });
      }
      if (s.troca) {
        out.push({ nivel: 0, nick: s.nick, txt: `indo para ${s.troca.nome}: ${s.troca.msg}`, cancelar: true });
      } else {
        const r = recomendar(s);
        if (r.meta !== 'off' && r.sugerir) {
          const quanto = r.ganho == null ? '' : `${num(r.ganho * 100)}% `;
          out.push({ nivel: 0, nick: s.nick, txt: `${r.melhor.nome} (Nv ${num(r.melhor.nivel)}) rende ${quanto}mais ${r.meta === 'ouro' ? 'ouro' : 'XP'}`, hunt: { slug: r.melhor.slug, nome: r.melhor.nome } });
        }
      }
    }
    return out.sort((a, b) => b.nivel - a.nivel);
  };

  const ESTILO = `
    #pc-painel{--fundo:#21141e;--sup:#2e1c2a;--sup2:#3a2435;--linha:#563a4d;--txt:#f4e9f0;--mut:#b59cac;--ouro:#f0b43c;--verde:#74d9a5;--alerta:#ff8080;--aviso:#ffd36b;
      position:fixed;left:50%;transform:translateX(-50%);bottom:8px;z-index:2147483646;width:min(820px,97vw);max-height:76vh;display:flex;flex-direction:column;background:var(--fundo);color:var(--txt);border:1px solid var(--linha);border-radius:14px;font:13px/1.45 'Segoe UI Variable','Segoe UI',system-ui,sans-serif;font-variant-numeric:tabular-nums;box-shadow:0 14px 40px rgba(0,0,0,.6);overflow:hidden}
    #pc-painel *{box-sizing:border-box}
    #pc-painel button{font:inherit}
    #pc-painel button:focus-visible,#pc-painel input:focus-visible,#pc-painel select:focus-visible{outline:2px solid var(--ouro);outline-offset:1px}
    #pc-painel .barra{display:flex;align-items:center;gap:14px;padding:9px 14px;background:var(--sup);cursor:pointer;user-select:none}
    #pc-painel .marca{font-weight:700;display:flex;align-items:center;gap:7px}
    #pc-painel .marca i{width:14px;height:14px;border-radius:50%;background:linear-gradient(var(--alerta) 0 46%,#1a0f17 46% 54%,#fff 54%);box-shadow:inset 0 0 0 2px #1a0f17;display:inline-block}
    #pc-painel .tot{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--mut);font-size:12px}
    #pc-painel .tot b{color:var(--txt);font-weight:600}
    #pc-painel .estado{margin-left:auto;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;background:#1f4d34;color:#c8f5dc}
    #pc-painel .estado.ruim{background:#6e2230;color:#ffd9dd}
    #pc-painel .seta{color:var(--mut);font-size:12px}
    #pc-painel .abas{display:flex;gap:4px;padding:0 10px;background:var(--sup);border-bottom:1px solid var(--linha)}
    #pc-painel .aba{background:none;border:0;color:var(--mut);padding:7px 12px 8px;cursor:pointer;border-bottom:2px solid transparent}
    #pc-painel .aba.on{color:var(--txt);border-bottom-color:var(--ouro);font-weight:600}
    #pc-painel .corpo{overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:12px}
    #pc-painel .fixo,#pc-painel .vivo{display:flex;flex-direction:column;gap:12px}
    #pc-painel .fixo:empty{display:none}
    #pc-painel .mut{color:var(--mut);font-size:12px}
    #pc-painel .n1{color:var(--aviso)}
    #pc-painel .n2{color:var(--alerta)}
    #pc-painel .ok{color:var(--verde)}
    #pc-painel h3{margin:0;font-size:13px;font-weight:600}
    #pc-painel .fila{display:flex;flex-direction:column;border:1px solid var(--linha);border-radius:10px;overflow:hidden}
    #pc-painel .fila .item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--sup);border-left:3px solid var(--ouro)}
    #pc-painel .fila .item + .item{border-top:1px solid var(--linha)}
    #pc-painel .fila .item.n1{border-left-color:var(--aviso);color:inherit}
    #pc-painel .fila .item.n2{border-left-color:var(--alerta);color:inherit}
    #pc-painel .fila .item .quem{font-weight:700;min-width:96px}
    #pc-painel .fila .item .oque{flex:1}
    #pc-painel .calmo{padding:10px 12px;border-radius:10px;background:#1c3628;color:#c8f5dc}
    #pc-painel .grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
    #pc-painel .conta{background:var(--sup);border:1px solid var(--linha);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
    #pc-painel .conta.n1{border-color:#8a6d2c;color:inherit}
    #pc-painel .conta.n2{border-color:#9a3b49;color:inherit}
    #pc-painel .conta .cab{display:flex;align-items:baseline;gap:8px}
    #pc-painel .conta .nick{font-weight:700;font-size:14px}
    #pc-painel .conta .nv{color:var(--mut);font-size:12px;margin-left:auto}
    #pc-painel .conta .onde{display:flex;align-items:center;gap:6px;font-size:12.5px}
    #pc-painel .ponto{width:8px;height:8px;border-radius:50%;background:var(--verde);flex:none}
    #pc-painel .ponto.n1{background:var(--aviso)}
    #pc-painel .ponto.n2{background:var(--alerta)}
    #pc-painel .nums{display:flex;gap:16px}
    #pc-painel .nums div{display:flex;flex-direction:column}
    #pc-painel .nums b{font-size:17px;font-weight:700;line-height:1.15}
    #pc-painel .nums span{color:var(--mut);font-size:11.5px}
    #pc-painel .est{display:flex;flex-wrap:wrap;gap:6px}
    #pc-painel .tag{background:var(--sup2);border-radius:6px;padding:1px 7px;font-size:11.5px;color:var(--mut)}
    #pc-painel .tag b{color:var(--txt);font-weight:600}
    #pc-painel .tag.n1{color:var(--aviso)}
    #pc-painel .tag.n2{color:var(--alerta)}
    #pc-painel .lnk{background:none;border:0;color:var(--ouro);padding:0;cursor:pointer;text-align:left;font-size:12px}
    #pc-painel table{width:100%;border-collapse:collapse}
    #pc-painel th{text-align:left;font-weight:500;font-size:11.5px;color:var(--mut);padding:3px 6px;border-bottom:1px solid var(--linha)}
    #pc-painel td{padding:4px 6px;border-bottom:1px solid #ffffff0b;vertical-align:middle}
    #pc-painel .gtit{display:flex;gap:8px;align-items:baseline;margin-top:6px;font-weight:600}
    #pc-painel .bt{background:var(--sup2);color:var(--txt);border:1px solid var(--linha);border-radius:7px;padding:4px 10px;cursor:pointer;font-size:12px;white-space:nowrap}
    #pc-painel .bt:hover{border-color:var(--ouro)}
    #pc-painel .bt.prim{background:var(--ouro);border-color:var(--ouro);color:#2a1508;font-weight:700}
    #pc-painel .bt.conf{background:var(--aviso);border-color:var(--aviso);color:#2a1508;font-weight:700}
    #pc-painel .bt.peq{padding:2px 7px;font-size:11.5px}
    #pc-painel .bt:disabled{opacity:.4;cursor:default}
    #pc-painel .seg{display:inline-flex;background:var(--sup2);border-radius:8px;padding:2px}
    #pc-painel .seg button{background:none;border:0;color:var(--mut);padding:3px 10px;border-radius:6px;cursor:pointer;font-size:12px}
    #pc-painel .seg button.on{background:var(--ouro);color:#2a1508;font-weight:700}
    #pc-painel .chip{display:inline-block;background:var(--sup2);border-radius:999px;padding:2px 10px;margin:2px 4px 2px 0;cursor:pointer;font-size:12px}
    #pc-painel .chip.on{background:var(--ouro);color:#2a1508;font-weight:600}
    #pc-painel .bloco{background:var(--sup);border:1px solid var(--linha);border-radius:12px;padding:10px 12px}
    #pc-painel .sug{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;border-radius:9px;padding:8px 10px;margin-top:8px;background:#3d2b12;border:1px solid #8a6a2a}
    #pc-painel .sug.boa{background:#1c3628;border-color:#2e6e47}
    #pc-painel .sug.info{background:var(--sup2);border-color:var(--linha)}
    #pc-painel .sug .txt{flex:1;min-width:220px}
    #pc-painel input[type=number]{width:78px;background:var(--fundo);color:inherit;border:1px solid var(--linha);border-radius:6px;padding:3px 6px;font:inherit}
    #pc-painel select{background:var(--fundo);color:inherit;border:1px solid var(--linha);border-radius:6px;padding:3px 6px;font:inherit}
    #pc-painel .tot .mini{display:inline-flex;align-items:center;gap:5px;background:var(--sup2);border:1px solid var(--linha);color:var(--txt);border-radius:999px;padding:1px 9px;cursor:pointer;font-size:12px}
    #pc-painel .tot .mini b{font-weight:600;color:var(--mut)}
    #pc-painel .barra{touch-action:none}
    #pc-painel.compacto{width:auto;max-width:97vw}
    #pc-painel .bloco.n1{border-color:#8a6d2c;color:inherit}
    #pc-painel .bloco.n2{border-color:#9a3b49;color:inherit}
    #pc-painel .cfg .ponto{align-self:center}
    #pc-painel .barrinha{display:block;height:6px;border-radius:3px;background:var(--ouro);opacity:.8}
    #pc-painel .grade{align-items:start}
    #pc-painel .conta.larga{grid-column:1/-1}
    #pc-painel table.itens td,#pc-painel table.itens th{white-space:nowrap}
    #pc-painel table.itens .nome{white-space:normal;width:100%}
    #pc-painel table.itens .num{text-align:right}
    #pc-painel table.itens .compra{text-align:right}
    #pc-painel table.itens .compra .bt{margin-left:4px}
    #pc-painel .ver{font-weight:400;font-size:11.5px;color:var(--mut);margin-left:6px;display:inline-flex;gap:6px;align-items:center}
    #pc-painel .ver .novo{background:var(--ouro);color:#2a1508;border:0;border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:700;cursor:pointer}
    #pc-painel .seletor{display:flex;flex-wrap:wrap;gap:6px}
    #pc-painel .seletor button{display:inline-flex;align-items:center;gap:6px;background:var(--sup);border:1px solid var(--linha);color:var(--txt);border-radius:999px;padding:4px 12px;cursor:pointer}
    #pc-painel .seletor button.on{border-color:var(--ouro);background:var(--sup2);font-weight:600}
    #pc-painel .secao{background:var(--sup);border:1px solid var(--linha);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
    #pc-painel .secao-cab{display:flex;align-items:baseline;gap:10px}
    #pc-painel .pilha{display:flex;flex-direction:column;gap:8px}
    #pc-painel .tag.on{background:#1f4d34;color:#c8f5dc}
    #pc-painel details summary{cursor:pointer}
    #pc-painel .secao .seguranca{background:var(--fundo)}
    #pc-painel .seguranca{margin-top:6px;padding:8px 10px;border-radius:9px;background:var(--fundo)}
    #pc-painel .cfg{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px}
    #pc-painel label{cursor:pointer}
    #pc-painel .acc{border:1px solid var(--linha);border-radius:12px;overflow:hidden}
    #pc-painel .acc + .acc{margin-top:-4px}
    #pc-painel .acc-cab{display:flex;align-items:center;gap:10px;width:100%;background:var(--sup);border:0;color:inherit;padding:9px 12px;cursor:pointer;text-align:left}
    #pc-painel .acc-cab .nick{font-weight:700}
    #pc-painel .acc-corpo{padding:10px 12px;background:var(--fundo);display:flex;flex-direction:column;gap:8px}
    #pc-painel .barra,#pc-painel .abas{flex:none}
    #pc-painel .grade>*{min-width:0}
    #pc-painel.celular:not(.compacto) .tot{display:none}
    #pc-painel .corpo{flex:1 1 auto;min-height:0}
    #pc-painel.celular{left:0;right:0;bottom:0;transform:none;width:100vw;max-width:100vw;max-height:72vh;border-radius:14px 14px 0 0;font-size:13px;line-height:1.35}
    #pc-painel.celular.compacto{width:100vw}
    #pc-painel.celular .barra{position:relative;padding:12px 10px 8px;gap:8px;flex-wrap:wrap}
    #pc-painel.celular .barra::before{content:'';position:absolute;left:50%;top:4px;width:32px;height:4px;margin-left:-16px;border-radius:2px;background:var(--linha)}
    #pc-painel.celular .marca{font-size:13px}
    #pc-painel.celular .estado{font-size:11.5px;padding:1px 8px}
    #pc-painel.celular .seta{font-size:11.5px}
    #pc-painel.celular .tot{display:flex;order:3;width:100%;gap:6px}
    #pc-painel.celular .abas{overflow-x:auto;scrollbar-width:none;padding:0 4px}
    #pc-painel.celular .abas::-webkit-scrollbar{display:none}
    #pc-painel.celular .aba{padding:8px 10px;white-space:nowrap;font-size:13px}
    #pc-painel.celular .corpo{padding:8px 8px calc(10px + env(safe-area-inset-bottom));gap:8px}
    #pc-painel.celular .fixo,#pc-painel.celular .vivo{gap:8px}
    #pc-painel.celular .grade{grid-template-columns:1fr;gap:8px}
    #pc-painel.celular .conta,#pc-painel.celular .bloco,#pc-painel.celular .secao{padding:8px 10px;border-radius:10px}
    #pc-painel.celular .nums{gap:12px}
    #pc-painel.celular .nums b{font-size:15px}
    #pc-painel.celular .calmo{padding:8px 10px}
    #pc-painel.celular h3{font-size:12.5px}
    #pc-painel.celular .bt{padding:6px 10px;font-size:12.5px}
    #pc-painel.celular .bt.peq{padding:5px 8px;font-size:12px}
    #pc-painel.celular .seg button{padding:5px 9px;font-size:12px}
    #pc-painel.celular input[type=number]{width:62px;padding:4px 6px;font-size:16px}
    #pc-painel.celular select{padding:4px 6px;font-size:16px;max-width:150px}
    #pc-painel.celular .seguranca{padding:8px}
    #pc-painel.celular .seguranca label{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    #pc-painel.celular table{display:block;overflow-x:auto;font-size:12px}
    #pc-painel.celular td,#pc-painel.celular th{padding:3px 4px}
    #pc-painel.celular .fila .item{flex-wrap:wrap;padding:7px 10px}
    #pc-painel.celular .cfg{gap:6px 12px}
    #pc-painel.celular .secao-cab{flex-wrap:wrap;gap:2px 8px}
    #pc-painel.celular .conta table.itens th:nth-child(3),#pc-painel.celular .conta table.itens td:nth-child(3),#pc-painel.celular .conta table.itens th:nth-child(4),#pc-painel.celular .conta table.itens td:nth-child(4){display:none}
    #pc-painel.celular .seletor button{padding:4px 10px;font-size:12.5px}
    @media (max-width:560px){#pc-painel .tot{display:none}#pc-painel .fila .item{flex-wrap:wrap}}
    @media (prefers-reduced-motion:no-preference){#pc-painel .bt,#pc-painel .chip,#pc-painel .seg button{transition:background-color .12s,border-color .12s}}
    #pc-chip{position:fixed;left:8px;bottom:8px;z-index:2147483646;background:#21141e;color:#f4e9f0;border:1px solid #563a4d;border-radius:9px;padding:5px 9px;font:12px 'Segoe UI',system-ui,sans-serif;opacity:.9}
    #pc-chip button{background:#3a2435;color:#f4e9f0;border:1px solid #563a4d;border-radius:6px;padding:1px 7px;margin-left:8px;cursor:pointer;font-size:11.5px}
  `;

  const garantirEstilo = () => {
    if (document.getElementById('pc-estilo')) return;
    const st = document.createElement('style');
    st.id = 'pc-estilo';
    st.textContent = ESTILO;
    (document.head ?? document.documentElement).appendChild(st);
  };

  const botaoCompra = (chave, qtd, preco, gold, rotulo) => {
    const conf = ui.pendente?.chave === chave && ui.pendente.ate > Date.now();
    const total = qtd * preco;
    const semOuro = Number(gold) < total;
    return `<button class="bt peq${conf ? ' conf' : ''}" data-acao="comprar" data-chave="${esc(chave)}" ${semOuro ? 'disabled title="Ouro insuficiente"' : ''}>${conf ? `Confirmar ${curto(total)} de ouro` : esc(rotulo)}</button>`;
  };

  const htmlFila = (contas) => {
    const lista = pendencias(contas);
    if (!lista.length) return '<div class="calmo">Tudo rodando. Nada precisa de você agora.</div>';
    return `<div class="fila">${lista.map((p) => {
      let acao = '';
      if (p.compra) acao = botaoCompra(p.compra.chave, p.compra.qtd, p.compra.total / p.compra.qtd, p.compra.gold, `Comprar ${num(p.compra.qtd)} ${p.compra.nome}`);
      else if (p.hunt) acao = `<button class="bt prim peq" data-acao="irHunt" data-nick="${esc(p.nick)}" data-slug="${esc(p.hunt.slug)}">Ir para ${esc(p.hunt.nome)}</button>`;
      else if (p.cancelar) acao = `<button class="bt peq" data-acao="cancelarHunt" data-nick="${esc(p.nick)}">Cancelar</button>`;
      return `<div class="item n${p.nivel}"><span class="quem">${esc(p.nick)}</span><span class="oque">${esc(p.txt)}${p.dica ? ` <span class="mut">${esc(p.dica)}</span>` : ''}</span>${acao}</div>`;
    }).join('')}</div>`;
  };

  const htmlItensConta = (s) => GRUPOS.map((g) => {
    const gr = grupoDaConta(s, g);
    if (!gr.itens.length) return '';
    const linhas = gr.itens.map((i) => `<tr><td class="nome">${esc(i.nome)}${i.naLista ? '' : ' <span class="mut">fora da automação</span>'}</td><td class="num">${num(i.qtd)}</td><td class="num mut">${i.uso ? `${num(i.uso)}/h` : '—'}</td><td class="mut">${i.repoe ? `${num(i.regra.lote)} quando &lt; ${num(i.regra.min)}` : 'manual'}</td><td class="compra">${i.preco > 0 ? [100, 500, 1000].map((q) => botaoCompra(`${s.nick}|${i.chave}|${q}`, q, i.preco, s.gold, `+${curto(q)}`)).join('') : '<span class="mut">só na Loja</span>'}</td></tr>`).join('');
    return `<div class="gtit">${g.nome} <span class="mut">${gr.ativo ? (gr.uso ? `${num(gr.total)} no total, dura ${tempoH(gr.eta)}` : `${num(gr.total)} no total`) : 'automação desligada'}${gr.auto ? ', reposição automática ligada' : ''}</span></div>
      <table class="itens"><tr><th>Item</th><th class="num">Tem</th><th class="num">Gasto</th><th>Repor auto</th><th class="compra">Comprar</th></tr>${linhas}</table>`;
  }).join('');

  const htmlGeral = (contas) => {
    if (!contas.length) return '<div class="mut">Nenhuma conta ainda. Abra as abas das contas com a extensão ativa.</div>';
    const cartoes = contas.map((s) => {
      const st = statusDaConta(s);
      const h = huntDe(s);
      const grupos = GRUPOS.map((g) => grupoDaConta(s, g)).filter((gr) => gr.ativo);
      const pior = corDaConta(s);
      const lucro = (Number(s.rate?.gold) || 0) - custoHora(s);
      const prox = horasProxNivel(s);
      const au = autoEstado(s);
      const medindo = Date.now() - (s.tot?.desde || Date.now()) < 300000;
      const aberto = ui.expandidas.has(s.nick);
      const onde = !online(s) || !s.conectado || st.nivel === 2 ? esc(st.txt)
        : s.noCentro ? 'no Centro Pokémon'
          : h ? `${esc(h.nome)} <span class="mut">Nv ${num(h.nivel)}</span>` : esc(st.txt);
      return `<div class="conta n${pior}${aberto ? ' larga' : ''}">
        <div class="cab"><span class="nick">${esc(s.nick)}</span><span class="nv">Treinador Nv ${num(s.nivel)}</span></div>
        <div class="mut">${s.ativo ? `${esc(s.ativo.nome)} Nv ${num(s.ativo.level)}` : '—'}</div>
        <div class="onde"><span class="ponto n${pior}"></span>${onde}${au.ligado && au.meta !== 'off' ? ` <span class="tag">auto ${au.meta === 'ouro' ? 'ouro' : 'XP'}</span>` : ''}</div>
        <div class="nums"><div><b>${curto(s.rate?.xp)}</b><span>XP/h${medindo ? ', medindo' : ''}</span></div><div><b>${curto(lucro)}</b><span>lucro/h</span></div><div><b>${curto(s.gold)}</b><span>ouro</span></div></div>
        <div class="mut">${prox != null ? `Próximo nível em ${tempoH(prox)}` : `Bruto ${curto(s.rate?.gold)} ouro/h, gasto ${curto(custoHora(s))}/h`}</div>
        <div class="est">${grupos.map((gr) => `<span class="tag n${gr.nivel}">${gr.g.nome} <b>${resumoGrupo(gr)}</b>${gr.auto ? ' 🔁' : ''}</span>`).join('') || '<span class="mut">sem itens acompanhados</span>'}</div>
        <button class="lnk" data-acao="expandir" data-nick="${esc(s.nick)}">${aberto ? 'Esconder itens' : 'Itens e compras'}</button>
        ${aberto ? `<div>${htmlItensConta(s)}</div>` : ''}
      </div>`;
    }).join('');
    return `<h3>Precisa de você</h3>${htmlFila(contas)}<h3>Contas</h3><div class="grade">${cartoes}</div>`;
  };

  const htmlHuntsFixoAntigo = () => '<div class="mut">Escolha a meta de cada conta. No modo automático a conta troca sozinha quando acha uma hunt segura que rende pelo menos 20% a mais, no máximo uma vez a cada 30 min, confere o resultado depois de 20 min e 40 abates e só volta se renderam 15% menos que a hunt anterior, ou se a conta cair.</div>';

  const NOME_FRAQ = { 1: 'nenhuma', 2: 'até ×2', 4: 'até ×4', 99: 'qualquer' };

  const htmlHuntsFixo = () => '';

  const htmlSeguranca = (s, seg) => {
    const n = esc(s.nick);
    const op = (v) => `<option value="${v}" ${seg.fraqMax === v ? 'selected' : ''}>${NOME_FRAQ[v]}</option>`;
    return `<div class="cfg seguranca">
      <label>Derrotar cada selvagem em até <input type="number" min="1" max="120" step="1" data-seg="ttkMax" data-nick="${n}" value="${seg.ttkMax}"> s</label>
      <label>Fraqueza aceita <select data-seg="fraqMax" data-nick="${n}">${op(1)}${op(2)}${op(4)}${op(99)}</select></label>
      <label>Cada golpe recebido tira no máximo <input type="number" min="5" max="100" step="1" data-seg="riscoMax" data-nick="${n}" value="${seg.riscoMax}"> % da vida</label>
      <label>Trocar se render <input type="number" min="0" max="500" step="1" data-seg="margem" data-nick="${n}" value="${seg.margem}"> % a mais</label>
      <label><input type="checkbox" data-seg="comprovada" data-nick="${n}" ${seg.comprovada ? 'checked' : ''}> Liberar hunts iguais ou mais leves que a atual</label>
    </div>`;
  };

  const linhaAuto = (s, r, au) => {
    if (!au.ligado || r.meta === 'off') return '';
    const u = au.ult;
    if (!u) return '<div class="mut">Automático ligado. Nenhuma troca ainda.</div>';
    const ha = haQuanto(Date.now() - u.t);
    const nomeDe = (slug) => huntPorSlug(slug)?.nome ?? slug;
    let txt = `Última troca há ${ha}: ${esc(nomeDe(u.de))} para ${esc(nomeDe(u.para))} (${esc(u.motivo)}).`;
    if (!u.conferido && u.para === s.huntSlug) {
      const falta = AUTO.conferir - (Date.now() - (s.huntAcc?.slug === u.para ? s.huntAcc.t0 : Date.now()));
      txt += ` Confere o resultado em ${haQuanto(Math.max(0, falta))} e depois de ${AUTO.minAbates} abates (${num(s.huntAcc?.slug === u.para ? s.huntAcc.kills : 0)} até agora).`;
    } else if (u.medido != null && u.antes) {
      txt += ` Mediu ${curto(u.medido)} contra ${curto(u.antes)} antes.`;
    }
    const prox = AUTO.espera - (Date.now() - u.t);
    if (prox > 0) txt += ` Próxima troca possível em ${haQuanto(prox)}.`;
    return `<div class="mut">${txt}</div>`;
  };

  const htmlHuntsVivo = (contas) => {
    if (!contas.length) return '<div class="mut">Nenhuma conta ainda.</div>';
    return contas.map((s) => {
      const r = recomendar(s);
      const au = autoEstado(s);
      const h = huntDe(s);
      const st = corDaConta(s);
      const metaSeg = [['xp', 'XP'], ['ouro', 'Ouro'], ['off', 'Desligado']].map(([m, rot]) => `<button class="${r.meta === m ? 'on' : ''}" data-acao="meta" data-nick="${esc(s.nick)}" data-meta="${m}">${rot}</button>`).join('');
      const metaTxt = r.meta === 'off' ? 'sem meta' : `${r.meta === 'ouro' ? 'Ouro' : 'XP'}${au.ligado ? ', troca sozinha' : ', só sugere'}`;
      const autoBt = `<span class="tag${au.ligado && r.meta !== 'off' ? ' on' : ''}">${metaTxt}</span><button class="lnk" data-acao="irAjustes" data-nick="${esc(s.nick)}">Ajustar</button>`;
      const valorTxt = (x) => `${curto(r.valor(x))} ${r.meta === 'ouro' ? 'ouro' : 'XP'}/h`;
      let corpo = '';
      if (s.troca) {
        corpo = `<div class="sug info"><span class="txt">Indo para <b>${esc(s.troca.nome)}</b>: ${esc(s.troca.msg)}</span><button class="bt peq" data-acao="cancelarHunt" data-nick="${esc(s.nick)}">Cancelar</button></div>`;
      } else if (r.meta === 'off') {
        corpo = `<div class="sug info"><span class="txt">Sem meta. Escolha XP ou Ouro em Ajustes para receber sugestões ou ligar a troca automática.</span><button class="bt peq" data-acao="irAjustes" data-nick="${esc(s.nick)}">Abrir Ajustes</button></div>`;
      } else if (r.erro) {
        corpo = `<div class="sug info"><span class="txt">${esc(r.erro[0].toUpperCase() + r.erro.slice(1))}</span></div>`;
      } else if (r.sugerir) {
        const m = r.melhor;
        const ganho = r.ganho == null ? '' : `, ${num(r.ganho * 100)}% a mais`;
        const risco = m.risco != null ? `, golpe tira ~${num(m.risco * 100)}% da vida` : '';
        const acao = au.ligado ? '<span class="mut">o automático decide</span>' : `<button class="bt prim peq" data-acao="irHunt" data-nick="${esc(s.nick)}" data-slug="${esc(m.slug)}">Ir</button>`;
        corpo = `<div class="sug"><span class="txt"><b>${esc(m.nome)}</b> Nv ${num(m.nivel)}: ${valorTxt(m)} ${m.medida ? 'medido' : 'estimado'}${ganho}. Derrota em ~${num(m.ttkMedio, 1)} s${m.fraqPior > 1 ? `, fraco ×${num(m.fraqPior)}` : ''}${risco}.</span>${acao}</div>`;
      } else if (r.melhor) {
        corpo = '<div class="sug boa"><span class="txt">Já está na melhor hunt segura.</span></div>';
      } else {
        const b = r.barradas[0];
        corpo = `<div class="sug info"><span class="txt">Nenhuma hunt passa na segurança.${b ? ` ${esc(b.nome)} ficou de fora: ${esc(b.motivos.join(' e '))}.` : ''}</span></div>`;
      }
      const podeTop = r.meta !== 'off' && !r.erro && r.seguras?.length;
      const mostraTop = podeTop && ui.topHunts.has(s.nick);
      const maior = podeTop ? Math.max(...r.seguras.map((x) => r.valor(x)), 1) : 1;
      const top = mostraTop
        ? `<table style="margin-top:6px">${r.seguras.map((x) => `<tr><td>${esc(x.nome)} <span class="mut">Nv ${num(x.nivel)}</span></td><td style="width:40%"><span class="barrinha" style="width:${Math.max(4, (r.valor(x) / maior) * 100)}%"></span></td><td>${valorTxt(x)}</td><td>${x.slug === s.huntSlug ? '<span class="ok">atual</span>' : au.ligado ? '' : `<button class="bt peq" data-acao="irHunt" data-nick="${esc(s.nick)}" data-slug="${esc(x.slug)}">Ir</button>`}</td></tr>`).join('')}</table>`
        : '';
      const seg = r.seg ?? segDe(lerHuntCfg(), s.nick);
      const segAberta = ui.segAberta.has(s.nick);
      const segTxt = `derrota em até ${num(seg.ttkMax)} s, fraqueza ${NOME_FRAQ[seg.fraqMax]}, golpe tira até ${num(seg.riscoMax)}% da vida`;
      return `<div class="bloco n${st}">
        <div class="cfg"><span class="ponto n${st}"></span><b>${esc(s.nick)}</b><span class="mut">${s.ativo ? `${esc(s.ativo.nome)} Nv ${num(s.ativo.level)}` : ''}</span><span style="margin-left:auto;display:flex;gap:8px;align-items:center">${autoBt}</span></div>
        <div class="mut" style="margin-top:4px">${h ? `${esc(h.nome)} Nv ${num(h.nivel)}` : 'sem hunt'}: ${curto(s.rate?.xp)} XP/h, ${curto(s.rate?.gold)} ouro/h.${podeTop ? ` <button class="lnk" data-acao="topHunts" data-nick="${esc(s.nick)}">${mostraTop ? 'Esconder' : 'Comparar hunts'}</button>` : ''}</div>
        ${corpo}${top}${linhaAuto(s, r, au)}
      </div>`;
    }).join('');
  };

  const htmlReposicaoFixo = (contas) => {
    if (!contas.length) return '<div class="mut">Nenhuma conta ainda.</div>';
    const todos = itensCompraveis();
    const aberta = ui.repAberta && contas.some((c) => c.nick === ui.repAberta) ? ui.repAberta : null;
    return contas.map((s) => {
      const cfg = lerCfg(s.nick);
      const resumo = `${cfg.reporBolas ? 'pokébolas ligada' : 'pokébolas desligada'}, ${cfg.reporCura ? 'cura ligada' : 'cura desligada'}`;
      const cab = `<button class="acc-cab" data-acao="repAbrir" data-nick="${esc(s.nick)}"><span class="nick">${esc(s.nick)}</span><span class="mut">${resumo}</span><span class="mut" style="margin-left:auto">${aberta === s.nick ? 'fechar' : 'editar'}</span></button>`;
      if (aberta !== s.nick) return `<div class="acc">${cab}</div>`;
      const linhaDe = (it) => {
        const r = cfg.regras[it.chave] ?? regraPadrao(it.chave);
        return `<tr data-regra="${esc(it.chave)}"><td><label><input type="checkbox" data-campo="ativo" ${r.ativo ? 'checked' : ''}> ${esc(it.nome)}</label></td><td class="mut">${curto(it.preco)}</td><td><input type="number" min="0" step="1" data-campo="min" value="${Number(r.min) || 0}"></td><td><input type="number" min="1" max="${MAX_QTD}" step="1" data-campo="lote" value="${Number(r.lote) || 1}"></td></tr>`;
      };
      return `<div class="acc">${cab}<div class="acc-corpo" data-cfg="${esc(s.nick)}">
        <div class="cfg">
          <label><input type="checkbox" data-campo="reporBolas" ${cfg.reporBolas ? 'checked' : ''}> Repor pokébolas</label>
          <label><input type="checkbox" data-campo="reporCura" ${cfg.reporCura ? 'checked' : ''}> Repor poções e revives</label>
        </div>
        <div class="cfg">
          <label>Guardar sempre <input type="number" min="0" step="1000" data-campo="reservaOuro" value="${Number(cfg.reservaOuro) || 0}"> de ouro</label>
          <label>Gastar até <input type="number" min="0" step="1000" data-campo="tetoHora" value="${Number(cfg.tetoHora) || 0}"> de ouro por hora <span class="mut">(0 = sem limite)</span></label>
        </div>
        <table><tr><th>Item</th><th>Preço</th><th>Comprar quando tiver menos de</th><th>Quantidade</th></tr>
          <tr><td colspan="4" class="mut">Pokébolas</td></tr>${todos.filter((i) => i.chave.startsWith('ball:')).map(linhaDe).join('')}
          <tr><td colspan="4" class="mut">Poções e revives</td></tr>${todos.filter((i) => i.chave.startsWith('item:')).map(linhaDe).join('')}
        </table>
        <div><button class="bt prim" data-acao="salvarcfg" data-nick="${esc(s.nick)}">Salvar reposição de ${esc(s.nick)}</button> <span class="mut" data-r="msg"></span></div>
      </div></div>`;
    }).join('') + `<div class="bloco"><label><input type="checkbox" data-acao="som" ${uiCfg().som ? 'checked' : ''}> Tocar um som quando surgir algo em "Precisa de você"</label>
      <div style="margin-top:8px"><b>Registro do mercado</b> <span class="mut">(para eu aprender os comandos do mercado; senha e token não são gravados)</span><div style="margin-top:4px">${contas.map((c) => `<button class="bt peq" data-acao="copiarReg" data-nick="${esc(c.nick)}">Copiar de ${esc(c.nick)} (${(gmGet(`pc.reg.${c.nick}`, []) ?? []).length})</button>`).join(' ')} <span class="mut" data-r="regmsg"></span></div></div>
      <div style="margin-top:6px"><button class="bt peq" data-acao="limpar">Remover contas sem sinal há mais de 10 min</button></div>
      <div class="mut" style="margin-top:6px">Extensão ${VERSAO}, jogo ${esc(ag.versaoJogo ?? '?')}${ag.versaoJogo && ag.versaoJogo !== VERSAO_JOGO_VALIDADA ? ' (versão do jogo ainda não validada)' : ''}. Painel na aba de ${esc(gmGet(K.main, '—'))}.</div></div>`;
  };

  const chanceShinyPorArremesso = () => {
    const c = Number(cat()?.chanceShiny) || 0;
    return c > 1 ? 1 / c : c;
  };
  const chanceCaptura = (ef, boostCaptura) => {
    const cp = cat()?.captura ?? { base: 0.0075, piso: 0.003, teto: 0.1 };
    let ch = clamp(Number(cp.base) * (ef / FATOR_PIOR_CASO) * 1.4, Number(cp.piso), Number(cp.teto));
    if (boostCaptura) ch = Math.min(Number(cp.teto), ch * 2);
    return ch;
  };

  const htmlCalculadora = (s) => {
    const boostCap = s.boosts?.captura > Date.now();
    const linhas = (cat()?.bolas ?? []).filter((b) => b.ef > 0).map((b) => {
      const ch = chanceCaptura(b.ef, boostCap);
      return { b, ch, custo: b.compravel && b.preco > 0 ? b.preco / ch : null, tem: Number(s.balls?.[b.id]) || 0 };
    });
    const baratas = linhas.filter((l) => l.custo != null).sort((a, b) => a.custo - b.custo);
    const maisBarata = baratas[0]?.b.id;
    const ordemAtual = (s.auto.ballIds ?? []).map((id) => bolaDoCat(id)?.nome ?? `#${id}`).join(' → ') || '—';
    const thr = Number(s.rate?.throws) || 0;
    const p0 = chanceShinyPorArremesso();
    const beast = linhas.find((l) => l.b.id === BEAST);
    const atual = linhas.find((l) => l.b.id === (s.auto.ballIds ?? []).find((id) => id !== BEAST && Number(s.balls?.[id]) > 0));
    let beastTxt = '';
    if (p0 && beast && atual && thr > 0) {
      const extra = thr * p0 * 2 * (beast.ch - atual.ch);
      const porShiny = extra > 0 ? Math.max(0, thr - PITY_BEAST_POR_HORA) / extra : Infinity;
      beastTxt = `<div class="mut">Usar Beast em todos durante o Lure custaria <b>~${Number.isFinite(porShiny) ? num(porShiny) : '∞'} Beast Balls por shiny a mais</b>. Não existe "Beast só no shiny": o brilho só aparece no arremesso.</div>`;
    }
    return `<table style="margin-top:6px"><tr><th>Bola</th><th>Chance</th><th>Derrotas por captura</th><th>Preço</th><th>Custo por captura</th><th>Tem</th></tr>
      ${linhas.map((l) => `<tr><td>${esc(l.b.nome)}${l.b.id === maisBarata ? ' 💰' : ''}</td><td>${num(l.ch * 100, 2)}%</td><td>${num(1 / l.ch)}</td><td>${l.b.compravel ? `${curto(l.b.preco)}🪙` : 'Loja 💎'}</td><td>${l.custo != null ? `${curto(l.custo)}🪙` : '—'}</td><td>${num(l.tem)}</td></tr>`).join('')}</table>
      <div class="mut">💰 mais barata por captura (pior caso: última evolução). A automação usa a primeira bola da lista com estoque. Sua ordem: ${esc(ordemAtual)}${baratas.length ? ` · mais econômica: ${esc(baratas.map((l) => l.b.nome).join(' → '))}` : ''}.</div>${beastTxt}`;
  };

  const htmlShiny = (contas) => {
    const p0 = chanceShinyPorArremesso();
    if (!p0) return '<div class="mut">Aguardando o jogo informar a chance de shiny.</div>';
    const agora = Date.now();
    let totVistos = 0;
    let totCap = 0;
    const linhas = contas.filter(online).map((s) => {
      const h = huntDe(s);
      const semShiny = !s.huntSlug || ehOutland(h) || s.boss || s.casa;
      const lure = s.boosts?.shiny > agora;
      const boostCap = s.boosts?.captura > agora;
      const p = p0 * (lure ? 2 : 1);
      const thr = Number(s.rate?.throws) || 0;
      const bola = bolaDoCat((s.auto.ballIds ?? []).find((id) => Number(s.balls?.[id]) > 0));
      const ch = bola ? chanceCaptura(bola.ef, boostCap) : 0;
      const vistosH = semShiny ? 0 : thr * p;
      totVistos += vistosH * 24;
      totCap += vistosH * 24 * ch;
      return `<tr><td><b>${esc(s.nick)}</b></td><td>${semShiny ? `<span class="n1">${ehOutland(h) ? 'Outland: sem shiny' : 'sem shiny aqui'}</span>` : esc(h?.nome ?? '—')}</td><td>${num(thr)}/h</td><td>${lure ? '✅ ×2' : '—'}</td><td>${semShiny || !vistosH ? '—' : `1 a cada ${tempoH(1 / vistosH)}`}</td><td>${bola ? `${esc(bola.nome)} ${num(ch * 100, 2)}%` : '—'}</td><td>${semShiny || !vistosH || !ch ? '—' : `1 a cada ${tempoH(1 / (vistosH * ch))}`}</td></tr>`;
    }).join('');
    const sel = ui.contaShiny && contas.find((c) => c.nick === ui.contaShiny) ? ui.contaShiny : contas[0]?.nick;
    ui.contaShiny = sel;
    const s = contas.find((c) => c.nick === sel);
    return `<div class="mut">Chance oficial: <b>1 em ${num(1 / p0)}</b> por arremesso (1 em ${num(1 / (p0 * 2))} com Shiny Secret Lure). O brilho é sorteado em qualquer bola; a bola só decide a captura.</div>
      <table><tr><th>Conta</th><th>Hunt</th><th>Arremessos</th><th>Lure</th><th>Ver 1 shiny</th><th>1ª bola</th><th>Capturar 1</th></tr>${linhas}</table>
      <div class="bloco">Todas as contas: ~${num(totVistos, 2)} shiny visto/dia · ~${num(totCap, 4)} capturado/dia${totCap > 0 ? ` (1 a cada ${tempoH(24 / totCap)})` : ''}. <span class="mut">🛡️ Lure comprado: cada hora sem shiny capturado devolve +${PITY_BEAST_POR_HORA} Beast Balls.</span></div>
      <div class="bloco"><b>🧮 Custo por captura</b> ${contas.map((c) => `<span class="chip${c.nick === sel ? ' on' : ''}" data-acao="selShiny" data-nick="${esc(c.nick)}">${esc(c.nick)}</span>`).join('')}${s ? htmlCalculadora(s) : ''}</div>`;
  };

  const salvarConfig = (nick) => {
    const box = [...(ui.raiz?.querySelectorAll('[data-cfg]') ?? [])].find((b) => b.dataset.cfg === nick);
    if (!box) return;
    const cfg = lerCfg(nick);
    cfg.reporBolas = !!box.querySelector('[data-campo=reporBolas]')?.checked;
    cfg.reporCura = !!box.querySelector('[data-campo=reporCura]')?.checked;
    cfg.reservaOuro = Math.max(0, Math.floor(Number(box.querySelector('[data-campo=reservaOuro]')?.value) || 0));
    cfg.tetoHora = Math.max(0, Math.floor(Number(box.querySelector('[data-campo=tetoHora]')?.value) || 0));
    for (const tr of box.querySelectorAll('tr[data-regra]')) {
      cfg.regras[tr.dataset.regra] = {
        ativo: !!tr.querySelector('[data-campo=ativo]')?.checked,
        min: Math.max(0, Math.floor(Number(tr.querySelector('[data-campo=min]')?.value) || 0)),
        lote: clamp(Math.floor(Number(tr.querySelector('[data-campo=lote]')?.value) || 1), 1, MAX_QTD),
      };
    }
    gmSet(K.cfg(nick), cfg);
    const msg = box.querySelector('[data-r=msg]');
    if (msg) msg.textContent = `✓ salvo às ${new Date().toLocaleTimeString('pt-BR')}`;
  };

  const htmlMercadoFixo = (contas) => {
    const main = gmGet(K.main, null);
    const alts = contas.filter((c) => c.nick !== main);
    if (!alts.length) return '<div class="mut">Nenhuma conta alternativa aberta. A venda automática só roda nas contas alternativas.</div>';
    const aberta = ui.mercAberta && alts.some((c) => c.nick === ui.mercAberta) ? ui.mercAberta : null;
    return `<div class="mut">Só contas alternativas. A conta anuncia tudo de uma vez quando juntar a quantidade definida (mínimo 5), espera 30 min antes de anunciar o mesmo item de novo e respeita o limite por hora. O envio do ouro para a main continua manual.</div>` + alts.map((s) => {
      const cfg = lerMerc(s.nick);
      const ativos = Object.values(cfg.itens).filter((r) => r?.ativo).length;
      const resumo = cfg.ativo ? `venda ligada, ${ativos} ${ativos === 1 ? 'item' : 'itens'}` : 'venda desligada';
      const cab = `<button class="acc-cab" data-acao="mercAbrir" data-nick="${esc(s.nick)}"><span class="nick">${esc(s.nick)}</span><span class="mut">${resumo}</span><span class="mut" style="margin-left:auto">${aberta === s.nick ? 'fechar' : 'editar'}</span></button>`;
      if (aberta !== s.nick) return `<div class="acc">${cab}</div>`;
      const precos = s.merc?.precos ?? {};
      const ids = [...new Set([...Object.keys(precos), ...Object.keys(cfg.itens)])]
        .filter((id) => !itemDoCat(Number(id)) || cfg.itens[id])
        .sort((a, b) => (Number(s.mochila?.[b]) || 0) - (Number(s.mochila?.[a]) || 0));
      const linhas = ids.map((id) => {
        const r = { ...regraMercPadrao(), ...(cfg.itens[id] ?? {}) };
        const p = precos[id] ?? {};
        return `<tr data-merc="${esc(id)}"><td class="nome"><label><input type="checkbox" data-campo="ativo" ${r.ativo ? 'checked' : ''}> ${esc(nomeItem(id))}</label></td><td class="num">${num(Number(s.mochila?.[id]) || 0)}</td><td class="num mut">${p.media ? curto(p.media) : '—'}</td><td class="num mut">${p.menor ? curto(p.menor) : '—'}</td>
          <td><input type="number" min="5" max="${MAX_QTD}" step="1" data-campo="acumular" value="${r.acumular}"></td>
          <td><input type="number" min="0" step="1" data-campo="guardar" value="${r.guardar}"></td>
          <td><select data-campo="modo"><option value="media" ${r.modo === 'media' ? 'selected' : ''}>média vendida</option><option value="menor" ${r.modo === 'menor' ? 'selected' : ''}>menor anúncio − 1</option></select></td>
          <td><input type="number" min="0" step="100" data-campo="minPreco" value="${r.minPreco}"></td></tr>`;
      }).join('');
      const semPrecos = !Object.keys(precos).length;
      return `<div class="acc">${cab}<div class="acc-corpo" data-mcfg="${esc(s.nick)}">
        <div class="cfg">
          <label><input type="checkbox" data-campo="mAtivo" ${cfg.ativo ? 'checked' : ''}> Vender automaticamente</label>
          <label>No máximo <input type="number" min="1" max="60" step="1" data-campo="maxHora" value="${cfg.maxHora}"> anúncios por hora</label>
          <button class="bt peq" data-acao="mercPrecos" data-nick="${esc(s.nick)}">Atualizar preços</button>
        </div>
        ${semPrecos && !ids.length ? '<div class="mut">Clique em "Atualizar preços" para listar os itens da mochila que têm mercado.</div>' : `<table class="itens"><tr><th>Item</th><th class="num">Tem</th><th class="num">Média</th><th class="num">Menor</th><th>Juntar</th><th>Guardar</th><th>Preço</th><th>Mínimo</th></tr>${linhas}</table>`}
        <div><button class="bt prim" data-acao="salvarMerc" data-nick="${esc(s.nick)}">Salvar venda de ${esc(s.nick)}</button> <span class="mut" data-r="mmsg"></span></div>
      </div></div>`;
    }).join('');
  };

  const htmlMercadoVivo = (contas) => {
    const main = gmGet(K.main, null);
    const alts = contas.filter((c) => c.nick !== main);
    if (!alts.length) return '<div class="mut">A venda automática roda só nas contas alternativas. Abra a aba de uma conta alternativa para ela aparecer aqui.</div>';
    return `<div class="mut">Anúncios automáticos das contas alternativas. Para escolher itens e preços, use Ajustes.</div>${alts.map((s) => {
      const log = (s.merc?.log ?? []).slice(-6).reverse();
      const ligada = lerMerc(s.nick).ativo;
      return `<div class="bloco"><div class="cfg"><b>${esc(s.nick)}</b><span class="tag${ligada ? ' on' : ''}">${ligada ? 'venda ligada' : 'venda desligada'}</span><span class="mut">${num(s.merc?.anunciados ?? 0)} unidades anunciadas nesta sessão</span><button class="lnk" style="margin-left:auto" data-acao="irAjustes" data-nick="${esc(s.nick)}">Ajustar</button></div>
        ${log.length ? log.map((l) => `<div class="${l.tipo === 'erro' ? 'n1' : l.tipo === 'ok' ? 'ok' : 'mut'}" style="font-size:12px">${new Date(l.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${esc(l.txt)}</div>`).join('') : '<div class="mut">Nada ainda.</div>'}</div>`;
    }).join('')}`;
  };

  const salvarMerc = (nick) => {
    const box = [...(ui.raiz?.querySelectorAll('[data-mcfg]') ?? [])].find((b) => b.dataset.mcfg === nick);
    if (!box) return;
    const cfg = lerCfg(nick);
    const m = { ...mercPadrao(), ...(cfg.mercado ?? {}) };
    m.ativo = !!box.querySelector('[data-campo=mAtivo]')?.checked;
    m.maxHora = clamp(Math.floor(Number(box.querySelector('[data-campo=maxHora]')?.value) || 6), 1, 60);
    m.itens = { ...m.itens };
    for (const tr of box.querySelectorAll('tr[data-merc]')) {
      m.itens[tr.dataset.merc] = {
        ativo: !!tr.querySelector('[data-campo=ativo]')?.checked,
        acumular: clamp(Math.floor(Number(tr.querySelector('[data-campo=acumular]')?.value) || 20), 5, MAX_QTD),
        guardar: Math.max(0, Math.floor(Number(tr.querySelector('[data-campo=guardar]')?.value) || 0)),
        modo: tr.querySelector('[data-campo=modo]')?.value === 'menor' ? 'menor' : 'media',
        minPreco: Math.max(0, Math.floor(Number(tr.querySelector('[data-campo=minPreco]')?.value) || 0)),
      };
    }
    cfg.mercado = m;
    gmSet(K.cfg(nick), cfg);
    const msg = box.querySelector('[data-r=mmsg]');
    if (msg) msg.textContent = `✓ salvo às ${new Date().toLocaleTimeString('pt-BR')}`;
  };

  const htmlRepCorpo = (s) => {
    const cfg = lerCfg(s.nick);
    const todos = itensCompraveis();
    const linhaDe = (it) => {
      const r = cfg.regras[it.chave] ?? regraPadrao(it.chave);
      return `<tr data-regra="${esc(it.chave)}"><td class="nome"><label><input type="checkbox" data-campo="ativo" ${r.ativo ? 'checked' : ''}> ${esc(it.nome)}</label></td><td class="num mut">${curto(it.preco)}</td><td><input type="number" min="0" step="1" data-campo="min" value="${Number(r.min) || 0}"></td><td><input type="number" min="1" max="${MAX_QTD}" step="1" data-campo="lote" value="${Number(r.lote) || 1}"></td></tr>`;
    };
    return `<div data-cfg="${esc(s.nick)}" class="pilha">
      <div class="cfg">
        <label><input type="checkbox" data-campo="reporBolas" ${cfg.reporBolas ? 'checked' : ''}> Repor pokébolas</label>
        <label><input type="checkbox" data-campo="reporCura" ${cfg.reporCura ? 'checked' : ''}> Repor poções e revives</label>
      </div>
      <div class="cfg">
        <label>Guardar sempre <input type="number" min="0" step="1000" data-campo="reservaOuro" value="${Number(cfg.reservaOuro) || 0}"> de ouro</label>
        <label>Gastar até <input type="number" min="0" step="1000" data-campo="tetoHora" value="${Number(cfg.tetoHora) || 0}"> de ouro por hora <span class="mut">(0 = sem limite)</span></label>
      </div>
      <table class="itens"><tr><th>Item</th><th class="num">Preço</th><th>Comprar abaixo de</th><th>Quantidade</th></tr>
        <tr><td colspan="4" class="mut">Pokébolas</td></tr>${todos.filter((i) => i.chave.startsWith('ball:')).map(linhaDe).join('')}
        <tr><td colspan="4" class="mut">Poções e revives</td></tr>${todos.filter((i) => i.chave.startsWith('item:')).map(linhaDe).join('')}
      </table>
      <div><button class="bt prim" data-acao="salvarcfg" data-nick="${esc(s.nick)}">Salvar reposição</button> <span class="mut" data-r="msg"></span></div>
    </div>`;
  };

  const htmlMercCorpo = (s) => {
    const cfg = lerMerc(s.nick);
    const precos = s.merc?.precos ?? {};
    const ids = [...new Set([...Object.keys(precos), ...Object.keys(cfg.itens)])]
      .filter((id) => !itemDoCat(Number(id)) || cfg.itens[id])
      .sort((a, b) => (Number(s.mochila?.[b]) || 0) - (Number(s.mochila?.[a]) || 0));
    const linhas = ids.map((id) => {
      const r = { ...regraMercPadrao(), ...(cfg.itens[id] ?? {}) };
      const p = precos[id] ?? {};
      return `<tr data-merc="${esc(id)}"><td class="nome"><label><input type="checkbox" data-campo="ativo" ${r.ativo ? 'checked' : ''}> ${esc(nomeItem(id))}</label></td><td class="num">${num(Number(s.mochila?.[id]) || 0)}</td><td class="num mut">${p.media ? curto(p.media) : '—'}</td><td class="num mut">${p.menor ? curto(p.menor) : '—'}</td>
        <td><input type="number" min="5" max="${MAX_QTD}" step="1" data-campo="acumular" value="${r.acumular}"></td>
        <td><input type="number" min="0" step="1" data-campo="guardar" value="${r.guardar}"></td>
        <td><select data-campo="modo"><option value="media" ${r.modo === 'media' ? 'selected' : ''}>média vendida</option><option value="menor" ${r.modo === 'menor' ? 'selected' : ''}>menor anúncio − 1</option></select></td>
        <td><input type="number" min="0" step="100" data-campo="minPreco" value="${r.minPreco}"></td></tr>`;
    }).join('');
    return `<div data-mcfg="${esc(s.nick)}" class="pilha">
      <div class="cfg">
        <label><input type="checkbox" data-campo="mAtivo" ${cfg.ativo ? 'checked' : ''}> Vender automaticamente</label>
        <label>No máximo <input type="number" min="1" max="60" step="1" data-campo="maxHora" value="${cfg.maxHora}"> anúncios por hora</label>
        <button class="bt peq" data-acao="mercPrecos" data-nick="${esc(s.nick)}">Atualizar preços</button>
      </div>
      ${ids.length ? `<table class="itens"><tr><th>Item</th><th class="num">Tem</th><th class="num">Média</th><th class="num">Menor</th><th>Juntar</th><th>Guardar</th><th>Preço</th><th>Mínimo</th></tr>${linhas}</table>` : '<div class="mut">Clique em "Atualizar preços" para listar os itens da mochila que têm mercado.</div>'}
      <div class="mut">Anuncia tudo de uma vez ao juntar a quantidade (mínimo 5) e espera 30 min antes de repetir o mesmo item.</div>
      <div><button class="bt prim" data-acao="salvarMerc" data-nick="${esc(s.nick)}">Salvar venda</button> <span class="mut" data-r="mmsg"></span></div>
    </div>`;
  };

  const htmlAjustesFixo = (contas) => {
    if (!contas.length) return '<div class="mut">Nenhuma conta ainda.</div>';
    const main = gmGet(K.main, null);
    const s = contas.find((c) => c.nick === ui.ajConta) ?? contas.find((c) => c.nick === main) ?? contas[0];
    ui.ajConta = s.nick;
    const hc = lerHuntCfg();
    const meta = hc.metas[s.nick] ?? 'off';
    const auto = !!hc.auto[s.nick];
    const seg = segDe(hc, s.nick);
    const contasSel = contas.length > 1
      ? `<div class="seletor">${contas.map((c) => `<button class="${c.nick === s.nick ? 'on' : ''}" data-acao="ajConta" data-nick="${esc(c.nick)}"><span class="ponto n${corDaConta(c)}"></span>${esc(c.nick)}${c.nick === main ? ' <span class="mut">main</span>' : ''}</button>`).join('')}</div>`
      : '';
    const metaSeg = [['xp', 'XP do treinador'], ['ouro', 'Ouro'], ['off', 'Desligado']].map(([m, rot]) => `<button class="${meta === m ? 'on' : ''}" data-acao="meta" data-nick="${esc(s.nick)}" data-meta="${m}">${rot}</button>`).join('');
    const secao = (titulo, desc, corpo) => `<section class="secao"><div class="secao-cab"><h3>${titulo}</h3>${desc ? `<span class="mut">${desc}</span>` : ''}</div>${corpo}</section>`;
    const hunt = `<div class="cfg"><span>Meta</span><span class="seg">${metaSeg}</span>
        ${meta === 'off' ? '' : `<label><input type="checkbox" data-acao="autoChk" data-nick="${esc(s.nick)}" ${auto ? 'checked' : ''}> Trocar de hunt sozinha</label>`}</div>
      ${htmlSeguranca(s, seg)}`;
    const alt = s.nick !== main;
    return `${contasSel}
      ${secao('Hunt', 'o que buscar e quanto risco aceitar', hunt)}
      ${secao('Reposição', 'compra automática de pokébolas e cura', htmlRepCorpo(s))}
      ${alt ? secao('Venda no mercado', 'só contas alternativas', htmlMercCorpo(s)) : ''}
      ${secao('Geral', '', `<div class="pilha">
        <label><input type="checkbox" data-acao="som" ${uiCfg().som ? 'checked' : ''}> Tocar um som quando surgir algo em "Precisa de você"</label>
        <div><button class="bt peq" data-acao="limpar">Remover contas sem sinal há mais de 10 min</button></div>
        <details><summary class="mut">Avançado</summary><div style="margin-top:6px">${contas.map((c) => `<button class="bt peq" data-acao="copiarReg" data-nick="${esc(c.nick)}">Copiar registro de ${esc(c.nick)}</button>`).join(' ')} <span class="mut" data-r="regmsg"></span></div></details>
        <div class="cfg"><span>Versão instalada <b>${esc(VERSAO)}</b>${novaVersao() ? `, nova versão <b>${esc(novaVersao())}</b> disponível` : ''}</span>
          ${novaVersao() ? '<button class="bt prim peq" data-acao="atualizar">Atualizar agora</button>' : '<button class="bt peq" data-acao="checarVersao">Procurar atualização</button>'}
          <span class="mut" data-r="vermsg">${(() => { const u = gmGet('pc.upd', null); return u?.ts ? `última verificação ${haQuanto(Date.now() - u.ts)} atrás${u.erro ? ' (o gerenciador de scripts cuida das atualizações aqui)' : ''}` : ''; })()}</span></div>
        <div class="mut">Jogo ${esc(ag.versaoJogo ?? '?')}. Painel na aba de ${esc(main ?? '—')}. <a href="${URL_PROJETO}" target="_blank" rel="noopener" style="color:var(--ouro)">Página do projeto</a></div>
      </div>`)}`;
  };

  const versaoMaior = (a, b) => {
    const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
    }
    return false;
  };
  const novaVersao = () => {
    const u = gmGet('pc.upd', null);
    return u?.versao && versaoMaior(u.versao, VERSAO) ? u.versao : null;
  };
  const checarAtualizacao = (forcar = false) => {
    const u = gmGet('pc.upd', null);
    if (!forcar && u && Date.now() - u.ts < 3 * 3600000) return;
    let req = null;
    try {
      if (typeof GM_xmlhttpRequest === 'function') req = GM_xmlhttpRequest;
    } catch {}
    if (!req) {
      gmSet('pc.upd', { ts: Date.now(), versao: u?.versao ?? null, erro: 'sem acesso' });
      return;
    }
    gmSet('pc.upd', { ...(u ?? {}), ts: Date.now() });
    req({
      method: 'GET',
      url: `${URL_SCRIPT}?t=${Date.now()}`,
      timeout: 15000,
      onload: (r) => {
        const v = String(r.responseText ?? '').match(/@version\s+([\w.-]+)/)?.[1] ?? null;
        gmSet('pc.upd', { ts: Date.now(), versao: v, notas: String(r.responseText ?? '').match(/@novidades\s+(.+)/)?.[1] ?? null });
        if (forcar) renderPrincipal(true);
      },
      onerror: () => gmSet('pc.upd', { ts: Date.now(), versao: u?.versao ?? null, erro: 'falhou' }),
    });
  };

  const bip = () => {
    try {
      const ctx = new (PW.AudioContext || PW.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.25);
    } catch {}
  };

  const contarAlertas = (contas) => pendencias(contas).filter((p) => p.nivel >= 1).length;

  const ABAS = [['geral', 'Contas'], ['hunts', 'Hunts'], ['mercado', 'Mercado'], ['shiny', 'Shiny'], ['ajustes', 'Ajustes']];

  const montarRaiz = () => {
    document.getElementById('pc-chip')?.remove();
    document.getElementById('pc-host')?.remove();
    ui.host = document.createElement('div');
    ui.host.id = 'pc-host';
    ui.host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;inset:auto 0 0 0;height:0;';
    const sombra = ui.host.attachShadow({ mode: 'open' });
    const est = document.createElement('style');
    est.textContent = `:host{all:initial}${ESTILO}`;
    sombra.appendChild(est);
    ui.raiz = document.createElement('div');
    ui.raiz.id = 'pc-painel';
    if (CELULAR) ui.raiz.classList.add('celular');
    ui.raiz.innerHTML = `<div class="barra" data-acao="toggle" title="Clique para abrir ou minimizar. Arraste para mover. Duplo clique volta ao lugar padrão."><span class="marca"><i></i>PokeIdle Central<span class="ver" data-r="ver"></span></span><span class="tot" data-r="tot"></span><span class="estado" data-r="estado"></span><span class="seta" data-r="seta"></span></div>
      <div class="abas">${ABAS.map(([id, rot]) => `<button class="aba" data-acao="aba" data-aba="${id}">${rot}</button>`).join('')}</div>
      <div class="corpo"><div class="fixo"></div><div class="vivo"></div></div>`;
    sombra.appendChild(ui.raiz);
    document.body.appendChild(ui.host);
    ui.abaRenderizada = null;
    for (const tipo of ['keydown', 'keyup', 'keypress']) ui.raiz.addEventListener(tipo, (ev) => ev.stopPropagation());
    ui.raiz.addEventListener('click', aoClicar);
    ui.raiz.addEventListener('change', aoMudar);
    const barra = ui.raiz.querySelector('.barra');
    barra.addEventListener('pointerdown', (ev) => {
      if (CELULAR || ev.button !== 0 || ev.target.closest('button')) return;
      const r = ui.raiz.getBoundingClientRect();
      ui.arraste = { x0: ev.clientX, y0: ev.clientY, l: r.left, t: r.top, moveu: false };
      barra.setPointerCapture?.(ev.pointerId);
    });
    barra.addEventListener('pointermove', (ev) => {
      const a = ui.arraste;
      if (!a) return;
      const dx = ev.clientX - a.x0;
      const dy = ev.clientY - a.y0;
      if (!a.moveu && Math.hypot(dx, dy) < 5) return;
      a.moveu = true;
      ui.pos = { x: a.l + dx, y: a.t + dy };
      aplicarPos();
    });
    barra.addEventListener('pointerup', () => {
      const a = ui.arraste;
      ui.arraste = null;
      if (a?.moveu) {
        ui.arrastou = true;
        salvarUi({ pos: ui.pos });
      }
    });
    barra.addEventListener('dblclick', () => {
      ui.pos = null;
      salvarUi({ pos: null });
      aplicarPos();
    });
    aplicarPos();
  };

  const aplicarPos = () => {
    if (!ui.raiz) return;
    const st = ui.raiz.style;
    if (!ui.pos || CELULAR) {
      st.left = st.top = st.transform = st.bottom = '';
      return;
    }
    const w = ui.raiz.offsetWidth || 400;
    const x = clamp(ui.pos.x, 0, Math.max(0, window.innerWidth - w));
    const y = clamp(ui.pos.y, 0, Math.max(0, window.innerHeight - 40));
    st.left = `${x}px`;
    st.top = `${y}px`;
    st.bottom = 'auto';
    st.transform = 'none';
  };

  const renderPrincipal = (forcarFixo = false) => {
    garantirEstilo();
    if (!ui.raiz || !ui.raiz.isConnected) montarRaiz();
    carregarEspecies();
    const contas = lerContas();
    const alertas = contarAlertas(contas);
    if (alertas > ui.alertasAntes && uiCfg().som) bip();
    ui.alertasAntes = alertas;
    const ativas = contas.filter(online);
    const ouroH = ativas.reduce((a, c) => a + (Number(c.rate?.gold) || 0), 0);
    const xpH = ativas.reduce((a, c) => a + (Number(c.rate?.xp) || 0), 0);
    ui.raiz.querySelector('[data-r=tot]').innerHTML = ui.aberto
      ? `<span><b>${contas.length}</b> ${contas.length === 1 ? 'conta' : 'contas'}</span><span><b>${curto(xpH)}</b> XP/h</span><span><b>${curto(ouroH)}</b> ouro/h</span>`
      : contas.map((c) => `<button class="mini" data-acao="abrirConta" data-nick="${esc(c.nick)}"><span class="ponto n${corDaConta(c)}"></span>${esc(c.nick)} <b>${curto(c.rate?.xp)}</b></button>`).join('');
    const nova = novaVersao();
    const verEl = ui.raiz.querySelector('[data-r=ver]');
    verEl.innerHTML = nova ? `v${esc(VERSAO)} <button class="novo" data-acao="atualizar">Nova versão ${esc(nova)}</button>` : `v${esc(VERSAO)}`;
    const estado = ui.raiz.querySelector('[data-r=estado]');
    estado.textContent = alertas ? `${alertas} ${alertas === 1 ? 'pendência' : 'pendências'}` : 'Tudo certo';
    estado.classList.toggle('ruim', alertas > 0);
    ui.raiz.querySelector('[data-r=seta]').textContent = ui.aberto ? 'minimizar' : 'abrir';
    const abas = ui.raiz.querySelector('.abas');
    const corpo = ui.raiz.querySelector('.corpo');
    ui.raiz.classList.toggle('compacto', !ui.aberto);
    abas.style.display = ui.aberto ? 'flex' : 'none';
    corpo.style.display = ui.aberto ? 'flex' : 'none';
    if (!ui.aberto) return;
    for (const b of abas.querySelectorAll('.aba')) b.classList.toggle('on', b.dataset.aba === ui.aba);
    const fixo = corpo.querySelector('.fixo');
    const vivo = corpo.querySelector('.vivo');
    if (forcarFixo || ui.abaRenderizada !== ui.aba) {
      fixo.innerHTML = ui.aba === 'hunts' ? htmlHuntsFixo() : ui.aba === 'ajustes' ? htmlAjustesFixo(contas) : '';
      ui.abaRenderizada = ui.aba;
    }
    const foco = ui.host?.shadowRoot?.activeElement;
    if (foco && vivo.contains(foco) && /^(INPUT|SELECT)$/.test(foco.tagName)) return;
    const rolagem = corpo.scrollTop;
    vivo.innerHTML = ui.aba === 'geral' ? htmlGeral(contas) : ui.aba === 'hunts' ? htmlHuntsVivo(contas) : ui.aba === 'shiny' ? htmlShiny(contas) : ui.aba === 'mercado' ? htmlMercadoVivo(contas) : '';
    corpo.scrollTop = rolagem;
  };

  const aoClicar = (ev) => {
    const el = ev.target.closest('[data-acao]');
    if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'LABEL') return;
    ev.stopPropagation();
    const acao = el.dataset.acao;
    const nick = el.dataset.nick;
    let fixo = false;
    if (acao === 'toggle') {
      if (ui.arrastou) {
        ui.arrastou = false;
        return;
      }
      ui.aberto = !ui.aberto;
      salvarUi({ aberto: ui.aberto });
    } else if (acao === 'aba') {
      ui.aba = el.dataset.aba;
      salvarUi({ aba: ui.aba });
    } else if (acao === 'expandir') {
      if (ui.expandidas.has(nick)) ui.expandidas.delete(nick);
      else ui.expandidas.add(nick);
    } else if (acao === 'comprar') {
      const chave = el.dataset.chave;
      if (ui.pendente?.chave === chave && ui.pendente.ate > Date.now()) {
        const [n, item, qtd] = chave.split('|');
        const [kind, id] = item.split(':');
        enviarCmd(n, { tipo: 'buy', kind, itemId: Number(id), qty: Number(qtd) });
        ui.pendente = null;
      } else {
        ui.pendente = { chave, ate: Date.now() + 5000 };
      }
    } else if (acao === 'meta') {
      const hc = lerHuntCfg();
      hc.metas[nick] = el.dataset.meta;
      gmSet(K.hunt, { metas: hc.metas, auto: hc.auto, seg: hc.seg });
      fixo = ui.aba === 'ajustes';
    } else if (acao === 'irHunt') {
      enviarCmd(nick, { tipo: 'hunt', slug: el.dataset.slug });
    } else if (acao === 'cancelarHunt') {
      enviarCmd(nick, { tipo: 'cancelarHunt' });
    } else if (acao === 'topHunts') {
      if (ui.topHunts.has(nick)) ui.topHunts.delete(nick);
      else ui.topHunts.add(nick);
    } else if (acao === 'abrirConta') {
      ui.aberto = true;
      ui.aba = 'geral';
      ui.expandidas.add(nick);
      salvarUi({ aberto: true, aba: 'geral' });
    } else if (acao === 'auto') {
      const hc = lerHuntCfg();
      hc.auto[nick] = !hc.auto[nick];
      gmSet(K.hunt, { metas: hc.metas, auto: hc.auto, seg: hc.seg });
    } else if (acao === 'segAbrir') {
      if (ui.segAberta.has(nick)) ui.segAberta.delete(nick);
      else ui.segAberta.add(nick);
    } else if (acao === 'selShiny') {
      ui.contaShiny = nick;
    } else if (acao === 'repAbrir') {
      ui.repAberta = ui.repAberta === nick ? null : nick;
      fixo = true;
    } else if (acao === 'atualizar') {
      window.open(`${URL_SCRIPT}?v=${encodeURIComponent(novaVersao() ?? Date.now())}`, '_blank');
      return;
    } else if (acao === 'checarVersao') {
      checarAtualizacao(true);
      const m = ui.raiz.querySelector('[data-r=vermsg]');
      if (m) m.textContent = 'Procurando…';
      return;
    } else if (acao === 'ajConta') {
      ui.ajConta = nick;
      fixo = true;
    } else if (acao === 'irAjustes') {
      ui.aba = 'ajustes';
      ui.ajConta = nick;
      salvarUi({ aba: 'ajustes' });
      fixo = true;
    } else if (acao === 'mercAbrir') {
      ui.mercAberta = ui.mercAberta === nick ? null : nick;
      fixo = true;
    } else if (acao === 'mercPrecos') {
      enviarCmd(nick, { tipo: 'mercPrecos' });
      setTimeout(() => renderPrincipal(true), 4000);
    } else if (acao === 'salvarMerc') {
      salvarMerc(nick);
      return;
    } else if (acao === 'salvarcfg') {
      salvarConfig(nick);
      return;
    } else if (acao === 'copiarReg') {
      const dados = gmGet(`pc.reg.${nick}`, []) ?? [];
      const txt = JSON.stringify(dados, null, 1);
      const msg = ui.raiz.querySelector('[data-r=regmsg]');
      const ok = () => { if (msg) msg.textContent = `Copiado (${dados.length} mensagens). Cole na conversa.`; };
      try {
        navigator.clipboard.writeText(txt).then(ok, () => {
          const ta = document.createElement('textarea');
          ta.value = txt;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          ok();
        });
      } catch {}
      return;
    } else if (acao === 'limpar') {
      for (const s of lerContas()) if (Date.now() - s.ts > 10 * 60000) gmDel(K.st(s.nick));
      fixo = true;
    }
    renderPrincipal(fixo);
  };

  const aoMudar = (ev) => {
    const el = ev.target;
    if (el.dataset.seg) {
      const hc = lerHuntCfg();
      const nick = el.dataset.nick;
      const atual = segDe(hc, nick);
      const v = Number(el.value);
      const campo = el.dataset.seg;
      if (campo === 'ttkMax') atual.ttkMax = clamp(Math.round(v) || 8, 1, 120);
      if (campo === 'fraqMax') atual.fraqMax = [1, 2, 4, 99].includes(v) ? v : 1;
      if (campo === 'margem') atual.margem = clamp(Math.round(v) || 0, 0, 500);
      if (campo === 'comprovada') atual.comprovada = el.checked;
      if (campo === 'riscoMax') atual.riscoMax = clamp(Math.round(v) || 20, 5, 100);
      gmSet(K.hunt, { metas: hc.metas, auto: hc.auto, seg: { ...hc.seg, [nick]: { ttkMax: atual.ttkMax, fraqMax: atual.fraqMax, margem: atual.margem, comprovada: atual.comprovada, riscoMax: atual.riscoMax } } });
      renderPrincipal();
    } else if (el.dataset.acao === 'autoChk') {
      const hc = lerHuntCfg();
      hc.auto[el.dataset.nick] = el.checked;
      gmSet(K.hunt, { metas: hc.metas, auto: hc.auto, seg: hc.seg });
      renderPrincipal();
    } else if (el.dataset.acao === 'som') {
      salvarUi({ som: el.checked });
    }
  };

  const renderChip = () => {
    garantirEstilo();
    document.getElementById('pc-host')?.remove();
    ui.raiz = null;
    ui.host = null;
    let chip = document.getElementById('pc-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'pc-chip';
      document.body.appendChild(chip);
      chip.addEventListener('click', (ev) => {
        if (ev.target.closest('button') && ag.nick) {
          gmSet(K.main, ag.nick);
          tique();
        }
      });
    }
    const main = gmGet(K.main, null);
    const st = main ? gmGet(K.st(main), null) : null;
    const semSinal = !st || Date.now() - st.ts > OFFLINE_MS;
    const tr = ag.troca ? ` · 🗺️ indo para ${ag.troca.nome}` : '';
    const txt = `🛰️ Central ${VERSAO} · ${ag.nick ?? 'conectando…'}${tr} · painel em: ${main ?? '—'}${semSinal && main ? ' (sem sinal)' : ''} · registro: ${reg.itens.length}`;
    if (chip.dataset.txt !== txt) {
      chip.dataset.txt = txt;
      chip.innerHTML = `${esc(txt)}${ag.nick ? '<button type="button">Mostrar painel aqui</button>' : ''}`;
    }
  };

  const tique = () => {
    if (!document.body) return;
    conferirVersaoDoJogo();
    avaliarReposicao();
    try {
      cicloMercado();
    } catch {}
    publicar();
    if (ag.nick && gmGet(K.main, null) === ag.nick) {
      try {
        autoTrocar(lerContas());
      } catch {}
      try {
        checarAtualizacao();
      } catch {}
      renderPrincipal();
    }
    else renderChip();
  };

  if (document.readyState !== 'loading') reconectarSeJaAberto();
  gmOuvir(K.main, () => tique());
  setInterval(tique, 2000);
  setInterval(processarTroca, 500);
})();
