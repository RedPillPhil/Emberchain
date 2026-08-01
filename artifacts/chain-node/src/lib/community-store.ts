/**
 * File-backed community store for chain-node (duckdns).
 * Persists chat, forum, profiles without requiring a separate api-server.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DATA_FILE =
  (process.env.COMMUNITY_DATA_FILE ?? "").trim() || "./data/community.json";

export interface Profile {
  address: string;
  nickname: string | null;
  addressPublic: boolean;
}

export interface ChatMessage {
  id: number;
  author: string;
  displayName: string;
  addressPublic: boolean;
  content: string;
  createdAt: string;
}

export interface Post {
  id: number;
  author: string;
  title: string;
  content: string;
  upvotes: number;
  commentCount: number;
  createdAt: string;
}

export interface Comment {
  id: number;
  postId: number;
  author: string;
  content: string;
  createdAt: string;
}

interface StoredMessage {
  id: number;
  author: string;
  content: string;
  createdAt: string;
}

interface StoredPost {
  id: number;
  author: string;
  title: string;
  content: string;
  upvotes: number;
  createdAt: string;
}

interface StoredComment {
  id: number;
  postId: number;
  author: string;
  content: string;
  createdAt: string;
}

interface StoredProfile {
  nickname: string | null;
  addressPublic: boolean;
}

interface CommunityData {
  nextMessageId: number;
  nextPostId: number;
  nextCommentId: number;
  messages: StoredMessage[];
  posts: StoredPost[];
  comments: StoredComment[];
  profiles: Record<string, StoredProfile>;
  votes: Record<string, Record<string, 1 | -1>>;
}

let cache: CommunityData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function defaultData(): CommunityData {
  return {
    nextMessageId: 1,
    nextPostId: 1,
    nextCommentId: 1,
    messages: [],
    posts: [],
    comments: [],
    profiles: {},
    votes: {},
  };
}

function load(): CommunityData {
  if (cache) return cache;
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    cache = { ...defaultData(), ...(JSON.parse(raw) as CommunityData) };
  } catch {
    cache = defaultData();
  }
  return cache!;
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 500);
}

function flush(): void {
  if (!cache) return;
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf-8");
    renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error("[community-store] save failed:", (err as Error).message);
  }
}

function anonName(addr: string): string {
  const num = (parseInt(addr.slice(-4), 16) % 9000) + 1000;
  return `Anon${num}`;
}

function profileFor(addr: string): Profile {
  const p = load().profiles[addr.toLowerCase()];
  return {
    address: addr.toLowerCase(),
    nickname: p?.nickname ?? null,
    addressPublic: p?.addressPublic ?? true,
  };
}

function toMessage(m: StoredMessage): ChatMessage {
  const profile = load().profiles[m.author];
  return {
    id: m.id,
    author: m.author,
    displayName: profile?.nickname ?? anonName(m.author),
    addressPublic: profile?.addressPublic ?? true,
    content: m.content,
    createdAt: m.createdAt,
  };
}

export async function getRecentMessages(limit = 80): Promise<ChatMessage[]> {
  const data = load();
  return data.messages.slice(-limit).map(toMessage);
}

export async function getMessagesSince(sinceId: number): Promise<ChatMessage[]> {
  const data = load();
  return data.messages.filter((m) => m.id > sinceId).map(toMessage);
}

export async function insertMessage(author: string, content: string): Promise<ChatMessage> {
  const data = load();
  const addr = author.toLowerCase();
  const msg: StoredMessage = {
    id: data.nextMessageId++,
    author: addr,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  data.messages.push(msg);
  if (data.messages.length > 500) {
    data.messages = data.messages.slice(-500);
  }
  scheduleSave();
  return toMessage(msg);
}

export async function getProfile(address: string): Promise<Profile | null> {
  const p = load().profiles[address.toLowerCase()];
  if (!p) return null;
  return { address: address.toLowerCase(), nickname: p.nickname, addressPublic: p.addressPublic };
}

export async function upsertProfile(
  address: string,
  nickname: string | null,
  addressPublic: boolean,
): Promise<Profile> {
  const data = load();
  const addr = address.toLowerCase();
  const trimmed = nickname?.trim().slice(0, 32) || null;
  data.profiles[addr] = { nickname: trimmed, addressPublic };
  scheduleSave();
  return { address: addr, nickname: trimmed, addressPublic };
}

export async function listPosts(): Promise<Post[]> {
  const data = load();
  return [...data.posts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({
      id: p.id,
      author: p.author,
      title: p.title,
      content: p.content,
      upvotes: p.upvotes,
      commentCount: data.comments.filter((c) => c.postId === p.id).length,
      createdAt: p.createdAt,
    }));
}

export async function getPost(id: number): Promise<Post | null> {
  const posts = await listPosts();
  return posts.find((p) => p.id === id) ?? null;
}

export async function insertPost(author: string, title: string, content: string): Promise<Post> {
  const data = load();
  const post: StoredPost = {
    id: data.nextPostId++,
    author: author.toLowerCase(),
    title: title.trim(),
    content: content.trim(),
    upvotes: 0,
    createdAt: new Date().toISOString(),
  };
  data.posts.push(post);
  scheduleSave();
  return {
    id: post.id,
    author: post.author,
    title: post.title,
    content: post.content,
    upvotes: 0,
    commentCount: 0,
    createdAt: post.createdAt,
  };
}

export async function getComments(postId: number): Promise<Comment[]> {
  return load()
    .comments.filter((c) => c.postId === postId)
    .sort((a, b) => a.id - b.id)
    .map((c) => ({
      id: c.id,
      postId: c.postId,
      author: c.author,
      content: c.content,
      createdAt: c.createdAt,
    }));
}

export async function insertComment(postId: number, author: string, content: string): Promise<Comment> {
  const data = load();
  const comment: StoredComment = {
    id: data.nextCommentId++,
    postId,
    author: author.toLowerCase(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  data.comments.push(comment);
  scheduleSave();
  return {
    id: comment.id,
    postId: comment.postId,
    author: comment.author,
    content: comment.content,
    createdAt: comment.createdAt,
  };
}

export async function votePost(
  postId: number,
  voterAddress: string,
  vote: 1 | -1,
): Promise<{ netScore: number; myVote: 1 | -1 | null }> {
  const data = load();
  const addr = voterAddress.toLowerCase();
  const key = String(postId);
  if (!data.votes[key]) data.votes[key] = {};

  const existing = data.votes[key][addr];
  if (existing === vote) {
    delete data.votes[key][addr];
  } else {
    data.votes[key][addr] = vote;
  }

  const netScore = Object.values(data.votes[key] ?? {}).reduce((s, v) => s + v, 0);
  const post = data.posts.find((p) => p.id === postId);
  if (post) post.upvotes = netScore;

  scheduleSave();
  const myVote = data.votes[key]?.[addr] ?? null;
  return { netScore, myVote };
}

export async function getMyVotes(voterAddress: string): Promise<Map<number, 1 | -1>> {
  const data = load();
  const addr = voterAddress.toLowerCase();
  const map = new Map<number, 1 | -1>();
  for (const [postId, voters] of Object.entries(data.votes)) {
    const v = voters[addr];
    if (v === 1 || v === -1) map.set(Number(postId), v);
  }
  return map;
}

export { profileFor as getProfileForBroadcast };
