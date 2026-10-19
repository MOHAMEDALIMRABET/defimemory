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
  const SHARE_URL = 'https://mohamedalimrabet.github.io/defimemory/jouer/';
  const COLORS = ['var(--p1)', 'var(--p2)'];

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
  let code = null, room = null, unsub = null, stopPresence = null, loop = null;
  let shownN = 0, prev = null, endShown = 0, joinedShown = false, oppName = '', starting = 0;
  let size = 1;
  try { size = +(localStorage.getItem('dm-online-size') ?? 1); } catch (e) {}
  const msg = (text, ok) => { const m = $('onMsg'); m.textContent = text || ''; m.className = 'on-msg' + (ok ? ' ok' : ''); };
  const arr = v => (Array.isArray(v) ? v : v ? Object.values(v) : []).filter(x => x !== null && x !== undefined);
  const matchedBy = (g, k) => (g.matched ? g.matched[k] : undefined);
  const playersOf = r => Object.entries(r.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.slot - b.slot);
  const myName = () => ($('onName').value.trim() || T.player(1)).slice(0, 12);

  /* ---------- Accueil « En ligne » ---------- */
  function panel() {
    try { $('onName').value = localStorage.getItem('dm-online-name') || ''; } catch (e) {}
    $('onSizes').innerHTML = LEVELS.map((lv, i) =>
      `<button class="chip" data-s="${i}" aria-pressed="${i === size}">${lv.pairs}<small>${lv.name}</small></button>`).join('');
    const m = /^#([A-Z2-9]{4})$/i.exec(location.hash);
    if (m && !$('onCode').value) $('onCode').value = m[1].toUpperCase();
    if ($('onMsg').textContent === T.notAvailable) msg('');
  }
  $('onSizes').onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    size = +b.dataset.s; try { localStorage.setItem('dm-online-size', size); } catch (er) {}
    panel();
  };
  $('onName').oninput = () => { try { localStorage.setItem('dm-online-name', $('onName').value.trim()); } catch (e) {} };
  $('onCode').oninput = () => { $('onCode').value = $('onCode').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  $('onCode').onkeydown = e => { if (e.key === 'Enter') $('onJoin').click(); };
  $('onName').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };

  async function busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; msg(T.connecting, true);
    try { await connect(); await fn(); }
    catch (e) { console.warn(e); msg(T.noNet); }
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
    if (!/^[A-Z2-9]{4}$/.test(c)) { msg(T.badCode); return; }
    busy($('onJoin'), async () => {
      audio();
      const r = await api.get('rooms/' + c);
      if (!r) { msg(T.noRoom); return; }
      const ps = r.players || {};
      if (!ps[api.uid]) {
        if (r.status !== 'waiting' || Object.keys(ps).length >= 2) { msg(T.roomFull); return; }
        const ok = await api.transaction('rooms/' + c + '/players', cur => {
          cur = cur || {};
          if (Object.keys(cur).length >= 2 && !cur[api.uid]) return undefined;
          cur[api.uid] = { name: myName(), slot: 1, online: true };
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
    code = c; room = null; shownN = 0; prev = null; endShown = 0; joinedShown = false; oppName = ''; starting = 0;
    try { localStorage.setItem('dm-room', c); } catch (e) {}
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    els.home.hidden = true; els.game.hidden = true; els.overlay.hidden = true;
    $('lobby').hidden = false;
    $('roomCode').textContent = c;
    $('lobbyMeta').textContent = '';
    setLobbyStatus(T.waitingOpp, false);
    stopPresence = api.presence(`rooms/${c}/players/${api.uid}`);
    unsub = api.on('rooms/' + c, r => { room = r; render(); });
    clearInterval(loop); loop = setInterval(tickLoop, 200);
  }
  const setLobbyStatus = (t, done) => { const el = $('lobbyStatus'); el.textContent = t; el.classList.toggle('done', !!done); };

  $('onShare').onclick = async () => {
    const url = SHARE_URL + '#' + code, text = T.inviteText(code, url);
    const P = (window.Capacitor && window.Capacitor.Plugins) || {};
    try {
      if (P.Share) { await P.Share.share({ title: 'DefiMemory', text, dialogTitle: T.share }); return; }
      if (navigator.share) { await navigator.share({ title: 'DefiMemory', text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); setLobbyStatus(T.copied, true); }
    catch (e) { const sel = getSelection(), r = document.createRange(); r.selectNodeContents($('roomCode')); sel.removeAllRanges(); sel.addRange(r); }
  };
  $('lobbyBack').onclick = () => showHome();

  // Quitter : abandon si la partie est en cours, puis suppression du salon quand tout le monde est parti
  async function leave() {
    if (!code) return;
    const c = code, me = api.uid, r = room;
    code = null; room = null;
    clearInterval(loop); loop = null;
    if (unsub) unsub(); unsub = null;
    if (stopPresence) stopPresence(); stopPresence = null;
    try { localStorage.removeItem('dm-room'); } catch (e) {}
    try {
      if (r && r.g && !r.g.over) {
        await api.transaction(`rooms/${c}/g`, g => (g && !g.over ? { ...g, over: true, forfeit: me } : undefined));
      }
      if (r && !r.g && r.host !== me) await api.remove(`rooms/${c}/players/${me}`);   // l'invité part avant le début : la place se libère
      else await api.update(`rooms/${c}/players/${me}`, { left: true, online: false });
      await api.transaction('rooms/' + c, cur => {
        if (!cur) return undefined;
        const ps = Object.values(cur.players || {});
        return ps.every(p => p.left) || cur.status === 'waiting' && cur.host === me ? null : undefined;
      });
    } catch (e) { console.warn(e); }
    setTab('online');
  }

  /* ---------- Partie ---------- */
  // L'hôte lance la partie dès que deux joueurs sont là, et chaque revanche
  async function startGame(r) {
    const ps = playersOf(r), lv = LEVELS[r.size];
    const n = (r.g ? r.g.n : 0) + 1;
    if (starting >= n || ps.length < 2) return;
    starting = n;
    const first = !r.g ? ps[Math.random() * 2 | 0].id : ps.find(p => p.id !== r.g.first).id;   // chacun commence à son tour
    const syms = shuffle(SYMBOLS.slice()).slice(0, lv.pairs);
    const t0 = api.now() + COUNTDOWN_MS;
    const g = {
      n, deck: shuffle([...syms, ...syms]), first, turn: first,
      previewStart: t0, previewEnd: t0 + lv.preview, turnStart: t0 + lv.preview,
      scores: Object.fromEntries(ps.map(p => [p.id, 0])), over: false,
    };
    await api.transaction(`rooms/${code}`, cur => {
      if (!cur || (cur.g && cur.g.n >= n)) return undefined;
      return { ...cur, status: 'playing', g };
    });
  }

  function opponent() { return room ? playersOf(room).find(p => p.id !== api.uid) : null; }

  function render() {
    if (!code) return;
    if (!room) { endWith(T.oppLeft(oppName)); return; }
    const ps = playersOf(room), opp = ps.find(p => p.id !== api.uid);
    if (opp) oppName = opp.name;
    const lv = LEVELS[room.size], host = room.host === api.uid;
    $('lobbyMeta').textContent = `${lv.name} · ${T.pairs(lv.pairs)}`;

    if (!room.g) {
      // L'invité n'a pas besoin du code ni du bouton Partager
      $('onShare').hidden = !host; $('roomCode').hidden = !host;
      document.querySelector('.lobby-body > p').hidden = !host;
      if (opp && !opp.left) {
        setLobbyStatus(T.vsText(opp.name), true);
        if (!joinedShown) { joinedShown = true; play('pick'); }
        if (host) startGame(room);
      } else if (host) setLobbyStatus(T.waitingOpp, false);
      else setLobbyStatus(T.connecting, false);
      return;
    }
    const g = room.g;
    if (g.n !== shownN) buildBoard(g, lv);
    if (g.over && endShown !== g.n) showEnd(g);
    if (!g.over && !els.overlay.hidden) els.overlay.hidden = true;
    if (g.over) {
      // Revanche : quand les deux joueurs l'ont demandée, l'hôte relance
      const both = ps.length === 2 && ps.every(p => p.rematch === g.n && !p.left);
      if (both && room.host === api.uid) startGame(room);
      updateEndButtons(g, opp);
    }
    paint();
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

  // Dessine l'état courant : cartes, scores, message, barre du temps de tour
  function paint() {
    if (!room || !room.g || !S || !S.online) return;
    const g = room.g, t = api.now(), ps = playersOf(room);
    const open = arr(g.open), res = g.res || null;
    const preview = t >= g.previewStart && t < g.previewEnd;

    S.cards.forEach((c, k) => {
      const owner = matchedBy(g, k);
      const pIdx = owner ? ps.findIndex(p => p.id === owner) : -1;
      c.classList.toggle('matched', !!owner);
      if (owner) c.style.setProperty('--owner', COLORS[Math.max(0, pIdx)]); else c.style.removeProperty('--owner');
      c.classList.toggle('up', preview || g.over || open.includes(k));
      c.classList.toggle('wrong', !!res && res.t === 'miss' && open.includes(k));
    });

    // Sons quand l'état change
    if (prev && prev.n === g.n) {
      if (open.length > prev.open.length) play('flip');
      if (res && !prev.res) play(res.t === 'match' ? 'match' : 'miss');
    }
    prev = { n: g.n, open: open.slice(), res };

    // Scores
    const box = $('scores');
    box.style.gridTemplateColumns = 'repeat(2, 1fr)';
    box.innerHTML = ps.map((p, i) =>
      `<div class="pscore${p.id === g.turn && !g.over && t >= g.previewEnd ? ' active' : ''}${p.online === false ? ' off' : ''}" style="--pc:${COLORS[i]}">` +
      `<span>${esc(p.name)}</span><b>${(g.scores && g.scores[p.id]) || 0}</b>${p.id === api.uid ? `<small class="you">${T.you}</small>` : ''}</div>`).join('');

    // Message et barre
    const st = $('status'), bar = $('bar'), opp = ps.find(p => p.id !== api.uid);
    const turnP = ps.find(p => p.id === g.turn), turnIdx = ps.findIndex(p => p.id === g.turn);
    st.style.setProperty('--pc', COLORS[Math.max(0, turnIdx)]);
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
      const lost = opp && opp.online === false && opp.seen ? Math.max(0, Math.ceil((FORFEIT_MS - (t - opp.seen)) / 1000)) : null;
      st.className = 'status turn';
      st.textContent = lost !== null ? T.lostConn(opp.name, lost)
        : g.turn === api.uid ? T.yourTurnOn(secs) : T.oppTurn(turnP ? turnP.name : '', secs);
      bar.style.background = COLORS[Math.max(0, turnIdx)];
      bar.style.width = `${100 * left / TURN_MS}%`;
      S.lock = g.turn !== api.uid || !!res || open.length >= 2;
    }
  }

  // Toutes les 200 ms : affichage du temps, et règlement des tours (paire, erreur, temps écoulé, abandon)
  function tickLoop() {
    if (!room || !room.g) return;
    paint();
    const g = room.g, t = api.now();
    if (g.over) return;
    if (g.res && t >= g.res.at) resolve(g.res.at);
    else if (!g.res && t >= g.previewEnd && t - g.turnStart > TURN_MS + 400) timeout(g.turnStart);
    const opp = opponent();
    if (opp && (opp.left || (opp.online === false && opp.seen && t - opp.seen > FORFEIT_MS))) forfeit(opp.id);
  }

  const other = (g, id) => Object.keys(g.scores).find(k => k !== id);
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
      const open = arr(g.open), t = api.now();
      if (g.res.t === 'match') {
        g.matched = g.matched && !Array.isArray(g.matched) ? g.matched : Object.assign({}, g.matched || {});
        open.forEach(k => { g.matched[k] = g.turn; });
        g.scores[g.turn] = (g.scores[g.turn] || 0) + 1;
        const done = Object.values(g.matched).filter(Boolean).length >= g.deck.length;
        if (done) g.over = true;
      } else {
        g.turn = other(g, g.turn);
      }
      g.open = null; g.res = null; g.turnStart = t;
      return g;
    });
  }

  function timeout(turnStart) {
    api.transaction(gPath(), g => {
      if (!g || g.over || g.res || g.turnStart !== turnStart) return undefined;
      g.open = null; g.turn = other(g, g.turn); g.turnStart = api.now();
      return g;
    });
  }

  function forfeit(loser) {
    api.transaction(gPath(), g => (g && !g.over ? { ...g, over: true, forfeit: loser } : undefined));
  }

  /* ---------- Fin de partie et revanche ---------- */
  function showEnd(g) {
    endShown = g.n;
    const ps = playersOf(room), sc = id => (g.scores && g.scores[id]) || 0;
    const winners = g.forfeit ? ps.filter(p => p.id !== g.forfeit) : ps.filter(p => sc(p.id) === Math.max(...ps.map(q => sc(q.id))));
    const iWin = winners.length === 1 && winners[0].id === api.uid;
    const tie = winners.length > 1;
    play(iWin || tie ? 'win' : 'lose');
    $('rTitle').textContent = tie ? T.tie : iWin ? T.youWin : T.winner(winners[0].name);
    const quitter = g.forfeit && ps.find(p => p.id === g.forfeit);
    $('rText').textContent = quitter ? T.forfeitText(quitter.name) : T.scoreLine(...ps.map(p => T.pairs(sc(p.id))));
    const ranked = ps.slice().sort((a, b) => winners.includes(b) - winners.includes(a) || sc(b.id) - sc(a.id));
    $('rRank').innerHTML = ranked.map(p => {
      const win = winners.includes(p), pos = win ? 1 : 2, i = ps.indexOf(p);
      const cup = win ? `<b class="trophy" role="img" aria-label="${T.winnerCup}">🏆</b>` : '';
      return `<li class="${win ? 'first' : ''}" style="--pc:${COLORS[i]}"><i></i><span>${pos}. ${esc(p.name)}</span>${cup}<em>${T.pairs(sc(p.id))}</em></li>`;
    }).join('');
    $('rRank').hidden = false; $('rGrid').hidden = true; $('rStars').hidden = true; $('rCount').hidden = true;
    $('rRecord').hidden = true; $('rUnlock').hidden = true; $('rNext').hidden = true; $('rAgain').hidden = false;
    $('rHome').textContent = T.quit;
    againAction = () => api.update(`rooms/${code}/players/${api.uid}`, { rematch: g.n });
    els.overlay.hidden = false; $('rAgain').focus();
  }

  function updateEndButtons(g, opp) {
    const me = room.players[api.uid] || {};
    const gone = !opp || opp.left;
    const again = $('rAgain');
    if (gone) { again.disabled = true; again.textContent = T.oppLeft(opp ? opp.name : ''); }
    else if (me.rematch === g.n) { again.disabled = true; again.textContent = T.rematchWait(opp.name); }
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
    if (/^#[A-Z2-9]{4}$/i.test(location.hash)) setTab('online');
  }

  window.Online = { panel, click, leave: () => { if (code) leave(); }, get active() { return !!code; }, get room() { return room; }, get uid() { return api && api.uid; } };
  addEventListener('resize', () => { if (S && S.online) fit(); });
  resume();
})();
