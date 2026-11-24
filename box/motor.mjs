const ORIGEM = process.env.POKEBOX_ASSETS || 'https://pokeidle.io';
const MS_ONDA = 2600;
const MAX_MOBS = 16;
const MS_ENTRE_ALVOS = 2600;
const MEDIR_MIN_MS = 10 * 60000;
const DIAGONAL = { FIRE: 0.5, WATER: 0.5, ELECTRIC: 0.5, GRASS: 0.5, ICE: 0.5, POISON: 0.5, PSYCHIC: 0.5, DARK: 0.5, STEEL: 0.5, GHOST: 2, DRAGON: 2 };
export const NOMES_TIPO = {
  NORMAL: 'Normal', FIRE: 'Fogo', WATER: 'Água', GRASS: 'Planta', ELECTRIC: 'Elétrico', ICE: 'Gelo', FIGHTING: 'Lutador',
  POISON: 'Veneno', GROUND: 'Terra', FLYING: 'Voador', PSYCHIC: 'Psíquico', BUG: 'Inseto', ROCK: 'Pedra', GHOST: 'Fantasma',
  DRAGON: 'Dragão', DARK: 'Sombrio', STEEL: 'Aço', FAIRY: 'Fada',
};

export const SEG_PADRAO = { ttkMax: 8, fraqMax: 2, margem: 20, comprovada: true, riscoMax: 20 };
export const AUTO = { espera: 30 * 60000, conferir: 20 * 60000, minNaHunt: 5 * 60000, ganhoMin: 0.2, bloqueio: 6 * 3600000, minAbates: 40, tolerancia: 0.85, pausaManual: 2 * 3600000 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const mediana = (arr) => {
  const v = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
export const empurrar = (arr, v, max) => {
  arr.push(v);
  if (arr.length > max) arr.splice(0, arr.length - max);
};
const XP_ANCORA = 0.6 * 150 ** 2;
const xpDoNivel = (n) => (n <= 150 ? Math.floor((6 * n * n) / 10) + 8 : Math.round(XP_ANCORA * (n / 150) ** 1.25));
const EXP_OURO = Math.log(6000 / 36) / Math.log(5000);
const TETO_OURO = Math.round(36 * 25000 ** EXP_OURO);
const ouroKill = (n) => Math.min(TETO_OURO, Math.max(1, Math.round(36 * Math.max(1, Number(n) || 1) ** EXP_OURO)));
const ouroPorDerrota = (n) => {
  const nn = Math.max(1, Number(n) || 1);
  return Math.round((nn <= 25000 ? ouroKill(nn) : TETO_OURO * (nn / 25000) ** 0.3) * 1.15);
};
const hpPadrao = (base, nivel) => Math.floor((2 * base * nivel) / 100) + nivel + 10;
const defPadrao = (base, nivel) => Math.floor((2 * base * nivel) / 100) + 5;
const multTipo = (atq, def, linha) => (def === atq ? (DIAGONAL[atq] ?? 1) : (linha?.[def] ?? 1));
const efetividade = (atq, d1, d2, tabela) => {
  const a = String(atq).toUpperCase();
  const linha = tabela?.[a] ?? {};
  let v = multTipo(a, String(d1).toUpperCase(), linha);
  if (d2 && d2 !== d1) v *= multTipo(a, String(d2).toUpperCase(), linha);
  return v;
};
const ampliar = (v, a = 1.5) => (v > 1 ? 1 + (v - 1) * a : v < 1 && v > 0 ? v / a : v);
const espId = (sp) => Number(sp?.pokeId ?? sp?.id);

export const especies = { mapa: null, porNome: null, carregando: false, erro: null };
export const carregarEspecies = async () => {
  if (especies.mapa || especies.carregando) return;
  especies.carregando = true;
  const lista = [];
  for (const arq of ['creatures.json', 'creatures-novos.json', 'creatures-outland-novos.json', 'creatures-formas.json']) {
    try {
      const r = await fetch(`${ORIGEM}/assets/${arq}`, { headers: { 'User-Agent': 'Mozilla/5.0 PokeBox' } });
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.creatures ?? j.lista ?? Object.values(j).find(Array.isArray) ?? []);
      if (Array.isArray(arr)) lista.push(...arr);
    } catch {}
  }
  const mapa = new Map();
  const porNome = new Map();
  for (const c of lista) {
    const id = Number(c?.pokeId);
    if (!id || mapa.has(id)) continue;
    const e = { nome: c.name, hp: Number(c.baseHp) || 50, def: Number(c.baseDef) || 50, spdef: Number(c.baseSpDef) || 50, t1: c.type1 ? String(c.type1).toUpperCase() : null, t2: c.type2 ? String(c.type2).toUpperCase() : null };
    mapa.set(id, e);
    if (c.name) porNome.set(String(c.name).toLowerCase(), e);
  }
  especies.carregando = false;
  if (mapa.size) {
    especies.mapa = mapa;
    especies.porNome = porNome;
  } else {
    especies.erro = 'não consegui baixar as espécies do jogo';
    setTimeout(() => {
      especies.erro = null;
    }, 60000);
  }
};

export const novaInteligencia = (salvo = {}) => ({
  golpes: [],
  intervalos: [],
  xpMult: [],
  ouroMult: [],
  tomados: [],
  ultimoGolpeJog: 0,
  acc: null,
  hist: { medidas: { ...(salvo.medidas ?? {}) }, perigo: { ...(salvo.perigo ?? {}) }, fraqObs: { ...(salvo.fraqObs ?? {}) } },
  auto: { log: [...(salvo.autoLog ?? [])], bloq: { ...(salvo.autoBloq ?? {}) } },
  pausaManualAte: Number(salvo.pausaManualAte) || 0,
  estavaNoCentro: null,
});

const huntDe = (conta, slug) => conta.hunts.find((h) => h.slug === slug);
const ativoDe = (conta) => (conta.estado.pokemons ?? []).find((p) => p.id === conta.estado.activeId) ?? null;

export const aoEvento = (conta, e) => {
  const ia = conta.ia;
  const agora = Date.now();
  if (e.k === 'ataque') {
    const h = huntDe(conta, conta.estado.huntSlug);
    const unica = h?.especies?.length === 1 ? espId(h.especies[0]) : null;
    const mob = conta.mobs.get(e.slot);
    const nv = Number(mob?.nv ?? h?.nivel) || 0;
    if (e.por === 'jogador') {
      const gap = agora - ia.ultimoGolpeJog;
      if (gap > 200 && gap < 10000) empurrar(ia.intervalos, gap, 80);
      ia.ultimoGolpeJog = agora;
      if ((mob?.nome || unica) && nv > 0 && Number(e.dano) > 0 && !mob?.trein && !mob?.bon) empurrar(ia.golpes, { nome: mob?.nome ?? null, id: mob?.nome ? null : unica, nv, mhp: Number(mob?.mhp) || 0, dano: Number(e.dano), ef: Number(e.ef) || 1 }, 200);
    } else if (e.por === 'selvagem' && Number(e.dano) > 0) {
      const chave = mob?.nome ?? (unica ? `#${unica}` : null);
      const ef = Number(e.ef) || 1;
      if (nv > 0) empurrar(ia.tomados, { nv, dano: Number(e.dano), ef }, 200);
      if (chave) {
        const antes = ia.hist.fraqObs[chave];
        if (!antes || ef > antes.ef || agora - antes.t > 3 * 86400000) ia.hist.fraqObs[chave] = { ef, t: agora };
      }
    }
  } else if (e.k === 'morte' && e.quem === 'selvagem') {
    const xp = Number(e.xpTreinador ?? e.xp) || 0;
    const ouro = Number(e.ouro) || 0;
    const nv = Number(conta.mobs.get(e.slot)?.nv ?? huntDe(conta, conta.estado.huntSlug)?.nivel) || 0;
    if (nv > 0 && xp > 0) empurrar(ia.xpMult, xp / xpDoNivel(nv), 60);
    if (nv > 0 && ouro > 0) empurrar(ia.ouroMult, ouro / ouroPorDerrota(nv), 60);
    if (ia.acc) {
      ia.acc.kills += 1;
      ia.acc.xp += xp;
      ia.acc.ouro += ouro;
    }
  }
};

export const aoCampo = (conta, m) => {
  for (const b of m.mobs ?? []) {
    if (b?.s === undefined) continue;
    const e = conta.mobs.get(b.s) ?? {};
    if (b.n !== undefined) e.nome = b.n;
    if (b.nv !== undefined) e.nv = b.nv;
    if (b.mhp !== undefined) e.mhp = b.mhp;
    if (b.tr !== undefined) e.trein = !!b.tr;
    if (b.bn !== undefined) e.bon = !!b.bn;
    conta.mobs.set(b.s, e);
  }
  for (const s of m.fora ?? []) conta.mobs.delete(s);
};

export const acompanhar = (conta) => {
  const ia = conta.ia;
  const est = conta.estado;
  const slug = est.huntSlug && !est.noCentro && !est.safari?.dentro && !est.boss?.arena ? est.huntSlug : null;
  const noCentro = !!est.noCentro;
  if (ia.estavaNoCentro === false && noCentro && Date.now() - conta.ultimoCombate < 15000 && ia.acc?.slug && !conta.troca) {
    ia.hist.perigo[ia.acc.slug] = { nivelPok: ativoDe(conta)?.level ?? 0, t: Date.now() };
    conta.evento(`A conta caiu em ${huntDe(conta, ia.acc.slug)?.nome ?? ia.acc.slug}; essa hunt fica de fora por um tempo`, 'erro');
  }
  ia.estavaNoCentro = noCentro;
  if (ia.acc?.slug === slug) return;
  if (ia.acc) {
    const dur = Date.now() - ia.acc.t0;
    if (dur >= MEDIR_MIN_MS && ia.acc.kills > 0) {
      const f = 3600000 / dur;
      ia.hist.medidas[ia.acc.slug] = { xpH: ia.acc.xp * f, ouroH: ia.acc.ouro * f, killsH: ia.acc.kills * f, nivelPok: ia.acc.nivelPok, ts: Date.now() };
    }
  }
  ia.acc = slug ? { slug, t0: Date.now(), xp: 0, ouro: 0, kills: 0, nivelPok: ativoDe(conta)?.level ?? 0 } : null;
};

const valorMedido = (conta, meta) => {
  const a = conta.ia.acc;
  if (!a || a.slug !== conta.estado.huntSlug) return null;
  const dur = Date.now() - a.t0;
  if (dur < 5 * 60000) return null;
  return ((meta === 'ouro' ? a.ouro : a.xp) * 3600000) / dur;
};

export const recomendar = (conta, cfgHunt) => {
  const meta = cfgHunt.meta ?? 'off';
  const seg = { ...SEG_PADRAO, ...(cfgHunt.seg ?? {}) };
  const ia = conta.ia;
  const est = conta.estado;
  if (!especies.mapa) return { meta, erro: especies.erro ?? 'baixando os dados das espécies…' };
  const ativo = ativoDe(conta);
  if (!ativo?.tipos?.length) return { meta, erro: 'sem dados do Pokémon ativo' };
  const tabela = conta.tabelaTipos ?? {};
  const amp = conta.ampliacao ?? 1.5;
  const nossos = ativo.tipos;
  const intervalo = clamp(mediana(ia.intervalos) ?? 900, 400, 6000) / 1000;
  const xpMult = mediana(ia.xpMult) ?? 1;
  const ouroMult = mediana(ia.ouroMult) ?? 1;
  let kHp = conta.multHp ?? 5;
  let forca = null;
  let fonte = null;
  const hAtual = huntDe(conta, est.huntSlug);
  const espPrincipal = hAtual?.especies?.length ? [...hAtual.especies].sort((a, b) => b.pontos - a.pontos)[0] : null;
  const achar = (g) => (g.nome ? especies.porNome.get(String(g.nome).toLowerCase()) : null) ?? (g.id ? especies.mapa.get(Number(g.id)) : null) ?? (espPrincipal ? especies.mapa.get(espId(espPrincipal)) : null);
  if (ia.golpes.length >= 12) {
    kHp = mediana(ia.golpes.map((g) => {
      const e = achar(g);
      return e && g.mhp > 0 ? g.mhp / hpPadrao(e.hp, g.nv) : NaN;
    })) ?? kHp;
    forca = mediana(ia.golpes.map((g) => {
      const e = achar(g);
      return e ? (g.dano / Math.max(0.05, g.ef || 1)) * ((defPadrao(e.def, g.nv) + defPadrao(e.spdef, g.nv)) / 2) : NaN;
    }));
    if (forca) fonte = 'golpes';
  }
  const ttkCom = (h, f) => {
    let pontos = 0;
    let soma = 0;
    for (const sp of h.especies ?? []) {
      const e = especies.mapa.get(espId(sp));
      if (!e) return NaN;
      const ef = Math.max(...nossos.map((t) => ampliar(efetividade(t, e.t1, e.t2, tabela), amp)), 0);
      const dano = ef > 0 ? (f * ef) / ((defPadrao(e.def, h.nivel) + defPadrao(e.spdef, h.nivel)) / 2) : 0;
      if (!(dano > 0)) return Infinity;
      soma += ((kHp * hpPadrao(e.hp, h.nivel)) / dano) * intervalo * sp.pontos;
      pontos += sp.pontos;
    }
    return pontos ? soma / pontos : NaN;
  };
  if (!forca && hAtual && ia.acc?.slug === hAtual.slug && ia.acc.kills >= 5 && Date.now() - ia.acc.t0 > 60000 && !est.noCentro) {
    const killsH = (ia.acc.kills * 3600000) / (Date.now() - ia.acc.t0);
    const porOnda = Math.min(MAX_MOBS, (hAtual.especies ?? []).reduce((a, x) => a + (x.pontos || 0), 0)) || 1;
    const alvo = 3600 / killsH - MS_ENTRE_ALVOS / 1000 - MS_ONDA / 1000 / porOnda;
    const ref = ttkCom(hAtual, 1000);
    if (Number.isFinite(ref) && ref > 0) {
      forca = (1000 * ref) / Math.max(alvo, intervalo);
      fonte = 'ritmo';
    }
  }
  if (!forca) return { meta, erro: 'aprendendo com a luta atual (precisa de 1 a 2 min na hunt)' };
  const recebido = mediana(ia.tomados.slice(-80).map((x) => x.dano / Math.max(0.05, x.ef) / x.nv));
  const lista = [];
  for (const h of conta.hunts) {
    if (!h.especies?.length || Number(est.level) < h.nivel) continue;
    let pontos = 0;
    let ttkPond = 0;
    let ttkPior = 0;
    let fraqPior = 0;
    let fraqTipo = null;
    let ok = true;
    for (const sp of h.especies) {
      const e = especies.mapa.get(espId(sp));
      if (!e) {
        ok = false;
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
          fraqTipo = NOMES_TIPO[t] ?? t;
        }
      }
      const obs = ia.hist.fraqObs[e.nome] ?? ia.hist.fraqObs[`#${espId(sp)}`];
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
    if (!ok || !pontos) continue;
    const ttkMedio = ttkPond / pontos;
    const porOnda = Math.min(MAX_MOBS, pontos);
    const killsH = Number.isFinite(ttkMedio) ? (porOnda / (porOnda * (ttkMedio + MS_ENTRE_ALVOS / 1000) + MS_ONDA / 1000)) * 3600 : 0;
    let xpH = killsH * xpDoNivel(h.nivel) * xpMult;
    let ouroH = killsH * ouroPorDerrota(h.nivel) * ouroMult;
    const med = ia.hist.medidas[h.slug];
    const medida = !!med && Math.abs((med.nivelPok ?? 0) - ativo.level) <= 10 && Date.now() - med.ts < 3 * 86400000;
    if (medida) {
      xpH = med.xpH;
      ouroH = med.ouroH;
    }
    const perigo = ia.hist.perigo[h.slug];
    const perigosa = !!perigo && (perigo.nivelPok ?? 0) >= ativo.level - 4 && Date.now() - perigo.t < 3 * 86400000;
    const maxHp = Number(ativo.maxHp) || 0;
    const risco = recebido && ia.tomados.length >= 8 && maxHp > 0 ? (recebido * h.nivel * ampliar(Math.max(fraqPior, 1), amp)) / maxHp : null;
    lista.push({ slug: h.slug, nome: h.nome, nivel: h.nivel, ttkMedio, ttkPior, fraqPior, fraqTipo, xpH, ouroH, medida, perigosa, risco });
  }
  const atualBruta = lista.find((x) => x.slug === est.huntSlug) ?? null;
  const naHunt = ia.acc?.slug === est.huntSlug ? Date.now() - ia.acc.t0 : 0;
  const prova = seg.comprovada && atualBruta && !atualBruta.perigosa && !est.noCentro && naHunt > 10 * 60000 ? atualBruta : null;
  const limTtk = Math.max(seg.ttkMax, prova && Number.isFinite(prova.ttkPior) ? prova.ttkPior * 1.1 : 0);
  const limFraq = seg.fraqMax >= 99 ? Infinity : Math.max(seg.fraqMax, prova ? prova.fraqPior : 0);
  for (const x of lista) {
    x.motivos = [];
    if (!(x.ttkPior <= limTtk)) x.motivos.push(Number.isFinite(x.ttkPior) ? `levaria ${x.ttkPior.toFixed(1)} s por selvagem` : 'não causa dano');
    if (x.fraqPior > limFraq) x.motivos.push(`fraco ×${x.fraqPior} contra ${x.fraqTipo}`);
    if (x.perigosa) x.motivos.push('a conta já caiu aqui');
    if (x.risco != null && x.risco > seg.riscoMax / 100 && !(prova && x.slug === prova.slug)) x.motivos.push(`cada golpe tiraria ~${Math.round(x.risco * 100)}% da vida`);
    x.seguro = x.motivos.length === 0;
  }
  const valor = (x) => (meta === 'ouro' ? x.ouroH : x.xpH);
  const seguras = lista.filter((x) => x.seguro).sort((a, b) => valor(b) - valor(a));
  const atual = atualBruta;
  const melhor = seguras[0] ?? null;
  const ganho = melhor && atual && valor(atual) > 0 ? valor(melhor) / valor(atual) - 1 : null;
  const sugerir = meta !== 'off' && !!melhor && melhor.slug !== est.huntSlug && (ganho == null || ganho >= seg.margem / 100);
  const enxuto = (x) => x && { slug: x.slug, nome: x.nome, nivel: x.nivel, valor: Math.round(valor(x)), xpH: Math.round(x.xpH), ouroH: Math.round(x.ouroH), ttk: Number.isFinite(x.ttkMedio) ? Math.round(x.ttkMedio * 10) / 10 : null, fraq: x.fraqPior, risco: x.risco != null ? Math.round(x.risco * 100) : null, medida: x.medida, motivos: x.motivos };
  return {
    meta,
    fonte,
    atual: enxuto(atual),
    melhor: enxuto(melhor),
    ganho: ganho == null ? null : Math.round(ganho * 100),
    sugerir,
    opcoes: seguras.slice(0, 6).map(enxuto),
    barradas: lista.filter((x) => !x.seguro).sort((a, b) => valor(b) - valor(a)).slice(0, 3).map(enxuto),
    _valorAtualMedido: valorMedido(conta, meta),
  };
};

export const cicloAuto = (conta, cfgHunt) => {
  const ia = conta.ia;
  const meta = cfgHunt.meta ?? 'off';
  if (cfgHunt.modo !== 'auto' || meta === 'off' || conta.status !== 'online' || conta.troca || conta.estado.noCentro) return;
  if (ia.pausaManualAte > Date.now()) return;
  const agora = Date.now();
  const reg = ia.auto;
  const ult = reg.log[reg.log.length - 1] ?? null;
  const est = conta.estado;
  if (ult && !ult.conferido && ult.para === est.huntSlug && ia.acc?.slug === ult.para && agora - ia.acc.t0 >= AUTO.conferir && ia.acc.kills >= AUTO.minAbates) {
    const medido = valorMedido(conta, ult.meta);
    ult.conferido = true;
    ult.medido = medido;
    if (medido != null && ult.antesMedido && ult.antes > 0 && medido < ult.antes * AUTO.tolerancia && ult.de) {
      reg.bloq[ult.para] = agora;
      reg.log.push({ t: agora, de: ult.para, para: ult.de, meta, conferido: true, motivo: 'voltou: rendeu menos que a anterior' });
      conta.evento(`Automático: ${huntDe(conta, ult.para)?.nome ?? ult.para} rendeu menos; voltando`, 'erro');
      conta.iniciarTroca(ult.de);
    }
    return;
  }
  if (ult?.para === est.huntSlug && ult.de && !ult.caiu && ia.hist.perigo[est.huntSlug] && agora - ia.hist.perigo[est.huntSlug].t < 10 * 60000) {
    ult.caiu = true;
    reg.bloq[est.huntSlug] = agora;
    reg.log.push({ t: agora, de: est.huntSlug, para: ult.de, meta, conferido: true, motivo: 'voltou: a conta caiu' });
    conta.iniciarTroca(ult.de);
    return;
  }
  if (ult && agora - ult.t < AUTO.espera) return;
  const naHunt = ia.acc?.slug === est.huntSlug ? agora - ia.acc.t0 : 0;
  if (naHunt < AUTO.minNaHunt) return;
  const r = recomendar(conta, cfgHunt);
  if (r.erro || !r.sugerir || !r.melhor) return;
  if (reg.bloq[r.melhor.slug] && agora - reg.bloq[r.melhor.slug] < AUTO.bloqueio) return;
  const seg = { ...SEG_PADRAO, ...(cfgHunt.seg ?? {}) };
  if (r.ganho == null || r.ganho < Math.max(AUTO.ganhoMin * 100, seg.margem)) return;
  const antesMed = r._valorAtualMedido;
  reg.log.push({ t: agora, de: est.huntSlug, para: r.melhor.slug, meta, antes: antesMed ?? r.atual?.valor ?? 0, antesMedido: antesMed != null, conferido: false, motivo: `${r.ganho}% a mais` });
  if (reg.log.length > 20) reg.log.splice(0, reg.log.length - 20);
  conta.evento(`Automático: indo para ${r.melhor.nome} (${r.ganho}% a mais de ${meta === 'ouro' ? 'ouro' : 'XP'})`, 'ok');
  conta.iniciarTroca(r.melhor.slug);
};

export const resumoAuto = (conta, cfgHunt) => {
  const ia = conta.ia;
  const ult = ia.auto.log[ia.auto.log.length - 1] ?? null;
  const agora = Date.now();
  const nomeDe = (slug) => huntDe(conta, slug)?.nome ?? slug;
  let proximo = null;
  if (ult) proximo = Math.max(0, AUTO.espera - (agora - ult.t));
  return {
    modo: cfgHunt.modo ?? 'manual',
    meta: cfgHunt.meta ?? 'off',
    seg: { ...SEG_PADRAO, ...(cfgHunt.seg ?? {}) },
    pausaManualAte: ia.pausaManualAte > agora ? ia.pausaManualAte : 0,
    ultima: ult ? { t: ult.t, de: nomeDe(ult.de), para: nomeDe(ult.para), motivo: ult.motivo, conferido: ult.conferido, medido: ult.medido ? Math.round(ult.medido) : null, antes: ult.antes ? Math.round(ult.antes) : null } : null,
    proximoEmMs: proximo,
    abatesNaHunt: ia.acc?.slug === conta.estado.huntSlug ? ia.acc.kills : 0,
  };
};

export const salvarInteligencia = (ia) => ({ medidas: ia.hist.medidas, perigo: ia.hist.perigo, fraqObs: ia.hist.fraqObs, autoLog: ia.auto.log, autoBloq: ia.auto.bloq, pausaManualAte: ia.pausaManualAte });
