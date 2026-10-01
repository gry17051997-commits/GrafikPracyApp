#!/usr/bin/env bash
set -u

APP_ROOT="$GITHUB_WORKSPACE/GrafikPracy_Final"
APK="$APP_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
TEST_ID="${TEST_ID:-unknown}"

echo "=== Runtime diagnostics TEST $TEST_ID ==="
echo "APP_ROOT=$APP_ROOT"
echo "APK=$APK"

if [ ! -s "$APK" ]; then
  echo "ERROR: debug APK not found: $APK"
  find "$APP_ROOT/android/app/build/outputs/apk" -maxdepth 3 -type f -name "*.apk" -print || true
  exit 1
fi

adb wait-for-device
adb get-state

set +e
adb install -r "$APK"
INSTALL_RC=$?

adb logcat -c
adb shell am force-stop pl.grafikpracy.app
adb shell monkey -p pl.grafikpracy.app 1
LAUNCH_RC=$?

sleep 8

rm -f "$APP_ROOT/runtime-window.xml"
for attempt in 1 2 3; do
  adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 && break
  echo "UiAutomator dump attempt $attempt failed; retrying"
  sleep 3
done
adb pull /sdcard/window.xml "$APP_ROOT/runtime-window.xml" >/dev/null 2>&1
adb logcat -d > "$APP_ROOT/runtime-logcat.txt"
adb shell pidof pl.grafikpracy.app > "$APP_ROOT/runtime-pid.txt"

echo "INSTALL_RC=$INSTALL_RC"
echo "LAUNCH_RC=$LAUNCH_RC"
echo "=== UI DUMP ==="
cat "$APP_ROOT/runtime-window.xml" 2>/dev/null || true
echo "=== PROCESS ==="
cat "$APP_ROOT/runtime-pid.txt" 2>/dev/null || true
echo "=== FATAL/ERROR LOGS ==="
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|Hermes|Unable to load script|Could not connect|Exception" "$APP_ROOT/runtime-logcat.txt" | tail -200 || true

if [ "$INSTALL_RC" -ne 0 ] || [ "$LAUNCH_RC" -ne 0 ]; then
  exit 1
fi

if grep -q "TEST $TEST_ID" "$APP_ROOT/runtime-window.xml"; then
  echo "TEST $TEST_ID UI marker FOUND"
  exit 0
fi

echo "TEST $TEST_ID UI marker NOT FOUND"
exit 2
