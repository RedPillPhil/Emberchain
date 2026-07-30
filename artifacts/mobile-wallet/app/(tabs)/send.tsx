import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { AddressBookModal } from '@/components/AddressBookModal';
import { formatEMBR, isValidAddress, parseEMBR } from '@/lib/format';

const FEE_ESTIMATE = '0.00001';

export default function SendScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { formattedBalance, balance, send, nodeStatus } = useWallet();

  const [toAddr, setToAddr] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bookVisible, setBookVisible] = useState(false);

  const isOffline = nodeStatus === 'offline';
  const addrValid = isValidAddress(toAddr.trim());
  const amtNum = parseFloat(amount) || 0;
  const maxEMBR = parseFloat(formatEMBR(balance)) || 0;
  const canSend = addrValid && amtNum > 0 && amtNum <= maxEMBR && !loading && !isOffline;

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) { setToAddr(text.trim()); setError(''); }
  };

  const handleMax = () => {
    setAmount(formatEMBR(balance, 8));
    setError('');
  };

  const handleSend = async () => {
    setError(''); setSuccess('');
    if (!addrValid) { setError('Invalid recipient address (must be 0x + 40 hex chars).'); return; }
    if (amtNum <= 0) { setError('Enter an amount greater than 0.'); return; }
    if (amtNum > maxEMBR) { setError(`Insufficient balance. You have ${formatEMBR(balance)} EMBR.`); return; }

    Alert.alert(
      'Confirm Send',
      `Send ${amount} EMBR to\n${toAddr.slice(0, 10)}…${toAddr.slice(-8)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              const tx = await send(toAddr.trim(), amount);
              setSuccess(`Sent! Tx: ${tx.hash.slice(0, 12)}…`);
              setToAddr('');
              setAmount('');
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e: any) {
              setError(e.message ?? 'Transaction failed.');
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 16);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad, paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Send EMBR</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Balance: {formattedBalance} EMBR
        </Text>

        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: `${colors.destructive}15`, borderColor: `${colors.destructive}30` }]}>
            <Feather name="wifi-off" size={14} color={colors.destructive} />
            <Text style={[styles.offlineText, { color: colors.destructive }]}>
              Node offline — transactions unavailable
            </Text>
          </View>
        )}

        {/* To field */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>RECIPIENT ADDRESS</Text>
          <View style={[
            styles.inputRow,
            { backgroundColor: colors.input, borderColor: toAddr && !addrValid ? colors.destructive : colors.border }
          ]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, flex: 1 }]}
              placeholder="0x…"
              placeholderTextColor={colors.mutedForeground}
              value={toAddr}
              onChangeText={(t) => { setToAddr(t); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* Address book picker */}
            <Pressable onPress={() => setBookVisible(true)} hitSlop={8} style={styles.iconBtn}>
              <Feather name="users" size={18} color={colors.mutedForeground} />
            </Pressable>
            {/* Clipboard paste */}
            <Pressable onPress={handlePaste} hitSlop={8} style={styles.iconBtn}>
              <Feather name="clipboard" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          {toAddr.length > 0 && !addrValid && (
            <Text style={[styles.fieldError, { color: colors.destructive }]}>Invalid address</Text>
          )}
        </View>

        {/* Amount field */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>AMOUNT (EMBR)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, { color: colors.foreground, flex: 1 }]}
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              value={amount}
              onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, '')); setError(''); }}
              keyboardType="decimal-pad"
            />
            <Pressable
              onPress={handleMax}
              style={[styles.maxBtn, { backgroundColor: `${colors.primary}20` }]}
            >
              <Text style={[styles.maxText, { color: colors.primary }]}>MAX</Text>
            </Pressable>
          </View>
        </View>

        {/* Fee estimate */}
        <View style={[styles.feeRow, { borderColor: colors.border }]}>
          <Text style={[styles.feeLabel, { color: colors.mutedForeground }]}>Estimated fee</Text>
          <Text style={[styles.feeAmount, { color: colors.mutedForeground }]}>~{FEE_ESTIMATE} EMBR</Text>
        </View>

        {error ? <Text style={[styles.statusText, { color: colors.destructive }]}>{error}</Text> : null}
        {success ? <Text style={[styles.statusText, { color: colors.success }]}>{success}</Text> : null}

        {/* Send button */}
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: canSend ? colors.primary : colors.muted,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="send" size={18} color={canSend ? '#fff' : colors.mutedForeground} />
              <Text style={[styles.sendBtnText, { color: canSend ? '#fff' : colors.mutedForeground }]}>
                Send
              </Text>
            </>
          )}
        </Pressable>

        {/* Private send hint */}
        <View style={[styles.privateHint, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20` }]}>
          <Feather name="shield" size={13} color={colors.primary} />
          <Text style={[styles.privateHintText, { color: colors.mutedForeground }]}>
            Need privacy?{' '}
            <Text style={{ color: colors.primary }} onPress={() => {}}>
              Use the Private tab
            </Text>{' '}
            for ring-signature shielded transfers.
          </Text>
        </View>
      </ScrollView>

      {/* Address book modal */}
      <AddressBookModal
        visible={bookVisible}
        onClose={() => setBookVisible(false)}
        onSelect={(addr) => { setToAddr(addr); setError(''); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: -8 },
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 8, borderWidth: 1,
  },
  offlineText: { fontSize: 13 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 4, gap: 4,
  },
  input: { fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  iconBtn: { padding: 4 },
  fieldError: { fontSize: 12 },
  maxBtn: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  maxText: { fontSize: 12, fontWeight: '700' },
  feeRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1,
  },
  feeLabel: { fontSize: 13 },
  feeAmount: { fontSize: 13 },
  statusText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: 18, borderRadius: 12, marginTop: 4,
  },
  sendBtnText: { fontSize: 17, fontWeight: '700' },
  privateHint: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  privateHintText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
