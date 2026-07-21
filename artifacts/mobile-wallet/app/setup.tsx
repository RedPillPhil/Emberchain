import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';

type Mode = 'choose' | 'import';

export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { createWallet, importWallet } = useWallet();

  const [mode, setMode] = useState<Mode>('choose');
  const [privateKey, setPrivateKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await createWallet();
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create wallet. Is a node reachable?');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!privateKey.trim()) {
      setError('Enter your private key.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await importWallet(privateKey.trim());
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Invalid private key or node unreachable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 24),
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo area */}
        <View style={styles.logoArea}>
          <LinearGradient
            colors={['#FF5A0040', '#FF5A0010', 'transparent']}
            style={styles.glow}
          />
          <View style={[styles.emberIcon, { borderColor: `${colors.primary}40` }]}>
            <Feather name="zap" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.brand, { color: colors.primary }]}>EMBERCHAIN</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Decentralized EMBR Wallet
          </Text>
        </View>

        {mode === 'choose' ? (
          <View style={styles.actions}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              GET STARTED
            </Text>

            {/* Create */}
            <Pressable
              onPress={handleCreate}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="plus-circle" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Create New Wallet</Text>
                </>
              )}
            </Pressable>

            <Text style={[styles.divider, { color: colors.mutedForeground }]}>or</Text>

            {/* Import */}
            <Pressable
              onPress={() => { setMode('import'); setError(''); }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Feather name="download" size={18} color={colors.foreground} />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                Import Existing Wallet
              </Text>
            </Pressable>

            {error ? (
              <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
            ) : null}

            <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
              Your private key is stored encrypted on this device only.
            </Text>
          </View>
        ) : (
          <View style={styles.actions}>
            {/* Back */}
            <Pressable
              onPress={() => { setMode('choose'); setError(''); setPrivateKey(''); }}
              style={styles.backRow}
            >
              <Feather name="arrow-left" size={16} color={colors.mutedForeground} />
              <Text style={[styles.backText, { color: colors.mutedForeground }]}>Back</Text>
            </Pressable>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              IMPORT WALLET
            </Text>

            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: error ? colors.destructive : colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="0x private key…"
              placeholderTextColor={colors.mutedForeground}
              value={privateKey}
              onChangeText={(t) => { setPrivateKey(t); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
              secureTextEntry={false}
            />

            <Pressable
              onPress={handleImport}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="log-in" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Import Wallet</Text>
                </>
              )}
            </Pressable>

            {error ? (
              <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 0,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 48,
    gap: 12,
  },
  glow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -40,
  },
  emberIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5A0015',
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
  },
  tagline: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    textAlign: 'center',
    fontSize: 13,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  backText: { fontSize: 14 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
