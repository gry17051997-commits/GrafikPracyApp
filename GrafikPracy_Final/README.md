# Grafik Pracy V5 - Firebase / Expo

Gotowy projekt Expo/React Native z lokalnym zapisem oraz wspólnym grafikiem online przez Firebase Firestore.

## Firebase
Konfiguracja projektu Firebase jest już wpisana w `firebaseConfig.js`.

W Firebase włączone powinny być:
- Authentication -> Email/Password
- Firestore Database

Reguły bezpieczeństwa są w `firestore.rules`.

## Role
Nowe konta rejestrowane w aplikacji otrzymują rolę `employee`.
Aby konto administratora mogło edytować grafik, w Firestore należy w dokumencie `users/<UID>` zmienić pole `role` z `employee` na `admin`.

Pracownik ma dostęp tylko do odczytu wspólnego grafiku. Administrator może generować i edytować grafik.

## Budowanie APK
Projekt używa Expo SDK 54. Produkcyjny build APK jest wykonywany przez GitHub Actions w `.github/workflows/android-apk.yml`. Workflow tworzy natywny projekt Android przez Expo Prebuild, osadza bundle JavaScript i publikuje gotowy APK jako artefakt GitHub Actions.

Nie przechowujemy w repozytorium wygenerowanego katalogu `android/`, paczek ZIP ani lokalnych plików EAS. Dzięki temu źródła pozostają jednoznaczne i build jest powtarzalny.

## Etap 3 - regresja i bezpieczeństwo

Automatyczny zestaw regresyjny znajduje się w `tests/stage3-regression.test.js` i uruchamia się przez:

```bash
npm test
```

Sprawdza m.in.:
- powiązanie zapisów GPS pracownika z administracyjnie przypisanym `vehicleId`,
- ochronę `ownerUid` i zakresów współrzędnych,
- blokadę eskalacji roli i samousuwania,
- zatrzymanie nadajnika GPS przy wylogowaniu/utracie sesji,
- ponowną weryfikację właściciela przed zapisem GPS,
- ochronę przed uruchomieniem drugiego trackera,
- kluczową logikę powiadomień raportów godzinowych,
- podstawową logikę generatora grafiku,
- zgodność wersji Expo/React Native oraz ścieżek web/Android.

Workflow PR uruchamia te testy przed eksportem WWW i budową APK.

### Ważne ograniczenie testów Firebase
Testy etapowe w repozytorium są testami regresyjnymi/static security checks. Nie zastępują pełnego testu Firestore Emulator z prawdziwymi kontami testowymi. Przed produkcyjnym wdrożeniem reguł warto wykonać osobny test integracyjny na projekcie testowym Firebase.

## Obecna architektura produkcyjna

Projekt działa bez Firebase Cloud Functions i bez Cloud Build. APK oraz WWW są budowane przez GitHub Actions na podstawie źródeł z GrafikPracy_Final.

### Konta administratora

Administrator tworzy nowe konto przez drugą, tymczasową instancję Firebase Authentication, dzięki czemu jego własna sesja pozostaje zalogowana. Profil użytkownika jest zapisywany w Firestore.

Usunięcie użytkownika z panelu administratora usuwa jego profil users/<UID> z Firestore i blokuje dostęp do aplikacji. Bez uprzywilejowanego backendu aplikacja nie może fizycznie usunąć cudzego rekordu z Firebase Authentication. UI nie deklaruje już fizycznego usunięcia z Auth.

### Synchronizacja

Grafik tygodniowy jest przechowywany w schedules/<weekId> jako mapa zmian. Zapisy administratora są wykonywane transakcyjnie i rebazowane na świeżym stanie serwera. Wszystkie lokalnie zmienione tygodnie są zapisywane, nie tylko aktualnie otwarty tydzień.

Wspólne ustawienia administracyjne są synchronizowane przez settings/main.

### GPS

locationConfig/main jest źródłem prawdy dla centralnego przypisania pojazdu. Nadajnik lokalizatora nie korzysta ze starego lokalnego numeru rejestracyjnego przy aktywacji. Odczyt dashboardu Teraz jest ograniczony do jednego centralnie przypisanego dokumentu pojazdu.

### Build

Źródła produkcyjne nie są już modyfikowane przez postinstall ani przez skrypty patchujące App.js podczas CI. App.js pozostaje prostym, stałym entry pointem.
