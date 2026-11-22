# Plan wydzielenia 3gf

## Założenia
- Migracja etapowa, bez zatrzymania obecnego Grafiku Pracy.
- Prace na gałęziach feature i przez Pull Request.
- Bez płatnych usług i bez drugiej produkcyjnej bazy.
- Najpierw stabilizacja, później wydzielenie APK, następnie integracja HYBRID.

## Stan rozpoznany w repozytoriach (2026-11-22)

### GrafikPracyApp/main
- Aplikacja Expo znajduje się w `GrafikPracy_Final/`.
- Backend centralny znajduje się w `backend/`.
- Backend ma już tabele `gps_current`, `gps_history`, `vehicles`, `phones`, `assignments`.
- Backend ma endpointy urządzeń, bieżących pozycji, historii i szczegółów tras.
- Backend ma `backend/tripHistory.js` oraz map matching.
- Aplikacja ma własne `LocationService.js`, ale w odczytanej wersji nie ma kolejki offline.
- `/api/gps` bez warunku czasu aktualizuje bieżącą pozycję również starszym pomiarem. To wymaga poprawki.
- `backend/package.json` nie deklaruje obecnie skryptu testów.

### 3gf/main
- Zawiera ulepszoną obsługę trackingu w `LocationService.js`.
- Ma kolejkę `LOCATION_PENDING_QUEUE_KEY` w AsyncStorage, FIFO, limit 250 i flush po 20 punktów na przebieg.
- Ma `forceRestartVehicleLocationTracking` i mechanizmy odzyskiwania trackingu.
- Zawiera `TripHistoryPanel.js` oraz klienta API do historii tras.
- Algorytm `backend/tripHistory.js` jest taki sam jak w GrafikPracyApp/main według identycznego SHA pliku.
- `backend/server.js` w 3gf jest starszą/inną kopią centralnego backendu i nie powinien być osobno wdrażany.
- `render.yaml` w 3gf definiuje osobny serwis i bazę. Nie używać go w docelowej architekturze.
- `android.package` w 3gf jest obecnie taki sam jak w Grafik Pracy: `pl.grafikpracy.app`. Trzeba zmienić przed osobnym APK.

## Etap 0: bezpieczeństwo i przygotowanie
1. Zachować aktualne `main` obu repozytoriów.
2. Pracować wyłącznie na gałęziach migracyjnych.
3. Zapisać aktualne SHA plików krytycznych i wyniki workflow.
4. Nie zmieniać adresu API produkcyjnego, schematu bazy ani sekretów.
5. Przygotować procedurę rollbacku.

**Kryterium:** obie aplikacje nadal budują się i zachowują dotychczasowe zachowanie.

## Etap 1: stabilizacja centralnego ingestu GPS
1. Dodać monotoniczną aktualizację `gps_current`: aktualizacja tylko, gdy `EXCLUDED.observed_at` jest nowsze niż istniejące.
2. Nadal zachować historię punktów zgodnie z regułami retencji.
3. Dodać testy jednostkowe/integracyjne kolejności pomiarów.
4. Zweryfikować zakres dat i obsługę niepoprawnych timestampów.
5. Nie wprowadzać jeszcze zmian w przypisaniach i rolach.

**Kryterium:** opóźniony punkt nie cofa aktualnej pozycji.

## Etap 2: przeniesienie logiki GPS do 3gf
1. Jako źródło użyć `3gf/GrafikPracy_Final/LocationService.js`, a nie starszej wersji z GrafikPracyApp.
2. Przenieść mechanizmy kolejki i restartu z kontrolą zgodności kluczy AsyncStorage.
3. Zachować identyczny `LOCATION_TASK_NAME` tylko jeśli aktualizacja ma zastąpić istniejący moduł w tej samej aplikacji; po zmianie pakietu 3gf używać osobnego task name.
4. Zachować rejestrację urządzenia i token urządzenia.
5. Dodać testy kolejki i obsługi błędów.
6. Nie przenosić całego backendu z 3gf.

**Kryterium:** aplikacja 3gf zbiera i wysyła pomiary, a Grafiku Pracy nie trzeba jeszcze zmieniać.

## Etap 3: odrębna tożsamość Android
1. Zmienić Android applicationId/package 3gf na unikalny, np. `pl.grafikpracy.threegf` po sprawdzeniu konfliktów.
2. Zmienić nazwę aplikacji, ikonę i identyfikator projektu Expo.
3. Ustawić osobną wersję i versionCode.
4. Dodać własny schemat deep link.
5. Wygenerować APK testowe.
6. Sprawdzić instalację obok Grafiku Pracy na Androidzie.

**Kryterium:** oba APK instalują się równocześnie i nie nadpisują się.

## Etap 4: jeden backend
1. Skierować 3gf do istniejącego `EXPO_PUBLIC_API_URL` centralnego backendu.
2. Użyć endpointów GPS i historii w GrafikPracyApp.
3. Zrezygnować z osobnego deployu `3gf/backend` i `3gf/render.yaml`.
4. Zweryfikować zgodność payloadów, nagłówków i odpowiedzi.
5. Nie usuwać endpointów kompatybilności.

**Kryterium:** 3gf wysyła GPS do jednego centralnego API, a obie aplikacje odczytują ten sam stan.

## Etap 5: integracja map BOTH
1. Zachować mapę w 3gf.
2. Zachować/rozwinąć mapę floty w Grafik Pracy.
3. Ujednolicić nazwy pól, znaczniki czasu i format prędkości.
4. Dodać wskaźnik świeżości pozycji i stan offline.
5. Dodać widok trasy i postojów w obu aplikacjach.

**Kryterium:** pozycja, trasa i postoje są zgodne w obu aplikacjach.

## Etap 6: HYBRID i deep links
1. Dodać linki do pojazdu, historii i diagnostyki 3gf.
2. Przekazywać tylko niepoufne identyfikatory i parametry widoku.
3. Obsłużyć brak aplikacji 3gf i bezpieczny powrót do Grafiku Pracy.
4. SSO dodać dopiero po wdrożeniu jednorazowego kodu wymiany; nie przesyłać tokenów w URI.

**Kryterium:** przejścia między aplikacjami działają, a mapy w Grafik Pracy działają samodzielnie.

## Etap 7: bezpieczeństwo i retencja
1. Sprawdzić autoryzację wszystkich endpointów lokalizacji i historii.
2. `locator` ograniczyć do własnego przypisanego pojazdu. W tej gałęzi dodano już kontrolę API i testy.
3. Zachować obecne zachowanie `employee` (widok całej floty) do czasu potwierdzenia docelowego zakresu tej roli.
4. Sprawdzić pierwszą rejestrację admina i ochronę endpointu rejestracji.
5. Dodać automatyczne czyszczenie danych starszych niż 7 dni, jeżeli nie jest już realizowane.
6. Dodać audyt przypisań urządzeń i zmian uprawnień.

**Kryterium:** brak nieautoryzowanego odczytu lokalizacji.

## Etap 8: testy i rollout
- test dwóch telefonów;
- test blokady ekranu;
- test utraty sieci na 30+ minut;
- test restartu procesu i telefonu;
- test kolejki i duplikatów;
- test starych pomiarów;
- test ról i przypisań;
- test instalacji i aktualizacji obu APK;
- test backendu i workflow CI;
- rollout etapowy, z możliwością powrotu do poprzedniego APK.

## Punkty wymagające fizycznego udziału użytkownika
Nie zatrzymywać prac programistycznych dla zwykłych decyzji. Wymagany udział użytkownika będzie potrzebny dopiero do:
- testu rzeczywistego GPS i uprawnień Androida na telefonie kierowcy;
- zatwierdzenia, że konkretne konto/urządzenie jest przypisane do konkretnego pojazdu;
- potwierdzenia działania na urządzeniu po instalacji APK;
- przekazania brakujących sekretów/konfiguracji, jeśli workflow lub serwer ich nie ma.

Nie wpisywać sekretów do repozytorium.
