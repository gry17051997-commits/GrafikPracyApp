# Architektura Grafik Pracy 2.0

- App.js: cienki shell UI i nawigacja.
- src/scheduleEngine.js: czysta logika grafiku, bez React i bez sieci.
- src/data.js: dane domenowe i konfiguracja startowa.
- src/theme.js: tokeny UI.
- przyszłe src/features/*: izolowane moduły domenowe.

Kolejność: Core → Android/Web baseline → backend → schedule persistence → settlement ledger → GPS → reports/notifications → chat/export → widgets.

Startup nie wykonuje połączeń sieciowych i nie wymaga uprawnień systemowych. Awaria backendu lub GPS nie może zablokować renderowania aplikacji.

Generator operuje na przyszłym grafiku. Rozliczenia będą tworzone z zatwierdzonych i wykonanych operacji biznesowych przez ledger. locked nie będzie źródłem prawdy dla historii płatności.