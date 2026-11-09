# Migracja PostgreSQL z Render Free do Neon Free

## Cel

Zachować istniejący backend Node.js/Express i przenieść wyłącznie PostgreSQL do zewnętrznej bazy Neon Free. Nie wymaga to zmiany klienta aplikacji ani przepisywania API.

## Limity planu Neon Free

Według dokumentacji sprawdzonej 2026-11-09:
- 1 GB PostgreSQL storage na projekt
- 100 CU-hours compute na projekt miesięcznie
- 5 GB transferu publicznego miesięcznie
- compute automatycznie usypia się po 5 minutach bezczynności i wznawia przy następnym połączeniu
- po wyczerpaniu limitu compute baza może zostać zawieszona do kolejnego okresu rozliczeniowego; dane pozostają zapisane

To plan $0, ale ma limity użycia. Nie jest to gwarancja bezterminowej dostępności bez limitów.

## Przygotowanie projektu Neon

1. Utwórz projekt PostgreSQL w konsoli Neon: https://console.neon.tech/
2. Wybierz region europejski, jeśli jest dostępny.
3. Skopiuj pooled connection string PostgreSQL dla bazy projektu.
4. Nie umieszczaj connection string w repozytorium, plikach aplikacji, issue ani logach.

## Konfiguracja Render

W istniejącej usłudze API używanej przez aplikację (obecnie `grafik-pracy-api-fra`):
1. Otwórz Environment.
2. Ustaw `DATABASE_URL` na pooled connection string z Neon.
3. Zachowaj `NODE_ENV=production`.
4. Zapisz zmianę i wykonaj redeploy.

Nie twórz drugiego API, jeśli obecna usługa `grafik-pracy-api-fra` jest tą, której URL jest zapisany w APK.

## Schemat bazy

Po uruchomieniu backend odczytuje `backend/schema.sql` i wykonuje idempotentne instrukcje tworzące tabele i indeksy. Weryfikuj logi deployu oraz endpoint `/api/health`, który powinien zwrócić HTTP 200 i JSON `{"ok":true,"backend":"central-api","firestore":false}`.

## Pierwsze konto administratora

Endpoint `POST /api/auth/register` nadaje rolę `admin` wyłącznie pierwszemu użytkownikowi, gdy tabela `users` jest pusta. Dlatego:
1. Po uruchomieniu pustej bazy utwórz pierwsze konto przez ekran rejestracji aplikacji lub endpoint rejestracji.
2. Zaloguj się na konto administratora.
3. Dopiero potem dodaj pozostałych pracowników, konta lokalizatora, pojazdy, telefony i przypisania.

Nie otwieraj publicznej rejestracji na długo. Po utworzeniu administratora należy ją zabezpieczyć/wyłączyć w osobnej zmianie backendu, zanim aplikacja będzie szerzej używana.

## Ważne

- Nie zmieniaj `EXPO_PUBLIC_API_URL`, jeżeli nadal wskazuje na działającą usługę API-FRA.
- Nie commituj `DATABASE_URL` ani żadnych haseł.
- Nie usuwaj starej usługi Render ani bazy przed potwierdzeniem działania nowej konfiguracji.
- Nowa baza będzie pusta. Konta, grafiki, pojazdy, przypisania i historia GPS trzeba utworzyć ponownie.
- Ten proces nie odzyskuje danych ze starej bazy Render.
