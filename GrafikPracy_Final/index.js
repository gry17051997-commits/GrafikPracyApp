import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

let App = null;
let bootstrapError = null;

try {
  App = require('./App').default;
} catch (error) {
  bootstrapError = error;
  console.error('Grafik Pracy bootstrap error:', error);
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: props.bootstrapError || null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    console.error('Grafik Pracy runtime error:', error, info);
  }

  render() {
    if (this.state.error) {
      const message = String(this.state.error?.message || this.state.error || 'Nieznany błąd');
      return (
        <View style={styles.root}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Grafik Pracy nie uruchomił interfejsu</Text>
          <Text style={styles.subtitle}>Aplikacja wykryła błąd podczas startu zamiast zostawić pusty ekran.</Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
          <Text style={styles.hint}>Uruchom aplikację ponownie po zainstalowaniu najnowszego APK.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function Root() {
  if (!App) {
    return (
      <AppErrorBoundary bootstrapError={bootstrapError}>
        <View />
      </AppErrorBoundary>
    );
  }
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

registerRootComponent(Root);

// Widget task handler is intentionally not registered during JS bootstrap.
// The previous implementation loaded react-native-android-widget before the
// main UI was mounted, which can cause a native startup failure on Android.
// Widget support will be reattached after the base app startup is verified.

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#11151c',
    justifyContent: 'center',
    padding: 24
  },
  icon: {
    fontSize: 52,
    textAlign: 'center',
    marginBottom: 18
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center'
  },
  subtitle: {
    color: '#c7ccd6',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12
  },
  errorBox: {
    backgroundColor: '#1b222d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7b3039',
    padding: 14,
    marginTop: 20
  },
  errorText: {
    color: '#ffb4b4',
    fontSize: 13,
    lineHeight: 19
  },\n  hint: {
    color: '#9299a8',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 14
  }
});
