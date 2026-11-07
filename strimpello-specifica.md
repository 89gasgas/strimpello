# Strimpello — Specifica dei requisiti

Aggiornata al 7 novembre 2026

## Obiettivo

Strimpello è una web app per il telefono Android dove conservare gli accordi delle canzoni che suoni all'ukulele o alla chitarra. Le canzoni si importano da foto di libri, screenshot o testo copiato, e c'è un dizionario con i diagrammi degli accordi. Tutto gratuito, pubblicato su GitHub, con il codice scritto interamente da Claude.

Nella colonna Origine di ogni tabella: **Tuo** = l'hai chiesto tu; **Proposta** = l'ho aggiunto io e puoi toglierlo; **Da confermare** = manca una tua risposta. I punti aperti sono raccolti in fondo.

## Vincoli

I vincoli escludono server, API a pagamento e sincronizzazione: tutto gira sul telefono.

| Vincolo | Origine |
| --- | --- |
| Solo strumenti gratuiti: nessun servizio a pagamento o a consumo | Tuo |
| Non scrivi né modifichi codice; su GitHub fai solo i passaggi guidati (account, caricamento file, attivazione pubblicazione) | Tuo |
| Un solo dispositivo: telefono Android | Tuo |
| Browser Chrome | Tuo |
| Codice e pubblicazione su GitHub | Tuo |
| Strumento: ukulele o chitarra, a scelta nell'app | Tuo |
| Accordatura standard: ukulele Sol-Do-Mi-La (GCEA), chitarra Mi-La-Re-Sol-Si-Mi (EADGBE) | Tuo |

## Archivio canzoni

L'archivio è la schermata principale: elenco, ricerca e lettura delle canzoni mentre suoni.

| ID | Requisito | Origine |
| --- | --- | --- |
| A1 | Elenco di tutte le canzoni salvate, in ordine di titolo | Tuo |
| A2 | Scheda canzone con titolo, artista e testo, con gli accordi evidenziati sopra le parole | Tuo |
| A3 | Ricerca per titolo, artista o parola del testo | Proposta |
| A4 | Tocco su un accordo nella canzone: si apre il suo diagramma per lo strumento scelto | Proposta |
| A5 | Modifica e cancellazione di una canzone salvata | Proposta |
| A6 | Dimensione del testo regolabile | Proposta |
| A7 | Cambio di tonalità (trasposizione) con due pulsanti, un semitono su o giù | Tuo |
| A8 | Schermo sempre acceso mentre una canzone è aperta | Tuo |
| A9 | Scorrimento automatico del testo: avvio e pausa con un tocco, velocità regolabile, schermo acceso mentre scorre | Tuo |
| A10 | La tonalità scelta e la velocità di scorrimento si ricordano per ogni canzone; il testo originale resta intatto | Proposta |

## Import

Foto e screenshot li trascrivi tu con Gemini, e l'app riceve il testo già pronto. Ogni import passa da una revisione prima del salvataggio.

| ID | Requisito | Origine |
| --- | --- | --- |
| I1 | Foto dalla fotocamera letta con OCR dentro l'app | Tuo — alternativa a I8 |
| I2 | Screenshot dalla galleria letto con OCR dentro l'app | Tuo — alternativa a I8 |
| I3 | Incolla testo: accetta il ChordPro prodotto da Gemini e il testo con gli accordi sopra le parole copiato da un sito | Proposta |
| I4 | Riconoscimento delle righe di soli accordi (es. "Am   G   C") e aggancio di ogni accordo alla sillaba sotto | Proposta |
| I5 | Revisione obbligatoria: testo modificabile, anteprima, campi titolo e artista | Proposta |
| I6 | Condividi verso l'app: un testo condiviso da Gemini o selezionato nel browser apre l'import | Proposta |
| I7 | Import da link di una pagina web | Tuo — rinviato alla fase 2 |
| I8 | Foto e screenshot trascritti da te nell'app Gemini con il prompt qui sotto, poi incollati o condivisi nell'app | Tuo |
| I9 | Pulsante «Copia prompt per Gemini» nella schermata di import | Proposta |

Gli accordi vengono sempre salvati in notazione americana; nell'app si possono mostrare in notazione italiana (D6). Condividere una pagina dal browser invia solo il link, quindi rientra in I7.

## Prompt per Gemini

Allega a Gemini una o più immagini della stessa canzone, incolla questo prompt, poi copia il blocco di codice che restituisce e incollalo nell'app.

```text
Trascrivi in formato ChordPro la canzone nelle immagini allegate. Se le immagini sono più di una, sono pagine della stessa canzone, in ordine.

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
10. Dopo il blocco, elenca brevemente gli accordi o le parole che non hai letto con certezza. Se non ce ne sono, scrivi «Nessun dubbio».
```

I dubbi che Gemini elenca dopo il blocco sono i punti da controllare nella revisione.

## Dizionario accordi

Il dizionario mostra i diagrammi per lo strumento scelto, ukulele o chitarra, ed è lo stesso che si apre toccando un accordo in una canzone.

| ID | Requisito | Origine |
| --- | --- | --- |
| D1 | Elenco degli accordi con diagramma per lo strumento scelto: corde, tasti e posizione delle dita | Tuo |
| D2 | Ricerca per nome (es. "Am7", "F#m") | Proposta |
| D3 | Copertura per tutte le 12 note: maggiori, minori, 7, maj7, m7, sus2, sus4, diminuiti, aumentati | Proposta |
| D4 | Più posizioni sul manico per lo stesso accordo, quando esistono | Proposta |
| D5 | Un accordo di una canzone assente dal dizionario resta visibile come testo, senza diagramma | Proposta |
| D6 | Notazione degli accordi a scelta nelle impostazioni: americana (C, Em, Cmaj7) o italiana; vale per canzoni e dizionario | Tuo |
| D7 | Scelta dello strumento, ukulele o chitarra, nelle impostazioni; vale sia per il dizionario sia per le canzoni | Tuo |
| D8 | Forma italiana: Do, Mim, Sib, Do7, Do7+ (maj7), Sol4 (sus4), Midim | Proposta |
| D9 | La ricerca nel dizionario accetta entrambe le notazioni ("Mim" trova Em) | Proposta |

## Dati e backup

Le canzoni esistono solo sul telefono: senza backup, un reset, un cambio di telefono o la pulizia dei dati di Chrome le cancellano tutte.

| ID | Requisito | Origine |
| --- | --- | --- |
| B1 | Canzoni salvate solo nel telefono, dentro il browser; nessun server, nessun account | Tuo |
| B2 | All'avvio l'app chiede a Chrome l'archiviazione persistente, così non cancella i dati quando manca spazio | Proposta |
| B3 | Esporta backup: un unico file con tutte le canzoni, da salvare su Drive o dove preferisci | Proposta |
| B4 | Importa backup: ripristino da file, aggiungendo le canzoni mancanti o sostituendo tutto | Proposta |
| B5 | Promemoria: avviso se ci sono canzoni nuove e l'ultimo backup ha più di 14 giorni | Proposta |

## Scelte tecniche

Le scelte sono proposte mie, tranne browser e uso di Gemini, pensate per un'app che non dovrai mai mantenere a mano.

| Area | Scelta | Perché |
| --- | --- | --- |
| Tipo di app | PWA: sito web installabile sulla Home, funziona offline | Nessuno store, gratis, si aggiorna da sola |
| Browser | Chrome su Android | Confermato da te; supporta installazione e menu Condividi |
| Codice | HTML, CSS e JavaScript semplici, senza passaggi di compilazione | GitHub la pubblica così com'è; meno parti che si rompono |
| Pubblicazione | GitHub Pages da un repository pubblico | Gratis solo con repo pubblico |
| Contenuto del repo | Solo il codice dell'app, nessuna canzone | I testi delle canzoni sono protetti da copyright |
| Formato canzoni | ChordPro (es. `[Am]Ciao [G]come stai`) | Standard aperto; facilita ricerca, trasposizione ed export |
| Archivio sul telefono | IndexedDB, il database interno del browser | Gratis, offline, nessun server |
| Trascrizione di foto e screenshot | Gemini, usato da te fuori dall'app | Nessun costo aggiuntivo; sulle foto di libri probabilmente più preciso dell'OCR |
| OCR nell'app | Tesseract.js sul telefono, caricato solo quando lo usi | Gratis; alternativa a Gemini; se non lo usi l'app resta leggera |
| Diagrammi | Disegnati dall'app da chords-db 0.5.1 (licenza MIT), copiato nel repository come `chords.js` | Nessun disegno da fare a mano; funziona offline |
| Librerie esterne | Caricate da CDN con versione bloccata | Pochi file da caricare su GitHub; nessun aggiornamento a sorpresa |
| Numero di file | 10, in un'unica cartella | Caricamento manuale semplice |

## Fuori dalla v1

Questi punti restano fuori dalla prima versione e si possono aggiungere dopo senza rifare l'app.

| Funzione | Perché è rinviata | Cosa servirebbe |
| --- | --- | --- |
| Import da link | Il browser non può scaricare pagine di altri siti; molti siti di accordi bloccano i bot | Un server intermedio gratuito (es. Cloudflare Worker) |
| Trascrizione automatica dentro l'app | La trascrizione manuale con Gemini copre la v1; l'abbonamento non include l'uso via API | Una chiave API del piano gratuito di Gemini |
| Backup automatico su GitHub | Il backup a file copre la v1 | Un repository privato e un token creato da te |
| Più dispositivi | Hai chiesto solo il telefono | Sincronizzazione tramite il backup su GitHub |
| Strumenti oltre ukulele e chitarra | Hai chiesto solo questi due | Altri database di diteggiature |

## Rischi

Il rischio principale è che Gemini alteri testo o accordi senza che te ne accorga; il secondo è perdere le canzoni senza backup.

| Rischio | Mitigazione |
| --- | --- |
| Gemini corregge il testo, inventa accordi o li sposta di sillaba | Regole esplicite nel prompt, elenco dei dubbi dopo il blocco, revisione con anteprima (I5) |
| Perdita delle canzoni | Archiviazione persistente (B2), backup a file (B3) e promemoria (B5) |
| Testo copiato da un sito con impaginazione insolita (accordi in linea, font non monospaziati) | Revisione con anteprima; in alternativa uno screenshot del sito passato a Gemini |
| Testi delle canzoni pubblicati per errore | Le canzoni non entrano mai nel repository; restano solo sul telefono e nei tuoi backup |
| Gemini cambia o smette di funzionare così | Il prompt funziona con qualsiasi assistente che legge immagini, Claude compreso |
| Il primo uso dell'OCR richiede internet e scarica alcuni MB di dati per italiano e inglese | Avviso al primo uso; dopo funziona offline |
| Una libreria esterna sparisce o cambia | Versioni bloccate; in caso di problemi la copio nel repository |
| Un file dimenticato durante il caricamento da computer rompe l'app | Pochi file in un'unica cartella da trascinare; istruzioni passo passo con controllo finale |

## Tappe di sviluppo

La v1 si costruisce in tre tappe, ognuna provata sul telefono prima della successiva.

- [ ] Tappa 1: archivio (A1–A3, A5, A6), import con revisione (I3–I5, I8, I9), backup (B1–B5). File consegnati il 7 novembre 2026, da provare sul telefono
- [ ] Tappa 2: dizionario (D1–D9), tocco sull'accordo (A4), trasposizione (A7, A10). Dizionario e tocco sull'accordo consegnati il 7 novembre 2026 (versione 0.2.0) e provati sul telefono; trasposizione consegnata il 7 novembre 2026 (versione 0.3.0), da provare sul telefono
- [ ] Tappa 3: scorrimento automatico e schermo acceso (A8, A9, A10), menu Condividi (I6), OCR (I1, I2). Scorrimento automatico e schermo acceso anticipati alla versione 0.3.0 (7 novembre 2026), da provare sul telefono; restano Condividi e OCR

## Criteri di accettazione della v1

La v1 è pronta quando, sul tuo telefono, riesci a fare tutte queste prove. Spuntale mentre le provi.

- [ ] Installo l'app sulla Home dal link di GitHub Pages
- [ ] In modalità aereo apro l'archivio e leggo una canzone
- [ ] Incollo una canzone copiata da un sito di accordi e, dopo la revisione, gli accordi stanno sopra le sillabe giuste
- [ ] Fotografo una pagina di un libro, la passo a Gemini con il prompt, incollo il risultato nell'app, lo correggo e lo salvo
- [ ] Condivido da Gemini il testo trascritto verso l'app e parte l'import
- [ ] Avvio lo scorrimento automatico, regolo la velocità e lo metto in pausa con un tocco
- [ ] Passo da ukulele a chitarra nelle impostazioni e i diagrammi cambiano
- [ ] Passo alla notazione italiana nelle impostazioni e gli accordi diventano Do, Re, Mim
- [ ] Tocco un accordo in una canzone e vedo il suo diagramma per lo strumento scelto
- [ ] Cerco "Am7" nel dizionario e vedo il diagramma
- [ ] Esporto il backup, cancello i dati dell'app, reimporto il file e ritrovo tutte le canzoni
- [ ] Importo uno screenshot con l'OCR e restano solo correzioni puntuali

## Punti aperti

Tutte le domande sono chiuse e le righe con origine Proposta sono approvate.

- [x] Nome dell'app: Strimpello
- [x] GitHub: account esistente, caricamento da computer
- [x] Trasposizione e schermo sempre acceso: entrambi nella v1
- [x] Accordature: entrambe standard, ukulele GCEA e chitarra EADGBE
- [x] Notazione: a scelta nelle impostazioni
- [x] OCR dentro l'app: tenuto come alternativa a Gemini
- [x] Browser: Chrome
- [x] Lingua delle canzoni: italiano e inglese
- [ ] Gemini rifiuta di trascrivere le canzoni per motivi di copyright (7 novembre 2026): il copia-incolla da un sito (I3) funziona; per foto e screenshot resta l'OCR nell'app (I1, I2). Da decidere se togliere I8 e I9
