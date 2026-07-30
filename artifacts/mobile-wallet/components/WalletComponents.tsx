/**
 * Shared UI components for the EmberChain wallet.
 * NodeBadge, TxItem, ReceiveModal
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather, Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { type NodeStatus } from '@/context/WalletContext';
import { type Transaction } from '@/lib/nodeClient';
import { formatEMBR, shortAddr, timeAgo } from '@/lib/format';

// ── NodeBadge ─────────────────────────────────────────────────────────────
export function NodeBadge({
  status,
  peerCount,
}: {
  status: NodeStatus;
  peerCount: number;
}) {
  const colors = useColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'searching') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      pulse.setValue(1);
    }
  }, [status]);

  const dotColor =
    status === 'connected'
      ? colors.success
      : status === 'searching'
      ? colors.warning
      : colors.destructive;

  const label =
    status === 'connected'
      ? `${peerCount} peer${peerCount !== 1 ? 's' : ''}`
      : status === 'searching'
      ? 'searching…'
      : 'offline';

  return (
    <View style={styles.badge}>
      <Animated.View style={[styles.dot, { backgroundColor: dotColor, opacity: pulse }]} />
      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ── TxItem ────────────────────────────────────────────────────────────────
export function TxItem({
  tx,
  myAddress,
  onPress,
}: {
  tx: Transaction;
  myAddress: string;
  onPress?: () => void;
}) {
  const colors = useColors();
  const isOut = tx.from.toLowerCase() === myAddress.toLowerCase();
  const amount = formatEMBR(tx.value);
  const counterparty = isOut ? tx.to : tx.from;
  const isPending = tx.status === 'pending';
  const isFailed = tx.status === 'failed';

  const amountColor = isFailed
    ? colors.mutedForeground
    : isOut
    ? colors.foreground
    : colors.success;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.txItem,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      {/* Icon */}
      <View
        style={[
          styles.txIcon,
          {
            backgroundColor: isOut ? `${colors.primary}18` : `${colors.success}18`,
            borderColor: isOut ? `${colors.primary}30` : `${colors.success}30`,
          },
        ]}
      >
        <Feather
          name={isOut ? 'arrow-up-right' : 'arrow-down-left'}
          size={16}
          color={isOut ? colors.primary : colors.success}
        />
      </View>

      {/* Detail */}
      <View style={styles.txDetail}>
        <Text style={[styles.txAddr, { color: colors.foreground }]} numberOfLines={1}>
          {isOut ? 'To ' : 'From '}{shortAddr(counterparty ?? '—')}
        </Text>
        <Text style={[styles.txMeta, { color: colors.mutedForeground }]}>
          {isPending ? '⏳ Pending · ' : isFailed ? '✗ Failed · ' : ''}{timeAgo(tx.createdAt)}
        </Text>
      </View>

      {/* Amount */}
      <Text style={[styles.txAmount, { color: amountColor }]} numberOfLines={1}>
        {isOut ? '−' : '+'}{amount} EMBR
      </Text>
    </Pressable>
  );
}

// ── ReceiveModal ──────────────────────────────────────────────────────────
export function ReceiveModal({
  visible,
  address,
  onClose,
}: {
  visible: boolean;
  address: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(400);
    }
  }, [visible]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(address);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 24,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Title row */}
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Receive EMBR</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* QR */}
          <View style={[styles.qrContainer, { backgroundColor: '#fff', borderRadius: colors.radius }]}>
            <QRCode
              value={address}
              size={200}
              color="#1F1B17"
              backgroundColor="#FFFFFF"
            />
          </View>

          <Text style={[styles.qrLabel, { color: colors.mutedForeground }]}>
            Scan to send EMBR to this address
          </Text>

          {/* Address pill */}
          <View style={[styles.addrBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text
              style={[styles.addrText, { color: colors.foreground }]}
              selectable
              numberOfLines={2}
            >
              {address}
            </Text>
          </View>

          {/* Copy button */}
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [
              styles.copyBtn,
              { backgroundColor: copied ? colors.success : colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name={copied ? 'check' : 'copy'} size={16} color="#fff" />
            <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy Address'}</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // NodeBadge
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '500' },

  // TxItem
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDetail: { flex: 1, gap: 2 },
  txAddr: { fontSize: 14, fontWeight: '500' },
  txMeta: { fontSize: 12 },
  txAmount: { fontSize: 13, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  // ReceiveModal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 20 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  qrContainer: { padding: 16, marginBottom: 16 },
  qrLabel: { fontSize: 13, marginBottom: 16, textAlign: 'center' },
  addrBox: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  addrText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    lineHeight: 20,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    borderRadius: 8,
    padding: 16,
    justifyContent: 'center',
  },
  copyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
