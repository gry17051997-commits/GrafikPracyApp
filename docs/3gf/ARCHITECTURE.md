# Architektura docelowa: 3gf + Grafik Pracy

**Wariant zatwierdzony:** HYBRID + BOTH  
**Data przygotowania:** 2026-11-22  
**Status:** dokument architektury, bez przełączenia produkcyjnego

## 1. Cel

3gf jest niezależną aplikacją Android odpowiedzialną za telematykę pojazdów. Grafik Pracy pozostaje główną aplikacją do grafików, pracowników, magazynów i rozliczeń. Obie aplikacje pokazują mapy i dane telematyczne z jednego centralnego API.

## 2. Zasady niepodlegające zmianie

1. Nie modyfikować ani nie zastępować produkcyjnego `main` w ramach migracji.
2. Jeden aktywny nadajnik GPS na urządzenie/pojazd. Grafik Pracy nie uruchamia drugiego trackingu, jeśli nadaje 3gf.
3. Jeden autorytatywny backend Node.js i jedna baza PostgreSQL. Repozytorium 3gf nie może uruchamiać drugiej produkcyjnej bazy ani konkurencyjnego API.
4. Zapis GPS i odczyt map są rozdzielone. 3gf zapisuje pomiary, obie aplikacje odczytują je z API.
5. Przerwa w telemetrii nie może blokować grafiku, logowania ani rozliczeń.
6. Historia przejazdów zachowuje dotychczasowe 7 dni retencji.
7. Nie wprowadzać płatnych usług. Wykorzystać obecny serwer, PostgreSQL, GitHub Actions i aktualny dostawca map w granicach jego darmowych limitów.
8. Każda migracja schematu bazy musi być kompatybilna wstecz i mieć plan wycofania.

## 3. Komponenty

### 3gf Android
- logowanie użytkownika i rejestracja urządzenia;
- przypisanie telefonu do pojazdu;
- uruchamianie i zatrzymywanie lokalizacji przez kierowcę;
- Android Foreground Service typu location;
- trwałe kolejkowanie pomiarów offline;
- wysyłanie pomiarów do centralnego API;
- status GPS, diagnostyka i ostatnia synchronizacja;
- mapa na żywo i historia tras;
- uruchamianie konkretnych ekranów z Grafiku Pracy przez bezpieczne linki.

### Grafik Pracy
- grafik, pracownicy, magazyny, rozliczenia i administracja;
- mapa floty, status ostatniej pozycji i wiek pomiaru;
- szczegóły pojazdu, trasy i postoje;
- otwieranie odpowiednich ekranów 3gf, jeśli aplikacja jest zainstalowana;
- pełny podgląd map przez API nawet wtedy, gdy 3gf nie jest zainstalowane na telefonie dyspozytora.

### Centralny backend
- istniejący Express API w repozytorium GrafikPracyApp;
- istniejąca baza PostgreSQL;
- autoryzacja użytkownika i osobne uwierzytelnianie urządzenia GPS;
- przypisania urządzeń do pojazdów;
- bieżąca pozycja i historia punktów GPS;
- algorytm historii tras i postoje;
- autoryzacja odczytu według roli i przypisania pojazdu;
- retencja danych oraz diagnostyka.

## 4. Topologia

```text
3gf Android ── GPS / offline queue ──┐
                                     │
                                     ▼
                         Centralne API Express
                                     │
                                     ▼
                             PostgreSQL
                                     ▲
                                     │
Grafik Pracy ── mapa / historia ─────┘
      │
      └── bezpieczny deep link do ekranu 3gf
```

Nie wdrażać osobnego backendu z repozytorium 3gf. Plik `3gf/render.yaml` opisuje osobną usługę i bazę. Nie może zostać użyty do uruchomienia drugiego środowiska produkcyjnego w tej architekturze.

## 5. Identyfikator aplikacji Android

Aktualny `GrafikPracy_Final/app.json` w repozytorium 3gf ma `android.package = pl.grafikpracy.app`, taki sam jak Grafik Pracy. Takie aplikacje nie mogą być zainstalowane obok siebie jako dwie niezależne aplikacje Android: będą kolidować jako ten sam pakiet.

Przed wydaniem niezależnego 3gf trzeba nadać mu unikalny identyfikator, np. `pl.grafikpracy.threegf` (propozycja do sprawdzenia), oddzielną nazwę, ikonę i własny numer wersji. Nie zmieniać identyfikatora obecnej aplikacji Grafik Pracy.

## 6. Logowanie i przekazywanie kontekstu

- Obie aplikacje korzystają z tych samych kont backendowych.
- Token użytkownika i token urządzenia GPS to dwa różne sekrety o różnych uprawnieniach.
- Nie przekazywać bearer tokenu w URI, logach, schowku ani parametrach powiadomień.
- Jeśli ma działać SSO/deep-link, zastosować krótkotrwały jednorazowy kod wymiany (np. TTL 60 sekund) z losowym challenge/PKCE i walidacją po stronie backendu.
- W pierwszej iteracji dopuszczalne jest osobne logowanie w obu aplikacjach. Bezpieczne SSO jest osobnym zadaniem, nie warunkiem uruchomienia telemetrii.
- Link może przekazywać tylko identyfikator pojazdu/trasy i ekran docelowy, nigdy sekret.

## 7. Android i lokalizacja w tle

3gf musi:
- uruchamiać śledzenie po świadomym działaniu kierowcy, gdy aplikacja jest widoczna;
- korzystać z foreground service typu location i widocznego powiadomienia;
- obsługiwać uprawnienia lokalizacji na pierwszym planie i w tle;
- wykrywać brak świeżych pomiarów i przerwane sesje;
- ponawiać synchronizację po odzyskaniu sieci;
- nie uznawać błędu sieci za utratę przypisania urządzenia;
- odzyskiwać tracking po wznowieniu aplikacji;
- obsłużyć restart telefonu zgodnie z ograniczeniami Androida i wymaganymi uprawnieniami.

Nie obiecywać bezwarunkowego działania po wymuszonym zatrzymaniu aplikacji przez użytkownika lub system. Takie stany muszą być widoczne w diagnostyce.

## 8. Kolejka offline

W 3gf istnieje już kolejka `LOCATION_PENDING_QUEUE_KEY` w AsyncStorage, limit 250 punktów i wysyłanie FIFO po maksymalnie 20 punktów na przebieg. To jest punkt wyjścia, nie dowód pełnej odporności.

Etapy:
1. zachować zgodność i odczyt istniejącej kolejki;
2. dodać testy FIFO, limitu, zmiany przypisania, restartu procesu i błędów sieci;
3. dopiero po testach rozważyć SQLite/Expo SQLite, jeśli aktualny mechanizm okaże się niewystarczający;
4. nie usuwać starych danych kolejki podczas migracji.

## 9. Model danych

W pierwszej fazie zachować istniejące tabele:
- `vehicles`
- `phones`
- `assignments`
- `gps_current`
- `gps_history`
- `users`
- `sessions`

Nie tworzyć równoległych tabel z innymi nazwami dla tych samych danych. Nowe tabele (np. sesje telemetrii, idempotency keys) dodawać dopiero po uzasadnieniu i migracji.

## 10. Odczyt map i uprawnienia

- `locator`: tylko własne przypisane auto i jego trasy. Tak działa już ekran „Teraz” dla lokalizatora.
- `employee`: obecny ekran floty pobiera dla tej roli wszystkie pojazdy. Zachowujemy to zachowanie, aby nie wprowadzić regresji; zakres tej roli wymaga potwierdzenia właściciela przed dalszym zaostrzeniem.
- `admin`: wszystkie pojazdy.
- Inne role, w tym gość: brak dostępu do telemetrii.
- Backend egzekwuje uprawnienia przy każdym żądaniu; ukrycie przycisku w UI nie jest zabezpieczeniem.

W tej gałęzi dodano kontrolę po stronie API: `locator` widzi tylko pojazd przypisany do jego konta, również przy bezpośrednim wywołaniu endpointów historii. Polityka jest testowana w `backend/gpsAccess.test.js`.

## 11. Mapy

- Zachować aktualną implementację Leaflet/WebView i obecny MapTiler/OSM fallback.
- Nie dublować tajnych kluczy w kodzie. Klucz mapowy jest konfiguracją builda i musi mieć ograniczenia oraz kontrolę limitu.
- Grafik Pracy i 3gf mogą mieć oddzielne ekrany, ale muszą używać tego samego kontraktu danych, formatu punktów i reguł świeżości.
- Nie wykonywać geokodowania reverse dla każdego odświeżenia pozycji. Stosować cache i ograniczać zapytania.

## 12. Wersjonowanie i kompatybilność

Nowe endpointy powinny być w `/api/v1/telematics` albo zachować dotychczasowe ścieżki jako aliasy kompatybilności. Nie usuwać `/api/gps`, `/api/gps/vehicles`, `/api/gps/mine` ani tras historii, dopóki obie aplikacje nie zostaną przeniesione i zweryfikowane.

## 13. Warunki gotowości

- osobne APK 3gf i Grafik Pracy instalują się równocześnie;
- 3gf nadaje GPS przy zablokowanym ekranie;
- pomiary są buforowane offline i odtwarzane bez duplikowania;
- starszy pomiar nie nadpisuje nowszej pozycji;
- obie aplikacje widzą tę samą pozycję i historię;
- kierowca nie widzi danych innych pojazdów;
- dyspozytor ma właściwy zakres danych;
- brak 3gf nie blokuje Grafiku Pracy;
- istnieją testy API, logiki tras i uprawnień;
- produkcyjne wdrożenie ma plan rollbacku.
