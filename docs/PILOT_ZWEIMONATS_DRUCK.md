# Kontrollierter Zwei-Monats-Druck

Der Drucksatz und die aktive Tafelbelegung sind getrennte Entscheidungen.
Die finale, unblocked Backendrevision ist fuehrend. Zeitraum und Revision muessen
zu der vom Verantwortlichen bestaetigten Druckentscheidung passen. Es erfolgt
keine automatische Kuerzung nach Kartenzahl oder alten 100-Karten-Annahmen.

## Vollstaendiger Druck

Alle gueltigen Tageskarten innerhalb des inklusiven Forecasts muessen genau
einmal in den Eingabe-PDFs enthalten sein. Beispiel:

```sh
npm run pilot:print:merge -- --output /private/full.pdf --forecast-start 2026-10-12 --forecast-end 2026-12-06 --as-of 2026-10-08 --revision /private/final-revision.json --journal /private/allocation.jsonl --witness /private/witness.json /private/part-01.pdf /private/part-02.pdf
```

## Expliziter Bereichsdruck

Eine privat bestaetigte JSON-Auswahl bindet Projekt, Zeitraum und unveraenderte
Bereichspfade. Der Pfad trifft genau den Bereich selbst und Unterbereiche mit
dem Trenner `/`; aehnliche Namen treffen nicht. Keine ID-Zuordnung anhand von Namen.

```json
{
  "schema": "pilot-print-selection-v1",
  "sourceProjectId": "synthetic-project",
  "forecastStart": "2026-10-12",
  "forecastEnd": "2026-12-06",
  "mode": "areas",
  "areaPaths": ["Synthetic Area / North"]
}
```

Gleicher Befehl mit `--selection /private/confirmed-areas.json`. Jede Karte aus
dieser Regel muss genau einmal vorliegen; andere Karten blockieren. Ein im
Donnerstagstand fehlender ausgewaehlter Bereich verlangt erneute Entscheidung.
Auswahlhash, volle Forecastmenge, ausgewaehlte Menge und ausgeschlossene Menge
werden im privaten Ausgabe-Manifest gebunden.

## Vorbereitung und Nachweise

Der betreute Drucklauf kann auch direkt aus der privat gesicherten Liste echter
Backend-Druckvorbereitungen rendern, ohne die Studio-UI umzubauen:

```sh
npm run pilot:print:package -- --output /private/full.pdf --revision /private/final-revision.json --preparations /private/print-jobs.json --journal /private/allocation.jsonl --witness /private/witness.json --as-of 2026-10-08
```

Fuer Bereichsdruck zusaetzlich `--selection /private/confirmed-areas.json`.
Das Werkzeug verwendet exakt den vorhandenen Studio-Renderer und das gebundene
Codebuch; Kartenklartext und Attribute muessen zur finalen Revision passen.
Es ruft keine API auf und vergibt keine IDs. Die Vorbereitungen stammen aus der
einzigen freigegebenen Backendautoritaet und werden vor PDF-Weitergabe gesichert.
Beide Ausgabewege pruefen Journal-Kette, Witness, Requesthashes, Autoritaet,
Projekt und stabile Karten-/Tafelbindungen. Der Renderer akzeptiert ausschliesslich
exakt journalidentische Vorbereitungen; der Merger prueft jedes Kartenpaar gegen
den vergebenen Bestand und einen Auftrag der finalen Revision. Journal-/Witness-
Hashes werden im Ausgabe-Manifest gebunden. Dies ersetzt nicht die anschliessende
unabhaengige externe Sicherung und deren Ruecklesepruefung.

- Originale Studio-PDFs verwenden: 66 x 120 mm je Karte, 18-mm-Kartenraster,
  bestehender Innenrahmen und beide Kartenenden. Kein neues Layout oder UI.
- Maximal 900 Karten je Backend-Druckauftrag; grosse Drucksaetze duerfen in mehrere
  Auftraege zerlegt werden. Das legt weder die physische noch optische Kapazitaet
  einer aktiven Tafel fest. Je aktiver physischer Tafel genau ein vollstaendiger
  Auftrag, hoechstens ein aktives Vorkommen jeder Karte.
- Tafelmarker getrennt drucken; Reservekarten werden nicht mitaktiviert.
- Merger prueft Projekt, kanonischen Revisionshash, exakte Kartenmenge, eindeutige
  Tagpaare, Seitenrotation/UserUnit und Media-/Crop-/Trim-/Bleedmasse.
- PDFs/Manifest vor Weitergabe gemeinsam mit konsistentem Produkt-, Journal- und
  Witnessstand extern sichern und zuruecklesen. Keine technische Ack-Sperre behaupten.
- Copyshop gibt die Karten bei 100 Prozent/tatsaechlicher Groesse im Endformat aus.
  Material und Referenzauftrag sind privat gebunden. Reale Steckplaetze und groesste
  optische Projektbelegung separat vor Aufnahme nachweisen.
