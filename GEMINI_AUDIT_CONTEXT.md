# Grafik Pracy - kontekst dla audytora Gemini

Ten plik jest krótką mapą projektu. Pełnym źródłem prawdy jest kod znajdujący się w pakiecie audytowym.

## Główne moduły
- GrafikPracy_Final/App.js: główny stan aplikacji, generator, synchronizacja, raporty, powiadomienia, UI.
- GrafikPracy_Final/LiveLocationDashboard.js: dashboard GPS, wybór centralnie przypisanego pojazdu, historia i sugestie raportów.
- GrafikPracy_Final/LocationService.js: nadajnik GPS i konfiguracja lokalizacji.
- GrafikPracy_Final/tests/stage3-regression.test.js: regresje source-inspection.
- GrafikPracy_Final/firestore.rules: kontrola dostępu Firestore.
- GrafikPracy_Final/app.json: konfiguracja Expo/Android.
- .github/workflows/android-apk.yml: build debug APK.
- .github/workflows/web.yml: export/deploy Web.
- .github/workflows/full-audit.yml: walidacja konfiguracji, prebuild i Web.
- .github/workflows/gemini-audit-package.yml: tworzenie paczki dla zewnętrznego audytu.

## Aktualny obszar szczególnej uwagi
System raportów godzinowych został ostatnio wzmacniany. Obejmuje:
- dedykowany Android notification channel,
- MAX importance/priority,
- vibration,
- obsługę kliknięcia powiadomienia,
- ochronę przed ponownym przetworzeniem tego samego/starego response,
- zachowanie ciągłości statusu raportu.

Audytor powinien sprawdzić ten mechanizm end-to-end, a nie tylko obecność pojedynczych instrukcji w kodzie.

## Ograniczenie obecnych testów
Testy w stage3-regression.test.js są w dużej części testami inspekcji źródła. Ich przejście nie jest dowodem, że runtime Android/Firebase działa poprawnie.

## Zasada
Jeżeli coś wygląda poprawnie tylko dlatego, że istnieje test regex/source-inspection, sprawdź także rzeczywiste zachowanie wynikające z kodu.
