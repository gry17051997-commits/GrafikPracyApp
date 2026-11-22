# Konfiguracja automatycznych aktualizacji Grafik Pracy

Aplikacja sprawdza publiczne wydanie `grafik-latest` w repozytorium `gry17051997-commits/3gf`. APK jest pobierany bezpośrednio przez aplikację, a Android otwiera systemowy instalator.

## Jednorazowa konfiguracja publikacji

Repozytorium GrafikPracyApp jest prywatne, dlatego workflow potrzebuje osobnego tokenu do umieszczenia APK w publicznym repozytorium 3gf.

1. W GitHub otwórz Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Utwórz token dla właściciela `gry17051997-commits`.
3. Ogranicz dostęp wyłącznie do repozytorium `3gf`.
4. Nadaj tylko uprawnienie Repository permissions → Contents → Read and write.
5. W repozytorium `GrafikPracyApp` otwórz Settings → Secrets and variables → Actions → New repository secret.
6. Nazwa sekretu: `PUBLIC_RELEASE_TOKEN`. Wartość: utworzony token.

Token nie jest zapisywany w kodzie ani w aplikacji.

## Publikowanie aktualizacji

Po scaleniu zmian zwiększ wersję w `GrafikPracy_Final/app.json`, a następnie utwórz tag `grafik-vX.Y.Z`. Workflow zbuduje APK, sprawdzi zgodność podpisu z obecnymi instalacjami i opublikuje plik `GrafikPracy.apk` w publicznym wydaniu `grafik-latest`.

Android nadal wymaga zatwierdzenia instalacji przez użytkownika. Nie trzeba ręcznie pobierać APK z repozytorium.
