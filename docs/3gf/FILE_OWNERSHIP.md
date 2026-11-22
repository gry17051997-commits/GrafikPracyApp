# Mapa odpowiedzialności plików: 3gf / Grafik Pracy

To mapa docelowa i decyzja migracyjna. Nie przenosić plików wyłącznie na podstawie podobnej nazwy. Najpierw sprawdzić zależności, importy, konfigurację Expo i testy.

| Plik / obszar | Docelowy właściciel | Działanie |
|---|---|---|
| `GrafikPracy_Final/LocationService.js` z 3gf | 3gf | Źródło logiki trackingu, kolejki i odzyskiwania |
| `GrafikPracy_Final/LocationService.js` z GrafikPracyApp | Grafik Pracy | Docelowo tylko status/odczyt, bez drugiego trackingu |
| `GrafikPracy_Final/TripHistoryPanel.js` z 3gf | Obie aplikacje | W 3gf ekran natywny; w Grafiku Pracy ekran floty/wybranej trasy |
| `GrafikPracy_Final/LiveLocationDashboard.js` | Obie aplikacje | Zachować różne widoki, wspólny kontrakt danych |
| `GrafikPracy_Final/NowDashboard.js` | Grafik Pracy | Nie przenosić całego dashboardu |
| `GrafikPracy_Final/apiClient.js` | Każda aplikacja | Zachować osobny klient, ujednolicić kontrakt |
| `backend/server.js` z GrafikPracyApp | Centralny backend | Źródło prawdy |
| `backend/server.js` z 3gf | Brak wdrożenia | Nie uruchamiać drugiej usługi produkcyjnej |
| `backend/schema.sql` | Centralna baza | Zachować istniejące tabele, migracje tylko gdy potrzebne |
| `backend/tripHistory.js` | Centralny backend | W GrafikPracyApp i 3gf plik ma identyczny SHA na sprawdzonych main |
| `backend/mapMatching.js` | Centralny backend | Zachować obecny map matching |
| `render.yaml` z 3gf | Nie używać produkcyjnie | Opisuje osobny serwis i osobną bazę |
| `app.json` z 3gf | 3gf | Zmienić android.package na unikalny przed osobnym APK |
| `app.json` z GrafikPracyApp | Grafik Pracy | Nie zmieniać applicationId |
| `.github/workflows/*` | Każde repo osobno | Osobne buildy APK i testy |

## Ważne różnice wykryte 2026-11-22

1. 3gf ma kolejkę GPS AsyncStorage o limicie 250 i flush FIFO po maksymalnie 20 punktów.
2. 3gf ma `forceRestartVehicleLocationTracking`; w wersji Grafiku Pracy odczytanej na main ta funkcja nie występuje.
3. Oba repozytoria mają `backend/tripHistory.js` o identycznym SHA `72e11e9807fd1c920ad3d8fdd97bf90772c4ff8f`.
4. GrafikPracyApp ma map matching w backendzie. Nie zastępować nowszego backendu starszą kopią z 3gf.
5. Oba projekty mają obecnie ten sam `android.package`, co uniemożliwia instalację jako dwóch niezależnych aplikacji.
6. Backend 3gf i plik `render.yaml` nie mogą być wdrażane jako osobny system danych.

## Kolejność przenoszenia
1. testy logiki GPS;
2. LocationService i konfiguracja aplikacji 3gf;
3. unikalny Android package;
4. API centralne;
5. UI mapy i historii;
6. deep links;
7. usunięcie martwych duplikatów dopiero po potwierdzeniu, że nie są używane.
