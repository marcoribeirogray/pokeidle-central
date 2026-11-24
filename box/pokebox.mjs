import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { carregarEspecies, especies, novaInteligencia, aoEvento, aoCampo, acompanhar, recomendar, cicloAuto, resumoAuto, salvarInteligencia, AUTO } from './motor.mjs';

const VERSAO = '0.2.0';
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DADOS = process.env.POKEBOX_DADOS || path.join(process.env.HOME || AQUI, 'pokebox-dados');
const NOVAS = path.join(DADOS, 'novas');
const ARQ_CONTAS = path.join(DADOS, 'contas.json');
const ARQ_CFG = path.join(DADOS, 'config.json');
const ARQ_PID = path.join(DADOS, 'pokebox.pid');
const ARQ_IA = path.join(DADOS, 'inteligencia.json');
const PORTA = Number(process.env.POKEBOX_PORTA || 8377);
const URL_WS = process.env.POKEBOX_WS || 'wss://pokeidle.io';
const ORIGEM = 'https://pokeidle.io';
const MAX_CONTAS = 4;
const LIMITE_MEMORIA_MB = 200;

fs.mkdirSync(NOVAS, { recursive: true });

const lerJson = (arq, padrao) => {
  try {
    return JSON.parse(fs.readFileSync(arq, 'utf8'));
  } catch {
    return padrao;
  }
};
const gravarJson = (arq, dados) => {
  const tmp = `${arq}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, arq);
};

const outro = (() => {
  try {
    const pid = Number(fs.readFileSync(ARQ_PID, 'utf8'));
    if (pid && pid !== process.pid) {
      process.kill(pid, 0);
      return pid;
    }
  } catch {}
  return null;
})();
if (outro) {
  console.log(`Já existe um PokeBox rodando (pid ${outro}). Saindo para não derrubar as contas.`);
  process.exit(0);
}
fs.writeFileSync(ARQ_PID, String(process.pid));
const limparPid = () => {
  try {
    if (Number(fs.readFileSync(ARQ_PID, 'utf8')) === process.pid) fs.unlinkSync(ARQ_PID);
  } catch {}
};
process.on('exit', limparPid);
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => process.exit(0));

const iaSalva = lerJson(ARQ_IA, {});
const cfgPadrao = () => ({ contas: {} });
let cfg = { ...cfgPadrao(), ...lerJson(ARQ_CFG, {}) };
const salvarCfg = () => gravarJson(ARQ_CFG, cfg);
const cfgConta = (nick) => {
  cfg.contas[nick] ??= {};
  const c = cfg.contas[nick];
  c.reposicao ??= { ativo: false, reservaOuro: 0, regras: {} };
  c.mercado ??= { ativo: false, maxHora: 6, itens: {} };
  c.hunt ??= { modo: 'manual', meta: 'off', seg: {} };
  return c;
};

const num = (v) => Number(v) || 0;
const agora = () => Date.now();
const log = (nick, txt) => console.log(`${new Date().toISOString().slice(11, 19)} [${nick}] ${txt}`);

let catalogoItens = {};
const carregarCatalogo = async () => {
  try {
    const r = await fetch(`${process.env.POKEBOX_ASSETS || ORIGEM}/assets/items.json`, { headers: { 'User-Agent': 'Mozilla/5.0 PokeBox' } });
    const j = await r.json();
    for (const i of j.items ?? []) if (i?.id != null) catalogoItens[i.id] = { nome: i.name, cat: i.category, preco: num(i.npcPrice) };
  } catch (e) {
    console.log('Não consegui baixar a lista de itens agora:', e.message);
  }
};

class Conta {
  constructor(dados) {
    this.nick = dados.nick;
    this.token = dados.token;
    this.dispositivo = dados.dispositivo || crypto.randomUUID();
    this.pausada = !!dados.pausada;
    this.ws = null;
    this.estado = {};
    this.hunts = [];
    this.bolas = [];
    this.status = this.pausada ? 'pausada' : 'desligada';
    this.motivo = '';
    this.tentativas = 0;
    this.timerReconexao = null;
    this.timerPing = null;
    this.ultimaMsg = 0;
    this.ultimoCombate = 0;
    this.sessao = { desde: agora(), xp: 0, ouro: 0, abates: 0, capturas: 0, shinies: 0, drops: {} };
    this.troca = null;
    this.eventos = [];
    this.merc = { dados: null, ts: 0, pendente: null, ultimo: {}, trava: {}, porHora: [], ultimoCiclo: 0 };
    this.repo = { ultima: 0, gastoHora: [] };
    this.mobs = new Map();
    this.ia = novaInteligencia(iaSalva[this.nick]);
    this.tabelaTipos = null;
    this.ampliacao = 1.5;
    this.multHp = 5;
    this.rec = null;
    this.recEm = 0;
  }

  recomendacao() {
    const ch = cfgConta(this.nick).hunt;
    if (ch.meta === 'off' || this.status !== 'online') return null;
    if (!this.rec || Date.now() - this.recEm > 5000) {
      this.rec = recomendar(this, ch);
      this.recEm = Date.now();
    }
    return this.rec;
  }

  evento(txt, tipo = 'info') {
    this.eventos.push({ t: agora(), txt, tipo });
    if (this.eventos.length > 40) this.eventos.splice(0, this.eventos.length - 40);
    log(this.nick, txt);
  }

  dadosParaSalvar() {
    return { nick: this.nick, token: this.token, dispositivo: this.dispositivo, pausada: this.pausada };
  }

  conectar() {
    if (this.pausada) return;
    if (this.ws && this.ws.readyState <= 1) return;
    clearTimeout(this.timerReconexao);
    this.status = 'conectando';
    let ws;
    try {
      ws = new WebSocket(URL_WS, { headers: { Origin: ORIGEM, 'User-Agent': 'Mozilla/5.0 (Linux; Android 11) PokeBox' } });
    } catch (e) {
      this.agendar(`erro ao abrir conexão: ${e.message}`);
      return;
    }
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.enviar({ t: 'hello', nick: this.nick, token: this.token, delta: 1, dispositivo: this.dispositivo });
      clearInterval(this.timerPing);
      this.timerPing = setInterval(() => this.enviar({ t: 'ping' }), 25000);
    });
    ws.addEventListener('message', (ev) => {
      this.ultimaMsg = agora();
      let m;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      } catch {
        return;
      }
      try {
        this.receber(m);
      } catch (e) {
        log(this.nick, `erro ao tratar mensagem ${m?.t}: ${e.message}`);
      }
    });
    ws.addEventListener('close', (ev) => {
      clearInterval(this.timerPing);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pausada) return;
      this.agendar(`conexão fechada (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`);
    });
    ws.addEventListener('error', () => {});
  }

  agendar(motivo) {
    this.tentativas += 1;
    const espera = Math.min(300000, 5000 * 2 ** Math.min(this.tentativas - 1, 6));
    this.status = 'reconectando';
    this.motivo = `${motivo}; nova tentativa em ${Math.round(espera / 1000)} s`;
    this.evento(this.motivo, 'erro');
    clearTimeout(this.timerReconexao);
    this.timerReconexao = setTimeout(() => this.conectar(), espera);
  }

  pausar(motivo) {
    this.pausada = true;
    this.status = 'pausada';
    this.motivo = motivo;
    clearTimeout(this.timerReconexao);
    clearInterval(this.timerPing);
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {}
    this.evento(`Pausada: ${motivo}`, 'erro');
    salvarContas();
  }

  retomar() {
    this.pausada = false;
    this.tentativas = 0;
    this.motivo = '';
    this.evento('Retomada pelo painel');
    salvarContas();
    this.conectar();
  }

  enviar(obj) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  mesclarEstado(e) {
    if (!e || typeof e !== 'object') return;
    for (const [k, v] of Object.entries(e)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && this.estado[k] && typeof this.estado[k] === 'object' && !Array.isArray(this.estado[k])) {
        this.estado[k] = { ...this.estado[k], ...v };
      } else {
        this.estado[k] = v;
      }
    }
  }

  receber(m) {
    if (typeof m.token === 'string' && m.token.length >= 16 && m.token !== this.token && !['chat', 'chat.historico'].includes(m.t)) {
      this.token = m.token;
      salvarContas();
      this.evento('O jogo renovou o token; salvo');
    }
    switch (m.t) {
      case 'welcome':
        this.estado = {};
        this.mesclarEstado(m.estado);
        if (Array.isArray(m.hunts)) this.hunts = m.hunts;
        if (Array.isArray(m.catalogoBolas)) this.bolas = m.catalogoBolas;
        if (m.tabelaTipos) this.tabelaTipos = m.tabelaTipos;
        if (m.ampliacaoHunt) this.ampliacao = Number(m.ampliacaoHunt) || 1.5;
        if (m.multHpSelvagem) this.multHp = Number(m.multHpSelvagem) || 5;
        this.mobs.clear();
        this.status = 'online';
        this.motivo = '';
        this.tentativas = 0;
        this.evento(`Conectada: treinador Nv ${num(this.estado.level)}, ${this.nomeHunt(this.estado.huntSlug)}`, 'ok');
        break;
      case 'estado':
        this.mesclarEstado(m.estado ?? m);
        break;
      case 'batalha':
        for (const e of m.ev ?? []) {
          this.eventoBatalha(e);
          try {
            aoEvento(this, e);
          } catch {}
        }
        break;
      case 'campo.init':
        this.mobs.clear();
        aoCampo(this, m);
        break;
      case 'campo':
        aoCampo(this, m);
        break;
      case 'market':
        if (m.aba === 'itens') {
          this.merc.dados = { resumo: m.resumo ?? {}, medias: m.medias ?? {} };
          this.merc.ts = agora();
        }
        break;
      case 'erro': {
        const chave = String(m.chave ?? m.msg ?? 'erro');
        if (/sess|token|auth|login|tomad|outro.?disp|duplic/i.test(chave)) this.pausar(`o jogo recusou a sessão (${chave}). Se você abriu a conta em outro lugar, feche lá e clique em Retomar`);
        else this.evento(`Servidor: ${chave}`, 'erro');
        if (chave.startsWith('market.') && this.merc.pendente) {
          this.merc.trava[this.merc.pendente.id] = agora();
          this.merc.pendente = null;
        }
        break;
      }
      default:
        if (/tomad|kick|desconect|sessao\.?(outra|encerr)/i.test(String(m.t))) this.pausar(`sessão encerrada pelo jogo (${m.t}). A conta provavelmente foi aberta em outro lugar`);
    }
  }

  eventoBatalha(e) {
    if (e.k === 'ataque') this.ultimoCombate = agora();
    else if (e.k === 'morte' && e.quem === 'selvagem') {
      this.ultimoCombate = agora();
      this.sessao.abates += 1;
      this.sessao.xp += num(e.xpTreinador ?? e.xp);
      this.sessao.ouro += num(e.ouro);
      for (const d of e.drops ?? []) {
        const id = d?.itemId ?? d?.id ?? d;
        const q = num(d?.qtd ?? d?.quantidade ?? 1) || 1;
        if (id != null) this.sessao.drops[id] = (this.sessao.drops[id] ?? 0) + q;
      }
    } else if (e.k === 'capturado' || (e.k === 'bola' && e.sucesso)) {
      this.sessao.capturas += 1;
      if (e.shiny) {
        this.sessao.shinies += 1;
        this.evento('Capturou um shiny!', 'ok');
      }
    } else if (e.k === 'hunt') {
      if (this.troca) this.concluirTroca('ok');
    } else if (e.k === 'aviso') {
      const msg = String(e.msg ?? '');
      if (msg === 'market.travaItemAberto' && this.merc.pendente) this.evento(`${this.nomeItem(this.merc.pendente.id)}: anúncio aceito, retido 2 min`, 'ok');
      else if (msg.startsWith('market.') && this.merc.pendente) {
        this.evento(`Mercado recusou: ${msg}`, 'erro');
        this.merc.trava[this.merc.pendente.id] = agora();
        this.merc.pendente = null;
      }
    }
  }

  nomeHunt(slug) {
    const h = this.hunts.find((x) => x.slug === slug);
    return h ? `${h.nome} Nv ${h.nivel}` : slug ?? 'sem hunt';
  }

  nomeItem(id) {
    return catalogoItens[id]?.nome ?? this.bolas.find((b) => b.id === Number(id))?.nome ?? `Item ${id}`;
  }

  iniciarTroca(slug) {
    const h = this.hunts.find((x) => x.slug === slug);
    if (!h) return 'hunt desconhecida';
    if (this.estado.huntSlug === slug) return 'já está nessa hunt';
    this.troca = { slug, nome: h.nome, desde: agora(), tentativas: 0, ultima: 0 };
    this.evento(`Indo para ${h.nome}: esperando uma pausa no combate`);
    return null;
  }

  concluirTroca(resultado) {
    if (!this.troca) return;
    this.evento(resultado === 'ok' ? `Trocou para ${this.troca.nome}` : `Não trocou para ${this.troca.nome}: ${resultado}`, resultado === 'ok' ? 'ok' : 'erro');
    this.troca = null;
  }

  processarTroca() {
    const t = this.troca;
    if (!t) return;
    if (this.estado.huntSlug === t.slug) return this.concluirTroca('ok');
    if (agora() - t.desde > 5 * 60000) return this.concluirTroca('desisti depois de 5 min');
    if (this.status !== 'online') return;
    const livre = agora() - this.ultimoCombate > 3200;
    if (livre && agora() - t.ultima > 2500) {
      t.tentativas += 1;
      t.ultima = agora();
      this.enviar({ t: 'hunt.select', slug: t.slug });
    }
  }

  comprar(kind, id, qty) {
    qty = Math.max(1, Math.min(9999, Math.floor(num(qty))));
    if (!this.enviar({ t: 'shop.buy', kind, id: Number(id), qty })) return 'conta offline';
    this.evento(`Comprou ${qty} ${this.nomeItem(id)}`);
    return null;
  }

  precoLoja(kind, id) {
    if (kind === 'ball') return num(this.bolas.find((b) => b.id === Number(id))?.priceGold);
    return num(catalogoItens[id]?.preco);
  }

  cicloReposicao() {
    const c = cfgConta(this.nick).reposicao;
    if (!c.ativo || this.status !== 'online' || agora() - this.repo.ultima < 20000) return;
    this.repo.gastoHora = this.repo.gastoHora.filter((x) => agora() - x.t < 3600000);
    for (const [chave, r] of Object.entries(c.regras)) {
      if (!r?.ativo) continue;
      const [kind, id] = chave.split(':');
      const tem = num(kind === 'ball' ? this.estado.balls?.[id] : this.estado.items?.[id]);
      if (tem >= num(r.min)) continue;
      const preco = this.precoLoja(kind, id);
      const lote = Math.max(1, num(r.lote) || 100);
      const custo = preco * lote;
      if (!preco || num(this.estado.gold) - custo < num(c.reservaOuro)) continue;
      const gasto = this.repo.gastoHora.reduce((a, x) => a + x.v, 0);
      if (num(c.tetoHora) > 0 && gasto + custo > num(c.tetoHora)) continue;
      if (!this.comprar(kind, id, lote)) {
        this.repo.ultima = agora();
        this.repo.gastoHora.push({ t: agora(), v: custo });
      }
      return;
    }
  }

  cicloMercado() {
    const c = cfgConta(this.nick).mercado;
    const mm = this.merc;
    if (!c.ativo || this.status !== 'online' || this.nick === cfg.main) return;
    const t = agora();
    if (mm.pendente && t - mm.pendente.t > 20000) {
      const qtd = num(this.estado.items?.[mm.pendente.id]);
      if (qtd <= mm.pendente.antes - mm.pendente.qtd) {
        mm.ultimo[mm.pendente.id] = t;
        this.evento(`Anunciou ${mm.pendente.qtd} ${this.nomeItem(mm.pendente.id)} a ${mm.pendente.preco} cada`, 'ok');
      } else {
        mm.trava[mm.pendente.id] = t;
        this.evento(`${this.nomeItem(mm.pendente.id)}: o anúncio não saiu da mochila; tento de novo em 3 min`, 'erro');
      }
      mm.pendente = null;
    }
    if (mm.pendente || t - mm.ultimoCiclo < 60000) return;
    mm.porHora = mm.porHora.filter((x) => t - x < 3600000);
    if (mm.porHora.length >= (num(c.maxHora) || 6)) return;
    const cand = Object.entries(c.itens)
      .filter(([, r]) => r?.ativo)
      .map(([id, r]) => ({ id: Number(id), r, tem: num(this.estado.items?.[id]) }))
      .map((x) => ({ ...x, vender: x.tem - num(x.r.guardar) }))
      .filter((x) => x.vender >= Math.max(5, num(x.r.acumular) || 20) && !(mm.trava[x.id] && t - mm.trava[x.id] < 180000) && !(mm.ultimo[x.id] && t - mm.ultimo[x.id] < 1800000))
      .sort((a, b) => b.vender - a.vender);
    if (!cand.length) {
      mm.ultimoCiclo = t;
      return;
    }
    if (!mm.dados || t - mm.ts > 90000) {
      if (!mm.pedido || t - mm.pedido > 10000) {
        mm.pedido = t;
        this.enviar({ t: 'market.itens' });
      }
      return;
    }
    mm.ultimoCiclo = t;
    const x = cand[0];
    const media = num(mm.dados.medias?.[x.id]?.gold?.media);
    const menor = num(mm.dados.resumo?.[x.id]?.minGold);
    let preco = x.r.modo === 'menor' ? (menor ? menor - 1 : media) : media || menor;
    preco = Math.max(Math.round(preco), num(x.r.minPreco), 2);
    if (!preco) {
      mm.trava[x.id] = t;
      return;
    }
    const qtd = Math.min(x.vender, 9999);
    this.evento(`Enviando anúncio: ${qtd} ${this.nomeItem(x.id)} a ${preco} cada`);
    this.enviar({ t: 'market.criar', tipo: 'item', itemId: x.id, casaId: null, bicicletaId: null, qtd, preco, moeda: 'gold', dias: null });
    mm.pendente = { id: x.id, qtd, preco, antes: x.tem, t };
    mm.porHora.push(t);
  }

  resumo() {
    const e = this.estado;
    const ativo = (e.pokemons ?? []).find((p) => p.id === e.activeId);
    const horas = Math.max((agora() - this.sessao.desde) / 3600000, 1 / 60);
    return {
      nick: this.nick,
      status: this.status,
      motivo: this.motivo,
      pausada: this.pausada,
      nivel: num(e.level),
      ouro: num(e.gold),
      noCentro: !!e.noCentro,
      pokemon: ativo ? { nome: ativo.nome, nivel: ativo.level, tipos: ativo.tipos } : null,
      hunt: e.huntSlug ? { slug: e.huntSlug, nome: this.nomeHunt(e.huntSlug) } : null,
      hunts: this.hunts.map((h) => ({ slug: h.slug, nome: h.nome, nivel: h.nivel })).sort((a, b) => a.nivel - b.nivel),
      troca: this.troca ? { nome: this.troca.nome, tentativas: this.troca.tentativas } : null,
      sessao: {
        ...this.sessao,
        xpH: Math.round(this.sessao.xp / horas),
        ouroH: Math.round(this.sessao.ouro / horas),
        drops: Object.entries(this.sessao.drops).map(([id, q]) => ({ id, nome: this.nomeItem(id), q })).sort((a, b) => b.q - a.q).slice(0, 12),
      },
      bolas: Object.entries(e.balls ?? {}).filter(([, q]) => num(q) > 0).map(([id, q]) => ({ id, nome: this.nomeItem(id), q: num(q), preco: this.precoLoja('ball', id) })),
      itens: Object.entries(e.items ?? {}).filter(([, q]) => num(q) > 0).map(([id, q]) => ({ id, nome: this.nomeItem(id), cat: catalogoItens[id]?.cat ?? '', q: num(q), preco: this.precoLoja('item', id) })),
      inteligencia: { recomendacao: this.recomendacao(), auto: resumoAuto(this, cfgConta(this.nick).hunt), especies: !!especies.mapa },
      catalogoBolas: this.bolas.filter((b) => b.compravel).map((b) => ({ id: b.id, nome: b.nome, preco: b.priceGold })),
      catalogoCura: Object.entries(catalogoItens).filter(([, i]) => (i.cat === 'heal' || i.cat === 'revive') && i.preco > 0).map(([id, i]) => ({ id, nome: i.nome, preco: i.preco })),
      precosMercado: this.merc.dados ? Object.fromEntries(Object.keys(e.items ?? {}).filter((id) => this.merc.dados.medias?.[id] || this.merc.dados.resumo?.[id]).map((id) => [id, { media: num(this.merc.dados.medias?.[id]?.gold?.media), menor: num(this.merc.dados.resumo?.[id]?.minGold) }])) : {},
      eventos: this.eventos.slice(-15).reverse(),
      cfg: cfgConta(this.nick),
    };
  }
}

const contas = new Map();
const salvarContas = () => gravarJson(ARQ_CONTAS, [...contas.values()].map((c) => c.dadosParaSalvar()));

const importarNovas = () => {
  let arquivos = [];
  try {
    arquivos = fs.readdirSync(NOVAS);
  } catch {}
  for (const nome of arquivos) {
    const arq = path.join(NOVAS, nome);
    try {
      const st = fs.statSync(arq);
      if (!st.isFile() || st.size === 0 || agora() - st.mtimeMs < 3000) continue;
    } catch {
      continue;
    }
    let texto = '';
    try {
      texto = fs.readFileSync(arq, 'utf8').replace(/^﻿/, '').trim();
    } catch {
      continue;
    }
    let dados = null;
    try {
      dados = JSON.parse(texto);
      if (typeof dados === 'string') dados = JSON.parse(dados);
    } catch {}
    try {
      fs.unlinkSync(arq);
    } catch {}
    if (dados && typeof dados === 'object' && !dados.token) {
      const dentro = Object.values(dados).find((v) => v && typeof v === 'object' && v.token);
      if (dentro) dados = { ...dentro, nick: dentro.nick ?? dados.nick };
    }
    if (!dados?.nick || !dados?.token) {
      const forma = dados && typeof dados === 'object' ? `campos: ${Object.keys(dados).join(', ') || 'nenhum'}` : `não é JSON (${texto.length} caracteres, começa com "${texto.slice(0, 1)}")`;
      console.log(`Arquivo ${nome} ignorado: não tem nick e token (${forma}).`);
      continue;
    }
    const existente = contas.get(dados.nick);
    if (!existente && contas.size >= MAX_CONTAS) {
      console.log(`Limite de ${MAX_CONTAS} contas atingido. ${dados.nick} não foi adicionada.`);
      continue;
    }
    if (existente) {
      existente.token = dados.token;
      existente.pausada = false;
      existente.evento('Token atualizado a partir de um arquivo novo');
      try {
        existente.ws?.close();
      } catch {}
      existente.ws = null;
      existente.conectar();
    } else {
      const c = new Conta({ nick: dados.nick, token: dados.token });
      contas.set(c.nick, c);
      c.evento('Conta adicionada');
      if (!cfg.main) {
        cfg.main = c.nick;
        salvarCfg();
      }
      setTimeout(() => c.conectar(), 1000 + contas.size * 1500);
    }
    salvarContas();
  }
};

const PAINEL = path.join(AQUI, 'painel.html');
const responder = (res, cod, corpo, tipo = 'application/json') => {
  res.writeHead(cod, { 'Content-Type': `${tipo}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
};

const acao = (corpo) => {
  const c = contas.get(corpo.nick);
  switch (corpo.tipo) {
    case 'pausar':
      if (!c) return 'conta não encontrada';
      c.pausar('pausada pelo painel');
      return null;
    case 'retomar':
      if (!c) return 'conta não encontrada';
      c.retomar();
      return null;
    case 'hunt': {
      if (!c) return 'conta não encontrada';
      const erro = c.iniciarTroca(String(corpo.slug));
      if (!erro && cfgConta(c.nick).hunt.modo === 'auto') {
        c.ia.pausaManualAte = agora() + AUTO.pausaManual;
        c.evento('Você escolheu a hunt: o automático fica pausado por 2 h nesta conta');
      }
      return erro;
    }
    case 'huntCfg': {
      if (!c) return 'conta não encontrada';
      const h = cfgConta(c.nick).hunt;
      if (['manual', 'auto'].includes(corpo.modo)) h.modo = corpo.modo;
      if (['off', 'xp', 'ouro'].includes(corpo.meta)) h.meta = corpo.meta;
      if (corpo.seg && typeof corpo.seg === 'object') {
        const sg = corpo.seg;
        h.seg = {
          ttkMax: Math.min(120, Math.max(1, Number(sg.ttkMax) || 8)),
          fraqMax: [1, 2, 4, 99].includes(Number(sg.fraqMax)) ? Number(sg.fraqMax) : 2,
          riscoMax: Math.min(100, Math.max(5, Number(sg.riscoMax) || 20)),
          margem: Math.min(500, Math.max(0, Number(sg.margem) || 20)),
          comprovada: sg.comprovada !== false,
        };
      }
      if (corpo.modo === 'auto' || corpo.retomarAuto) c.ia.pausaManualAte = 0;
      c.rec = null;
      salvarCfg();
      return null;
    }
    case 'cancelarHunt':
      if (c?.troca) c.concluirTroca('cancelada por você');
      return null;
    case 'comprar':
      if (!c) return 'conta não encontrada';
      return c.comprar(corpo.kind === 'ball' ? 'ball' : 'item', corpo.id, corpo.qty);
    case 'precosMercado':
      if (!c) return 'conta não encontrada';
      c.enviar({ t: 'market.itens' });
      return null;
    case 'salvarCfg': {
      if (!c) return 'conta não encontrada';
      const atual = cfgConta(c.nick);
      if (corpo.reposicao && typeof corpo.reposicao === 'object') atual.reposicao = { ...atual.reposicao, ...corpo.reposicao };
      if (corpo.mercado && typeof corpo.mercado === 'object') atual.mercado = { ...atual.mercado, ...corpo.mercado };
      salvarCfg();
      return null;
    }
    case 'main':
      if (!c) return 'conta não encontrada';
      cfg.main = c.nick;
      salvarCfg();
      return null;
    case 'remover':
      if (!c) return 'conta não encontrada';
      c.pausar('removida');
      contas.delete(c.nick);
      delete cfg.contas[c.nick];
      salvarCfg();
      salvarContas();
      return null;
    default:
      return 'ação desconhecida';
  }
};

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      return responder(res, 200, fs.readFileSync(PAINEL, 'utf8'), 'text/html');
    } catch {
      return responder(res, 500, 'painel.html não encontrado', 'text/plain');
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/estado') {
    const mem = process.memoryUsage();
    return responder(res, 200, { versao: VERSAO, main: cfg.main ?? null, memoriaMB: Math.round(mem.rss / 1048576), iniciado: inicio, contas: [...contas.values()].map((c) => c.resumo()) });
  }
  if (req.method === 'POST' && url.pathname === '/api/acao') {
    const origem = req.headers.origin;
    if (origem && origem !== `http://${req.headers.host}`) return responder(res, 403, { erro: 'origem não permitida' });
    if (!String(req.headers['content-type'] ?? '').includes('application/json')) return responder(res, 415, { erro: 'use JSON' });
    let corpo = '';
    req.on('data', (d) => {
      corpo += d;
      if (corpo.length > 20000) req.destroy();
    });
    req.on('end', () => {
      let dados;
      try {
        dados = JSON.parse(corpo);
      } catch {
        return responder(res, 400, { erro: 'JSON inválido' });
      }
      const erro = acao(dados);
      responder(res, erro ? 400 : 200, erro ? { erro } : { ok: true });
    });
    return;
  }
  responder(res, 404, { erro: 'não encontrado' });
});

const inicio = agora();
for (const d of lerJson(ARQ_CONTAS, [])) {
  if (d?.nick && d?.token && contas.size < MAX_CONTAS) contas.set(d.nick, new Conta(d));
}
await carregarCatalogo();
carregarEspecies();
const salvarIa = () => {
  try {
    gravarJson(ARQ_IA, Object.fromEntries([...contas.values()].map((c) => [c.nick, salvarInteligencia(c.ia)])));
  } catch {}
};
process.on('exit', salvarIa);
setInterval(salvarIa, 60000);
setInterval(() => {
  if (!especies.mapa && !especies.carregando) carregarEspecies();
  for (const c of contas.values()) {
    try {
      cicloAuto(c, cfgConta(c.nick).hunt);
    } catch (e) {
      log(c.nick, `erro no automático: ${e.message}`);
    }
  }
}, 5000);
importarNovas();
let atraso = 0;
for (const c of contas.values()) {
  setTimeout(() => c.conectar(), atraso);
  atraso += 2500;
}
servidor.listen(PORTA, '0.0.0.0', () => console.log(`PokeBox ${VERSAO} rodando. Painel: http://<ip-da-box>:${PORTA}  contas: ${contas.size}`));

setInterval(() => {
  importarNovas();
  for (const c of contas.values()) {
    try {
      c.processarTroca();
      acompanhar(c);
      c.cicloReposicao();
      c.cicloMercado();
      if (c.status === 'online' && c.ultimaMsg && agora() - c.ultimaMsg > 120000) {
        try {
          c.ws?.close();
        } catch {}
      }
    } catch (e) {
      log(c.nick, `erro no ciclo: ${e.message}`);
    }
  }
}, 1000);

setInterval(() => {
  const mb = process.memoryUsage().rss / 1048576;
  if (mb > LIMITE_MEMORIA_MB) {
    console.log(`Memória em ${Math.round(mb)} MB, acima de ${LIMITE_MEMORIA_MB} MB. Reiniciando.`);
    process.exit(3);
  }
}, 60000);
