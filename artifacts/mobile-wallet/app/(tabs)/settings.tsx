import React, { useEffect, useState } from 'react';
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
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { NodeBadge } from '@/components/WalletComponents';
import { nodeClient } from '@/lib/nodeClient';
import { shortAddr } from '@/lib/format';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon, label, value, onPress, danger, last,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && { borderBottomWidth: 1, borderBottomColor: colors.border },
        pressed && onPress ? { opacity: 0.7 } : {},
      ]}
      disabled={!onPress}
    >
      <Feather
        name={icon}
        size={16}
        color={danger ? colors.destructive : colors.mutedForeground}
        style={styles.rowIcon}
      />
      <Text style={[styles.rowLabel, { color: danger ? colors.destructive : colors.foreground }]}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress && <Feather name="chevron-right" size={14} color={colors.mutedForeground} />}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { address, nodeStatus, nodeUrl, peerCount, reconnect, removeWallet, getPrivateKey } = useWallet();

  const [nodeOverride, setNodeOverride] = useState('');
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [showingKey, setShowingKey] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    nodeClient.getOverride().then((v) => { if (v) setNodeOverride(v); });
  }, []);

  const handleSaveNode = async () => {
    setOverrideLoading(true);
    try {
      await nodeClient.setOverride(nodeOverride.trim() || null);
      await reconnect();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setOverrideLoading(false);
    }
  };

  const handleShowKey = async () => {
    Alert.alert(
      'Show Private Key',
      'Your private key gives full access to your funds. Only view it in a secure location.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show Key',
          style: 'destructive',
          onPress: async () => {
            const pk = await getPrivateKey();
            if (pk) {
              setPrivateKey(pk);
              setShowingKey(true);
            }
          },
        },
      ]
    );
  };

  const handleCopyKey = async () => {
    await Clipboard.setStringAsync(privateKey);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRemoveWallet = () => {
    Alert.alert(
      'Remove Wallet',
      'This will delete your wallet from this device. Make sure you have backed up your private key first.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeWallet();
            router.replace('/setup');
          },
        },
      ]
    );
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 16);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad, paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>

        {/* Network */}
        <Section title="NETWORK">
          <View style={styles.row}>
            <Feather name="radio" size={16} color={colors.mutedForeground} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Status</Text>
            <NodeBadge status={nodeStatus} peerCount={peerCount} />
          </View>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <Feather name="server" size={16} color={colors.mutedForeground} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Active node</Text>
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]} numberOfLines={1}>
              {nodeUrl ? new URL(nodeUrl).hostname : '—'}
            </Text>
          </View>

          {/* Custom node input */}
          <View style={styles.nodeInputRow}>
            <Feather name="link" size={16} color={colors.mutedForeground} style={styles.rowIcon} />
            <TextInput
              style={[styles.nodeInput, { color: colors.foreground }]}
              placeholder="Custom node URL (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={nodeOverride}
              onChangeText={setNodeOverride}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={handleSaveNode}
              style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              disabled={overrideLoading}
            >
              {overrideLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
        </Section>

        {/* Wallet */}
        <Section title="WALLET">
          <Row
            icon="at-sign"
            label="Address"
            value={address ? shortAddr(address) : '—'}
            last={false}
          />
          <Row icon="key" label="Backup Private Key" onPress={handleShowKey} last={false} />
          <Row icon="log-in" label="Import Different Wallet" onPress={() => router.replace('/setup')} last={false} />
          <Row icon="trash-2" label="Remove Wallet" onPress={handleRemoveWallet} danger last />
        </Section>

        {/* Chain info */}
        <Section title="NETWORK INFO">
          <Row icon="layers" label="Chain ID" value="7773" last={false} />
          <Row icon="dollar-sign" label="Currency" value="EMBR" last />
        </Section>

        {/* Private key reveal */}
        {showingKey && (
          <View style={[styles.keyBox, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}30` }]}>
            <View style={styles.keyHeader}>
              <Feather name="alert-triangle" size={14} color={colors.destructive} />
              <Text style={[styles.keyWarning, { color: colors.destructive }]}>
                Never share this key
              </Text>
              <Pressable onPress={() => { setShowingKey(false); setPrivateKey(''); }} hitSlop={8}>
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <Text style={[styles.keyText, { color: colors.foreground }]} selectable>
              {privateKey}
            </Text>
            <Pressable
              onPress={handleCopyKey}
              style={[styles.copyKeyBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Feather name={copiedKey ? 'check' : 'copy'} size={14} color={copiedKey ? colors.success : colors.foreground} />
              <Text style={[styles.copyKeyText, { color: copiedKey ? colors.success : colors.foreground }]}>
                {copiedKey ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          EmberChain Mobile Wallet · Chain ID 7773
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, gap: 0 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  sectionCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
  },
  rowIcon: { width: 20 },
  rowLabel: { flex: 1, fontSize: 15 },
  rowValue: { fontSize: 13, maxWidth: 160 },
  nodeInputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 8,
  },
  nodeInput: { flex: 1, fontSize: 14 },
  saveBtn: { borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, minWidth: 54, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  keyBox: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 12, marginBottom: 24 },
  keyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyWarning: { flex: 1, fontSize: 13, fontWeight: '600' },
  keyText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    lineHeight: 20,
  },
  copyKeyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start',
  },
  copyKeyText: { fontSize: 13, fontWeight: '600' },
  footer: { fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 8 },
});
