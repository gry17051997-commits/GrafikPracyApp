# Grafik Pracy V5 - Firebase

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
Projekt używa Expo SDK 54 i EAS Build. Profil `preview` tworzy APK bez publikowania w Google Play.
