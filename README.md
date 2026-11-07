# Strimpello

Web app per Android dove conservare gli accordi delle canzoni per ukulele e chitarra.
Funziona offline e si installa sulla schermata Home da Chrome.

Le canzoni restano solo sul telefono: questo repository contiene unicamente il codice dell'app.
Per non perderle usa «Esporta backup» nella sezione Backup.

## Pubblicazione

Settings → Pages → «Deploy from a branch», ramo `main`, cartella `/ (root)`.
L'app sarà su `https://<username>.github.io/strimpello/`.

## File

| File | Contenuto |
| --- | --- |
| `index.html` | Pagina e stile |
| `app.js` | Interfaccia, archivio, dizionario, impostazioni, backup |
| `chordpro.js` | Riconoscimento e conversione degli accordi |
| `chords.js` | Diteggiature per ukulele e chitarra, da [chords-db](https://github.com/tombatossals/chords-db) (MIT) |
| `sw.js` | Funzionamento offline |
| `manifest.webmanifest`, `icon-*.png` | Installazione come app |

Versione 0.2.0: tappa 1 (archivio, import, revisione, backup) e dizionario degli accordi.
