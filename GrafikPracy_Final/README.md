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
