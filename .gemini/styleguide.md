# Grafik Pracy: Gemini Code Review

## Cel audytu
Traktuj ten projekt jako aplikację produkcyjną Android/React Native. Szukaj rzeczywistych błędów i regresji, nie tylko kwestii stylistycznych.

## Priorytety
1. Błędy uniemożliwiające start aplikacji, w szczególności czarny ekran, crash JS/native oraz błędny bootstrap.
2. Problemy z budowaniem i uruchamianiem APK na Androidzie.
3. Błędy runtime, async, state management, nawigacji, storage i obsługi wyjątków.
4. Błędy logiki generatora grafiku, zmian zmian, rozliczeń i danych.
5. Problemy z kompatybilnością React Native/Expo/Android/Hermes.
6. Problemy bezpieczeństwa i konfiguracji.
7. Dopiero na końcu drobne refaktoryzacje i styl.

## Zasady
- Nie zgłaszaj problemu tylko dlatego, że kod można napisać inaczej.
- Dla każdego zgłoszenia podaj konkretną ścieżkę pliku, mechanizm błędu i warunek jego wystąpienia.
- Jeśli nie masz wystarczających dowodów, oznacz to jako hipotezę zamiast przedstawiać jako pewny błąd.
- Szczególnie sprawdzaj regresje względem poprzedniej działającej wersji.
- Nie proponuj zmian, które mogą ponownie uszkodzić działający bootstrap aplikacji bez wyjaśnienia ryzyka.
- Preferuj małe, odwracalne poprawki.
