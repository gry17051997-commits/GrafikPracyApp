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

Hasła są haszowane scrypt z indywidualną losową solą. Tokeny sesji i tokeny urządzeń GPS są przechowywane po stronie serwera wyłącznie jako SHA-256 hash.


## Produkcyjna konfiguracja bezpieczeństwa

- `ALLOWED_ORIGINS`: lista originów webowych rozdzielona przecinkami, np. `https://twoja-aplikacja.web.app,https://twoja-aplikacja.firebaseapp.com`. W produkcji pusta lista nie dopuszcza originów przeglądarkowych.
- `TRUST_PROXY`: opcjonalna konfiguracja Express `trust proxy`. Na Renderze domyślnie ufany jest jeden hop proxy; ustaw tę wartość tylko zgodnie z rzeczywistą topologią wdrożenia.
- Limity domyślne: logowanie 12 prób / 15 min na IP, rejestracja 5 / 15 min na IP, endpointy GPS 120 / min na IP.
- Żądania bez nagłówka `Origin` są dopuszczane dla kompatybilności z klientami natywnymi. To nie zastępuje tokena urządzenia ani autoryzacji API.

Harmonogramy obsługują opcjonalne `expectedRevision` w `PUT /api/schedules/:weekId`. Wartość `0` oznacza utworzenie wyłącznie wtedy, gdy harmonogram nie istnieje. Wartość dodatnia wymaga zgodności z aktualną rewizją. Konflikt zwraca HTTP 409 i `REVISION_CONFLICT`. Pominięcie pola zachowuje kompatybilność ze starszymi klientami.
