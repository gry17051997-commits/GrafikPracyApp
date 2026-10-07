# Grafik Pracy Central API

Centralny backend aplikacji. Firestore i Firebase Functions nie są wymagane.

## Wymagania

- Node.js 20+
- PostgreSQL
- DATABASE_URL

## Uruchomienie

npm ci
npm start

Serwer automatycznie wykonuje schema.sql przy starcie.

## API

- POST /api/auth/register
- POST /api/auth/login
- GET /api/me
- GET/POST/PATCH/DELETE /api/users...
- GET/POST/PATCH/DELETE /api/vehicles...
- GET/POST/PATCH /api/phones...
- GET/POST /api/assignments...
- POST /api/gps przez X-Device-Token
- GET /api/gps/vehicles
- GET /api/gps/:vehicleId/history
- GET/PUT /api/schedules/:weekId
- centralny store dokumentowy pod /api/store

## Telefon GPS

Administrator tworzy telefon w panelu, a backend zwraca jednorazowy token urządzenia. Token zapisuje się na konkretnym telefonie. Administrator następnie przypisuje telefon do samochodu. Nadajnik GPS nie wysyła numeru rejestracyjnego jako źródła prawdy, tylko token urządzenia, a serwer rozpoznaje przypisany samochód.

## Aplikacja

Build Android musi otrzymać zmienną EXPO_PUBLIC_API_URL wskazującą publiczny adres backendu. Bez niej aplikacja celowo nie uruchomi synchronizacji API.

## Bezpieczeństwo

Hasła są obecnie haszowane SHA-256 jako etap migracji. Przed produkcyjnym wdrożeniem należy zastąpić to Argon2id lub scrypt z indywidualną solą. Tokeny sesji i tokeny urządzeń GPS są przechowywane po stronie serwera wyłącznie jako hash.
