/* Strimpello — logica degli accordi (nessuna dipendenza dal browser). */
const ChordPro = (() => {
  'use strict';

  const ACC = '(?:#|b|♯|♭)?';
  const SUFFIX = '(?:maj|min|dim|aug|sus|add|m|M|\\+|-|°|ø|[0-9]|b|#|\\(|\\)|,)*';
  const US_ROOT = '[A-G]';
  const IT_ROOT = '(?:Do|Re|Mi|Fa|Sol|La|Si)';

  const US_CHORD = new RegExp(`^${US_ROOT}${ACC}${SUFFIX}(?:\\/${US_ROOT}${ACC})?$`);
  const IT_CHORD = new RegExp(`^${IT_ROOT}${ACC}${SUFFIX}(?:\\/${IT_ROOT}${ACC})?$`);
  const IT_PARTS = /^(Do|Re|Mi|Fa|Sol|La|Si)([#b♯♭]?)(.*?)(?:\/(Do|Re|Mi|Fa|Sol|La|Si)([#b♯♭]?))?$/;
  const IT_TO_US = { Do: 'C', Re: 'D', Mi: 'E', Fa: 'F', Sol: 'G', La: 'A', Si: 'B' };

  // Elementi ammessi in una riga di accordi oltre agli accordi stessi.
  const SEPARATOR = /^(?:\||\|\||\/|-|–|%|\.\.\.|…|x\d+|\(x\d+\)|\d+x|\(\d+x\)|N\.?C\.?)$/i;
  const LABEL = /^[^\s:]{1,20}:$/;

  const fixAcc = (s) => (s || '').replace(/♯/g, '#').replace(/♭/g, 'b');

  function isUsChord(t) { return US_CHORD.test(t); }
  function isItChord(t) { return IT_CHORD.test(t); }
  function isChordToken(t) { return isUsChord(t) || isItChord(t); }

  function itSuffixToUs(s) {
    let x = fixAcc(s);
    x = x.replace(/^min/, 'm').replace(/^-/, 'm');
    x = x.replace(/7\+/, 'maj7');
    if (x === '+') x = 'aug';
    if (x === '4') x = 'sus4';
    if (x === 'm4') x = 'msus4';
    return x;
  }

  /** Converte un accordo in notazione americana. Se non è un accordo lo restituisce invariato. */
  function toAmerican(token) {
    const t = token.trim();
    if (isUsChord(t)) return fixAcc(t);
    if (!isItChord(t)) return token;
    const m = t.match(IT_PARTS);
    if (!m) return token;
    const [, root, acc, rest, bassRoot, bassAcc] = m;
    let out = IT_TO_US[root] + fixAcc(acc) + itSuffixToUs(rest);
    if (bassRoot) out += '/' + IT_TO_US[bassRoot] + fixAcc(bassAcc);
    return out;
  }

  function expandTabs(line, size = 8) {
    if (line.indexOf('\t') === -1) return line;
    let out = '';
    for (const ch of line) {
      if (ch === '\t') out += ' '.repeat(size - (out.length % size));
      else out += ch;
    }
    return out;
  }

  const DIRECTIVE = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i;
  function isDirective(line) { return DIRECTIVE.test(line); }

  /** Una riga è di soli accordi se ogni elemento è un accordo, un separatore o un'etichetta iniziale. */
  function isChordLine(line) {
    if (!line || !line.trim() || isDirective(line)) return false;
    const tokens = line.trim().split(/\s+/);
    let chords = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (isChordToken(t)) { chords++; continue; }
      if (SEPARATOR.test(t)) continue;
      if (i === 0 && LABEL.test(t)) continue;
      return false;
    }
    return chords > 0;
  }

  function tokensWithColumns(line) {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(line))) out.push({ text: m[0], col: m.index });
    return out;
  }

  function mergeChordsIntoLyrics(chordLine, lyricLine) {
    const chords = tokensWithColumns(chordLine).filter((t) => isChordToken(t.text));
    let lyric = lyricLine.replace(/\s+$/, '');
    const textEnd = lyric.length;
    // Un accordo sopra uno spazio si aggancia all'inizio della parola successiva.
    const cols = chords.map(({ col }) => {
      let c = col;
      while (c < textEnd && lyric[c] === ' ') c++;
      return c < textEnd ? c : col;
    });
    for (let i = 1; i < cols.length; i++) if (cols[i] < cols[i - 1]) cols[i] = cols[i - 1];
    const maxCol = cols.length ? cols[cols.length - 1] : 0;
    if (lyric.length < maxCol) lyric = lyric.padEnd(maxCol, ' ');
    for (let i = chords.length - 1; i >= 0; i--) {
      const col = cols[i];
      lyric = lyric.slice(0, col) + '[' + toAmerican(chords[i].text) + ']' + lyric.slice(col);
    }
    return lyric.replace(/\s+$/, '');
  }

  function chordOnlyLine(line) {
    return line.trim().split(/\s+/)
      .map((t) => (isChordToken(t) ? '[' + toAmerican(t) + ']' : t))
      .join(' ');
  }

  /** Testo con gli accordi sopra le parole → ChordPro. */
  function convertChordsOverLyrics(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => expandTabs(l));
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isChordLine(line)) {
        const next = lines[i + 1];
        if (next !== undefined && next.trim() !== '' && !isChordLine(next) && !isDirective(next)) {
          out.push(mergeChordsIntoLyrics(line, next));
          i++;
        } else {
          out.push(chordOnlyLine(line));
        }
      } else {
        out.push(line.replace(/\s+$/, ''));
      }
    }
    return out.join('\n');
  }

  /** Dentro le parentesi quadre converte gli accordi italiani in americani. */
  function normalizeChordPro(text) {
    return text.replace(/\[([^\]\n]+)\]/g, (whole, inner) => {
      const t = inner.trim();
      return isChordToken(t) ? '[' + toAmerican(t) + ']' : whole;
    });
  }

  function looksLikeChordPro(text) {
    if (/^\s*\{\s*(title|t|artist|subtitle|st|comment|c|ci|soc|eoc|start_of_chorus|end_of_chorus|capo|key)\b/mi.test(text)) return true;
    const re = /\[([^\]\n]+)\]/g;
    let m;
    while ((m = re.exec(text))) if (isChordToken(m[1].trim())) return true;
    return false;
  }

  /** Separa il blocco di codice dalla risposta di Gemini e tiene il resto come note. */
  function splitGeminiResponse(raw) {
    const text = raw.replace(/\r\n?/g, '\n');
    const m = text.match(/```[^\n]*\n([\s\S]*?)(?:\n```|$)/);
    if (!m) return { body: text, notes: '' };
    const before = text.slice(0, m.index).trim();
    const after = text.slice(m.index + m[0].length).trim();
    const notes = [before, after].filter(Boolean).join('\n').trim();
    return { body: m[1], notes };
  }

  function tidy(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n').map((l) => l.replace(/\s+$/, '')).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
  }

  /** Toglie titolo e artista dal testo e li restituisce a parte. */
  function extractMeta(text) {
    let title = '';
    let artist = '';
    const kept = [];
    for (const line of text.split('\n')) {
      const m = line.match(DIRECTIVE);
      if (m) {
        const key = m[1].toLowerCase();
        const val = (m[2] || '').trim();
        if (key === 'title' || key === 't') { if (!title) title = val; continue; }
        if (key === 'artist' || key === 'subtitle' || key === 'st') { if (!artist) artist = val; continue; }
      }
      kept.push(line);
    }
    return { title, artist, body: kept.join('\n') };
  }

  /** Testo incollato (risposta di Gemini, ChordPro o accordi sopra il testo) → bozza da rivedere. */
  function importText(raw) {
    const { body: inner, notes } = splitGeminiResponse(raw || '');
    const isCp = looksLikeChordPro(inner);
    const converted = isCp ? normalizeChordPro(inner) : convertChordsOverLyrics(inner);
    const { title, artist, body } = extractMeta(converted);
    return { title, artist, body: tidy(body), notes, source: isCp ? 'chordpro' : 'chords-over-lyrics' };
  }

  /** ChordPro → righe pronte da disegnare. */
  function parse(body) {
    const lines = [];
    let capo = '';
    let inChorus = false;
    for (const raw of (body || '').replace(/\r\n?/g, '\n').split('\n')) {
      const d = raw.match(DIRECTIVE);
      if (d) {
        const key = d[1].toLowerCase();
        const val = (d[2] || '').trim();
        if (key === 'soc' || key === 'start_of_chorus') { inChorus = true; continue; }
        if (key === 'eoc' || key === 'end_of_chorus') { inChorus = false; continue; }
        if (key === 'c' || key === 'comment' || key === 'ci' || key === 'comment_italic' || key === 'cb' || key === 'comment_box') {
          lines.push({ type: 'comment', text: val, chorus: inChorus });
          continue;
        }
        if (key === 'capo') { capo = val; continue; }
        continue; // altre direttive ignorate
      }
      if (!raw.trim()) { lines.push({ type: 'empty', chorus: inChorus }); continue; }
      const parts = raw.split(/\[([^\]\n]*)\]/);
      const segments = [];
      if (parts[0] !== '') segments.push({ chord: '', text: parts[0] });
      for (let i = 1; i < parts.length; i += 2) segments.push({ chord: parts[i].trim(), text: parts[i + 1] || '' });
      const hasChords = segments.some((s) => s.chord);
      lines.push({ type: 'line', segments, hasChords, chorus: inChorus });
    }
    return { capo, lines };
  }

  /** Testo senza accordi né direttive, per la ricerca. */
  function plainText(body) {
    return (body || '')
      .split('\n')
      .filter((l) => !isDirective(l))
      .join('\n')
      .replace(/\[[^\]\n]*\]/g, '');
  }

  /* ---------- Nomi degli accordi: analisi, forma canonica, notazione italiana ---------- */

  const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const US_TO_IT = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const US_PARTS = /^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/;

  const pcOf = (letter, acc) => (NOTE_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;

  /** Suffisso scritto in uno dei modi comuni → suffisso usato nel dizionario. */
  function canonSuffix(raw) {
    let s = fixAcc(raw).replace(/[()]/g, '').replace(/,/g, '');
    s = s.replace(/^min(?!or)/, 'm').replace(/^-/, 'm');
    const map = {
      '': '', maj: '', M: '', major: '', minor: 'm',
      M7: 'maj7', Maj7: 'maj7', ma7: 'maj7', '7M': 'maj7', '7+': 'maj7', 'maj7': 'maj7',
      mM7: 'mmaj7', mmaj7: 'mmaj7', mMaj7: 'mmaj7', 'm7+': 'mmaj7',
      '+': 'aug', '#5': 'aug', aug: 'aug', '+5': 'aug',
      '+7': 'aug7', '7#5': 'aug7', '7+5': 'aug7', aug7: 'aug7',
      '°': 'dim', dim: 'dim', '°7': 'dim7', dim7: 'dim7',
      'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', m7b5: 'm7b5',
      sus: 'sus4', '4': 'sus4', sus4: 'sus4', '2': 'sus2', sus2: 'sus2',
      '7sus': '7sus4', '7sus4': '7sus4', '74': '7sus4', '7-5': '7b5',
      add2: 'add9', madd2: 'madd9', '6/9': '69', 'M9': 'maj9', 'Maj9': 'maj9',
    };
    return Object.prototype.hasOwnProperty.call(map, s) ? map[s] : s;
  }

  /** Scompone un accordo (americano o italiano). null se non è un accordo. */
  function splitChord(name) {
    const t = toAmerican(String(name || '').trim());
    if (!isUsChord(t)) return null;
    const m = t.match(US_PARTS);
    if (!m) return null;
    const [, letter, acc, suffix, bLetter, bAcc] = m;
    const pc = pcOf(letter, acc);
    const out = { letter, acc, suffix, pc, canon: canonSuffix(suffix), bass: null };
    if (bLetter) out.bass = { letter: bLetter, acc: bAcc, pc: pcOf(bLetter, bAcc) };
    return out;
  }

  /** Nomi da cercare nel dizionario, dal più preciso al più generico. */
  function chordKeys(name) {
    const c = splitChord(name);
    if (!c) return null;
    const base = ROOTS[c.pc] + c.canon;
    return { base, slash: c.bass ? base + '/' + ROOTS[c.bass.pc] : null, bassPc: c.bass ? c.bass.pc : null };
  }

  /** Accordo in notazione italiana: Do, Mim, Sib, Do7+, Sol4, Do/Mi. */
  function toItalian(name) {
    const c = splitChord(name);
    if (!c) return name;
    let suffix = c.suffix;
    if (c.canon === 'maj7') suffix = '7+';
    else if (c.canon === 'mmaj7') suffix = 'm7+';
    else if (c.canon === 'sus4') suffix = '4';
    let out = US_TO_IT[c.letter] + c.acc + suffix;
    if (c.bass) out += '/' + US_TO_IT[c.bass.letter] + c.bass.acc;
    return out;
  }

  /** Nome di una nota (0–11) nella notazione scelta. */
  function noteName(pc, notation) {
    const r = ROOTS[pc];
    return notation === 'it' ? US_TO_IT[r[0]] + r.slice(1) : r;
  }

  const displayChord = (name, notation) => (notation === 'it' ? toItalian(name) : name);

  /** Testo digitato nella ricerca (anche minuscolo, anche italiano) → accordo americano o null. */
  function parseQuery(q) {
    let t = String(q || '').trim().replace(/\s+/g, '');
    if (!t) return null;
    const it = t.match(/^(do|re|mi|fa|sol|la|si)(.*)$/i);
    if (it) t = it[1][0].toUpperCase() + it[1].slice(1).toLowerCase() + it[2];
    else t = t[0].toUpperCase() + t.slice(1);
    const c = splitChord(t);
    return c ? toAmerican(t) : null;
  }

  return {
    isChordToken, isChordLine, toAmerican, convertChordsOverLyrics, normalizeChordPro,
    looksLikeChordPro, splitGeminiResponse, extractMeta, importText, parse, plainText, tidy,
    ROOTS, canonSuffix, splitChord, chordKeys, toItalian, noteName, displayChord, parseQuery,
  };
})();

if (typeof module !== 'undefined') module.exports = ChordPro;
