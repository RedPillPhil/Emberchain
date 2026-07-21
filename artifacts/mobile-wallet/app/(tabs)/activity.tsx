import React, { useState } from 'react';
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import { TxItem } from '@/components/WalletComponents';
import { type Transaction } from '@/lib/nodeClient';

export default function ActivityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { transactions, txLoading, address, refreshTransactions } = useWallet();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshTransactions();
    setRefreshing(false);
  };

  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 16);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={transactions as Transaction[]}
        keyExtractor={(tx) => tx.hash}
        scrollEnabled={!!transactions.length}
        contentContainerStyle={[
          styles.list,
          { paddingTop: topPad, paddingBottom: insets.bottom + 90 },
        ]}
        ListHeaderComponent={
          <Text style={[styles.title, { color: colors.foreground }]}>Activity</Text>
        }
        renderItem={({ item }) => (
          <TxItem tx={item} myAddress={address ?? ''} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="inbox" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {txLoading ? 'Loading…' : 'No transactions yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              {txLoading ? 'Fetching your transaction history' : 'Your transactions will appear here'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20, gap: 0 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 20 },
  emptyContainer: { alignItems: 'center', gap: 10, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
});
