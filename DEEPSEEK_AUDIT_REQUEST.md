# Grafik Pracy App - audyt produkcyjny dla DeepSeek

Repozytorium: gry17051997-commits/GrafikPracyApp
Branch audytowy: deepseek-audit-2026-09-29
Cel: niezależny, techniczny audyt aktualnego kodu aplikacji React Native + Expo + Firebase.

## Najważniejsze problemy do zweryfikowania

1. Synchronizacja Firestore między wieloma urządzeniami:
   - utrata zmian przy równoczesnych zapisach,
   - nadpisywanie całego tygodnia zamiast delta updates,
   - poprawność updateDoc, dot notation i transakcji,
   - hasPendingWrites i ochrona lokalnych zmian,
   - offline/reconnect,
   - stabilne identyfikatory zmian,
   - separacja tygodni,
   - race conditions.

2. Lokalizacja:
   - expo-location,
   - background tracking,
   - TaskManager i rejestracja tasków,
   - uprawnienia Android,
   - restart procesu,
   - foreground service,
   - synchronizacja pozycji z Firestore,
   - przypisanie pojazdu do użytkownika,
   - odporność na brak sieci i ubijanie aplikacji.

3. Użytkownicy i role:
   - dodawanie/usuwanie pracowników,
   - Firebase Auth,
   - Firestore permissions,
   - Admin / Manager / Driver / Guest,
   - zgodność UI z regułami bezpieczeństwa,
   - czy operacje administracyjne faktycznie działają produkcyjnie.

4. Architektura React Native / Expo:
   - AppRuntime.js jako monolit,
   - niepotrzebne re-rendery,
   - timery,
   - globalny scope dla natywnych rejestracji,
   - poprawność index.js,
   - inicjalizacja powiadomień/widgetów/tasków.

5. CI/CD:
   - GitHub Actions,
   - Expo prebuild,
   - Gradle,
   - generowanie i lokalizacja APK,
   - embedded JS bundle,
   - testy, które mogą dawać fałszywe poczucie poprawności,
   - EAS i konfiguracja produkcyjna.

6. Firebase:
   - firebaseConfig,
   - Firestore rules,
   - Cloud Functions,
   - bezpieczeństwo,
   - autoryzacja,
   - walidacja danych po stronie serwera,
   - potencjalne wycieki sekretów.

7. Stabilność danych:
   - AsyncStorage,
   - migracje,
   - recoveryLedger,
   - blokady,
   - ręczne zmiany grafiku,
   - odporność na restart aplikacji.

## Zasady audytu

- Nie proponuj prowizorek ani regexowych patchy w CI.
- Szukaj przyczyn źródłowych.
- Każdy problem wskaż z dokładną ścieżką pliku i numerem linii.
- Nadaj priorytet P0/P1/P2/P3.
- Dla każdego problemu opisz: objaw, przyczynę, wpływ, dowód w kodzie, poprawne rozwiązanie produkcyjne.
- Sprawdź zależności między plikami, a nie tylko pojedyncze pliki.
- Nie zakładaj, że istniejące testy oznaczają poprawność.
- Szczególnie sprawdź scenariusze dwóch telefonów zalogowanych na różne konta, jednoczesnej edycji grafiku, offline -> online, restartu aplikacji i ubicia procesu Android.
- Sprawdź aktualny stan branchu, nie tylko wcześniejsze raporty.
- Na końcu przygotuj kolejność napraw: P0 -> P1 -> P2 -> P3.
- Jeżeli rozwiązanie wymaga przebudowy architektury, opisz konkretną strukturę plików i przepływ danych.
- Nie modyfikuj repozytorium podczas audytu. Zwróć raport i konkretne rekomendacje.

## Kryterium końcowe

Audyt ma odpowiedzieć jednoznacznie:
1. Dlaczego synchronizacja może nie działać między dwoma telefonami?
2. Dlaczego lokalizacja może nie działać?
3. Dlaczego Admin może nie móc dodawać/usuwać użytkowników?
4. Czy aktualny model Firestore jest bezpieczny dla równoczesnych zmian?
5. Czy CI faktycznie buduje i weryfikuje właściwą aplikację?
6. Co trzeba zmienić, aby aplikacja była produkcyjnie stabilna?

Nie wystarczy lista ogólnych zaleceń. Wymagany jest audyt kodu z dowodami.