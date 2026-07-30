/**
 * Community — live chat + forum, sharing the same backend as the web wallet.
 * Identity: user can set a custom nickname and toggle anonymous mode.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useWallet } from '@/context/WalletContext';
import {
  communityClient,
  openChatSocket,
  sendChatMessage,
  type ChatMessage,
  type ForumPost,
  type ForumComment,
} from '@/lib/communityClient';
import {
  getNickname,
  saveNickname,
  getAnonymous,
  saveAnonymous,
} from '@/lib/communityIdentity';
import { shortAddr, timeAgo } from '@/lib/format';

type Tab = 'chat' | 'forum';

// ── Deterministic fallback name ───────────────────────────────────────────
function anonName(address: string): string {
  const num = parseInt(address.slice(2, 7), 16) % 9000 + 1000;
  return `Anon${num}`;
}

// ── Identity modal ────────────────────────────────────────────────────────
function IdentityModal({
  visible,
  address,
  colors,
  insets,
  onClose,
  onChanged,
}: {
  visible: boolean;
  address: string | null;
  colors: any;
  insets: any;
  onClose: () => void;
  onChanged: (name: string, anon: boolean) => void;
}) {
  const [nick, setNick] = useState('');
  const [anon, setAnon] = useState(true);
  const [loading, setLoading] = useState(false);

  // Load current settings on open
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    Promise.all([getNickname(), getAnonymous()]).then(([n, a]) => {
      setNick(n ?? '');
      setAnon(a);
      setLoading(false);
    });
  }, [visible]);

  const save = async () => {
    await saveNickname(nick);
    await saveAnonymous(anon);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const effectiveName = anon ? 'Anonymous' : (nick.trim() || (address ? anonName(address) : 'Anonymous'));
    onChanged(effectiveName, anon);
    onClose();
  };

  const defaultName = address ? anonName(address) : 'Anonymous';
  const preview = anon ? 'Anonymous' : (nick.trim() || defaultName);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[idStyles.root, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[idStyles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[idStyles.title, { color: colors.foreground }]}>Community Identity</Text>
          <Pressable onPress={save} hitSlop={8}>
            <Text style={[idStyles.saveBtn, { color: colors.primary }]}>Save</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={idStyles.centered}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <ScrollView contentContainerStyle={[idStyles.body, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {/* Anonymous toggle */}
            <View style={[idStyles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[idStyles.rowLabel, { color: colors.foreground }]}>Post Anonymously</Text>
                <Text style={[idStyles.rowSub, { color: colors.mutedForeground }]}>
                  Your name shows as "Anonymous" in chat and forum posts.
                </Text>
              </View>
              <Switch
                value={anon}
                onValueChange={setAnon}
                trackColor={{ true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Nickname field — only relevant when not anonymous */}
            <View style={{ gap: 6, opacity: anon ? 0.4 : 1 }}>
              <Text style={[idStyles.fieldLabel, { color: colors.mutedForeground }]}>NICKNAME</Text>
              <Text style={[idStyles.fieldSub, { color: colors.mutedForeground }]}>
                If not anonymous, this is shown instead of your address-derived name. Leave blank to use "{defaultName}".
              </Text>
              <View style={[idStyles.inputRow, { backgroundColor: colors.input, borderColor: colors.border }]}>
                <TextInput
                  style={[idStyles.input, { color: colors.foreground }]}
                  placeholder={defaultName}
                  placeholderTextColor={colors.mutedForeground}
                  value={nick}
                  onChangeText={setNick}
                  maxLength={30}
                  editable={!anon}
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Preview */}
            <View style={[idStyles.preview, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
              <Feather name="user" size={14} color={colors.primary} />
              <Text style={[idStyles.previewText, { color: colors.mutedForeground }]}>
                You will appear as{' '}
                <Text style={{ color: colors.foreground, fontWeight: '700' }}>{preview}</Text>
              </Text>
            </View>

            <View style={[idStyles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="shield" size={14} color={colors.mutedForeground} />
              <Text style={[idStyles.infoText, { color: colors.mutedForeground }]}>
                Your wallet address is never shared with other users. Even with a custom nickname, posts cannot be linked back to your address by other participants.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const idStyles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: '700' },
  saveBtn: { fontSize: 16, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12, borderWidth: 1,
  },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  fieldSub: { fontSize: 12, lineHeight: 17 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 4,
  },
  input: { flex: 1, fontSize: 16 },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  previewText: { flex: 1, fontSize: 14 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});

// ── Main screen ───────────────────────────────────────────────────────────
export default function CommunityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { address } = useWallet();
  const [tab, setTab] = useState<Tab>('chat');
  const [identityVisible, setIdentityVisible] = useState(false);
  const [displayName, setDisplayName] = useState<string>('Anonymous');
  const [isAnon, setIsAnon] = useState(true);
  const topPad = insets.top + (Platform.OS === 'web' ? 67 : 16);

  // Load identity on mount
  useEffect(() => {
    Promise.all([getNickname(), getAnonymous()]).then(([nick, anon]) => {
      setIsAnon(anon);
      if (anon) {
        setDisplayName('Anonymous');
      } else {
        setDisplayName(nick?.trim() || (address ? anonName(address) : 'Anonymous'));
      }
    });
  }, [address]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.foreground }]}>Community</Text>
          <Pressable
            onPress={() => setIdentityVisible(true)}
            style={({ pressed }) => [styles.identityBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            hitSlop={8}
          >
            <Feather name="user" size={14} color={colors.mutedForeground} />
            <Text style={[styles.identityBtnText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Feather name="edit-2" size={12} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <View style={[styles.segmentRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {(['chat', 'forum'] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.segment, tab === t && styles.segmentActive, tab === t && { backgroundColor: colors.card }]}
            >
              <Text style={[styles.segmentText, { color: tab === t ? colors.foreground : colors.mutedForeground }]}>
                {t === 'chat' ? '💬 Live Chat' : '📋 Forum'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {tab === 'chat'
        ? <ChatPanel insets={insets} displayName={displayName} />
        : <ForumPanel insets={insets} address={address} displayName={displayName} />}

      <IdentityModal
        visible={identityVisible}
        address={address}
        colors={colors}
        insets={insets}
        onClose={() => setIdentityVisible(false)}
        onChanged={(name, anon) => { setDisplayName(name); setIsAnon(anon); }}
      />
    </View>
  );
}

// ── Chat panel ────────────────────────────────────────────────────────────
function ChatPanel({ insets, displayName }: { insets: any; displayName: string }) {
  const colors = useColors();
  const { address, nodeUrl } = useWallet();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [wsState, setWsState] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList>(null);

  // Connect / reconnect when node changes
  useEffect(() => {
    if (!nodeUrl) return;
    let closed = false;

    function connect() {
      if (closed) return;
      setWsState('connecting');
      try {
        const ws = openChatSocket({
          onOpen: () => setWsState('open'),
          onClose: () => {
            setWsState('closed');
            if (!closed) setTimeout(connect, 3000);
          },
          onError: () => setWsState('closed'),
          onHistory: (msgs) => setMessages(msgs),
          onMessage: (msg) => setMessages((prev) => [...prev, msg]),
          onNewPost: () => {},
        });
        wsRef.current = ws;
      } catch {
        setWsState('closed');
      }
    }

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [nodeUrl]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || wsState !== 'open' || !address) return;
    setInput('');
    sendChatMessage(wsRef.current!, displayName, text);
    await Haptics.selectionAsync();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.bottom + 90}>
      {/* Status bar */}
      <View style={[styles.chatStatus, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.wsDot, { backgroundColor: wsState === 'open' ? colors.success : wsState === 'connecting' ? colors.warning : colors.destructive }]} />
        <Text style={[styles.chatStatusText, { color: colors.mutedForeground }]}>
          {wsState === 'open'
            ? `Connected · posting as ${displayName}`
            : wsState === 'connecting' ? 'Connecting…' : 'Disconnected — retrying'}
        </Text>
      </View>

      {/* Message list */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m, i) => `${m.id ?? i}`}
        contentContainerStyle={[styles.chatList, { paddingBottom: 8 }]}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => <ChatBubble msg={item} myName={displayName} colors={colors} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={[styles.chatEmpty, { color: colors.mutedForeground }]}>
            {wsState === 'connecting' ? 'Connecting to chat…' : 'No messages yet. Say hello!'}
          </Text>
        }
      />

      {/* Input */}
      <View style={[styles.chatInputRow, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 90 : 8) }]}>
        <TextInput
          style={[styles.chatInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
          placeholder={address ? 'Type a message…' : 'Connect a wallet to chat'}
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={wsState === 'open' && !!address}
          multiline={false}
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || wsState !== 'open' || !address}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: input.trim() && wsState === 'open' ? colors.primary : colors.muted, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="send" size={16} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ msg, myName, colors }: { msg: ChatMessage; myName: string; colors: any }) {
  const isMe = msg.author === myName || msg.displayName === myName;
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isMe && (
        <Text style={[styles.bubbleAuthor, { color: colors.mutedForeground }]}>
          {msg.displayName ?? msg.author}
        </Text>
      )}
      <View style={[styles.bubbleBody, { backgroundColor: isMe ? colors.primary : colors.card, borderColor: colors.border }]}>
        <Text style={[styles.bubbleText, { color: isMe ? '#fff' : colors.foreground }]}>{msg.content}</Text>
      </View>
      <Text style={[styles.bubbleTime, { color: colors.mutedForeground }]}>{timeAgo(msg.createdAt)}</Text>
    </View>
  );
}

// ── Forum panel ───────────────────────────────────────────────────────────
function ForumPanel({ insets, address, displayName }: { insets: any; address: string | null; displayName: string }) {
  const colors = useColors();
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<(ForumPost & { comments: ForumComment[] }) | null>(null);
  const [newPostVisible, setNewPostVisible] = useState(false);

  const loadPosts = useCallback(async () => {
    try { setPosts(await communityClient.listPosts()); } catch { }
  }, []);

  useEffect(() => {
    loadPosts().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  };

  const handleVote = async (post: ForumPost, vote: 1 | -1) => {
    if (!address) return;
    try {
      const { upvotes } = await communityClient.vote(post.id, address, vote);
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, upvotes } : p));
      await Haptics.selectionAsync();
    } catch { }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <>
      <FlatList
        data={posts}
        keyExtractor={(p) => `${p.id}`}
        contentContainerStyle={[styles.forumList, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={[styles.chatEmpty, { color: colors.mutedForeground }]}>No posts yet. Start a discussion!</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={async () => {
              try {
                const full = await communityClient.getPost(item.id);
                setSelectedPost(full);
              } catch { }
            }}
            style={({ pressed }) => [styles.postCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[styles.postTitle, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[styles.postContent, { color: colors.mutedForeground }]} numberOfLines={2}>{item.content}</Text>
            <View style={styles.postMeta}>
              <Text style={[styles.postMetaText, { color: colors.mutedForeground }]}>
                {item.author} · {timeAgo(item.createdAt)}
              </Text>
              <View style={styles.postVoteRow}>
                <Pressable onPress={(e) => { e.stopPropagation?.(); handleVote(item, 1); }} hitSlop={8}>
                  <Feather name="arrow-up" size={14} color={colors.mutedForeground} />
                </Pressable>
                <Text style={[styles.postVoteCount, { color: colors.foreground }]}>{item.upvotes}</Text>
                <Pressable onPress={(e) => { e.stopPropagation?.(); handleVote(item, -1); }} hitSlop={8}>
                  <Feather name="arrow-down" size={14} color={colors.mutedForeground} />
                </Pressable>
                <Feather name="message-square" size={13} color={colors.mutedForeground} />
                <Text style={[styles.postMetaText, { color: colors.mutedForeground }]}>{item.commentCount ?? 0}</Text>
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* FAB */}
      {address && (
        <Pressable
          onPress={() => setNewPostVisible(true)}
          style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 80 }]}
        >
          <Feather name="edit-3" size={20} color="#fff" />
        </Pressable>
      )}

      {/* Post detail modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          address={address}
          displayName={displayName}
          colors={colors}
          insets={insets}
          onClose={() => setSelectedPost(null)}
          onCommented={(comment) => setSelectedPost((p) => p ? { ...p, comments: [...p.comments, comment] } : null)}
        />
      )}

      {/* New post modal */}
      {newPostVisible && (
        <NewPostModal
          displayName={displayName}
          colors={colors}
          insets={insets}
          onClose={() => setNewPostVisible(false)}
          onCreated={(post) => { setPosts((prev) => [post, ...prev]); setNewPostVisible(false); }}
        />
      )}
    </>
  );
}

// ── Post detail modal ─────────────────────────────────────────────────────
function PostDetailModal({ post, address, displayName, colors, insets, onClose, onCommented }: any) {
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!commentText.trim() || !address) return;
    setSubmitting(true);
    try {
      const c = await communityClient.addComment(post.id, displayName, commentText.trim());
      onCommented(c);
      setCommentText('');
      await Haptics.selectionAsync();
    } catch { }
    finally { setSubmitting(false); }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>{post.title}</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.postTitle, { color: colors.foreground, fontSize: 18, marginBottom: 6 }]}>{post.title}</Text>
          <Text style={[styles.postMetaText, { color: colors.mutedForeground, marginBottom: 12 }]}>
            {post.author} · {timeAgo(post.createdAt)} · ↑ {post.upvotes}
          </Text>
          <Text style={[styles.postContent, { color: colors.foreground, marginBottom: 20 }]}>{post.content}</Text>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>COMMENTS ({post.comments.length})</Text>
          {post.comments.map((c: ForumComment) => (
            <View key={c.id} style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.commentAuthor, { color: colors.primary }]}>{c.author}</Text>
              <Text style={[styles.commentText, { color: colors.foreground }]}>{c.content}</Text>
              <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{timeAgo(c.createdAt)}</Text>
            </View>
          ))}
        </ScrollView>

        {address && (
          <View style={[styles.chatInputRow, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 20 : 8) }]}>
            <TextInput
              style={[styles.chatInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder={`Comment as ${displayName}…`}
              placeholderTextColor={colors.mutedForeground}
              value={commentText}
              onChangeText={setCommentText}
            />
            <Pressable
              onPress={submit}
              disabled={submitting}
              style={[styles.sendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.muted }]}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── New post modal ────────────────────────────────────────────────────────
function NewPostModal({ displayName, colors, insets, onClose, onCreated }: any) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !content.trim()) { setError('Title and content are required.'); return; }
    setLoading(true);
    try {
      const post = await communityClient.createPost(displayName, title.trim(), content.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCreated(post);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.modalRoot, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 8 }}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Post</Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground }}>Posting as {displayName}</Text>
          </View>
          <Pressable onPress={submit} disabled={loading} hitSlop={8}>
            {loading ? <ActivityIndicator size="small" color={colors.primary} /> : (
              <Text style={[styles.postSubmitBtn, { color: colors.primary }]}>Post</Text>
            )}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.modalScroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <TextInput
            style={[styles.newPostTitle, { color: colors.foreground, borderBottomColor: colors.border }]}
            placeholder="Title"
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={(t) => { setTitle(t); setError(''); }}
          />
          <TextInput
            style={[styles.newPostBody, { color: colors.foreground }]}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.mutedForeground}
            value={content}
            onChangeText={(t) => { setContent(t); setError(''); }}
            multiline
            textAlignVertical="top"
          />
          {error ? <Text style={[{ color: colors.destructive, fontSize: 13, textAlign: 'center' }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 24, fontWeight: '800' },
  identityBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
    maxWidth: 160,
  },
  identityBtnText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  segmentRow: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, padding: 3, marginBottom: 8 },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  segmentActive: {},
  segmentText: { fontSize: 14, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Chat
  chatStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  wsDot: { width: 6, height: 6, borderRadius: 3 },
  chatStatusText: { fontSize: 12 },
  chatList: { paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  chatEmpty: { textAlign: 'center', paddingTop: 60, fontSize: 14 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  chatInput: { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Bubbles
  bubble: { maxWidth: '80%', gap: 2 },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubbleAuthor: { fontSize: 11, marginLeft: 4 },
  bubbleBody: { borderRadius: 16, padding: 10, borderWidth: 1 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 10, marginLeft: 4 },

  // Forum
  forumList: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  postCard: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 6 },
  postTitle: { fontSize: 16, fontWeight: '700' },
  postContent: { fontSize: 14, lineHeight: 20 },
  postMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  postMetaText: { fontSize: 12 },
  postVoteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postVoteCount: { fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  fab: { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  commentCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 8, gap: 4 },
  commentAuthor: { fontSize: 12, fontWeight: '700' },
  commentText: { fontSize: 14, lineHeight: 20 },
  commentTime: { fontSize: 11 },

  // Modals
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
  modalScroll: { paddingHorizontal: 20, paddingTop: 16, gap: 0 },
  postSubmitBtn: { fontSize: 16, fontWeight: '700' },
  newPostTitle: { fontSize: 22, fontWeight: '700', paddingVertical: 14, borderBottomWidth: 1, marginBottom: 12 },
  newPostBody: { fontSize: 16, lineHeight: 24, minHeight: 200 },
});
