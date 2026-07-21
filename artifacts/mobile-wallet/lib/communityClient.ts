/**
 * Community client — REST + WebSocket for live chat and forum.
 * Connects to the same node used by nodeClient.
 */
import { nodeClient } from './nodeClient';

// ── Types ──────────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: number;
  author: string;      // address or nickname
  content: string;
  displayName?: string;
  addressPublic?: boolean;
  createdAt: string;
}

export interface ForumPost {
  id: number;
  author: string;
  title: string;
  content: string;
  upvotes: number;
  commentCount?: number;
  createdAt: string;
}

export interface ForumComment {
  id: number;
  postId: number;
  author: string;
  content: string;
  createdAt: string;
}

export interface Profile {
  address: string;
  nickname: string | null;
  addressPublic: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function nodeBase(): string {
  return (nodeClient as any).getActiveNode?.() ?? '';
}

async function rest<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const base = nodeBase();
  if (!base) throw new Error('No node connected.');
  const res = await fetch(`${base}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let msg = body;
    try { msg = JSON.parse(body).error ?? body; } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function wsUrl(): string {
  const base = nodeBase();
  if (!base) throw new Error('No node connected.');
  return base.replace(/^https?/, (p) => (p === 'https' ? 'wss' : 'ws')) + '/api/community/ws';
}

// ── REST API ───────────────────────────────────────────────────────────────
export const communityClient = {
  // Forum
  listPosts: () => rest<ForumPost[]>('/community/posts'),
  getPost: (id: number) => rest<ForumPost & { comments: ForumComment[] }>(`/community/posts/${id}`),
  createPost: (author: string, title: string, content: string) =>
    rest<ForumPost>('/community/posts', { method: 'POST', body: JSON.stringify({ author, title, content }) }),
  addComment: (postId: number, author: string, content: string) =>
    rest<ForumComment>(`/community/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ author, content }),
    }),
  vote: (postId: number, address: string, vote: 1 | -1) =>
    rest<{ upvotes: number; myVote: 1 | -1 }>(`/community/posts/${postId}/vote`, {
      method: 'POST',
      body: JSON.stringify({ address, vote }),
    }),
  getMyVotes: (address: string) =>
    rest<Record<string, 1 | -1>>(`/community/my-votes?address=${encodeURIComponent(address)}`),

  // Profile
  getProfile: (address: string) => rest<Profile>(`/community/profile/${encodeURIComponent(address)}`),
  upsertProfile: (address: string, nickname: string | null, addressPublic: boolean) =>
    rest<Profile>('/community/profile', {
      method: 'PUT',
      body: JSON.stringify({ address, nickname, addressPublic }),
    }),
};

// ── WebSocket live chat ────────────────────────────────────────────────────
export type WsHandler = {
  onHistory: (messages: ChatMessage[]) => void;
  onMessage: (message: ChatMessage) => void;
  onNewPost: (post: ForumPost) => void;
  onError?: (err: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export function openChatSocket(handlers: WsHandler): WebSocket {
  const url = wsUrl();
  const ws = new WebSocket(url);

  ws.onopen = () => handlers.onOpen?.();
  ws.onerror = (e) => handlers.onError?.(e);
  ws.onclose = () => handlers.onClose?.();

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data as string);
      if (data.type === 'history') handlers.onHistory(data.messages ?? []);
      else if (data.type === 'chat_message') handlers.onMessage(data.message);
      else if (data.type === 'new_post') handlers.onNewPost(data.post);
    } catch { /* ignore malformed */ }
  };

  return ws;
}

export function sendChatMessage(ws: WebSocket, author: string, content: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'chat', author, content }));
}
