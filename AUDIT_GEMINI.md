# Grafik Pracy - zewnętrzny audyt Gemini

## Cel
Przeprowadź niezależny, techniczny audyt całego projektu Android/Web "Grafik Pracy". Nie zakładaj, że obecna implementacja jest poprawna. Traktuj repozytorium jako kod produkcyjny w fazie przed wydaniem.

## Zakres
1. Architektura i podział odpowiedzialności.
2. Logika generatora grafiku, w szczególności:
   - 10 h: 06:00-16:00 i 16:00-02:00
   - 12 h: 06:00-18:00 i 18:00-06:00
   - P, M, L i rotacja
   - MUST, OFF, FORBID, PREFER
   - cele liczby zmian
   - recover
   - konflikty reguł
   - ręczne/locked/completed assignments
   - możliwość pracy 24 h, jeżeli wynika to z wymagań
   - przechodzenie między tygodniami
   - różne konfiguracje godzin dla poszczególnych tygodni
3. Spójność danych i stanów UI.
4. Firebase Auth/Firestore, reguły bezpieczeństwa i funkcje backendowe.
5. GPS/lokalizacja:
   - świeżość danych
   - wybór konkretnego pojazdu
   - fallback
   - błędne/brakujące dane
   - prywatność i bezpieczeństwo.
6. Raporty i powiadomienia:
   - harmonogram
   - daty tygodni
   - godziny zmian
   - duplikaty
   - strefy czasowe
   - zachowanie po zmianie konfiguracji.
7. Widgety Android.
8. Web/mobile responsive UI.
9. Build Expo/React Native/Android.
10. GitHub Actions i deployment.
11. Testy i pokrycie krytycznych ścieżek.
12. Bezpieczeństwo: XSS, injection, auth bypass, Firestore rules, sekrety, dane lokalizacyjne, uprawnienia.
13. Wydajność, race conditions, memory leaks i problemy z asynchronicznym stanem React.
14. Obsługa błędów, offline, reconnect i częściowej niedostępności Firebase.
15. Zgodność zależności i ryzyko wersji.

## Ważne wymagania biznesowe
- Stawka 10 h = 300 PLN.
- Stawka 12 h = 360 PLN.
- Magazyny: PNT B, PNT C, UNICO, SP3, DC2, DC1, ECE, PNT A, GLP B, GLP C.
- Aplikacja ma wspierać tygodniowe grafiki, zmianę tygodnia, ręczną edycję, automatyczny generator, raporty, GPS, chat, widgety i panel administracyjny.
- Generator nie może cicho nadpisywać ręcznych/locked danych.
- Konflikty reguł powinny być wykrywane i komunikowane.
- Zmiana konfiguracji jednego tygodnia nie może przypadkowo zmieniać innego tygodnia.

## Metoda
Najpierw przeanalizuj cały kod i zależności. Następnie:
A. zidentyfikuj krytyczne przepływy danych,
B. prześledź każdy przepływ od UI do Firebase/backendu i z powrotem,
C. sprawdź przypadki brzegowe,
D. porównaj implementację z wymaganiami,
E. przejrzyj testy i wskaż brakujące testy,
F. jeśli możesz, uruchom dostępne testy/lint/build lub opisz dokładnie, czego nie udało się uruchomić.

## Format raportu
Podaj:
- Executive summary
- Critical findings
- High severity
- Medium severity
- Low severity
- Security findings
- Logic/business-rule findings
- Test gaps
- Build/deployment findings
- UX/accessibility findings
- Konkretne rekomendacje napraw
- Kolejność napraw: P0/P1/P2
- Dla każdego problemu: plik, funkcja/obszar, opis, warunek wystąpienia, wpływ, sposób reprodukcji, rekomendowana poprawka.

Nie zmieniaj kodu. To ma być niezależny audyt. Nie zakładaj, że wcześniejsze komentarze lub istniejące testy są prawidłowe.

Na końcu odpowiedz na 5 pytań:
1. Czy generator może wygenerować niepoprawny grafik mimo braku błędu UI?
2. Czy istnieją sytuacje, w których dane jednego tygodnia mogą zostać pomieszane z innym tygodniem?
3. Czy istnieją możliwe obejścia autoryzacji lub reguł Firestore?
4. Czy mechanizm GPS może pokazać użytkownikowi nie ten pojazd, o który pyta?
5. Jakie 10 zmian należy wykonać przed testami użytkowników?
