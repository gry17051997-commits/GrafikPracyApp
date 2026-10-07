# Grafik Pracy V5 - Central API / Expo

Aplikacja Expo/React Native z lokalnym cache oraz wspólną synchronizacją przez centralne API i PostgreSQL.

## Architektura

- Android/Web: Expo SDK 54 + React Native.
- Backend: Node.js + Express w katalogu `backend/`.
- Baza danych: PostgreSQL.
- Synchronizacja grafiku, kont, ustawień i GPS odbywa się przez centralne API.
- Firebase Firestore i Firebase Functions nie są używane jako backend aplikacji.
- Firebase Hosting może nadal służyć wyłącznie do hostowania statycznej wersji WWW.

## Konta i role

Backend obsługuje role:
- `admin`
- `employee`
- `locator`

Pierwsze konto utworzone przez `POST /api/auth/register` otrzymuje rolę administratora. Kolejne konta są pracownikami. Administrator może następnie tworzyć i edytować konta przez panel aplikacji.

Hasła są przechowywane jako scrypt z losową solą. Tokeny sesji i tokeny urządzeń GPS są przechowywane po stronie serwera wyłącznie jako SHA-256 hash.

## GPS

Administrator tworzy telefon GPS w panelu, otrzymuje jednorazowy token urządzenia i przypisuje telefon do samochodu.

Telefon wysyła lokalizację do:
`POST /api/gps`

przez nagłówek:
`X-Device-Token`

Numer rejestracyjny nie jest źródłem prawdy po stronie telefonu. Serwer rozpoznaje pojazd na podstawie administracyjnego przypisania telefonu.

Historia GPS jest przechowywana przez 7 dni.

## Konfiguracja aplikacji

Build Android musi otrzymać:

`EXPO_PUBLIC_API_URL`

ze wskazaniem publicznego adresu centralnego API.

Bez tej zmiennej aplikacja celowo nie uruchamia synchronizacji sieciowej.

## Backend lokalnie

Wymagania:
- Node.js 20+
- PostgreSQL
- `DATABASE_URL`

Uruchomienie:

```bash
cd backend
npm install
npm start
```

Backend automatycznie wykonuje `schema.sql` przy starcie.

Health check:

`GET /api/health`

## Wdrożenie

W repozytorium znajduje się `render.yaml`, który definiuje centralne API oraz PostgreSQL na Render. Po wdrożeniu publiczny adres usługi należy ustawić jako `EXPO_PUBLIC_API_URL` w procesie budowania APK.

## Budowanie APK

Produkcyjny build APK jest wykonywany przez GitHub Actions. Workflow tworzy natywny projekt Android przez Expo Prebuild, osadza bundle JavaScript i publikuje zweryfikowany APK jako artefakt.

Nie przechowujemy w repozytorium wygenerowanego katalogu `android/` ani gotowych APK.

## Testy

`npm test` uruchamia zestaw regresyjny projektu.

GitHub Actions dodatkowo wykonuje:
- kontrolę backendu,
- walidację Expo,
- eksport WWW,
- prebuild Android,
- kompilację APK,
- testy uruchomieniowe Androida.

Przed wydaniem APK wymagane jest działające centralne API oraz ustawione `EXPO_PUBLIC_API_URL`.
