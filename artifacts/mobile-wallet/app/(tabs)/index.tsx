import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { NodeBadge, ReceiveModal, TxItem } from '@/components/WalletComponents';
import { shortAddr } from '@/lib/format';

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    address, formattedBalance, transactions, txLoading,
    nodeStatus, peerCount, refreshBalance, refreshTransactions,
  } = useWallet();

  const [receiveVisible, setReceiveVisible] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleCopyAddr = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    await Haptics.selectionAsync();
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([refreshBalance(), refreshTransactions()]);
    setRefreshing(false);
  };

  const recentTxs = transactions.slice(0, 5);
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Ember glow */}
      <LinearGradient
        colors={['#FF5A0020', '#FF5A0005', 'transparent']}
        style={[styles.glowBg, { top: topPad }]}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: insets.bottom + 90 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.brandLabel, { color: colors.primary }]}>EMBERCHAIN</Text>
          <NodeBadge status={nodeStatus} peerCount={peerCount} />
        </View>

        {/* Balance card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>TOTAL BALANCE</Text>
          <Text
            style={[styles.balanceAmount, { color: colors.foreground }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formattedBalance}
          </Text>
          <Text style={[styles.balanceCurrency, { color: colors.primary }]}>EMBR</Text>

          {/* Address pill */}
          <Pressable
            onPress={handleCopyAddr}
            style={({ pressed }) => [
              styles.addrPill,
              { backgroundColor: colors.muted, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.addrText, { color: colors.mutedForeground }]}>
              {address ? shortAddr(address) : '—'}
            </Text>
            <Feather
              name={copiedAddr ? 'check' : 'copy'}
              size={13}
              color={copiedAddr ? colors.success : colors.mutedForeground}
            />
          </Pressable>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setReceiveVisible(true)}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Feather name="arrow-down-left" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>Receive</Text>
          </Pressable>

          <Pressable
            onPress={() => router.navigate('/(tabs)/send')}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Feather name="arrow-up-right" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.foreground }]}>Send</Text>
          </Pressable>
        </View>

        {/* Recent transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RECENT</Text>
            {transactions.length > 5 && (
              <Pressable onPress={() => router.navigate('/(tabs)/activity')}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
              </Pressable>
            )}
          </View>

          {recentTxs.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {txLoading ? 'Loading transactions…' : 'No transactions yet'}
              </Text>
            </View>
          ) : (
            recentTxs.map((tx) => (
              <TxItem key={tx.hash} tx={tx} myAddress={address ?? ''} />
            ))
          )}

          {/* Offline hint */}
          {nodeStatus === 'offline' && (
            <View style={[styles.offlineBanner, { backgroundColor: `${colors.destructive}15`, borderColor: `${colors.destructive}30` }]}>
              <Feather name="wifi-off" size={14} color={colors.destructive} />
              <Text style={[styles.offlineText, { color: colors.destructive }]}>
                Node offline — showing cached data
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Receive modal */}
      {address && (
        <ReceiveModal
          visible={receiveVisible}
          address={address}
          onClose={() => setReceiveVisible(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glowBg: {
    position: 'absolute',
    left: '25%',
    width: '50%',
    height: 300,
    borderRadius: 150,
  },
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brandLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 4 },

  // Balance card
  balanceCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  balanceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  balanceAmount: {
    fontSize: 52,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: -1,
  },
  balanceCurrency: { fontSize: 18, fontWeight: '700', letterSpacing: 3, marginTop: 2 },
  addrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
  },
  addrText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '600' },

  // Transactions
  section: { gap: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  seeAll: { fontSize: 13, fontWeight: '600' },
  emptyBox: {
    alignItems: 'center',
    gap: 10,
    padding: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 14 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  offlineText: { fontSize: 13 },
});
