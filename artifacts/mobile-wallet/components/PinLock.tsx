/**
 * PinLock — full-screen PIN entry overlay.
 * Shown whenever PinContext.isLocked is true.
 */
import React, { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { usePin } from '@/context/PinContext';
import { useColors } from '@/hooks/useColors';
import { FlameIcon } from '@/components/FlameIcon';

const PIN_LENGTH = 4;

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

export function PinLock() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { unlock } = usePin();
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const shake = useCallback(() => {
    setShaking(true);
    Vibration.vibrate([0, 80, 50, 80]);
    setTimeout(() => setShaking(false), 500);
  }, []);

  const press = useCallback(async (key: string) => {
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      setError(false);
      return;
    }
    if (key === '') return;

    const next = [...digits, key];
    setDigits(next);

    if (next.length === PIN_LENGTH) {
      const ok = await unlock(next.join(''));
      if (!ok) {
        setError(true);
        shake();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setTimeout(() => setDigits([]), 600);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } else {
      await Haptics.selectionAsync();
    }
  }, [digits, unlock, shake]);

  return (
    <View
      style={[
        styles.overlay,
        { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
      ]}
    >
      {/* Logo */}
      <View style={styles.logoWrap}>
        <FlameIcon width={56} height={56} />
        <Text style={[styles.title, { color: colors.foreground }]}>EmberChain</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Enter your PIN to continue</Text>
      </View>

      {/* Dots */}
      <View style={[styles.dotsRow, shaking && styles.dotsShake]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i < digits.length
                    ? error
                      ? colors.destructive
                      : colors.primary
                    : colors.border,
                borderColor: colors.border,
              },
            ]}
          />
        ))}
      </View>

      {error && (
        <Text style={[styles.errorText, { color: colors.destructive }]}>
          Incorrect PIN — try again
        </Text>
      )}

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((key, ki) => (
              <Pressable
                key={ki}
                onPress={() => press(key)}
                disabled={key === ''}
                style={({ pressed }) => [
                  styles.key,
                  {
                    backgroundColor:
                      key === ''
                        ? 'transparent'
                        : pressed
                        ? colors.muted
                        : colors.card,
                    borderColor: key === '' ? 'transparent' : colors.border,
                  },
                ]}
              >
                {key === '⌫' ? (
                  <Feather name="delete" size={22} color={colors.foreground} />
                ) : (
                  <Text style={[styles.keyText, { color: key === '' ? 'transparent' : colors.foreground }]}>
                    {key}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoWrap: { alignItems: 'center', gap: 10 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: 2 },
  subtitle: { fontSize: 14 },

  dotsRow: { flexDirection: 'row', gap: 20 },
  dotsShake: { transform: [{ translateX: 6 }] }, // simple visual nudge
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  errorText: { fontSize: 13, marginTop: -8 },

  keypad: { width: '100%', maxWidth: 320, gap: 14, paddingHorizontal: 24 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  key: {
    flex: 1,
    aspectRatio: Platform.OS === 'web' ? undefined : 1.4,
    height: Platform.OS === 'web' ? 64 : undefined,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 26, fontWeight: '600' },
});
