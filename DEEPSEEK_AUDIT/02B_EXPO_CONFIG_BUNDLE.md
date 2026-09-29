# DeepSeek Audit Bundle 2B/3


===== FILE: GrafikPracy_Final/functions/package.json =====

```text
{
  "name": "grafik-pracy-functions",
  "private": true,
  "engines": {
    "node": "20"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^13.4.0",
    "firebase-functions": "^6.4.0"
  }
}

```

===== FILE: GrafikPracy_Final/package.json =====

```text
{
  "name": "grafik-pracy",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "node --test tests/production-hardening.test.js",
    "check": "npm test",
    "postinstall": "node scripts/fix-app-build.js && node scripts/fix-chat-build.js"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "expo": "~54.0.0",
    "expo-print": "~15.0.8",
    "expo-sharing": "~14.0.8",
    "react": "19.1.0",
    "react-dom": "^19.1.0",
    "react-native": "0.81.5",
    "react-native-view-shot": "4.0.3",
    "firebase": "^12.0.0",
    "expo-notifications": "~0.32.17",
    "expo-clipboard": "~8.0.8",
    "react-native-web": "^0.21.0",
    "expo-location": "~19.0.8",
    "expo-task-manager": "~14.0.9",
    "react-native-webview": "~13.15.0"
  }
}

```

===== FILE: GrafikPracy_Final/app.json =====

```text
{
  "expo": {
    "name": "Grafik Pracy",
    "slug": "grafikpracyapp",
    "version": "1.0.6",
    "orientation": "portrait",
    "newArchEnabled": false,
    "userInterfaceStyle": "dark",
    "icon": "./icon-512.png",
    "web": {
      "output": "single"
    },
    "android": {
      "package": "pl.grafikpracy.app",
      "versionCode": 10,
      "adaptiveIcon": {
        "foregroundImage": "./icon-512.png",
        "backgroundColor": "#11151c"
      },
      "permissions": [
        "android.permission.SCHEDULE_EXACT_ALARM",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION"
      ]
    },
    "extra": {
      "eas": {
        "projectId": "a1bf7cf9-1bfd-4bd0-8392-e9c3266ce9b6"
      }
    },
    "owner": "kafel17",
    "plugins": [
      "expo-notifications",
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Grafik Pracy używa lokalizacji służbowego telefonu, aby pokazywać auto na żywo i automatycznie dobierać raporty.",
          "locationAlwaysAndWhenInUsePermission": "Grafik Pracy używa lokalizacji służbowego telefonu w tle, aby pokazywać auto na żywo i automatycznie dobierać raporty.",
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ]
    ],
    "entryPoint": "./index.js"
  }
}

```

===== FILE: GrafikPracy_Final/eas.json =====

```text
{
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    },
    "production-apk": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    }
  }
}

```

===== FILE: GrafikPracy_Final/firebase.json =====

```text
{
  "functions": {
    "source": "functions"
  },
  "firestore": {
    "rules": "firestore.rules"
  }
}

```
