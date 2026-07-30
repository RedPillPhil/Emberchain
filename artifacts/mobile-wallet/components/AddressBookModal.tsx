/**
 * AddressBookModal — slide-up sheet showing saved contacts.
 * Tap a contact to select it (calls onSelect with the address).
 * Long-press to delete.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { addressBook, type Contact } from '@/lib/addressBook';
import { shortAddr } from '@/lib/format';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect?: (address: string, label: string) => void;
  /** When true, show the "Add contact" button (manage mode). */
  allowAdd?: boolean;
}

export function AddressBookModal({ visible, onClose, onSelect, allowAdd = true }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;

  const reload = useCallback(async () => {
    setContacts(await addressBook.list());
  }, []);

  useEffect(() => {
    if (visible) {
      reload();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
    } else {
      slideAnim.setValue(600);
      setAdding(false);
      setNewLabel(''); setNewAddr(''); setNewNote('');
    }
  }, [visible]);

  const handleSaveContact = async () => {
    if (!newLabel.trim() || !newAddr.trim()) return;
    setSaving(true);
    try {
      await addressBook.add(newLabel, newAddr, newNote);
      await reload();
      setAdding(false);
      setNewLabel(''); setNewAddr(''); setNewNote('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (contact: Contact) => {
    Alert.alert('Remove Contact', `Remove "${contact.label}" from your address book?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await addressBook.remove(contact.id);
          await reload();
        },
      },
    ]);
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
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Address Book</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {allowAdd && !adding && (
                <Pressable onPress={() => setAdding(true)} hitSlop={12}>
                  <Feather name="user-plus" size={20} color={colors.primary} />
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={12}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          {/* Add contact form */}
          {adding && (
            <View style={[styles.addForm, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                style={[styles.addInput, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="Label (e.g. Alice)"
                placeholderTextColor={colors.mutedForeground}
                value={newLabel}
                onChangeText={setNewLabel}
              />
              <TextInput
                style={[styles.addInput, { color: colors.foreground, borderColor: colors.border, fontFamily: 'monospace' }]}
                placeholder="0x address"
                placeholderTextColor={colors.mutedForeground}
                value={newAddr}
                onChangeText={setNewAddr}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={[styles.addInput, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="Note (optional)"
                placeholderTextColor={colors.mutedForeground}
                value={newNote}
                onChangeText={setNewNote}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setAdding(false)}
                  style={[styles.addBtn, { flex: 1, backgroundColor: colors.secondary }]}
                >
                  <Text style={[styles.addBtnText, { color: colors.foreground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveContact}
                  disabled={saving}
                  style={[styles.addBtn, { flex: 2, backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.addBtnText, { color: '#fff' }]}>
                    {saving ? 'Saving…' : 'Save Contact'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Contact list */}
          <FlatList
            data={contacts}
            keyExtractor={(c) => c.id}
            style={{ maxHeight: 380 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="users" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No contacts yet.{allowAdd ? '\nTap + to add one.' : ''}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect?.(item.address, item.label); onClose(); }}
                onLongPress={() => handleDelete(item)}
                style={({ pressed }) => [
                  styles.contactRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: `${colors.primary}20` }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {item.label.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.contactLabel, { color: colors.foreground }]}>{item.label}</Text>
                  <Text style={[styles.contactAddr, { color: colors.mutedForeground }]}>{shortAddr(item.address)}</Text>
                  {item.note ? <Text style={[styles.contactNote, { color: colors.mutedForeground }]}>{item.note}</Text> : null}
                </View>
                {onSelect && <Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
              </Pressable>
            )}
          />
          {contacts.length > 0 && (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Long-press to remove a contact</Text>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingTop: 12, paddingHorizontal: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, marginBottom: 16, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  addForm: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12, gap: 8 },
  addInput: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  addBtn: { borderRadius: 8, padding: 12, alignItems: 'center' },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700' },
  contactLabel: { fontSize: 15, fontWeight: '600' },
  contactAddr: { fontSize: 12, fontFamily: 'monospace' },
  contactNote: { fontSize: 12, marginTop: 1 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  hint: { fontSize: 11, textAlign: 'center', paddingVertical: 8 },
});
