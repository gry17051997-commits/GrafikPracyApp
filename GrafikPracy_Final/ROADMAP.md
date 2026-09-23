# Grafik Pracy - ustalony zakres dalszego rozwoju

## Ustalenia użytkownika

### Celowo NIE wdrażamy
- Powiadomienie, gdy auto opuści magazyn.
- Automatyczne rozpoczęcie zmiany na podstawie GPS.
- Automatyczne zakończenie zmiany na podstawie GPS.

### Wdrażamy
- Automatyczne generowanie kolejnych tygodni, ale wyłącznie jako opcję administratora.
- Miniaturka aktualnej mapy i lokalizacji auta w zakładce **Teraz**, pod informacjami o aktualnej i następnej zmianie.
- Dalszy rozwój GPS/Auto: rozpoznawanie magazynu, statusy, historia trasy, sugestie raportów i obsługa lokalizacji.
- Rozwój raportów WhatsApp: ciągłość czasu oczekiwania, statusy zależne od sytuacji, propozycje na podstawie GPS, historia i ponowne użycie raportów.
- Rozwój grafiku: kolejne tygodnie, rotacja, zamiany, propozycje zamian, blokowanie zatwierdzonego grafiku, automatyczne godziny i wynagrodzenia, statystyki.
- Rozwój zarobków: tygodniowe i miesięczne podsumowania, godziny, stawki, korekty i historia wypłat.
- Rozwój profili pracowników i uprawnień administratora.
- Powiadomienia związane ze zmianami i raportami, z wyłączeniem automatycznego startu/końca zmiany oraz opuszczenia magazynu.
- Widgety Android.
- Rozwój czatu.
- Rozbudowa panelu administratora.
- Przygotowanie architektury pod użycie aplikacji przez wiele firm.

## Stan po aktualizacji
- Mini mapa lokalizacji została dodana do zakładki **Teraz**.
- Administrator otrzymał opcję automatycznego generowania kolejnych 4 tygodni.
- Ustawienie automatycznego generowania jest synchronizowane we wspólnym grafiku Firebase.
- Pracownik nie może samodzielnie włączyć tej funkcji.


## Nowy ustalony element
- Dodano możliwość wyczyszczenia wszystkich obsad osobno dla I zmiany albo II zmiany w całym aktualnie wyświetlanym tygodniu.
- Funkcja nie zmienia godzin ani magazynów, usuwa tylko przypisania pracowników dla wybranej zmiany.


## Etap UX/UI - rozpoczęty
- Ulepszono ekran Grafiku: szybkie podsumowanie obsadzenia tygodnia, liczba wolnych zmian i system godzin.
- Dodano wyraźne oznaczenie dnia bieżącego oraz szybki przycisk powrotu do bieżącego tygodnia.
- Przeniesiono szybkie czyszczenie I/II zmiany i całego tygodnia do ustawień, w bardziej logiczne miejsce.
- Dodano pierwszą warstwę responsywnego dopracowania weba: focus, większa spójność kontrolek, touch targets, scrollbar i ograniczenie animacji dla użytkowników z preferencją reduced motion.
- Kolejny etap UX powinien objąć kolejno: ekran Teraz, Auto/GPS, Podsumowanie, Czat, Ustawienia, formularze i modale, a następnie test końcowy Android + web.


### UX/UI etap 2
- Teraz: większy nacisk na najważniejsze informacje, status lokalizacji i szybki dostęp do mapy.
- Auto/GPS: uporządkowanie informacji na zasadzie status → sugestia → najbliższy magazyn → historia → mapa.
- Dalsze prace obejmują uspójnienie kart, nagłówków, przycisków i stanów pustych na wszystkich ekranach.
