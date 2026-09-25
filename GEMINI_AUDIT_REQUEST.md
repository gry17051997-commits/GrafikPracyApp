# Grafik Pracy - zlecenie niezależnego audytu Gemini

## Stan audytowanego projektu
Audytuj dokładnie stan repozytorium z commita, z którego został wygenerowany pakiet. Nie zakładaj, że wcześniejsze testy, komentarze ani poprawki są poprawne.

## Cel
Wykonaj niezależny audyt produkcyjny aplikacji Android/Web „Grafik Pracy”. Nie zmieniaj kodu.

## Szczególnie sprawdź po ostatnich zmianach
1. Raporty WhatsApp i alarm godzinowy:
   - planowanie 20 minut przed pełną godziną,
   - przejście przez zmianę 1/2,
   - zmiany konfiguracji tygodnia,
   - duplikaty odpowiedzi na powiadomienie,
   - stale/old notification response po restarcie aplikacji,
   - zachowanie przy zmianie statusu raportu,
   - Android notification channel, vibration, priority i lock screen,
   - różnice Android/Web.
2. GPS:
   - czy dashboard zawsze pokazuje centralnie przypisany pojazd,
   - brak danych/stare dane,
   - historia 7 dni,
   - race conditions przy zmianie przypisania,
   - bezpieczeństwo danych lokalizacyjnych.
3. Generator:
   - MUST/OFF/FORBID/PREFER,
   - manual/locked/completed,
   - recovery ledger,
   - zmiana tygodnia i różne konfiguracje tygodni,
   - brak cichego nadpisywania ręcznych zmian.
4. Synchronizacja Firebase:
   - konflikty grafiku,
   - race conditions,
   - autoryzacja pracownik/admin/locator,
   - Firestore rules.
5. Build:
   - Expo 54 / React Native 0.81.5,
   - Android prebuild,
   - web export,
   - GitHub Actions,
   - testy regresyjne.

## Wymagania biznesowe
- 10 h: 06:00-16:00 oraz 16:00-02:00, 300 PLN.
- 12 h: 06:00-18:00 oraz 18:00-06:00, 360 PLN.
- Pracownicy: P, M, L.
- Magazyny: PNT B, PNT C, UNICO, SP3, DC2, DC1, ECE, PNT A, GLP B, GLP C.
- Generator nie może cicho nadpisywać manual/locked assignments.
- Recovery debt jest niezależny od generatora.
- Zmiana jednego tygodnia nie może zmieniać danych innego tygodnia.
- GPS ma pokazywać wyłącznie centralnie przypisany pojazd.
- Raport alarmowy ma działać wyłącznie dla osoby aktualnie pracującej.

## Metoda
Najpierw przeczytaj cały pakiet. Następnie prześledź przepływy danych UI -> stan lokalny -> Firebase -> stan UI oraz notification -> handler -> modal -> raport.

Jeżeli środowisko pozwala, uruchom testy/build. Jeżeli nie, wyraźnie podaj ograniczenie. Nie zgaduj wyników.

## Raport
Podziel wynik na:
- Executive summary
- P0 Critical
- P1 High
- P2 Medium
- P3 Low
- Security
- Logic/business rules
- Notifications/reports
- GPS
- Firebase/Auth
- Tests
- Build/deployment
- UX/accessibility
- Performance/race conditions

Dla każdego problemu podaj:
- plik,
- funkcję/obszar,
- warunek wystąpienia,
- wpływ,
- sposób reprodukcji,
- dowód z kodu,
- rekomendowaną poprawkę.

Nie zmieniaj kodu i nie proponuj „poprawek” bez wskazania konkretnego miejsca.

## 5 pytań końcowych
1. Czy generator może wygenerować niepoprawny grafik mimo braku błędu UI?
2. Czy dane tygodni mogą zostać pomieszane?
3. Czy istnieje możliwe obejście autoryzacji lub Firestore rules?
4. Czy GPS może pokazać nieprzypisany pojazd?
5. Jakie 10 zmian powinno zostać wykonanych przed testami użytkowników?

## Ważne
To jest audyt niezależny. Nie zakładaj, że obecne testy dowodzą poprawności. Szukaj także błędów, których testy nie pokrywają.
