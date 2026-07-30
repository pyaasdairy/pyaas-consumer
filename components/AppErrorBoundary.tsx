import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { colors } from '../lib/theme';
import { logDiag } from '../lib/diag';

interface State {
  error: Error | null;
}

/**
 * Root crash container. Without this, any uncontained throw — most commonly the
 * transient in-flight-request / unmounted-setState churn while the app redirects
 * from (tabs) to (auth) during an auto sign-out — takes the whole app down (the
 * "signs out then crashes" bug). Catching it here shows a recoverable fallback
 * instead, and records the crash to Diagnostics.
 *
 * The fallback deliberately reads NO session/profile state (it must render even
 * when auth is mid-teardown); "Reload" simply clears the error so the tree
 * re-mounts and the router gate lands the user on the right screen.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    logDiag({ kind: 'event', message: `App error caught: ${error?.message ?? String(error)}` });
  }

  handleReload = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.milk,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 16,
        }}
      >
        <Text style={{ fontSize: 44 }}>🥛</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>
          Something went wrong
        </Text>
        <Text style={{ fontSize: 14, color: colors.inkMute, textAlign: 'center', lineHeight: 20 }}>
          The app hit a snag. Tap reload to continue. Your account and orders are safe.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={this.handleReload}
          style={{
            marginTop: 8,
            backgroundColor: colors.flameDeep,
            paddingHorizontal: 40,
            paddingVertical: 14,
            borderRadius: 999,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Reload</Text>
        </Pressable>
      </View>
    );
  }
}
