/* ---------- DefiMemory : défi en ligne entre amis (Firebase Realtime Database) ----------
   Un salon = rooms/CODE. Les deux joueurs écrivent l'état de la partie avec des transactions,
   donc les deux écrans voient exactement la même chose. Ce fichier utilise les variables
   globales de index.html (T, $, els, S, LEVELS, SYMBOLS, play, fit, esc, …). */
(() => {
  const CONFIG = {
    apiKey: 'AIzaSyBueVeCqhOwmOPZYQfTyBtrpkHtCNXBaFA',
    authDomain: 'defimemory.firebaseapp.com',
    databaseURL: 'https://defimemory-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'defimemory',
    appId: '1:665747100650:web:3fc1f2ca2d816024729893',
  };
  const TURN_MS = 10000;        // durée maximale d'un tour
  const FORFEIT_MS = 30000;     // délai pour revenir après une coupure
  const COUNTDOWN_MS = 3000;    // « La partie commence dans 3… »
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Lien d'invitation : ouvre l'application si elle est installée (Android App Links), le site sinon
  const SHARE_URL = 'https://defimemory.web.app/salon/';
  const codeFromUrl = u => { const m = /\/salon\/([A-Z2-9]{4})\b|#([A-Z2-9]{4})$/i.exec(u || ''); return m ? (m[1] || m[2]).toUpperCase() : null; };
  const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];

  /* ---------- Accès au serveur ----------
     Firebase en temps normal ; « ?online=local » remplace le serveur par un faux serveur
     partagé entre onglets du même navigateur (tests). */
  const loadScript = src => new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src));
    document.head.appendChild(s);
  });
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('timeout')), ms))]);

  function firebaseBackend() {
    let db, offset = 0;
    return {
      uid: null,
      now: () => Date.now() + offset,
      async init() {
        if (!window.firebase) for (const f of ['app', 'auth', 'database']) await loadScript(`vendor/firebase-${f}-compat.js`);
        if (!firebase.apps.length) firebase.initializeApp(CONFIG);
        const auth = firebase.auth();
        const user = auth.currentUser || (await withTimeout(auth.signInAnonymously(), 15000)).user;
        this.uid = user.uid;
        db = firebase.database();
        db.ref('.info/serverTimeOffset').on('value', s => { offset = s.val() || 0; });
      },
      on(path, cb) { const r = db.ref(path), h = s => cb(s.val()); r.on('value', h); return () => r.off('value', h); },
      async get(path) { return (await withTimeout(db.ref(path).get(), 15000)).val(); },
      // Les n meilleurs selon « pairs », et le nombre de joueurs au-dessus d'un score
      async top(path, n) { return (await withTimeout(db.ref(path).orderByChild('pairs').limitToLast(n).get(), 15000)).val() || {}; },
      async above(path, pairs) { return (await withTimeout(db.ref(path).orderByChild('pairs').startAt(pairs + 1).get(), 15000)).numChildren(); },
      async transaction(path, fn) { const r = await db.ref(path).transaction(fn); return r.committed ? r.snapshot.val() : undefined; },
      update: (path, v) => db.ref(path).update(v),
      remove: path => db.ref(path).remove(),
      // Présence : « en ligne » tant que la connexion tient, « hors ligne » + heure dès qu'elle tombe
      presence(path) {
        const conn = db.ref('.info/connected');
        const h = s => {
          if (!s.val()) return;
          db.ref(path).onDisconnect().update({ online: false, seen: firebase.database.ServerValue.TIMESTAMP });
          db.ref(path).update({ online: true });
        };
        conn.on('value', h);
        return () => { conn.off('value', h); db.ref(path).onDisconnect().cancel(); };
      },
    };
  }

  function localBackend() {
    const KEY = 'dm-local-server';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const write = tree => { localStorage.setItem(KEY, JSON.stringify(tree)); fire(); };
    const at = (tree, path) => path.split('/').reduce((n, k) => (n == null ? undefined : n[k]), tree);
    const put = (tree, path, v) => {
      const ks = path.split('/'); let n = tree;
      ks.slice(0, -1).forEach(k => { if (typeof n[k] !== 'object' || n[k] === null) n[k] = {}; n = n[k]; });
      if (v === null || v === undefined) delete n[ks[ks.length - 1]]; else n[ks[ks.length - 1]] = v;
      return tree;
    };
    const subs = new Set();
    const fire = () => subs.forEach(s => s());
    addEventListener('storage', e => { if (e.key === KEY) fire(); });
    const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
    let uid = sessionStorage.getItem('dm-local-uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('dm-local-uid', uid); }
    return {
      uid, now: () => Date.now(), async init() {},
      on(path, cb) { const s = () => cb(clone(at(read(), path))); subs.add(s); setTimeout(s); return () => subs.delete(s); },
      async get(path) { return clone(at(read(), path)); },
      async top(path, n) { const all = at(read(), path) || {}; return Object.fromEntries(Object.entries(all).sort((a, b) => b[1].pairs - a[1].pairs).slice(0, n)); },
      async above(path, pairs) { return Object.values(at(read(), path) || {}).filter(e => e.pairs > pairs).length; },
      async transaction(path, fn) {
        const tree = read(), v = fn(clone(at(tree, path)));
        if (v === undefined) return undefined;
        write(put(tree, path, v)); return clone(v);
      },
      async update(path, obj) { const tree = read(); Object.entries(obj).forEach(([k, v]) => put(tree, path + '/' + k, v)); write(tree); },
      async remove(path) { write(put(read(), path, null)); },
      presence(path) {
        this.update(path, { online: true });
        const off = () => this.update(path, { online: false, seen: Date.now() });
        addEventListener('pagehide', off);
        return () => removeEventListener('pagehide', off);
      },
    };
  }

  const LOCAL = /[?&]online=local\b/.test(location.search);
  let api = null, ready = null;
  function connect() {
    if (!ready) {
      api = LOCAL ? localBackend() : firebaseBackend();
      ready = api.init().catch(e => { ready = null; throw e; });
    }
    return ready;
  }

  /* ---------- État local ---------- */
  const MAX = 4;
  let code = null, room = null, unsub = null, stopPresence = null, loop = null;
  let huntN = 0, shownN = 0, prev = null, endShown = 0, known = new Set(), lastNames = {}, starting = 0;
  let size = 1;
  try { size = +(localStorage.getItem('dm-online-size') ?? 1); } catch (e) {}
  const msg = (text, ok) => { const m = $('onMsg'); m.textContent = text || ''; m.className = 'on-msg' + (ok ? ' ok' : ''); };
  const arr = v => (Array.isArray(v) ? v : v ? Object.values(v) : []).filter(x => x !== null && x !== undefined);
  const matchedBy = (g, k) => (g.matched ? g.matched[k] : undefined);
  const playersOf = r => Object.entries(r.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.slot - b.slot);
  const present = r => playersOf(r).filter(p => !p.left);
  const colorOf = p => COLORS[(p && p.slot) || 0];
  const myName = () => ($('onName').value.trim() || T.player(1)).slice(0, 12);

  /* ---------- Accueil « En ligne » ---------- */
  function panel() {
    try { $('onName').value = localStorage.getItem('dm-online-name') || ''; } catch (e) {}
    $('onSizes').innerHTML = LEVELS.map((lv, i) =>
      `<button class="chip" data-s="${i}" aria-pressed="${i === size}">${lv.pairs}<small>${lv.name}</small></button>`).join('');
    const c = codeFromUrl(location.href);
    if (c && !$('onCode').value) $('onCode').value = c;
    if ($('onMsg').textContent === T.notAvailable) msg('');
  }
  $('onSizes').onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    size = +b.dataset.s; try { localStorage.setItem('dm-online-size', size); } catch (er) {}
    panel();
  };
  $('onName').oninput = () => { try { localStorage.setItem('dm-online-name', $('onName').value.trim()); } catch (e) {} };
  // Seulement les caractères possibles dans un code ; on rejoint automatiquement au 4e caractère
  $('onCode').oninput = () => {
    const v = $('onCode').value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
    $('onCode').value = v;
    if (v.length === 4) $('onJoin').click(); else if ($('onMsg').textContent) msg('');
  };
  $('onCode').onkeydown = e => { if (e.key === 'Enter') $('onJoin').click(); };
  $('onName').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };

  // Message précis selon la cause de l'échec
  function explain(e) {
    const c = String((e && (e.code || e.message)) || e || '');
    if (/operation-not-allowed|admin-restricted/i.test(c)) return T.errAnon;
    if (/permission[_-]denied/i.test(c)) return T.errRules;
    if (/api-key|invalid-api|app-not-authorized|unauthorized-domain/i.test(c)) return T.errKey;
    if (/network|timeout|offline|vendor\//i.test(c)) return T.noNet;
    return T.noNet;
  }
  async function busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; msg(T.connecting, true);
    try { await connect(); await fn(); }
    catch (e) {
      console.warn(e);
      const c = String((e && (e.code || e.message)) || e).slice(0, 60);
      msg(explain(e) + ' (' + c + ')');
    }
    finally { btn.disabled = false; }
  }

  $('onCreate').onclick = () => busy($('onCreate'), async () => {
    audio();
    for (let tries = 0; tries < 6; tries++) {
      const c = Array.from({ length: 4 }, () => CHARS[Math.random() * CHARS.length | 0]).join('');
      const made = await api.transaction('rooms/' + c, cur => (cur ? undefined : {
        created: api.now(), host: api.uid, size, status: 'waiting',
        players: { [api.uid]: { name: myName(), slot: 0, online: true } },
      }));
      if (made) { msg(''); return enter(c); }
    }
    msg(T.noNet);
  });

  $('onJoin').onclick = () => {
    const c = $('onCode').value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(c)) { msg(T.badCode); return; }
    busy($('onJoin'), async () => {
      audio();
      const r = await api.get('rooms/' + c);
      if (!r) { msg(T.noRoom); return; }
      const ps = r.players || {};
      if (!ps[api.uid]) {
        if (r.status !== 'waiting' || Object.keys(ps).length >= MAX) { msg(T.roomFull); return; }
        const ok = await api.transaction('rooms/' + c + '/players', cur => {
          cur = cur || {};
          if (cur[api.uid]) return cur;
          if (Object.keys(cur).length >= MAX) return undefined;
          const used = Object.values(cur).map(p => p.slot);
          const slot = [0, 1, 2, 3].find(i => !used.includes(i));
          cur[api.uid] = { name: myName(), slot, online: true };
          return cur;
        });
        if (!ok) { msg(T.roomFull); return; }
      } else {
        await api.update(`rooms/${c}/players/${api.uid}`, { left: null, online: true });
      }
      msg(''); enter(c);
    });
  };

  /* ---------- Salon ---------- */
  function enter(c) {
    code = c; room = null; shownN = 0; prev = null; endShown = 0; known = new Set(); lastNames = {}; starting = 0;
    try { localStorage.setItem('dm-room', c); } catch (e) {}
    if (codeFromUrl(location.href)) history.replaceState(null, '', location.pathname.replace(/salon\/[A-Z0-9]{4}\/?$/i, '') + location.search);
    els.home.hidden = true; els.game.hidden = true; els.overlay.hidden = true;
    $('lobby').hidden = false;
    $('roomCode').textContent = c;
    $('lobbyMeta').textContent = '';
    $('lobbyPlayers').innerHTML = '';
    setLobbyStatus(T.connecting, false);
    stopPresence = api.presence(`rooms/${c}/players/${api.uid}`);
    unsub = api.on('rooms/' + c, r => { room = r; render(); });
    clearInterval(loop); loop = setInterval(tickLoop, 200);
  }
  const setLobbyStatus = (t, done) => { const el = $('lobbyStatus'); el.textContent = t; el.classList.toggle('done', !!done); };

  $('onShare').onclick = async () => {
    const url = SHARE_URL + code, text = T.inviteText(code, url);
    const P = (window.Capacitor && window.Capacitor.Plugins) || {};
    try {
      if (P.Share) { await P.Share.share({ title: 'DefiMemory', text, dialogTitle: T.share }); return; }
      if (navigator.share) { await navigator.share({ title: 'DefiMemory', text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); setLobbyStatus(T.copied, true); }
    catch (e) { const sel = getSelection(), r = document.createRange(); r.selectNodeContents($('roomCode')); sel.removeAllRanges(); sel.addRange(r); }
  };
  $('lobbyBack').onclick = () => showHome();
  $('onStart').onclick = () => { if (room && room.host === api.uid) { audio(); startGame(room, true); } };

  // Quitter : le joueur sort de la partie en cours ; l'hôte passe la main ; le salon disparaît quand il est vide
  async function leave() {
    if (!code) return;
    const c = code, me = api.uid, r = room;
    code = null; room = null;
    clearInterval(loop); loop = null;
    if (unsub) unsub(); unsub = null;
    if (stopPresence) stopPresence(); stopPresence = null;
    try { localStorage.removeItem('dm-room'); } catch (e) {}
    try {
      if (r && r.g && !r.g.over) await api.transaction(`rooms/${c}/g`, g => knockOut(g, me));
      if (r && !r.g) await api.remove(`rooms/${c}/players/${me}`);          // avant le début : la place se libère
      else await api.update(`rooms/${c}/players/${me}`, { left: true, online: false });
      await api.transaction('rooms/' + c, cur => {
        if (!cur) return undefined;
        const rest = Object.entries(cur.players || {}).filter(([, p]) => !p.left);
        if (!rest.length) return null;
        if (cur.host === me) return { ...cur, host: rest.sort((a, b) => a[1].slot - b[1].slot)[0][0] };
        return undefined;
      });
    } catch (e) { console.warn(e); }
    setTab('online');
  }

  /* ---------- Partie ---------- */
  // Ordre de jeu : celui des places dans le salon ; le premier joueur change à chaque partie
  async function startGame(r, byButton) {
    const ps = present(r).filter(p => p.online !== false), lv = LEVELS[r.size];
    if (ps.length < 2) return;
    const n = (r.g ? r.g.n : 0) + 1;
    if (starting >= n) return;
    starting = n;
    const order = ps.map(p => p.id);
    let first;
    if (!r.g) first = order[Math.random() * order.length | 0];
    else {
      const prevOrder = arr(r.g.order), i = prevOrder.indexOf(r.g.first);
      first = prevOrder.slice(i + 1).concat(prevOrder.slice(0, i + 1)).find(id => order.includes(id)) || order[0];
    }
    const syms = pickSymbols(lv);
    const t0 = api.now() + COUNTDOWN_MS;
    const g = {
      n, order, deck: shuffle([...syms, ...syms]), first, turn: first,
      previewStart: t0, previewEnd: t0 + lv.preview, turnStart: t0 + lv.preview,
      scores: Object.fromEntries(order.map(id => [id, 0])), over: false,
    };
    await api.transaction(`rooms/${code}`, cur => {
      if (!cur || (cur.g && cur.g.n >= n) || (!byButton && !cur.g)) return undefined;
      return { ...cur, status: 'playing', g };
    });
  }

  const outOf = g => g.out || {};
  const alive = g => arr(g.order).filter(id => !outOf(g)[id]);
  // Joueur suivant dans l'ordre, en sautant ceux qui ont quitté
  function nextTurn(g, from) {
    const order = arr(g.order), i = order.indexOf(from);
    for (let s = 1; s <= order.length; s++) { const id = order[(i + s) % order.length]; if (!outOf(g)[id]) return id; }
    return from;
  }
  // Retire un joueur (départ ou coupure de plus de 30 s) ; la partie s'arrête s'il ne reste qu'un joueur
  function knockOut(g, id) {
    if (!g || g.over || outOf(g)[id] || !arr(g.order).includes(id)) return undefined;
    g.out = { ...outOf(g), [id]: true };
    if (alive(g).length <= 1) { g.over = true; g.ended = 'left'; return g; }
    if (g.turn === id) { g.turn = nextTurn(g, id); g.turnStart = api.now(); g.open = null; g.res = null; }
    return g;
  }

  function render() {
    if (!code) return;
    if (!room) { endWith(T.roomClosed); return; }
    const ps = playersOf(room), host = room.host === api.uid;
    ps.forEach(p => { lastNames[p.id] = p.name; });
    const lv = LEVELS[room.size];
    $('lobbyMeta').textContent = `${lv.name} · ${T.pairs(lv.pairs)}`;

    if (!room.g) { renderLobby(ps, host); return; }
    const g = room.g;
    if (!arr(g.order).includes(api.uid)) { endWith(T.roomFull); return; }   // salon déjà en jeu sans nous
    if (g.n !== shownN) buildBoard(g, lv);
    if (g.over && endShown !== g.n) {
      // Égalité : prolongation « chasse au symbole », tous les joueurs à égalité en même temps
      const tied = matchWinners(g);
      if (tied.length > 1 && g.ended === 'done' && !huntOver(g)) { renderHunt(g, tied, host); return; }
      showEnd(g);
    }
    if (!g.over && !els.overlay.hidden) els.overlay.hidden = true;
    if (g.over) {
      // Revanche : quand tous les joueurs encore là l'ont demandée, l'hôte relance
      const here = present(room);
      if (host && here.length >= 2 && here.every(p => p.rematch === g.n)) startGame(room, true);
      updateEndButtons(g, here);
    }
    paint();
  }

  function renderLobby(ps, host) {
    const here = ps.filter(p => !p.left);
    $('lobbyPlayers').innerHTML = here.map(p =>
      `<li style="--pc:${colorOf(p)}"><i></i><span>${esc(p.name)}</span>${p.id === api.uid ? `<small>${T.you}</small>` : ''}${p.id === room.host ? '<b>👑</b>' : ''}</li>`).join('')
      + Array.from({ length: MAX - here.length }, () => `<li class="free"><i></i><span>${T.freeSeat}</span></li>`).join('');
    $('lobbyCount').textContent = T.playersCount(here.length, MAX);
    here.forEach(p => { if (!known.has(p.id)) { if (known.size) play('pick'); known.add(p.id); } });
    $('onStart').hidden = !host;
    $('onStart').disabled = here.length < 2;
    const hostP = ps.find(p => p.id === room.host);
    if (host) setLobbyStatus(here.length < 2 ? T.waitingOpp : T.readyToStart, here.length >= 2);
    else setLobbyStatus(T.waitHost(hostP ? hostP.name : ''), false);
  }

  function buildBoard(g, lv) {
    shownN = g.n; prev = null;
    $('lobby').hidden = true; els.home.hidden = true; els.overlay.hidden = true; els.game.hidden = false;
    S = { online: true, lv, cards: [], lock: true, over: false, mp: null };
    $('gName').textContent = T.online;
    $('gMeta').textContent = `${lv.name} · ${T.pairs(lv.pairs)}`;
    document.querySelector('.stats').hidden = true;
    $('scores').hidden = false; $('restart').hidden = true;
    els.board.innerHTML = g.deck.map((s, k) =>
      `<button class="card" data-k="${k}" aria-label="${T.card(k + 1)}"><span class="inner"><span class="back"></span><span class="face">${s}</span></span></button>`
    ).join('');
    S.cards = [...els.board.children];
    fit();
  }

  const playerById = id => { const p = room.players && room.players[id]; return p ? { id, ...p } : { id, name: lastNames[id] || '', slot: 0 }; };

  // Dessine l'état courant : cartes, scores, message, barre du temps de tour
  function paint() {
    if (!room || !room.g || !S || !S.online) return;
    const g = room.g, t = api.now(), order = arr(g.order), ps = order.map(playerById);
    const open = arr(g.open), res = g.res || null;
    const preview = t >= g.previewStart && t < g.previewEnd;

    S.cards.forEach((c, k) => {
      const owner = matchedBy(g, k);
      c.classList.toggle('matched', !!owner);
      if (owner) c.style.setProperty('--owner', colorOf(playerById(owner))); else c.style.removeProperty('--owner');
      c.classList.toggle('up', preview || g.over || open.includes(k));
      c.classList.toggle('wrong', !!res && res.t === 'miss' && open.includes(k));
    });

    if (prev && prev.n === g.n) {
      if (open.length > prev.open.length) play('flip');
      if (res && !prev.res) play(res.t === 'match' ? 'match' : 'miss');
    }
    prev = { n: g.n, open: open.slice(), res };

    const box = $('scores');
    box.style.gridTemplateColumns = `repeat(${ps.length}, 1fr)`;
    box.innerHTML = ps.map(p => {
      const out = outOf(g)[p.id], off = out || p.online === false;
      return `<div class="pscore${p.id === g.turn && !g.over && t >= g.previewEnd ? ' active' : ''}${off ? ' off' : ''}" style="--pc:${colorOf(p)}">` +
        `<span>${esc(p.name)}</span><b>${(g.scores && g.scores[p.id]) || 0}</b>${p.id === api.uid ? `<small class="you">${T.you}</small>` : ''}</div>`;
    }).join('');

    const st = $('status'), bar = $('bar'), turnP = playerById(g.turn);
    st.style.setProperty('--pc', colorOf(turnP));
    bar.style.transition = 'none';
    S.lock = true;
    if (g.over) { st.className = 'status'; st.textContent = ''; bar.style.width = '0%'; return; }
    if (t < g.previewStart) {
      st.className = 'status memo'; st.textContent = T.startsIn(Math.ceil((g.previewStart - t) / 1000)); bar.style.width = '0%';
    } else if (preview) {
      st.className = 'status memo'; st.textContent = T.memorize(Math.ceil((g.previewEnd - t) / 1000));
      bar.style.background = ''; bar.style.width = `${100 * (g.previewEnd - t) / (g.previewEnd - g.previewStart)}%`;
    } else {
      const left = Math.max(0, TURN_MS - (t - g.turnStart)), secs = Math.ceil(left / 1000);
      const lost = ps.find(p => p.id !== api.uid && !outOf(g)[p.id] && p.online === false && p.seen);
      st.className = 'status turn';
      st.textContent = lost ? T.lostConn(lost.name, Math.max(0, Math.ceil((FORFEIT_MS - (t - lost.seen)) / 1000)))
        : g.turn === api.uid ? T.yourTurnOn(secs) : T.oppTurn(turnP.name, secs);
      bar.style.background = colorOf(turnP);
      bar.style.width = `${100 * left / TURN_MS}%`;
      S.lock = g.turn !== api.uid || !!res || open.length >= 2 || !!outOf(g)[api.uid];
    }
  }

  // Toutes les 200 ms : temps affiché, et règlement des tours (paire, erreur, temps écoulé, joueur parti)
  function tickLoop() {
    if (!room || !room.g) return;
    paint();
    const g = room.g, t = api.now();
    if (g.over && g.hunt && endShown !== g.n && huntOver(g)) render();
    if (g.over) return;
    if (g.res && t >= g.res.at) resolve(g.res.at);
    else if (!g.res && t >= g.previewEnd && t - g.turnStart > TURN_MS + 400) timeout(g.turnStart);
    arr(g.order).forEach(id => {
      if (id === api.uid || outOf(g)[id]) return;
      const p = room.players && room.players[id];
      if (!p || p.left || (p.online === false && p.seen && t - p.seen > FORFEIT_MS)) api.transaction(gPath(), x => knockOut(x, id));
    });
  }

  const gPath = () => `rooms/${code}/g`;

  function click(c) {
    if (!room || !room.g || S.lock) return;
    const k = +c.dataset.k;
    api.transaction(gPath(), g => {
      if (!g || g.over || g.res || g.turn !== api.uid || api.now() < g.previewEnd) return undefined;
      const open = arr(g.open);
      if (open.includes(k) || matchedBy(g, k) || open.length >= 2) return undefined;
      open.push(k); g.open = open;
      if (open.length === 2) {
        const same = g.deck[open[0]] === g.deck[open[1]];
        g.res = { t: same ? 'match' : 'miss', at: api.now() + (same ? 450 : 1000) };
      }
      return g;
    });
    S.lock = true;   // évite un double toucher pendant l'envoi
  }

  function resolve(at) {
    api.transaction(gPath(), g => {
      if (!g || g.over || !g.res || g.res.at !== at) return undefined;
      const open = arr(g.open);
      if (g.res.t === 'match') {
        g.matched = Object.assign({}, g.matched || {});
        open.forEach(k => { g.matched[k] = g.turn; });
        g.scores[g.turn] = (g.scores[g.turn] || 0) + 1;
        if (Object.values(g.matched).filter(Boolean).length >= g.deck.length) { g.over = true; g.ended = 'done'; }
      } else {
        g.turn = nextTurn(g, g.turn);
      }
      g.open = null; g.res = null; g.turnStart = api.now();
      return g;
    });
  }

  function timeout(turnStart) {
    api.transaction(gPath(), g => {
      if (!g || g.over || g.res || g.turnStart !== turnStart) return undefined;
      g.open = null; g.turn = nextTurn(g, g.turn); g.turnStart = api.now();
      return g;
    });
  }

  /* ---------- Prolongation en ligne ---------- */
  function matchWinners(g) {
    const sc = id => (g.scores && g.scores[id]) || 0;
    const stay = arr(g.order).filter(id => !outOf(g)[id]);
    const top = Math.max(...stay.map(sc));
    return stay.filter(id => sc(id) === top);
  }
  // Terminée quand chaque joueur a fini, ou après le temps prévu (+5 s de marge si quelqu'un est déconnecté)
  function huntOver(g) {
    const h = g.hunt; if (!h) return false;
    const res = h.res || {};
    return arr(h.tied).every(id => res[id] && res[id].done) || api.now() > h.start + HUNT.memo + HUNT.dur + 5000;
  }
  function renderHunt(g, tied, host) {
    if (!g.hunt) {
      if (host) {
        const h = makeHunt();
        api.transaction(gPath(), x => (x && x.over && !x.hunt ? { ...x, hunt: { ...h, tied, start: api.now() + 10000 } } : undefined));   // 10 s pour lire les règles
      }
      return;
    }
    const h = g.hunt, res = h.res || {}, names = arr(h.tied).map(id => playerById(id).name);
    if (arr(h.tied).includes(api.uid)) {
      if (huntN !== g.n) {
        huntN = g.n;
        playHunt({ deck: arr(h.deck), targets: arr(h.targets) }, {
          now: api.now, startAt: h.start, who: T.huntWatch(joinNames(names)),
          board: () => huntBoardOnline(),
          onProgress: r => api.update(`${gPath()}/hunt/res/${api.uid}`, r),
          onDone: () => {}, intro: true,
        });
        // Règles affichées jusqu'au début, avec le compte à rebours
        $('rTitle').textContent = T.huntTitle;
        $('rText').textContent = T.huntWho(joinNames(names));
        huntHelp();
        $('rRank').hidden = true; $('rGrid').hidden = true; $('rStars').hidden = true; $('rRecord').hidden = true;
        $('rUnlock').hidden = true; $('rNext').hidden = true; $('rAgain').hidden = true;
        $('rHome').textContent = T.quit;
        $('rCount').style.setProperty('--pc', 'var(--accent)'); $('rCountLabel').textContent = T.huntStartsLabel;
        $('rCount').hidden = false; els.overlay.hidden = false;
      }
      huntBoardOnline();
    } else {
      // Les autres joueurs regardent la prolongation en direct
      $('rTitle').textContent = T.huntTitle;
      $('rText').textContent = T.huntWatch(joinNames(names));
      huntHelp();
      $('rRank').innerHTML = arr(h.tied).map(id => { const p = playerById(id); return `<li style="--pc:${colorOf(p)}"><i></i><span>${esc(p.name)}</span><em>${res[id] ? T.huntLine(res[id]) : '…'}</em></li>`; }).join('');
      $('rRank').hidden = false; $('rGrid').hidden = true; $('rStars').hidden = true; $('rCount').hidden = true;
      $('rRecord').hidden = true; $('rUnlock').hidden = true; $('rNext').hidden = true; $('rAgain').hidden = true;
      $('rHome').textContent = T.quit;
      els.overlay.hidden = false;
    }
  }
  function huntBoardOnline() {
    const g = room && room.g; if (!g || !g.hunt || !S || !S.hunt) return;
    const res = g.hunt.res || {}, ids = arr(g.hunt.tied), box = $('scores');
    box.hidden = false;
    box.style.gridTemplateColumns = `repeat(${ids.length}, 1fr)`;
    box.innerHTML = ids.map(id => { const p = playerById(id); return `<div class="pscore${id === api.uid ? ' active' : ''}" style="--pc:${colorOf(p)}"><span>${esc(p.name)}</span><b>${res[id] ? res[id].found : 0}</b>${id === api.uid ? `<small class="you">${T.you}</small>` : ''}</div>`; }).join('');
  }
  const joinNames = ns => ns.length > 1 ? `${ns.slice(0, -1).join(', ')} ${T.and} ${ns[ns.length - 1]}` : (ns[0] || '');

  /* ---------- Fin de partie et revanche ---------- */
  function showEnd(g) {
    endShown = g.n; $('rHelp').hidden = true;
    add((g.scores && g.scores[api.uid]) || 0);
    const ps = arr(g.order).map(playerById), sc = id => (g.scores && g.scores[id]) || 0;
    const stay = ps.filter(p => !outOf(g)[p.id]);
    const top = Math.max(...stay.map(p => sc(p.id)));
    let winners = stay.filter(p => sc(p.id) === top);
    const gone = ps.filter(p => outOf(g)[p.id]);
    let text = gone.map(p => T.forfeitText(p.name)).join(' ');
    let ranked = ps.slice().sort((a, b) => (!!outOf(g)[a.id] - !!outOf(g)[b.id]) || sc(b.id) - sc(a.id));
    let detail = p => T.pairs(sc(p.id)), posOf = p => 1 + stay.filter(q => sc(q.id) > sc(p.id)).length;
    const h = g.hunt;
    if (h && winners.length > 1) {
      // Prolongation : classement des joueurs à égalité selon la chasse au symbole
      const res = h.res || {}, rOf = p => res[p.id] || { found: 0 };
      const tied = winners.slice().sort((a, b) => huntBetter(rOf(a), rOf(b)));
      winners = tied.filter(p => huntBetter(rOf(p), rOf(tied[0])) === 0);
      text = tied.map(p => `${p.name} : ${T.huntLine(rOf(p))}`).join(' · ');
      ranked = tied.concat(ranked.filter(p => !tied.includes(p)));
      detail = p => (tied.includes(p) ? T.huntLine(rOf(p)) : T.pairs(sc(p.id)));
      posOf = p => (tied.includes(p) ? 1 + tied.filter(q => huntBetter(rOf(q), rOf(p)) < 0).length : tied.length + 1 + stay.filter(q => !tied.includes(q) && sc(q.id) > sc(p.id)).length);
    }
    const iWin = winners.some(p => p.id === api.uid), tie = winners.length > 1;
    play(iWin ? 'win' : 'lose');
    $('rTitle').textContent = tie ? T.tie : iWin ? T.youWin : (h ? T.huntWinner(winners[0].name) : T.winner(winners[0].name));
    $('rText').textContent = text;
    $('rRank').innerHTML = ranked.map(p => {
      const out = outOf(g)[p.id], win = winners.includes(p);
      const pos = out ? '–' : `${posOf(p)}.`;
      const cup = win ? `<b class="trophy" role="img" aria-label="${T.winnerCup}">🏆</b>` : '';
      return `<li class="${win ? 'first' : ''}" style="--pc:${colorOf(p)}${out ? ';opacity:.55' : ''}"><i></i><span>${pos} ${esc(p.name)}</span>${cup}<em>${detail(p)}</em></li>`;
    }).join('');
    $('rRank').hidden = false; $('rGrid').hidden = true; $('rStars').hidden = true; $('rCount').hidden = true;
    $('rRecord').hidden = true; $('rUnlock').hidden = true; $('rNext').hidden = true; $('rAgain').hidden = false;
    $('rHome').textContent = T.quit;
    againAction = () => api.update(`rooms/${code}/players/${api.uid}`, { rematch: g.n });
    els.overlay.hidden = false; $('rAgain').focus();
  }

  function updateEndButtons(g, here) {
    const me = room.players[api.uid] || {}, again = $('rAgain');
    const others = here.filter(p => p.id !== api.uid), waiting = others.filter(p => p.rematch !== g.n);
    if (!others.length) { again.disabled = true; again.textContent = T.alone; }
    else if (me.rematch === g.n) { again.disabled = true; again.textContent = T.rematchWait(waiting.map(p => p.name).join(', ') || '…'); }
    else { again.disabled = false; again.textContent = T.rematch; }
  }

  function endWith(text) {
    const c = code; code = null;
    clearInterval(loop); loop = null;
    if (unsub) unsub(); unsub = null;
    if (stopPresence) stopPresence(); stopPresence = null;
    try { localStorage.removeItem('dm-room'); } catch (e) {}
    S = null; showHome(); setTab('online'); if (c) msg(text);
  }

  /* ---------- Reprise après un rechargement, et lien d'invitation ---------- */
  async function resume() {
    let c = null; try { c = localStorage.getItem('dm-room'); } catch (e) {}
    if (c) {
      try {
        await connect();
        const r = await api.get('rooms/' + c);
        const me = r && r.players && r.players[api.uid];
        if (me && !me.left && !(r.g && r.g.over)) { await api.update(`rooms/${c}/players/${api.uid}`, { online: true }); enter(c); return; }
      } catch (e) { console.warn(e); }
      try { localStorage.removeItem('dm-room'); } catch (e) {}
    }
    const c2 = codeFromUrl(location.href);
    if (c2) openInvite(c2);
  }

  // Ouverture par un lien d'invitation : on demande d'abord le pseudo, puis on rejoint le salon
  function openInvite(c) {
    if (code === c) return;
    if (code) leave();
    showHome(); setTab('online');
    $('onCode').value = c; msg('');
    let name = ''; try { name = localStorage.getItem('dm-online-name') || ''; } catch (e) {}
    $('invName').value = name;
    $('invText').textContent = T.invText(c);
    $('invMsg').textContent = ''; $('invJoin').disabled = false;
    $('invite').hidden = false;
    setTimeout(() => { $('invName').focus(); $('invName').select(); }, 50);
    // Nom de l'hôte et salon encore ouvert ? (sans bloquer si le réseau est lent)
    connect().then(() => api.get('rooms/' + c)).then(r => {
      if ($('invite').hidden || $('onCode').value !== c) return;
      if (!r) { $('invMsg').textContent = T.noRoom; $('invJoin').disabled = true; return; }
      const ps = r.players || {}, host = ps[r.host];
      if (!ps[api.uid] && (r.status !== 'waiting' || Object.keys(ps).length >= MAX)) { $('invMsg').textContent = T.roomFull; $('invJoin').disabled = true; return; }
      if (host && host.name) $('invText').textContent = T.invFrom(host.name, c);
    }).catch(() => {});
  }
  $('invJoin').onclick = () => {
    const n = $('invName').value.trim();
    if (!n) { $('invMsg').textContent = T.invNeedName; $('invName').focus(); return; }
    $('onName').value = n;
    try { localStorage.setItem('dm-online-name', n); } catch (e) {}
    $('invite').hidden = true;
    $('onJoin').click();
  };
  $('invLater').onclick = () => { $('invite').hidden = true; };
  $('invName').oninput = () => { $('invMsg').textContent = ''; };
  $('invName').onkeydown = e => { if (e.key === 'Enter') $('invJoin').click(); };
  // Application installée : lien touché alors que l'application était fermée ou déjà ouverte
  const NP = (window.Capacitor && window.Capacitor.Plugins) || {};
  if (NP.App) {
    NP.App.addListener('appUrlOpen', e => { const c = codeFromUrl(e && e.url); if (c) openInvite(c); });
    if (NP.App.getLaunchUrl) NP.App.getLaunchUrl().then(r => { const c = r && codeFromUrl(r.url); if (c) openInvite(c); }).catch(() => {});
  }

  /* ---------- Ligue de la semaine ----------
     Chaque joueur ajoute ses paires (Solo et En ligne) à league/SEMAINE/uid.
     La semaine commence le lundi à 0 h, heure de Paris ; son nom est la date de ce lundi. */
  const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function parisNow(at = Date.now()) {
    const o = Object.fromEntries(PARIS.formatToParts(new Date(at)).map(x => [x.type, x.value]));
    return { y: +o.year, m: +o.month, d: +o.day, wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(o.weekday), h: +o.hour, mi: +o.minute, s: +o.second };
  }
  function weekId(at = Date.now()) {
    const p = parisNow(at), monday = new Date(Date.UTC(p.y, p.m - 1, p.d - p.wd));
    return monday.toISOString().slice(0, 10);
  }
  const prevWeekId = () => weekId(Date.now() - 7 * 86400000);
  // Temps restant jusqu'au lundi suivant à 0 h (heure de Paris)
  function weekLeft() { const p = parisNow(); return ((7 - p.wd) * 86400 - (p.h * 3600 + p.mi * 60 + p.s)) * 1000; }

  const BAD = /(merde|putain|pute|connard|connasse|encul|salope|batard|bâtard|nique|niqu|pd\b|fuck|shit|bitch|cunt|dick|nazi|hitler)/i;
  const cleanName = n => { n = (n || '').trim().slice(0, 12); return !n || BAD.test(n) ? '' : n; };
  function leagueName() {
    let n = ''; try { n = localStorage.getItem('dm-league-name') || localStorage.getItem('dm-online-name') || ''; } catch (e) {}
    n = cleanName(n);
    if (!n) {
      try { n = localStorage.getItem('dm-league-anon'); } catch (e) {}
      if (!n) { n = T.player(1000 + Math.random() * 9000 | 0); try { localStorage.setItem('dm-league-anon', n); } catch (e) {} }
    }
    return n;
  }
  const pendingKey = () => 'dm-league-' + weekId();
  function pending() { try { return +(localStorage.getItem(pendingKey()) || 0); } catch (e) { return 0; } }
  let flushing = false;
  async function flush(nameChanged) {
    const n = pending();
    if (flushing || (!n && !nameChanged)) return;
    flushing = true;
    try {
      await connect();
      const wk = weekId(), path = `league/${wk}/${api.uid}`;
      const ok = await api.transaction(path, cur => ({ name: leagueName(), pairs: ((cur && cur.pairs) || 0) + n, t: Date.now() }));
      if (ok) { try { localStorage.setItem(pendingKey(), Math.max(0, pending() - n)); } catch (e) {} }
    } catch (e) { console.warn('ligue', e); }
    finally { flushing = false; }
  }
  // Appelé à la fin d'une partie Solo ou En ligne
  function add(pairs) {
    if (!(pairs > 0)) return;
    try { localStorage.setItem(pendingKey(), pending() + pairs); } catch (e) {}
    flush();
  }

  async function openLeague() {
    els.home.hidden = true; els.game.hidden = true; els.overlay.hidden = true; $('lobby').hidden = true;
    $('league').hidden = false; $('league').scrollTop = 0;
    $('lgName').value = leagueName();
    $('lgMsg').textContent = T.connecting; $('lgMsg').className = 'on-msg ok';
    renderLeft();
    try {
      await flush();
      const wk = weekId(), board = await api.top('league/' + wk, 50);
      const rows = Object.entries(board).map(([id, e]) => ({ id, ...e })).sort((a, b) => b.pairs - a.pairs || a.t - b.t);
      let me = rows.find(r => r.id === api.uid), myRank = me ? rows.indexOf(me) + 1 : null;
      if (!me) {
        const mine = await api.get(`league/${wk}/${api.uid}`);
        if (mine) { me = { id: api.uid, ...mine }; myRank = (await api.above('league/' + wk, mine.pairs)) + 1; }
      }
      $('lgMine').innerHTML = me
        ? `<span>${T.lgYourRank}</span><b>${medal(myRank)}</b><em>${T.pairs(me.pairs)}</em>`
        : `<span>${T.lgNotRanked}</span>`;
      $('lgList').innerHTML = rows.length ? rows.map((r, i) =>
        `<li class="${r.id === api.uid ? 'me' : ''}${i < 3 ? ' podium' : ''}"><b class="rank">${medal(i + 1)}</b><span>${esc(r.name)}</span><em>${T.pairs(r.pairs)}</em></li>`).join('')
        : `<li class="empty">${T.lgEmpty}</li>`;
      if (me && myRank > rows.length) $('lgList').insertAdjacentHTML('beforeend', `<li class="me"><b class="rank">${myRank}.</b><span>${esc(me.name)}</span><em>${T.pairs(me.pairs)}</em></li>`);
      // Le podium de la semaine dernière
      const last = Object.values(await api.top('league/' + prevWeekId(), 3)).sort((a, b) => b.pairs - a.pairs || a.t - b.t);
      $('lgLast').hidden = !last.length;
      $('lgLast').innerHTML = `<span>${T.lgLastWeek}</span> ` + last.map((r, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(r.name)}`).join(' · ');
      $('lgMsg').textContent = '';
    } catch (e) { console.warn(e); $('lgMsg').textContent = explain(e); $('lgMsg').className = 'on-msg'; }
  }
  const medal = r => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}.`);
  function renderLeft() {
    const ms = weekLeft(), d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000);
    $('lgMeta').textContent = T.lgEnds(d, h, m);
  }
  $('lgName').onchange = () => {
    const n = cleanName($('lgName').value);
    if (!n) { $('lgMsg').textContent = T.lgBadName; $('lgMsg').className = 'on-msg'; $('lgName').value = leagueName(); return; }
    try { localStorage.setItem('dm-league-name', n); } catch (e) {}
    flush(true).then(openLeague);
  };
  $('lgName').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };
  $('leagueBtn').hidden = false;
  $('leagueBtn').onclick = () => { audio(); openLeague(); };
  $('leagueBack').onclick = () => showHome();
  window.League = { add, open: openLeague };
  addEventListener('online', () => flush());
  setTimeout(() => { if (pending()) flush(); }, 2500);

  window.Online = { panel, click, leave: () => { if (code) leave(); }, get active() { return !!code; }, get room() { return room; }, get uid() { return api && api.uid; } };
  addEventListener('resize', () => { if (S && S.online) fit(); });
  resume();
})();
