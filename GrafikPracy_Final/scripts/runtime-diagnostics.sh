#!/usr/bin/env bash
set -u

APP_ROOT="$GITHUB_WORKSPACE/GrafikPracy_Final"
APK="$APP_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE_NAME="pl.grafikpracy.app"
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
adb shell am force-stop "$PACKAGE_NAME"
adb shell monkey -p "$PACKAGE_NAME" 1
LAUNCH_RC=$?

sleep 8

rm -f "$APP_ROOT/runtime-window.xml"
UI_DUMP_RC=1
for attempt in 1 2 3; do
  if adb shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1; then
    if adb pull /sdcard/window.xml "$APP_ROOT/runtime-window.xml" >/dev/null 2>&1; then
      UI_DUMP_RC=0
      break
    fi
  fi
  echo "UiAutomator dump attempt $attempt failed; retrying"
  sleep 3
done

adb logcat -d > "$APP_ROOT/runtime-logcat.txt"
adb shell pidof "$PACKAGE_NAME" > "$APP_ROOT/runtime-pid.txt"

PROCESS_RC=1
if [ -s "$APP_ROOT/runtime-pid.txt" ]; then
  PROCESS_RC=0
fi

FATAL_COUNT=$(grep -E -c "FATAL EXCEPTION|AndroidRuntime.*FATAL|ReactNativeJS.*(Error|Exception)|Unable to load script|Could not connect" "$APP_ROOT/runtime-logcat.txt" || true)

echo "INSTALL_RC=$INSTALL_RC"
echo "LAUNCH_RC=$LAUNCH_RC"
echo "PROCESS_RC=$PROCESS_RC"
echo "UI_DUMP_RC=$UI_DUMP_RC"
echo "FATAL_COUNT=$FATAL_COUNT"

echo "=== UI DUMP ==="
cat "$APP_ROOT/runtime-window.xml" 2>/dev/null || true

echo "=== PROCESS ==="
cat "$APP_ROOT/runtime-pid.txt" 2>/dev/null || true

echo "=== FATAL/ERROR LOGS ==="
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|Hermes|Unable to load script|Could not connect|Exception" "$APP_ROOT/runtime-logcat.txt" | tail -200 || true

if [ "$INSTALL_RC" -ne 0 ] || [ "$LAUNCH_RC" -ne 0 ]; then
  echo "RUNTIME FAILURE: APK installation or launch failed."
  exit 1
fi

if [ "$PROCESS_RC" -ne 0 ]; then
  echo "RUNTIME FAILURE: application process is not alive after launch."
  exit 1
fi

if [ "$FATAL_COUNT" -gt 0 ]; then
  echo "RUNTIME FAILURE: fatal/native/JS runtime error detected."
  exit 1
fi

if [ "$UI_DUMP_RC" -eq 0 ] && grep -q "TEST $TEST_ID" "$APP_ROOT/runtime-window.xml"; then
  echo "TEST $TEST_ID UI marker FOUND"
else
  echo "TEST $TEST_ID UI marker unavailable; runtime health checks passed."
fi

exit 0
