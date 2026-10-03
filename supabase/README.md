# Migracja Firebase -> Supabase

Ta gałąź przygotowuje bezpieczną migrację backendu Grafiku Pracy z Firebase do Supabase.

## Zasada migracji

Nie wyłączamy Firebase na początku. Migracja jest etapowa:

1. Supabase schema + RLS.
2. Supabase Auth i Edge Functions.
3. Adapter klienta aplikacji.
4. Migracja logowania i profili użytkowników.
5. Migracja grafiku i synchronizacji Realtime.
6. Migracja GPS.
7. Migracja czatu/raportów/audytu.
8. Testy regresyjne.
9. Dopiero wtedy usunięcie Firebase.

Dzięki temu obecna wersja APK pozostaje nienaruszona podczas migracji.

## Konfiguracja aplikacji

Aplikacja będzie używać publicznych zmiennych Expo:

- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY

**Nigdy nie umieszczamy SUPABASE_SERVICE_ROLE_KEY w APK ani w kodzie klienta.**

## Edge Function

`supabase/functions/admin-users/index.ts` przejmuje operacje wymagające uprawnień administratora, które obecnie wykonuje Firebase Functions.

## Co będzie potrzebne po stronie właściciela projektu

Jednorazowo trzeba utworzyć projekt Supabase i podać do środowiska builda tylko URL projektu oraz klucz anon. Klucz service-role pozostaje wyłącznie po stronie Edge Functions.

Do czasu skonfigurowania projektu Supabase gałąź migracyjna nie zmienia produkcyjnego Firebase.
