/* Strimpello — interfaccia: archivio, import, revisione, dizionario accordi, impostazioni e backup. */
(() => {
  'use strict';

  const VERSION = '0.2.0';
  const DAY = 24 * 60 * 60 * 1000;
  const SIZE_MIN = 14;
  const SIZE_MAX = 34;
  const SIZE_DEFAULT = 19;

  const GEMINI_PROMPT = `Trascrivi in formato ChordPro la canzone nelle immagini allegate. Se le immagini sono più di una, sono pagine della stessa canzone, in ordine.

Regole:
1. Prima riga {title: Titolo}, seconda riga {artist: Artista}. Se non li vedi, lascia il valore vuoto. Se è indicato il capotasto, aggiungi {capo: N}.
2. Copia il testo esattamente com'è, nella lingua originale: non correggere, non tradurre, non completare parti mancanti o illeggibili.
3. Metti ogni accordo tra parentesi quadre subito prima della sillaba sopra cui è scritto. Esempio: [Am]Ciao, [G]come stai. Se l'accordo cade su uno spazio o a fine riga, mettilo nel punto più vicino.
4. Scrivi gli accordi in notazione americana: Do=C, Re=D, Mi=E, Fa=F, Sol=G, La=A, Si=B. Minori: Mim o Mi- = Em. Alterazioni: Sib = Bb, Fa# = F#. Estensioni: Re7 = D7, Lam7 = Am7, Do7+ = Cmaj7, Sol4 o Solsus4 = Gsus4, Midim = Edim.
5. Righe con soli accordi (intro, intermezzi, finale): scrivile su una riga, es. [C] [G] [Am] [F].
6. Ritornello tra {start_of_chorus} e {end_of_chorus}. Altre etichette come {comment: Intro}, {comment: Strofa 2}, {comment: x2}.
7. Ignora tablature, diagrammi degli accordi, numeri di pagina e note editoriali.
8. Lascia una riga vuota tra una strofa e l'altra.
9. Restituisci la canzone in un unico blocco di codice, senza testo prima.
10. Dopo il blocco, elenca brevemente gli accordi o le parole che non hai letto con certezza. Se non ce ne sono, scrivi «Nessun dubbio».`;

  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  };

  /* ---------- Archivio (IndexedDB) ---------- */
  let dbPromise;
  function openDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const r = indexedDB.open('strimpello', 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return dbPromise;
  }
  function run(storeName, mode, fn) {
    return openDB().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const s = t.objectStore(storeName);
      let out;
      const req = fn(s);
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const Songs = {
    all: () => run('songs', 'readonly', (s) => s.getAll()),
    get: (id) => run('songs', 'readonly', (s) => s.get(id)),
    put: (song) => run('songs', 'readwrite', (s) => s.put(song)),
    del: (id) => run('songs', 'readwrite', (s) => s.delete(id)),
    replaceAll: (songs) => run('songs', 'readwrite', (s) => { s.clear(); songs.forEach((x) => s.put(x)); }),
    addMany: (songs) => run('songs', 'readwrite', (s) => { songs.forEach((x) => s.put(x)); }),
  };
  const Meta = {
    get: (k) => run('meta', 'readonly', (s) => s.get(k)),
    set: (k, v) => run('meta', 'readwrite', (s) => s.put(v, k)),
  };

  /* ---------- Stato e utilità ---------- */
  const state = { songs: [], query: '', draft: null, listScroll: 0, installEvent: null, route: '', instrument: 'ukulele', notation: 'us', dictRoot: 0, dictQuery: '' };
  const view = document.getElementById('view');
  const bar = document.getElementById('topbar');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const fmtDate = (ts) => new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(ts);
  const dateStamp = () => new Date().toISOString().slice(0, 10);
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'it', { sensitivity: 'base' });

  function indexSong(s) {
    s._idx = norm([s.title, s.artist, ChordPro.plainText(s.body)].join(' '));
    return s;
  }
  function cleanSong(s) {
    return { id: s.id, title: s.title, artist: s.artist || '', body: s.body || '', createdAt: s.createdAt, updatedAt: s.updatedAt };
  }
  async function loadSongs() {
    const all = await Songs.all();
    state.songs = all.map(indexSong).sort(byTitle);
  }
  const markChanged = () => Meta.set('changedSinceBackup', true);

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /** Dialogo modale; restituisce il valore del pulsante scelto ('' se chiuso). */
  function ask({ title, text, buttons }) {
    const d = document.getElementById('dialog');
    d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${buttons
      .map((b) => `<button class="btn ${b.kind || ''}" value="${esc(b.value)}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}</form>`;
    return new Promise((resolve) => {
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue), { once: true });
      d.showModal();
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function setNav(tab) {
    document.body.classList.toggle('has-nav', !!tab);
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }
  function setBar(html) {
    bar.innerHTML = html;
    bar.classList.toggle('scrolled', window.scrollY > 4);
  }
  const mainBar = () => setBar('<span class="wordmark">Strimpello</span><span class="spacer"></span>');

  function goBack(fallback = '#/') {
    if (history.length > 1 && state.cameFromApp) history.back();
    else location.replace(fallback);
  }

  async function applyLyricSize() {
    if (!state.lyricSize) state.lyricSize = (await Meta.get('lyricSize')) || SIZE_DEFAULT;
    document.documentElement.style.setProperty('--lyric-size', state.lyricSize + 'px');
    return state.lyricSize;
  }

  /* ---------- Disegno del testo con gli accordi ---------- */
  const showChord = (name) => ChordPro.displayChord(name, state.notation);

  function renderLyrics(body, { tap = false } = {}) {
    const { lines } = ChordPro.parse(body);
    let html = '';
    let open = false;
    for (const ln of lines) {
      if (ln.chorus && !open) { html += '<div class="chorus">'; open = true; }
      if (!ln.chorus && open) { html += '</div>'; open = false; }
      if (ln.type === 'empty') { html += '<div class="gap"></div>'; continue; }
      if (ln.type === 'comment') { html += `<p class="cm">${esc(ln.text)}</p>`; continue; }
      if (!ln.hasChords) {
        html += `<p class="ln"><span class="ly">${esc(ln.segments.map((s) => s.text).join(''))}</span></p>`;
        continue;
      }
      html += '<p class="ln has-ch">' + ln.segments.map((s) => {
        const ch = !s.chord ? '<span class="ch"></span>'
          : tap ? `<button class="ch" data-act="chord" data-chord="${esc(s.chord)}">${esc(showChord(s.chord))}</button>`
            : `<span class="ch">${esc(showChord(s.chord))}</span>`;
        return `<span class="seg">${ch}<span class="ly">${s.text ? esc(s.text) : '\u200b'}</span></span>`;
      }).join('') + '</p>';
    }
    if (open) html += '</div>';
    return html || '<p class="hint">Nessun testo.</p>';
  }

  /* ---------- Vista: elenco ---------- */
  async function reminderHtml() {
    if (!state.songs.length) return '';
    if (!(await Meta.get('changedSinceBackup'))) return '';
    const now = Date.now();
    const snooze = await Meta.get('reminderSnoozeUntil');
    if (snooze && now < snooze) return '';
    const last = await Meta.get('lastBackupAt');
    if (last && now - last < 14 * DAY) return '';
    const text = last
      ? 'L\u2019ultimo backup ha più di 14 giorni e nel frattempo hai aggiunto o modificato canzoni.'
      : 'Non hai ancora fatto un backup: se il telefono si rompe o lo resetti, le canzoni si perdono.';
    return `<div class="banner" role="note"><p>${text}</p><div class="row"><a class="btn primary" href="#/backup">Fai il backup</a><button class="btn" data-act="snooze">Più tardi</button></div></div>`;
  }

  function installHtml() {
    if (!state.installEvent) return '';
    return `<div class="banner" role="note"><p>Installa Strimpello sulla schermata Home: si apre a schermo intero e funziona anche senza connessione.</p><div class="row"><button class="btn primary" data-act="install">Installa</button></div></div>`;
  }

  function renderResults() {
    const box = document.getElementById('results');
    if (!box) return;
    const words = norm(state.query).split(/\s+/).filter(Boolean);
    const list = words.length ? state.songs.filter((s) => words.every((w) => s._idx.includes(w))) : state.songs;
    const n = state.songs.length;
    const count = words.length
      ? (list.length ? `${list.length} ${list.length === 1 ? 'risultato' : 'risultati'}` : `Nessuna canzone trovata per «${esc(state.query.trim())}».`)
      : `${n} ${n === 1 ? 'canzone' : 'canzoni'}`;
    box.innerHTML = `<p class="count">${count}</p><ul class="songs">${list.map((s) =>
      `<li><a href="#/canzone/${encodeURIComponent(s.id)}"><span class="t">${esc(s.title)}</span>${s.artist ? `<span class="a">${esc(s.artist)}</span>` : ''}</a></li>`).join('')}</ul>`;
  }

  async function viewList() {
    setNav('list');
    mainBar();
    if (!state.songs.length) {
      view.innerHTML = `${installHtml()}<div class="empty"><h2>Ancora nessuna canzone</h2><p>Fotografa una pagina del tuo libro o fai uno screenshot, trascrivilo con Gemini e incolla qui il risultato.</p><a class="btn primary" href="#/aggiungi">Aggiungi la prima canzone</a></div>`;
      return;
    }
    view.innerHTML = `
      <div style="margin-top:4px">
        <label class="visually-hidden" for="q">Cerca tra le canzoni</label>
        <input id="q" class="search" type="search" placeholder="Cerca titolo, artista o testo" value="${esc(state.query)}" autocomplete="off" enterkeyhint="search">
      </div>
      ${installHtml()}
      ${await reminderHtml()}
      <div id="results"></div>`;
    renderResults();
    document.getElementById('q').addEventListener('input', (e) => { state.query = e.target.value; renderResults(); });
    requestAnimationFrame(() => window.scrollTo(0, state.listScroll || 0));
  }

  /* ---------- Vista: canzone ---------- */
  async function viewSong(id) {
    const song = state.songs.find((s) => s.id === id) || (await Songs.get(id));
    if (!song) { toast('Questa canzone non c\u2019è più.'); location.replace('#/'); return; }
    setNav(null);
    setBar(`
      <button class="icon-btn" data-act="back" aria-label="Torna alle canzoni">${ICON.back}</button>
      <span class="bar-title" id="bar-title"></span>
      <button class="icon-btn" data-act="smaller" aria-label="Testo più piccolo">A\u2212</button>
      <button class="icon-btn" data-act="bigger" aria-label="Testo più grande">A+</button>
      <a class="icon-btn" href="#/modifica/${encodeURIComponent(song.id)}" aria-label="Modifica canzone">${ICON.edit}</a>`);
    const { capo } = ChordPro.parse(song.body);
    view.innerHTML = `
      <header class="song-head">
        <h1>${esc(song.title)}</h1>
        ${song.artist ? `<div class="artist">${esc(song.artist)}</div>` : ''}
        ${capo ? `<div class="capo">Capotasto al ${esc(capo)}° tasto</div>` : ''}
      </header>
      <div class="lyrics">${renderLyrics(song.body, { tap: true })}</div>`;
    state.currentTitle = song.title;
    await applyLyricSize();
  }

  function changeSize(delta) {
    const cur = state.lyricSize || SIZE_DEFAULT;
    const next = Math.min(SIZE_MAX, Math.max(SIZE_MIN, cur + delta));
    state.lyricSize = next;
    document.documentElement.style.setProperty('--lyric-size', next + 'px');
    Meta.set('lyricSize', next);
    if (next === cur) toast(delta > 0 ? 'Dimensione massima' : 'Dimensione minima');
  }

  /* ---------- Diagrammi degli accordi ---------- */
  const INSTRUMENTS = { ukulele: 'Ukulele', guitar: 'Chitarra' };
  const MAIN_TYPES = [
    ['', 'maggiore'], ['m', 'minore'], ['7', 'settima'], ['maj7', 'settima maggiore'], ['m7', 'minore settima'],
    ['sus2', 'sus2'], ['sus4', 'sus4'], ['dim', 'diminuito'], ['aug', 'aumentato'],
  ];
  const OTHER_TYPES = ['6', 'm6', '9', 'add9', '7sus4', 'dim7', 'm7b5', 'mmaj7', 'maj9', 'm9', 'madd9', '69', 'm69', '11', 'm11', '13', '7b5', 'aug7', '7b9', '7#9'];

  /** Cerca un accordo nel dizionario dello strumento scelto. */
  function findChord(name, inst = state.instrument) {
    const db = CHORD_DB[inst].chords;
    const k = ChordPro.chordKeys(name);
    if (!k) return null;
    if (k.slash && db[k.slash]) return { name: k.slash, positions: db[k.slash], note: '' };
    if (!db[k.base]) return null;
    let note = '';
    if (k.slash) {
      const bass = ChordPro.noteName(k.bassPc, state.notation);
      note = inst === 'ukulele'
        ? `Sull’ukulele il basso ${bass} non si suona: questa è la diteggiatura di ${showChord(k.base)}.`
        : `Diteggiatura di ${showChord(k.base)}, senza il basso ${bass}.`;
    }
    return { name: k.base, positions: db[k.base], note };
  }

  /** Diagramma SVG: corde verticali, tasti orizzontali, dita numerate. */
  function diagramSvg(pos, inst = state.instrument) {
    const [fretStr, fingerStr, base, barreStr] = pos;
    const frets = [...fretStr].map((c) => (c === 'x' ? -1 : parseInt(c, 16)));
    const fingers = [...fingerStr].map(Number);
    const barres = [...barreStr].map((c) => parseInt(c, 16));
    const tuning = CHORD_DB[inst].tuning;
    const n = frets.length;
    const rows = Math.max(4, ...frets);
    const sx = n === 4 ? 26 : 20;
    const sy = 26;
    const left = 26;
    const top = 26;
    const w = left + (n - 1) * sx + 18;
    const h = top + rows * sy + 24;
    const X = (i) => left + i * sx;
    const Y = (f) => top + (f - 0.5) * sy;
    const r = n === 4 ? 9.5 : 8;
    let g = '';
    for (let k = 0; k <= rows; k++) g += `<line class="fr" x1="${X(0)}" y1="${top + k * sy}" x2="${X(n - 1)}" y2="${top + k * sy}"/>`;
    for (let i = 0; i < n; i++) g += `<line class="st" x1="${X(i)}" y1="${top}" x2="${X(i)}" y2="${top + rows * sy}"/>`;
    if (base === 1) g += `<rect class="nut" x="${X(0) - 1}" y="${top - 4}" width="${X(n - 1) - X(0) + 2}" height="5" rx="1"/>`;
    else g += `<text class="base" x="${X(0) - 10}" y="${Y(1) + 4}" text-anchor="end">${base}</text>`;
    const covered = new Set();
    for (const b of barres) {
      const idx = frets.map((f, i) => (f === b ? i : -1)).filter((i) => i >= 0);
      if (idx.length < 2) continue;
      const a = Math.min(...idx);
      const z = Math.max(...idx);
      idx.forEach((i) => covered.add(i));
      g += `<rect class="dot" x="${X(a) - r}" y="${Y(b) - r}" width="${X(z) - X(a) + 2 * r}" height="${2 * r}" rx="${r}"/>`;
      const fg = fingers[idx[0]];
      if (fg) g += `<text class="fg" x="${(X(a) + X(z)) / 2}" y="${Y(b) + 4}" text-anchor="middle">${fg}</text>`;
    }
    frets.forEach((f, i) => {
      if (f < 0) g += `<text class="mk" x="${X(i)}" y="${top - 9}" text-anchor="middle">×</text>`;
      else if (f === 0) g += `<circle class="open" cx="${X(i)}" cy="${top - 13}" r="4.5"/>`;
      else if (!covered.has(i)) {
        g += `<circle class="dot" cx="${X(i)}" cy="${Y(f)}" r="${r}"/>`;
        if (fingers[i]) g += `<text class="fg" x="${X(i)}" y="${Y(f) + 4}" text-anchor="middle">${fingers[i]}</text>`;
      }
      const tn = ChordPro.noteName(ChordPro.splitChord(tuning[i]).pc, state.notation);
      g += `<text class="tn" x="${X(i)}" y="${h - 6}" text-anchor="middle">${esc(tn)}</text>`;
    });
    return `<svg class="diagram" viewBox="0 0 ${w} ${h}" aria-hidden="true">${g}</svg>`;
  }

  const describePos = (pos) => (pos[2] === 1 ? 'Prima posizione' : `Dal ${pos[2]}° tasto`);

  /** Foglio con tutte le posizioni di un accordo (dal dizionario o toccandolo in una canzone). */
  function openChord(name) {
    const sheet = document.getElementById('sheet');
    const found = findChord(name);
    const inst = INSTRUMENTS[state.instrument];
    let body;
    if (!found) {
      body = `<p class="sheet-msg">Non ho il diagramma di «${esc(showChord(name))}» per ${state.instrument === 'ukulele' ? 'l’ukulele' : 'la chitarra'}.</p>`;
    } else {
      body = (found.note ? `<p class="sheet-msg">${esc(found.note)}</p>` : '') +
        `<div class="positions">${found.positions.map((p, i) =>
          `<figure class="pos">${diagramSvg(p)}<figcaption>${i + 1}. ${describePos(p)}</figcaption></figure>`).join('')}</div>`;
    }
    sheet.innerHTML = `<div class="sheet-head"><h2>${esc(showChord(name))}</h2><span class="sheet-inst">${inst}</span><button class="icon-btn" data-act="close-sheet" aria-label="Chiudi">${ICON.close}</button></div>${body}`;
    if (!sheet.open) sheet.showModal();
  }

  /* ---------- Vista: dizionario ---------- */
  function instSwitch() {
    return `<div class="tabs" role="group" aria-label="Strumento">${Object.entries(INSTRUMENTS).map(([k, label]) =>
      `<button data-act="set-inst" data-value="${k}" aria-pressed="${state.instrument === k}">${label}</button>`).join('')}</div>`;
  }

  function chordCard(name, label) {
    const f = findChord(name);
    if (!f) return '';
    return `<button class="card" data-act="chord" data-chord="${esc(name)}">${diagramSvg(f.positions[0])}<span class="cn">${esc(showChord(name))}</span>${label ? `<span class="cl">${esc(label)}</span>` : ''}</button>`;
  }

  function renderDict() {
    const box = document.getElementById('dict');
    if (!box) return;
    const q = state.dictQuery.trim();
    let top = '';
    if (q) {
      const us = ChordPro.parseQuery(q);
      if (!us) {
        top = `<p class="count">Scrivi il nome di un accordo, per esempio ${state.notation === 'it' ? 'Lam7 o Fa#m' : 'Am7 o F#m'}.</p>`;
      } else {
        state.dictRoot = ChordPro.splitChord(us).pc;
        const card = chordCard(us);
        top = card ? `<div class="cards one">${card}</div>`
          : `<p class="count">Nessun diagramma per «${esc(showChord(us))}». Ecco gli accordi di ${esc(ChordPro.noteName(state.dictRoot, state.notation))}.</p>`;
      }
    }
    const root = ChordPro.ROOTS[state.dictRoot];
    const rootName = esc(ChordPro.noteName(state.dictRoot, state.notation));
    const chips = ChordPro.ROOTS.map((x, i) =>
      `<button class="chip" data-act="root" data-value="${i}" aria-pressed="${i === state.dictRoot}">${esc(ChordPro.noteName(i, state.notation))}</button>`).join('');
    const main = MAIN_TYPES.map(([s, label]) => chordCard(root + s, label)).join('');
    const other = OTHER_TYPES.map((s) => chordCard(root + s)).join('');
    box.innerHTML = `${top}<div class="chips" role="group" aria-label="Nota">${chips}</div>
      <h2 class="sub">Accordi di ${rootName}</h2><div class="cards">${main}</div>
      ${other ? `<h2 class="sub">Altri accordi di ${rootName}</h2><div class="cards">${other}</div>` : ''}`;
  }

  function viewDict() {
    setNav('dict');
    mainBar();
    view.innerHTML = `
      <div style="margin-top:4px">
        <label class="visually-hidden" for="dq">Cerca un accordo</label>
        <input id="dq" class="search" type="search" placeholder="Cerca un accordo, es. ${state.notation === 'it' ? 'Lam7' : 'Am7'}" value="${esc(state.dictQuery)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      </div>
      ${instSwitch()}
      <div id="dict"></div>`;
    renderDict();
    document.getElementById('dq').addEventListener('input', (e) => { state.dictQuery = e.target.value; renderDict(); });
  }

  async function setSetting(key, value) {
    state[key] = value;
    await Meta.set(key, value);
    const sheet = document.getElementById('sheet');
    if (sheet.open) sheet.close();
    const y = window.scrollY;
    await route();
    window.scrollTo(0, y);
  }

  /* ---------- Vista: aggiungi ---------- */
  function viewAdd() {
    setNav('add');
    mainBar();
    view.innerHTML = `
      <h1 class="page">Aggiungi una canzone</h1>
      <ol class="steps">
        <li>Copia il prompt e incollalo in Gemini insieme alla foto o allo screenshot.</li>
        <li>Copia il blocco di testo che Gemini ti restituisce.</li>
        <li>Incollalo qui sotto.</li>
      </ol>
      <div class="row">
        <button class="btn" data-act="copy-prompt">${ICON.copy}Copia prompt</button>
        <a class="btn" href="https://gemini.google.com/app" target="_blank" rel="noopener">Apri Gemini</a>
      </div>
      <label class="field">
        <span>Testo della canzone</span>
        <textarea id="paste" class="text paste" placeholder="Incolla qui" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
      </label>
      <p class="hint">Va bene anche il testo copiato da un sito di accordi, con gli accordi scritti sopra le parole.</p>
      <div id="paste-err"></div>
      <div class="actions">
        <button class="btn block" data-act="paste-clip">Incolla dagli appunti</button>
        <button class="btn primary block" data-act="continue">Continua</button>
      </div>`;
  }

  async function continueImport() {
    const raw = document.getElementById('paste').value;
    const err = document.getElementById('paste-err');
    if (!raw.trim()) {
      err.innerHTML = '<p class="field-error">Incolla prima il testo della canzone.</p>';
      document.getElementById('paste').focus();
      return;
    }
    const r = ChordPro.importText(raw);
    state.draft = { id: null, title: r.title, artist: r.artist, body: r.body, notes: r.notes, dirty: true };
    await Meta.set('draft', state.draft);
    location.hash = '#/revisione';
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) { toast('Gli appunti sono vuoti.'); return; }
      document.getElementById('paste').value = text;
    } catch {
      toast('Tieni premuto nel riquadro e scegli Incolla.');
    }
  }

  /* ---------- Vista: revisione e modifica ---------- */
  async function viewReview(editId) {
    let d;
    if (editId) {
      const s = await Songs.get(editId);
      if (!s) { toast('Questa canzone non c\u2019è più.'); location.replace('#/'); return; }
      d = { id: s.id, title: s.title, artist: s.artist, body: s.body, notes: '', createdAt: s.createdAt, dirty: false };
    } else {
      d = state.draft || (await Meta.get('draft'));
      if (!d) { location.replace('#/aggiungi'); return; }
    }
    state.draft = d;
    setNav(null);
    setBar(`<button class="icon-btn" data-act="cancel-review" aria-label="Annulla">${ICON.back}</button><span class="bar-title">${editId ? 'Modifica' : 'Nuova canzone'}</span>`);
    view.innerHTML = `
      <h1 class="page">${editId ? 'Modifica canzone' : 'Controlla prima di salvare'}</h1>
      ${d.notes ? `<div class="note"><strong>Gemini segnala da controllare</strong>${esc(d.notes)}</div>` : ''}
      <label class="field"><span>Titolo</span><input id="f-title" class="text" value="${esc(d.title)}" autocomplete="off" enterkeyhint="next"></label>
      <div id="title-err"></div>
      <label class="field"><span>Artista</span><input id="f-artist" class="text" value="${esc(d.artist)}" autocomplete="off" enterkeyhint="done"></label>
      <div class="tabs" role="tablist" aria-label="Vista del testo">
        <button role="tab" id="tab-preview" aria-selected="true" aria-controls="pane-preview" data-act="tab" data-pane="preview">Anteprima</button>
        <button role="tab" id="tab-edit" aria-selected="false" aria-controls="pane-edit" data-act="tab" data-pane="edit">Testo e accordi</button>
      </div>
      <div id="pane-preview" role="tabpanel" aria-labelledby="tab-preview" class="preview" data-act="edit-text"><div class="lyrics">${renderLyrics(d.body)}</div><p class="hint">Tocca il testo per modificarlo.</p></div>
      <div id="pane-edit" role="tabpanel" aria-labelledby="tab-edit" hidden>
        <textarea id="f-body" class="text" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(d.body)}</textarea>
        <p class="hint">Ogni accordo va tra parentesi quadre, subito prima della sillaba: [Am]Ciao [G]come stai.</p>
      </div>
      <div class="actions">
        <button class="btn primary block" data-act="save">Salva canzone</button>
        ${editId ? '<button class="btn danger block" data-act="delete">Elimina canzone</button>' : ''}
      </div>`;
    await applyLyricSize();
    if (editId) showPane('edit');

    let t;
    const persist = () => { clearTimeout(t); t = setTimeout(() => { if (!d.id) Meta.set('draft', d); }, 400); };
    document.getElementById('f-title').addEventListener('input', (e) => { d.title = e.target.value; d.dirty = true; persist(); document.getElementById('title-err').innerHTML = ''; });
    document.getElementById('f-artist').addEventListener('input', (e) => { d.artist = e.target.value; d.dirty = true; persist(); });
    document.getElementById('f-body').addEventListener('input', (e) => { d.body = e.target.value; d.dirty = true; persist(); });
  }

  function showPane(name) {
    const isPreview = name === 'preview';
    document.getElementById('tab-preview').setAttribute('aria-selected', String(isPreview));
    document.getElementById('tab-edit').setAttribute('aria-selected', String(!isPreview));
    document.getElementById('pane-preview').hidden = !isPreview;
    document.getElementById('pane-edit').hidden = isPreview;
    if (isPreview) document.querySelector('#pane-preview .lyrics').innerHTML = renderLyrics(state.draft.body);
  }

  async function saveDraft() {
    const d = state.draft;
    const title = (d.title || '').trim();
    if (!title) {
      document.getElementById('title-err').innerHTML = '<p class="field-error">Scrivi il titolo per salvare la canzone.</p>';
      document.getElementById('f-title').focus();
      return;
    }
    const now = Date.now();
    const song = {
      id: d.id || uid(),
      title,
      artist: (d.artist || '').trim(),
      body: ChordPro.tidy(ChordPro.normalizeChordPro(d.body || '')),
      createdAt: d.createdAt || now,
      updatedAt: now,
    };
    await Songs.put(cleanSong(song));
    await markChanged();
    const i = state.songs.findIndex((s) => s.id === song.id);
    if (i >= 0) state.songs[i] = indexSong(song); else state.songs.push(indexSong(song));
    state.songs.sort(byTitle);
    state.draft = null;
    await Meta.set('draft', null);
    toast('Canzone salvata');
    location.replace('#/canzone/' + encodeURIComponent(song.id));
  }

  async function cancelReview() {
    const d = state.draft;
    if (d && d.dirty) {
      const v = await ask({
        title: d.id ? 'Scartare le modifiche?' : 'Scartare questa canzone?',
        text: d.id ? 'La canzone resta com\u2019era prima.' : 'Il testo incollato non verrà salvato.',
        buttons: [{ label: 'Scarta', value: 'discard', kind: 'primary' }, { label: 'Continua a modificare', value: 'stay' }],
      });
      if (v !== 'discard') return;
    }
    state.draft = null;
    await Meta.set('draft', null);
    if (d && d.id) location.replace('#/canzone/' + encodeURIComponent(d.id));
    else location.replace('#/aggiungi');
  }

  async function deleteSong() {
    const d = state.draft;
    const v = await ask({
      title: `Eliminare «${d.title}»?`,
      text: 'La canzone sparisce dal telefono. Resta solo nei backup già fatti.',
      buttons: [{ label: 'Elimina', value: 'delete', kind: 'primary' }, { label: 'Annulla', value: 'cancel' }],
    });
    if (v !== 'delete') return;
    await Songs.del(d.id);
    await markChanged();
    state.songs = state.songs.filter((s) => s.id !== d.id);
    state.draft = null;
    toast('Canzone eliminata');
    location.replace('#/');
  }

  /* ---------- Vista: backup ---------- */
  async function viewBackup() {
    setNav('backup');
    mainBar();
    const n = state.songs.length;
    const last = await Meta.get('lastBackupAt');
    const changed = await Meta.get('changedSinceBackup');
    let persisted = null;
    if (navigator.storage && navigator.storage.persisted) {
      try { persisted = await navigator.storage.persisted(); } catch { persisted = null; }
    }
    const opt = (key, value, label) => `<button data-act="set-${key}" data-value="${value}" aria-pressed="${state[key === 'inst' ? 'instrument' : 'notation'] === value}">${label}</button>`;
    view.innerHTML = `
      <h1 class="page">Impostazioni</h1>
      <section class="section">
        <h2>Strumento</h2>
        <p>Vale per il dizionario e per gli accordi che tocchi nelle canzoni.</p>
        <div class="tabs" role="group" aria-label="Strumento">${opt('inst', 'ukulele', 'Ukulele')}${opt('inst', 'guitar', 'Chitarra')}</div>
      </section>
      <section class="section">
        <h2>Notazione degli accordi</h2>
        <p>Le canzoni restano salvate in notazione americana: cambia solo come le vedi.</p>
        <div class="tabs" role="group" aria-label="Notazione">${opt('notation', 'us', 'Americana: C, Em')}${opt('notation', 'it', 'Italiana: Do, Mim')}</div>
      </section>
      <h1 class="page" style="margin-top:36px">Backup</h1>
      <ul class="facts">
        <li><span>Canzoni sul telefono</span><span>${n}</span></li>
        <li><span>Ultimo backup</span><span>${last ? fmtDate(last) : 'Mai'}</span></li>
        <li><span>Modifiche non ancora nel backup</span><span>${changed && n ? 'Sì' : 'No'}</span></li>
        <li><span>Protezione dalla pulizia di Chrome</span><span>${persisted === true ? 'Attiva' : persisted === false ? 'Non attiva' : 'Non disponibile'}</span></li>
      </ul>
      ${persisted === false ? `<div class="banner"><p>Se il telefono resta senza spazio, Chrome potrebbe cancellare le canzoni. Di solito la protezione si attiva da sola dopo aver installato l\u2019app sulla schermata Home.</p><div class="row"><button class="btn" data-act="persist">Prova ad attivarla</button></div></div>` : ''}
      <section class="section">
        <h2>Esporta</h2>
        <p>Crea un file con tutte le canzoni. Salvalo su Drive o in un altro posto sicuro, fuori dal telefono.</p>
        <button class="btn primary block" data-act="export" ${n ? '' : 'disabled'}>Esporta backup</button>
      </section>
      <section class="section">
        <h2>Ripristina</h2>
        <p>Carica un file di backup creato da Strimpello.</p>
        <button class="btn block" data-act="import">Scegli il file di backup</button>
      </section>
      <p class="version">Strimpello, versione ${VERSION}</p>`;
  }

  async function exportBackup() {
    const songs = (await Songs.all()).map(cleanSong);
    const data = { app: 'strimpello', format: 1, exportedAt: new Date().toISOString(), songs };
    const name = `strimpello-backup-${dateStamp()}.json`;
    const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });
    let how = '';
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup di Strimpello' });
        how = 'share';
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    if (!how) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      how = 'download';
    }
    await Meta.set('lastBackupAt', Date.now());
    await Meta.set('changedSinceBackup', false);
    toast(how === 'download' ? 'Backup salvato nella cartella Download' : 'Backup esportato');
    if (state.route === 'backup') viewBackup();
  }

  function validSong(s) {
    return s && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.body === 'string';
  }

  async function importBackupFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    if (!data || data.app !== 'strimpello' || !Array.isArray(data.songs)) {
      await ask({ title: 'File non riconosciuto', text: 'Scegli un file di backup creato con «Esporta backup» di Strimpello.', buttons: [{ label: 'Ok', value: 'ok', kind: 'primary' }] });
      return;
    }
    const incoming = data.songs.filter(validSong).map((s) => cleanSong({ ...s, createdAt: s.createdAt || Date.now(), updatedAt: s.updatedAt || Date.now() }));
    const have = new Set(state.songs.map((s) => s.id));
    const missing = incoming.filter((s) => !have.has(s.id));
    const n = state.songs.length;
    const v = await ask({
      title: 'Ripristina backup',
      text: `Il file contiene ${incoming.length} ${incoming.length === 1 ? 'canzone' : 'canzoni'}; ${missing.length} non ${missing.length === 1 ? 'è' : 'sono'} sul telefono.` + (n ? ` Sostituendo tutto, le ${n} canzoni attuali vengono rimpiazzate dal backup.` : ''),
      buttons: [
        { label: `Aggiungi le ${missing.length} mancanti`, value: 'merge', kind: 'primary', disabled: !missing.length },
        { label: 'Sostituisci tutto', value: 'replace' },
        { label: 'Annulla', value: 'cancel' },
      ],
    });
    if (v === 'merge') {
      await Songs.addMany(missing);
      await markChanged();
      toast(`${missing.length} ${missing.length === 1 ? 'canzone aggiunta' : 'canzoni aggiunte'}`);
    } else if (v === 'replace') {
      await Songs.replaceAll(incoming);
      await Meta.set('changedSinceBackup', false);
      toast('Archivio ripristinato dal backup');
    } else {
      return;
    }
    await loadSongs();
    viewBackup();
  }

  /* ---------- Navigazione ---------- */
  async function route() {
    const prev = state.route;
    if (prev === 'list') state.listScroll = window.scrollY;
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    const name = parts[0];
    const arg = parts[1] ? decodeURIComponent(parts[1]) : '';
    state.route = { '': 'list', canzone: 'song', accordi: 'dict', aggiungi: 'add', revisione: 'review', modifica: 'edit', backup: 'backup' }[name] || 'list';
    if (state.route !== 'list') window.scrollTo(0, 0);
    switch (state.route) {
      case 'song': await viewSong(arg); break;
      case 'dict': viewDict(); break;
      case 'add': viewAdd(); break;
      case 'review': await viewReview(null); break;
      case 'edit': await viewReview(arg); break;
      case 'backup': await viewBackup(); break;
      default: await viewList();
    }
  }

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    switch (act) {
      case 'back': goBack('#/'); break;
      case 'smaller': changeSize(-2); break;
      case 'bigger': changeSize(2); break;
      case 'copy-prompt':
        toast((await copyText(GEMINI_PROMPT)) ? 'Prompt copiato: incollalo in Gemini' : 'Non riesco a copiare: riprova');
        break;
      case 'paste-clip': pasteFromClipboard(); break;
      case 'continue': continueImport(); break;
      case 'tab': showPane(el.dataset.pane); break;
      case 'chord': openChord(el.dataset.chord); break;
      case 'close-sheet': document.getElementById('sheet').close(); break;
      case 'set-inst': setSetting('instrument', el.dataset.value); break;
      case 'set-notation': setSetting('notation', el.dataset.value); break;
      case 'root':
        state.dictRoot = Number(el.dataset.value);
        state.dictQuery = '';
        document.getElementById('dq').value = '';
        renderDict();
        break;
      case 'edit-text':
        showPane('edit');
        document.getElementById('f-body').focus();
        break;
      case 'save': saveDraft(); break;
      case 'cancel-review': cancelReview(); break;
      case 'delete': deleteSong(); break;
      case 'export': exportBackup(); break;
      case 'import': document.getElementById('file').click(); break;
      case 'persist': {
        const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
        toast(ok ? 'Protezione attivata' : 'Chrome non l\u2019ha concessa: installa l\u2019app e riprova');
        viewBackup();
        break;
      }
      case 'snooze':
        await Meta.set('reminderSnoozeUntil', Date.now() + 3 * DAY);
        el.closest('.banner').remove();
        break;
      case 'install':
        if (state.installEvent) {
          state.installEvent.prompt();
          await state.installEvent.userChoice.catch(() => null);
          state.installEvent = null;
          el.closest('.banner').remove();
        }
        break;
      default: break;
    }
  });

  document.getElementById('sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheet') e.target.close();
  });

  document.getElementById('file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importBackupFile(f);
  });

  window.addEventListener('scroll', () => {
    bar.classList.toggle('scrolled', window.scrollY > 4);
    const t = document.getElementById('bar-title');
    if (t && state.route === 'song') t.textContent = window.scrollY > 90 ? state.currentTitle : '';
  }, { passive: true });

  window.addEventListener('hashchange', () => { state.cameFromApp = true; route(); });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installEvent = e;
    if (state.route === 'list') viewList();
  });
  window.addEventListener('appinstalled', () => { state.installEvent = null; });

  /* ---------- Avvio ---------- */
  async function start() {
    try {
      await loadSongs();
    } catch {
      view.innerHTML = '<div class="empty"><h2>Archivio non disponibile</h2><p>Chrome non permette di salvare dati in questa finestra. Apri Strimpello in una scheda normale, non in incognito.</p></div>';
      return;
    }
    await applyLyricSize();
    state.instrument = (await Meta.get('instrument')) || 'ukulele';
    state.notation = (await Meta.get('notation')) || 'us';
    route();
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => { if (!p && navigator.storage.persist) navigator.storage.persist(); }).catch(() => {});
    }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  start();
})();
