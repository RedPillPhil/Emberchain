/**
 * Private Pool — shielded EMBR transfers using ring signatures.
 * Sub-screens: Balance · Shield · Send · Unshield
 */
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
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { AddressBookModal } from '@/components/AddressBookModal';
import { privacyClient, type PrivateBalance } from '@/lib/privacyClient';
import { formatEMBR, isValidAddress } from '@/lib/format';

type Tab = 'balance' | 'shield' | 'send' | 'unshield';

const TABS: { id: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { id: 'balance', label: 'Balance', icon: 'eye-off' },
  { id: 'shield', label: 'Shield', icon: 'lock' },
  { id: 'send', label: 'Private Send', icon: 'send' },
  { id: 'unshield', label: 'Unshield', icon: 'unlock' },
];

/** 0.01 EMBR in human-readable form — matches DEFAULT_PRIVATE_FEE in blockchain.ts */
const PRIVATE_SEND_FEE = '0.01';

export default function PrivateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { address, formattedBalance, nodeStatus } = useWallet();
  const [activeTab, setActiveTab] = useState<Tab>('balance');
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 16);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerTitle}>
          <Feather name="shield" size={18} color={colors.primary} />
          <Text style={[styles.title, { color: colors.foreground }]}>Privacy Pool</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Ring-signature shielded transfers
        </Text>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarWrap} contentContainerStyle={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setActiveTab(t.id)}
            style={[
              styles.tabBtn,
              {
                backgroundColor: activeTab === t.id ? colors.primary : colors.card,
                borderColor: activeTab === t.id ? colors.primary : colors.border,
              },
            ]}
          >
            <Feather name={t.icon} size={13} color={activeTab === t.id ? '#fff' : colors.mutedForeground} />
            <Text style={[styles.tabLabel, { color: activeTab === t.id ? '#fff' : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {activeTab === 'balance' && <BalancePanel colors={colors} insets={insets} />}
        {activeTab === 'shield' && <ShieldPanel colors={colors} insets={insets} address={address} formattedBalance={formattedBalance} />}
        {activeTab === 'send' && <PrivateSendPanel colors={colors} insets={insets} />}
        {activeTab === 'unshield' && <UnshieldPanel colors={colors} insets={insets} address={address} />}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Balance panel ─────────────────────────────────────────────────────────
function BalancePanel({ colors, insets }: any) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PrivateBalance | null>(null);
  const [error, setError] = useState('');

  const scan = async () => {
    setLoading(true);
    setError('');
    try {
      const pk = await SecureStore.getItemAsync('embr_pk');
      if (!pk) throw new Error('Wallet not found');
      const bal = await privacyClient.getBalance(pk);
      setResult(bal);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 90 }]}>
      <View style={[styles.infoBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          Scanning checks the privacy pool for notes owned by your private key. This stays on your device.
        </Text>
      </View>

      <Pressable
        onPress={scan}
        disabled={loading}
        style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <>
            <Feather name="search" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Scan Private Balance</Text>
          </>
        )}
      </Pressable>

      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}

      {result && (
        <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>PRIVATE BALANCE</Text>
          <Text style={[styles.resultAmount, { color: colors.foreground }]}>{formatEMBR(result.balance)}</Text>
          <Text style={[styles.resultCurrency, { color: colors.primary }]}>EMBR (shielded)</Text>
          <Text style={[styles.resultMeta, { color: colors.mutedForeground }]}>{result.noteCount} note{result.noteCount !== 1 ? 's' : ''} found</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Shield panel ──────────────────────────────────────────────────────────
function ShieldPanel({ colors, insets, address, formattedBalance }: any) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handle = async () => {
    setError(''); setSuccess('');
    if (!parseFloat(amount)) { setError('Enter an amount.'); return; }
    setLoading(true);
    try {
      const pk = await SecureStore.getItemAsync('embr_pk');
      if (!pk) throw new Error('Wallet not found');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await privacyClient.shield(pk, amount);
      setSuccess(`${amount} EMBR moved to shielded pool.`);
      setAmount('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 90 }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.infoBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
        <Feather name="lock" size={14} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          Shielding moves public EMBR into the privacy pool. The transfer is recorded on-chain but the amount is hidden using Pedersen commitments.
        </Text>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>AMOUNT TO SHIELD</Text>
      <Text style={[styles.fieldSub, { color: colors.mutedForeground }]}>Available: {formattedBalance} EMBR</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, flex: 1 }]}
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          value={amount}
          onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, '')); setError(''); }}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>EMBR</Text>
      </View>

      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
      {success ? <Text style={[styles.successText, { color: colors.success }]}>{success}</Text> : null}

      <Pressable
        onPress={handle} disabled={loading}
        style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <><Feather name="lock" size={18} color="#fff" /><Text style={styles.actionBtnText}>Shield EMBR</Text></>
        )}
      </Pressable>
    </ScrollView>
  );
}

// ── Private Send panel ────────────────────────────────────────────────────
function PrivateSendPanel({ colors, insets }: any) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bookVisible, setBookVisible] = useState(false);

  const totalDeducted = amount && parseFloat(amount) > 0
    ? (parseFloat(amount) + parseFloat(PRIVATE_SEND_FEE)).toFixed(4).replace(/\.?0+$/, '')
    : null;

  const handle = async () => {
    setError(''); setSuccess('');
    if (!isValidAddress(to.trim())) { setError('Invalid recipient address.'); return; }
    if (!parseFloat(amount)) { setError('Enter an amount.'); return; }
    setLoading(true);
    try {
      const pk = await SecureStore.getItemAsync('embr_pk');
      if (!pk) throw new Error('Wallet not found');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await privacyClient.privateSend(pk, to.trim(), amount);
      setSuccess(`Private send of ${amount} EMBR submitted.`);
      setTo(''); setAmount('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 90 }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.infoBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
        <Feather name="eye-off" size={14} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          Private send uses ring signatures — the sender, recipient, and amount are hidden from observers.
        </Text>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>RECIPIENT ADDRESS</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, flex: 1 }]}
          placeholder="0x…"
          placeholderTextColor={colors.mutedForeground}
          value={to}
          onChangeText={(t) => { setTo(t); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setBookVisible(true)} hitSlop={8}>
          <Feather name="users" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>AMOUNT TO SEND (EMBR)</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, flex: 1 }]}
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          value={amount}
          onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, '')); setError(''); }}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>EMBR</Text>
      </View>

      {/* Fee notice */}
      <View style={[styles.feeBox, { backgroundColor: `${colors.warning ?? '#F59E0B'}15`, borderColor: `${colors.warning ?? '#F59E0B'}40` }]}>
        <Feather name="info" size={14} color={colors.warning ?? '#F59E0B'} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.feeTitle, { color: colors.foreground }]}>
            Network fee: {PRIVATE_SEND_FEE} EMBR
          </Text>
          <Text style={[styles.feeSub, { color: colors.mutedForeground }]}>
            Deducted from your shielded balance on top of the send amount. The fee goes to a public protocol sink address (0x…deadbeef) — visible on-chain, but cannot be linked to you or the recipient.
          </Text>
          {totalDeducted && (
            <Text style={[styles.feeTotal, { color: colors.foreground }]}>
              Total deducted from pool: <Text style={{ fontWeight: '700' }}>{totalDeducted} EMBR</Text>
            </Text>
          )}
        </View>
      </View>

      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
      {success ? <Text style={[styles.successText, { color: colors.success }]}>{success}</Text> : null}

      <Pressable
        onPress={handle} disabled={loading}
        style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <><Feather name="send" size={18} color="#fff" /><Text style={styles.actionBtnText}>Send Privately</Text></>
        )}
      </Pressable>

      <AddressBookModal visible={bookVisible} onClose={() => setBookVisible(false)} onSelect={(addr) => { setTo(addr); setBookVisible(false); }} allowAdd={false} />
    </ScrollView>
  );
}

// ── Unshield panel ────────────────────────────────────────────────────────
function UnshieldPanel({ colors, insets, address }: any) {
  const [to, setTo] = useState(address ?? '');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [bookVisible, setBookVisible] = useState(false);

  const handle = async () => {
    setError(''); setSuccess('');
    if (!isValidAddress(to.trim())) { setError('Invalid destination address.'); return; }
    if (!parseFloat(amount)) { setError('Enter an amount.'); return; }
    setLoading(true);
    try {
      const pk = await SecureStore.getItemAsync('embr_pk');
      if (!pk) throw new Error('Wallet not found');
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await privacyClient.unshield(pk, to.trim(), amount);
      setSuccess(`${amount} EMBR unshielded to ${to.slice(0, 8)}…`);
      setAmount('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 90 }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.infoBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
        <Feather name="unlock" size={14} color={colors.primary} />
        <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
          Unshielding moves funds from the privacy pool back to a public address.
        </Text>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>DESTINATION ADDRESS</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, flex: 1 }]}
          placeholder="0x…"
          placeholderTextColor={colors.mutedForeground}
          value={to}
          onChangeText={(t) => { setTo(t); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setBookVisible(true)} hitSlop={8}>
          <Feather name="users" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 12 }]}>AMOUNT (EMBR)</Text>
      <View style={[styles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { color: colors.foreground, flex: 1 }]}
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          value={amount}
          onChangeText={(t) => { setAmount(t.replace(/[^0-9.]/g, '')); setError(''); }}
          keyboardType="decimal-pad"
        />
        <Text style={[styles.unit, { color: colors.mutedForeground }]}>EMBR</Text>
      </View>

      {error ? <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text> : null}
      {success ? <Text style={[styles.successText, { color: colors.success }]}>{success}</Text> : null}

      <Pressable
        onPress={handle} disabled={loading}
        style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 }]}
      >
        {loading ? <ActivityIndicator color="#fff" /> : (
          <><Feather name="unlock" size={18} color="#fff" /><Text style={styles.actionBtnText}>Unshield EMBR</Text></>
        )}
      </Pressable>

      <AddressBookModal visible={bookVisible} onClose={() => setBookVisible(false)} onSelect={(addr) => { setTo(addr); setBookVisible(false); }} allowAdd={false} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  tabBarWrap: { flexGrow: 0 },
  tabBar: { paddingHorizontal: 20, paddingVertical: 8, gap: 8, flexDirection: 'row' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tabLabel: { fontSize: 13, fontWeight: '600' },
  panel: { padding: 20, gap: 12 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  fieldSub: { fontSize: 12, marginTop: -6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 4 },
  input: { fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  unit: { fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 13, textAlign: 'center' },
  successText: { fontSize: 13, textAlign: 'center' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 12 },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resultCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', gap: 4 },
  resultLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  resultAmount: { fontSize: 40, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  resultCurrency: { fontSize: 16, fontWeight: '700' },
  resultMeta: { fontSize: 12, marginTop: 8 },

  // Fee notice
  feeBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  feeTitle: { fontSize: 13, fontWeight: '700' },
  feeSub: { fontSize: 12, lineHeight: 17 },
  feeTotal: { fontSize: 13, marginTop: 4 },
});
