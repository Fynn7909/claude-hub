// Ideen für die Leiste unten: Dinge, die Leute mit Claude bauen und im Netz zeigen
// (Stand Oktober 2026). `prompt` ist der Text, den „Prompt kopieren“ in die Zwischenablage legt.
export const ideas = [
  // ---- Spiele ----
  { tag: 'Spiel', title: 'Shooter mit Waffen-Roulette', prompt: 'Baue ein Ego-Shooter-Spiel im Browser, bei dem sich meine Waffe nach jedem Schuss zufällig ändert. Three.js, eine Arena, Gegnerwellen, Punktestand.' },
  { tag: 'Spiel', title: 'Tower Defense im Browser', prompt: 'Baue ein Tower-Defense-Spiel als eine einzige HTML-Datei: drei Turmarten, Gegnerwellen, Gold, Upgrades und ein Punktestand.' },
  { tag: 'Spiel', title: 'Falsches Betriebssystem als Spiel', prompt: 'Baue ein Browserspiel, das einen kompletten erfundenen Computer zeigt: Desktop, Fenster, Dateien, Fake-Virenmeldungen, die ich wegklicken muss, und ein verstecktes Rätsel.' },
  { tag: 'Spiel', title: 'Firmen-Tycoon', prompt: 'Baue ein Tycoon-Spiel im Browser, in dem ich eine kleine Firma führe: Preise festlegen, Leute einstellen, Kunden verlieren und gewinnen. Jede Runde ist ein Monat.' },
  { tag: 'Spiel', title: 'Lernspiel mit Bossen', prompt: 'Baue ein RPG im Browser mit fünf Welten, das mir ein Thema meiner Wahl beibringt. Jede Aufgabe ist ein Level, am Ende jeder Welt wartet ein Boss mit einer schweren Frage.' },
  { tag: 'Spiel', title: 'Zivilisation über Nacht', prompt: 'Baue eine Simulation, in der kleine KI-Bewohner eine Welt besiedeln, Gesetze beschließen, Gruppen bilden und rebellieren. Lass sie lange laufen und schreibe eine Chronik mit, die ich morgens lesen kann.' },
  { tag: 'Spiel', title: 'Roguelike im Terminal', prompt: 'Baue ein Roguelike für das Terminal: zufällige Dungeons, Gegner, Gegenstände, Permadeath und eine Bestenliste in einer lokalen Datei.' },
  { tag: 'Spiel', title: 'Physik-Sandkasten', prompt: 'Baue einen Physik-Sandkasten im Browser: Sand, Wasser, Feuer, Holz und Stein als Pixel, die miteinander reagieren. Ich male mit der Maus.' },
  { tag: 'Spiel', title: 'Rennspiel aus der Vogelperspektive', prompt: 'Baue ein Rennspiel im Browser aus der Vogelperspektive mit Drift-Physik, Geisterwagen meiner Bestzeit und drei Strecken.' },
  { tag: 'Spiel', title: 'Multiplayer-Quiz für Freunde', prompt: 'Baue ein Quiz, bei dem Freunde über einen Raumcode mit dem Handy beitreten. Fragen laufen auf meinem Bildschirm, Antworten kommen vom Handy, am Ende gibt es ein Siegerpodest.' },
  { tag: 'Spiel', title: 'Schach gegen eine eigene KI', prompt: 'Baue ein Schachspiel im Browser mit einem eigenen Gegner (Minimax mit Alpha-Beta). Drei Stärken, Zug-Rücknahme und Anzeige des besten Zugs.' },
  { tag: 'Spiel', title: 'Idle-Clicker mit Prestige', prompt: 'Baue ein Idle-Spiel im Browser: klicken, Automaten kaufen, Prestige-System, Offline-Fortschritt und Speichern im Browser.' },
  { tag: 'Spiel', title: 'Textadventure mit eigener Welt', prompt: 'Baue ein Textadventure im Browser mit Inventar, Karte und mehreren Enden. Denk dir die Welt selbst aus und halte die Geschichte spannend.' },
  { tag: 'Spiel', title: 'Controller-Spiel für zwei', prompt: 'Baue ein lokales Zwei-Spieler-Spiel im Browser, das mit Gamepads gesteuert wird (Gamepad API): kleine Arena, schnelle Runden, Rumble bei Treffern.' },

  // ---- Kamera, Ton, Bild ----
  { tag: 'Kamera', title: 'Partikel mit der Hand steuern', prompt: 'Baue eine Web-App, die über die Webcam meine Hand erkennt (MediaPipe) und mich Tausende Partikel mit Gesten schieben, ziehen und explodieren lassen lässt.' },
  { tag: 'Kamera', title: 'Luftgitarre mit der Webcam', prompt: 'Baue eine Web-App, die über die Webcam meine Hände erkennt und daraus Gitarrentöne macht: linke Hand wählt den Akkord, rechte schlägt an.' },
  { tag: 'Kamera', title: 'Gesten als Tastenkürzel', prompt: 'Baue ein Programm, das Handgesten vor der Webcam erkennt und damit Lautstärke, Lied vor/zurück und Pause auf meinem Linux-Rechner steuert.' },
  { tag: 'Musik', title: 'Musik-Visualizer', prompt: 'Baue einen Musik-Visualizer im Browser, der auf das Mikrofon oder eine Audiodatei reagiert. Mehrere Stile, die im Takt wechseln, Vollbildmodus.' },
  { tag: 'Musik', title: 'Drumcomputer im Browser', prompt: 'Baue einen Drumcomputer im Browser mit 16 Schritten, eigenen Sounds (Web Audio, keine Dateien), Tempo, Swing und Speichern von Mustern.' },
  { tag: 'Video', title: 'Werbespot nur aus Code', prompt: 'Erstelle einen 30-Sekunden-Werbespot für ein erfundenes Luxusprodukt, komplett aus Code: Drehbuch, animierte Szenen in HTML, Rendern zu einem MP4 mit ffmpeg.' },
  { tag: 'Video', title: 'Automatische Untertitel', prompt: 'Baue ein Skript, das zu einem Video mit Whisper lokal Untertitel erzeugt und sie im TikTok-Stil (Wort für Wort, groß, farbig) ins Video brennt.' },
  { tag: 'Video', title: 'Lange Videos zu Clips schneiden', prompt: 'Baue ein Werkzeug, das ein langes Video transkribiert, die spannendsten Stellen findet und daraus fertige Hochkant-Clips mit Untertiteln schneidet.' },
  { tag: 'Bild', title: 'Fotos nach Datum sortieren', prompt: 'Schreibe ein Skript, das einen Ordner voller Fotos anhand der EXIF-Daten umbenennt und in Monatsordner sortiert. Zeig mir zuerst eine Vorschau, bevor etwas verschoben wird.' },
  { tag: 'Bild', title: 'Pixel-Art-Editor', prompt: 'Baue einen Pixel-Art-Editor im Browser mit Ebenen, Palette, Animation in Einzelbildern und Export als PNG und GIF.' },
  { tag: 'Bild', title: 'Generative Kunst als Hintergrundbild', prompt: 'Schreibe ein Programm, das jeden Tag ein neues generatives Kunstwerk in meiner Bildschirmauflösung erzeugt und als Hintergrundbild setzt (KDE Plasma).' },
  { tag: 'Bild', title: 'ASCII-Kamera', prompt: 'Baue eine Web-App, die das Webcam-Bild live als ASCII-Zeichen zeigt, mit Farbmodus und Knopf zum Speichern als Bild.' },

  // ---- Eigene Daten ----
  { tag: 'Daten', title: 'Betrachter für Arztbilder', prompt: 'Ich habe medizinische Aufnahmen (DICOM) bekommen, die sich nur mit einem Windows-Programm öffnen lassen. Baue mir einen Betrachter im Browser, der die Dateien lokal anzeigt und durchblättern lässt.' },
  { tag: 'Daten', title: 'Ausgaben aus Kontoauszügen', prompt: 'Baue aus meinen Kontoauszügen (CSV oder PDF in einem Ordner) eine lokale Seite mit bunten Diagrammen: Ausgaben pro Monat und Kategorie, größte Posten, Abos.' },
  { tag: 'Daten', title: 'Mein Spotify-Jahr', prompt: 'Baue aus meinem Spotify-Datenexport eine eigene „Wrapped“-Seite: meistgehörte Lieder und Künstler, Hörzeiten nach Uhrzeit, Serien und vergessene Favoriten.' },
  { tag: 'Daten', title: 'Chatverlauf auswerten', prompt: 'Werte einen exportierten WhatsApp-Chat lokal aus: wer schreibt am meisten, zu welcher Uhrzeit, häufigste Wörter und Emojis, längste Funkstille. Als hübsche Seite.' },
  { tag: 'Daten', title: 'Steam-Bibliothek durchleuchten', prompt: 'Baue eine Seite, die meine Steam-Bibliothek auswertet: Spielzeit pro Spiel, nie gestartete Spiele, Geld pro Stunde und ein Zufallsknopf „Was spiele ich heute?“.' },
  { tag: 'Daten', title: 'Datenspuren im Browserverlauf', prompt: 'Lies meinen Browserverlauf lokal aus und zeig mir, wo meine Zeit hingeht: Seiten pro Tag, Uhrzeiten, längste Sitzungen. Nichts davon darf den Rechner verlassen.' },
  { tag: 'Daten', title: 'Tägliche Dosis aus eigenen Notizen', prompt: 'Baue eine kleine Seite, die mir jeden Tag einen zufälligen Eintrag aus meinen eigenen Notizen und gespeicherten Zitaten zeigt, mit Favoriten und „noch einen“.' },
  { tag: 'Daten', title: 'Wissensablage zum Durchsuchen', prompt: 'Baue mir eine lokale Wissensablage: Ich werfe Links, PDFs und Notizen in einen Ordner, du machst daraus eine durchsuchbare Seite mit Zusammenfassungen und Schlagwörtern.' },

  // ---- Automatisierung ----
  { tag: 'Automatik', title: 'Morgenzeitung nur für mich', prompt: 'Baue ein Skript, das jeden Morgen neue Beiträge meiner Lieblingsquellen (RSS, YouTube-Kanäle, Subreddits) holt, zusammenfasst und als eine Leseseite ohne Wiederholungen ablegt.' },
  { tag: 'Automatik', title: 'Download-Ordner räumt sich selbst auf', prompt: 'Schreibe einen Dienst, der meinen Download-Ordner beobachtet und Dateien nach Art und Alter einsortiert. Erst Probelauf mit Liste, dann als systemd-Dienst.' },
  { tag: 'Automatik', title: 'Preiswächter', prompt: 'Baue einen Preiswächter: Ich gebe Produktseiten an, das Skript prüft sie täglich und schickt mir eine Desktop-Benachrichtigung, wenn der Preis unter meine Grenze fällt.' },
  { tag: 'Automatik', title: 'Recherche auf Knopfdruck', prompt: 'Baue einen eigenen Befehl, der zu einem Thema im Netz recherchiert, Quellen vergleicht und einen gegliederten Bericht mit Links als Datei ablegt.' },
  { tag: 'Automatik', title: 'YouTube-Zahlen als Tabelle', prompt: 'Baue ein Skript, das die Zahlen eines YouTube-Kanals holt (Aufrufe, Länge, Titel) und als formatierte Tabelle mit den besten und schlechtesten Videos ausgibt.' },
  { tag: 'Automatik', title: 'Trend-Radar', prompt: 'Baue ein Dashboard, das zu einem Thema meiner Wahl Daten von GitHub, Reddit und YouTube sammelt und zeigt, was diese Woche neu und beliebt ist. Durchsuchbar und filterbar.' },
  { tag: 'Automatik', title: 'Backup, das wirklich läuft', prompt: 'Richte ein automatisches, verschlüsseltes Backup meiner wichtigsten Ordner ein (restic), mit täglichem Lauf, Aufräumregeln und einem Test, ob das Zurückholen klappt.' },
  { tag: 'Automatik', title: 'Screenshots, die man wiederfindet', prompt: 'Baue ein Werkzeug, das den Text in meinen Screenshots per OCR ausliest, die Dateien sinnvoll benennt und eine Suche über alle Screenshots bietet.' },
  { tag: 'Automatik', title: 'Bewerbungen im Blick', prompt: 'Baue eine kleine lokale App, in der ich Bewerbungen verfolge: Firma, Stand, Fristen, Notizen. Mit Kanban-Ansicht und Erinnerung an offene Antworten.' },

  // ---- Claude selbst aufmotzen ----
  { tag: 'Claude', title: 'Spielsounds, wenn Claude fertig ist', prompt: 'Richte Hooks ein, die einen Spielsound abspielen, wenn du fertig bist, und einen anderen, wenn du eine Antwort brauchst oder ein Fehler passiert.' },
  { tag: 'Claude', title: 'Eigene Befehle für Wiederholtes', prompt: 'Schau dir an, was ich dich immer wieder bitte, und baue mir daraus drei eigene Slash-Befehle, die das mit einer Zeile erledigen.' },
  { tag: 'Claude', title: 'Eigener Skill', prompt: 'Baue mir einen eigenen Skill für etwas, das ich oft mache, mit klarer Beschreibung, Beispielen und einem Test, ob er im richtigen Moment anspringt.' },
  { tag: 'Claude', title: 'Eigener MCP-Server', prompt: 'Baue einen kleinen MCP-Server, über den du etwas auf meinem Rechner steuern kannst, das dir bisher fehlt, zum Beispiel Musik, Licht oder Fensteranordnung.' },
  { tag: 'Claude', title: 'Statuszeile mit Stil', prompt: 'Gestalte mir eine eigene Statuszeile für Claude Code: Modell, Ordner, Git-Zweig, Kontextfüllstand und Kosten der Session, farbig und kompakt.' },
  { tag: 'Claude', title: 'Agenten als Fachleute', prompt: 'Lass mehrere Subagenten als verschiedene Fachleute dieselbe Datei prüfen (Sicherheit, Tempo, Lesbarkeit, Gestaltung) und fasse ihre Urteile zu einem Bericht zusammen.' },
  { tag: 'Claude', title: 'Claude mit eigener Website', prompt: 'Baue dir in einem Container eine eigene kleine Website und schreibe dort jeden Tag einen kurzen Beitrag darüber, was du gebaut und gelernt hast.' },
  { tag: 'Claude', title: 'Spielberater mit Stimme', prompt: 'Baue einen Helfer, der in Abständen einen Screenshot meines Strategiespiels macht, die Lage einschätzt und mir den nächsten Zug vorliest.' },

  // ---- Apps und Werkzeuge ----
  { tag: 'App', title: 'Terminal fürs Handy', prompt: 'Baue eine Handy-App, mit der ich mich per SSH auf meinen Rechner verbinde: echtes Terminal, Spracheingabe und eine Benachrichtigung, wenn ein langer Befehl fertig ist.' },
  { tag: 'App', title: 'Gewohnheiten mit Serien', prompt: 'Baue einen Gewohnheits-Tracker als Desktop-App: tägliche Häkchen, Serien, Kalenderansicht wie bei GitHub und eine Wochenübersicht.' },
  { tag: 'App', title: 'Pomodoro im Panel', prompt: 'Baue einen Pomodoro-Timer als Plasma-Widget für die Kontrollleiste, mit Tagesstatistik und einem Ton am Ende jeder Runde.' },
  { tag: 'App', title: 'Zwischenablage mit Gedächtnis', prompt: 'Baue eine Zwischenablage-Verwaltung für Linux: Verlauf der letzten 200 Einträge, Suche per Tastenkürzel, angepinnte Schnipsel, Bilder inklusive.' },
  { tag: 'App', title: 'Spotlight für Linux', prompt: 'Baue einen Schnellstarter für meinen Desktop: Tastenkürzel öffnet ein Suchfeld für Programme, Dateien, Rechnungen und Web-Suche, mit eigenen Erweiterungen.' },
  { tag: 'App', title: 'Wetter im Terminal', prompt: 'Baue ein Wetter-Werkzeug für das Terminal: aktuelle Lage und sieben Tage als ASCII-Grafik, Standort automatisch, ohne API-Schlüssel.' },
  { tag: 'App', title: 'Karteikarten, die mitdenken', prompt: 'Baue eine Karteikarten-App mit verteiltem Wiederholen (wie Anki). Ich gebe ein Thema an, du erzeugst die Karten, die App fragt mich zum richtigen Zeitpunkt ab.' },
  { tag: 'App', title: 'Tagebuch mit Rückblick', prompt: 'Baue ein lokales Tagebuch als Desktop-App: ein Eintrag pro Tag, Stimmung, Suche und „Heute vor einem Jahr“. Alles bleibt verschlüsselt auf meinem Rechner.' },
  { tag: 'App', title: 'Rezepte aus dem Kühlschrank', prompt: 'Baue eine App, in die ich eintrage, was im Kühlschrank ist, und die mir daraus Rezepte vorschlägt, eine Einkaufsliste führt und Ablaufdaten im Blick hält.' },
  { tag: 'App', title: 'Discord-Bot für den eigenen Server', prompt: 'Baue einen Discord-Bot für meinen Server: Umfragen, Musik-Quiz, Level-System und ein Befehl, der die letzten 100 Nachrichten zusammenfasst.' },
  { tag: 'App', title: 'Browser-Erweiterung gegen Ablenkung', prompt: 'Baue eine Browser-Erweiterung, die ablenkende Seiten nach einer Tagesgrenze sperrt und mir zeigt, wie viel Zeit ich wo verbracht habe.' },
  { tag: 'App', title: 'Kurzlinks mit Statistik', prompt: 'Baue einen eigenen Kurzlink-Dienst mit Klickzahlen, QR-Codes und einer kleinen Verwaltungsseite. Läuft lokal oder auf einem kleinen Server.' },

  // ---- Web ----
  { tag: 'Web', title: 'Eigene Website in einer Stunde', prompt: 'Baue mir eine einseitige persönliche Website: wer ich bin, was ich baue, Kontakt. Frag mich kurz nach Inhalten und gib ihr einen eigenen Stil statt einer Vorlage.' },
  { tag: 'Web', title: 'Portfolio als 3D-Zimmer', prompt: 'Baue ein Portfolio als begehbares 3D-Zimmer im Browser (Three.js): Projekte hängen als Bilder an der Wand, Klick öffnet die Details.' },
  { tag: 'Web', title: 'Link-Seite fürs Profil', prompt: 'Baue eine eigene „Link in Bio“-Seite mit Animationen, Klickzählung und Themenwechsel, als eine einzige Datei, die ich überall hosten kann.' },
  { tag: 'Web', title: 'Interaktive Erklärseite', prompt: 'Erkläre mir ein Thema, das ich nie ganz verstanden habe, als interaktive Seite mit Reglern und Animationen, an denen ich selbst drehen kann.' },
  { tag: 'Web', title: 'Sonnensystem zum Durchfliegen', prompt: 'Baue ein Sonnensystem im Browser mit echten Bahndaten, Zeitraffer und Kamera, die einem Planeten folgt.' },
  { tag: 'Web', title: 'Lebenskalender', prompt: 'Baue eine Seite, die mein Leben in Wochen als Raster zeigt: gelebte Wochen gefüllt, wichtige Ereignisse markiert, Ziele für die nächsten Jahre.' },
  { tag: 'Web', title: 'Stadt aus eigenen Git-Commits', prompt: 'Baue eine 3D-Stadt im Browser, in der jedes Hochhaus ein Tag ist und die Höhe für die Zahl meiner Commits steht.' },

  // ---- Rechner und Hardware ----
  { tag: 'System', title: 'Rechner-Check', prompt: 'Untersuche meinen Rechner: Was startet automatisch, was frisst Speicher und Platz, welche Dienste sind überflüssig? Mach Vorschläge und ändere erst nach meiner Zustimmung.' },
  { tag: 'System', title: 'Heimnetz-Karte', prompt: 'Scanne mein Heimnetz und baue eine Seite mit allen Geräten, Herstellern und offenen Ports. Markiere, was unsicher aussieht.' },
  { tag: 'System', title: 'Desktop-Thema aus einem Bild', prompt: 'Baue ein Skript, das aus einem Hintergrundbild eine Farbpalette zieht und daraus passende Farben für KDE Plasma, Terminal und Editor setzt.' },
  { tag: 'System', title: 'Sprachbefehle für den Rechner', prompt: 'Baue eine lokale Sprachsteuerung für meinen Linux-Rechner: Aktivierungswort, Whisper offline, Befehle wie Programme starten, Lautstärke und Fenster verschieben.' },
  { tag: 'System', title: 'Spiele-Launcher mit Vorschau', prompt: 'Baue einen eigenen Spiele-Launcher, der Steam, Emulatoren und einzelne Spiele in einer Oberfläche mit Covern und Controller-Bedienung bündelt.' },
  { tag: 'System', title: 'Controller als Maus', prompt: 'Schreibe ein Programm, das meinen Xbox-Controller zur Maus und Tastatur macht: Sticks bewegen den Zeiger, Tasten sind frei belegbar, Profil pro Programm.' },
  { tag: 'System', title: 'KI komplett offline', prompt: 'Richte ein lokales Sprachmodell auf meiner Grafikkarte ein (Ollama), mit einer kleinen Chat-Oberfläche und einem Vergleich, welches Modell auf meiner Hardware am besten läuft.' },
  { tag: 'System', title: 'Altes Spiel untersuchen', prompt: 'Hilf mir, das Speicherformat eines alten Spiels zu entschlüsseln, und baue einen Spielstand-Editor dafür.' },
];
