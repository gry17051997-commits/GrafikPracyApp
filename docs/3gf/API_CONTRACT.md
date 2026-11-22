# Kontrakt API telematyki

**Źródło prawdy:** centralny backend w repozytorium GrafikPracyApp.  
**Klient zapisujący GPS:** 3gf Android.  
**Klienci odczytujący:** 3gf Android i Grafik Pracy.

## Obecne ścieżki kompatybilności

Ścieżki są już obecne w centralnym backendzie i powinny zostać zachowane podczas wydzielania:

| Metoda | Ścieżka | Cel |
|---|---|---|
| GET | `/api/gps/device` | Odczyt przypisania urządzenia, nagłówek `X-Device-Token` |
| POST | `/api/gps` | Zapis pojedynczego punktu GPS, nagłówek `X-Device-Token` |
| GET | `/api/gps/mine` | Pojazd przypisany do zalogowanego użytkownika |
| GET | `/api/gps/vehicles` | Bieżące pozycje floty |
| GET | `/api/gps/:vehicleId/trips` | Lista tras z ostatnich 7 dni |
| GET | `/api/gps/:vehicleId/trips/:tripId` | Szczegóły trasy |
| GET | `/api/gps/:vehicleId/history` | Surowa historia punktów |

Endpointy użytkownika wymagają `Authorization: Bearer <token>`. Zapis GPS wykorzystuje odrębny token urządzenia.

## Payload zapisu GPS

```json
{
  "latitude": 51.0,
  "longitude": 16.0,
  "accuracy": 8,
  "altitude": 250,
  "speed": 12.5,
  "heading": 90,
  "observedAt": 1795363200000
}
```

- `latitude` i `longitude` są wymagane i muszą mieścić się w granicach geograficznych.
- `speed` jest w m/s w zapisie GPS; API historii wylicza km/h.
- `observedAt` to czas pomiaru urządzenia w Unix milliseconds.
- Czas odbioru serwera jest przechowywany oddzielnie jako `received_at`.
- Punkty mogą dotrzeć poza kolejnością; bieżąca pozycja ma być monotoniczna według `observed_at`.

## Odpowiedź zapisu

```json
{
  "ok": true,
  "vehicleId": "uuid",
  "registration": "DSW00000",
  "observedAt": "2026-11-22T12:00:00.000Z",
  "currentUpdated": true
}
```

Pole `currentUpdated` jest propozycją do dodania po wdrożeniu monotonicznego UPSERT. Nie traktować go jako istniejącego pola, dopóki zmiana nie zostanie wdrożona.

## Docelowe endpointy wersjonowane

Nowe endpointy można wprowadzać pod `/api/v1/telematics`, ale nie usuwać istniejących tras przed migracją wszystkich klientów.

| Metoda | Docelowa ścieżka | Cel |
|---|---|---|
| POST | `/api/v1/telematics/points/batch` | Paczka punktów z kolejki |
| GET | `/api/v1/telematics/live` | Pozycje widoczne dla bieżącej roli |
| GET | `/api/v1/telematics/vehicles/:id` | Szczegóły pojazdu |
| GET | `/api/v1/telematics/vehicles/:id/trips` | Historia przejazdów |
| GET | `/api/v1/telematics/trips/:id` | Szczegóły trasy |
| GET | `/api/v1/telematics/devices/me` | Status przypisanego urządzenia |

## Zasady bezpieczeństwa

- Nie przyjmować identyfikatora pojazdu z klienta jako dowodu uprawnień.
- Backend ustala pojazd na podstawie tokenu urządzenia.
- Backend sprawdza prawo użytkownika do odczytu pojazdu i historii.
- Token urządzenia nie może być używany jako token użytkownika.
- Nie przesyłać sekretów w deep linkach.
- Błędy sieci nie mogą automatycznie usuwać przypisania urządzenia.
- Dane lokalizacyjne są wrażliwe i wymagają ograniczonego dostępu oraz retencji.
