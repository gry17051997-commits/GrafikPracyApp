import React, { Component, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

let AppRuntime = null;
let bootError = null;

function BootScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.subtitle}>Uruchamianie aplikacji...</Text>
    </View>
  );
}

function ErrorScreen({ title = 'Błąd startu aplikacji', message }) {
  return (
    <View style={styles.rootError}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

class RuntimeErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('RUNTIME_RENDER_ERROR', error);
    console.error('RUNTIME_RENDER_ERROR_INFO', info);
  }

  render() {
    if (this.state.error) {
      const error = this.state.error;
      return (
        <ErrorScreen
          title="Błąd renderowania aplikacji"
          message={String(error?.message || error || 'Nieznany błąd renderowania.')}
        />
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [status, setStatus] = useState('booting');
  const [globalError, setGlobalError] = useState(null);

  useEffect(() => {
    const previousHandler =
      typeof globalThis.ErrorUtils?.getGlobalHandler === 'function'
        ? globalThis.ErrorUtils.getGlobalHandler()
        : null;

    const handler = (error, isFatal) => {
      console.error('GLOBAL_JS_ERROR', error, isFatal);
      setGlobalError({
        message: String(error?.message || error || 'Nieznany błąd JavaScript.'),
        fatal: !!isFatal,
      });
      if (previousHandler && previousHandler !== handler) {
        try {
          previousHandler(error, isFatal);
        } catch (handlerError) {
          console.error('PREVIOUS_GLOBAL_HANDLER_ERROR', handlerError);
        }
      }
    };

    if (globalThis.ErrorUtils?.setGlobalHandler) {
      globalThis.ErrorUtils.setGlobalHandler(handler);
    }

    return () => {
      if (globalThis.ErrorUtils?.setGlobalHandler && previousHandler) {
        globalThis.ErrorUtils.setGlobalHandler(previousHandler);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const mod = require('./AppRuntime');
        if (!mounted) return;

        if (!mod || typeof mod.default !== 'function') {
          throw new Error('AppRuntime nie zwrócił poprawnego komponentu React.');
        }

        AppRuntime = mod.default;
        setStatus('ready');
      } catch (error) {
        console.error('BOOT_ERROR', error);
        bootError = error;
        if (mounted) setStatus('error');
      }
    };

    start();

    return () => {
      mounted = false;
    };
  }, []);

  if (globalError) {
    return (
      <ErrorScreen
        title={globalError.fatal ? 'Krytyczny błąd JavaScript' : 'Błąd JavaScript'}
        message={globalError.message}
      />
    );
  }

  if (status === 'booting') return <BootScreen />;

  if (status === 'error') {
    return (
      <ErrorScreen
        message={String(
          bootError?.message ||
          bootError ||
          'Nieznany błąd podczas ładowania aplikacji.'
        )}
      />
    );
  }

  if (AppRuntime) {
    const RuntimeApp = AppRuntime;
    return (
      <RuntimeErrorBoundary>
        <RuntimeApp />
      </RuntimeErrorBoundary>
    );
  }

  return <BootScreen />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  rootError: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 52,
    marginBottom: 12,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
