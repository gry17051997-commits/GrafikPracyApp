# Grafik Pracy - kontekst dla audytora Gemini

Ten plik jest krótką mapą projektu. Pełnym źródłem prawdy jest kod znajdujący się w repozytorium.

## Główne moduły
- GrafikPracy_Final/AppRuntime.js: główny stan aplikacji, generator, synchronizacja, raporty, powiadomienia i UI.
- GrafikPracy_Final/LiveLocationDashboard.js: dashboard GPS, wybór centralnie przypisanego pojazdu, historia i sugestie raportów.
- GrafikPracy_Final/LocationService.js: nadajnik GPS i komunikacja z centralnym API.
- GrafikPracy_Final/apiClient.js: klient centralnego API oraz kompatybilna warstwa dokumentowego store.
- GrafikPracy_Final/AdminUsersPanel.js: zarządzanie kontami przez centralne API.
- GrafikPracy_Final/AdminFleetPanel.js: samochody, telefony GPS i przypisania.
- backend/server.js: centralny backend Node.js/Express.
- backend/schema.sql: PostgreSQL.
- render.yaml: infrastruktura backendu + PostgreSQL.
- .github/workflows/android-apk.yml: diagnostyka runtime Android.
- .github/workflows/build-apk.yml: produkcyjny APK.
- .github/workflows/web.yml: export/deploy Web.
- .github/workflows/full-audit.yml: walidacja konfiguracji, prebuild i Web.
- .github/workflows/gemini-audit-package.yml: tworzenie paczki dla zewnętrznego audytu.

## Architektura backendu
Firestore i Firebase Functions nie są backendem aplikacji.

Źródłem prawdy dla kont, grafiku, ustawień i GPS jest centralne API z PostgreSQL. Synchronizacja grafiku wykorzystuje identyfikatory zmian w formacie `shift_YYYY-MM-DD_N`, ochronę lokalnych dirty fields oraz optymistyczną kontrolę wersji po stronie centralnego store.

GPS telefonu jest autoryzowany jednorazowym tokenem urządzenia przypisanym administracyjnie do konkretnego pojazdu. Numer rejestracyjny zapisany lokalnie w telefonie nie może zmienić przypisania serwera.

## Aktualny obszar szczególnej uwagi
System raportów godzinowych obejmuje:
- dedykowany Android notification channel,
- MAX importance/priority,
- vibration,
- obsługę kliknięcia powiadomienia,
- ochronę przed ponownym przetworzeniem tego samego/starego response,
- zachowanie ciągłości statusu raportu.

Audytor powinien sprawdzić ten mechanizm end-to-end, a nie tylko obecność pojedynczych instrukcji w kodzie.

## Testy
Główny zestaw regresyjny uruchamiany przez `npm test` znajduje się w `tests/production-hardening.test.js`.

Dodatkowo repozytorium ma osobny workflow kontroli centralnego API oraz workflow pełnego audytu projektu.

## Zasada
Jeżeli coś wygląda poprawnie tylko dlatego, że istnieje test regex/source-inspection, sprawdź także rzeczywiste zachowanie wynikające z kodu.
