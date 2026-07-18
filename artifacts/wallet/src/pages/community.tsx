import React, { useState, useEffect, useRef, useCallback } from "react";
import { Shell } from "@/components/layout/shell";
import { useActiveWallet } from "@/hooks/use-active-wallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  FileText,
  Send,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  Plus,
  X,
  Loader2,
  Users,
  Hash,
} from "lucide-react";

// ── types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: number;
  author: string;
  content: string;
  createdAt: string;
}

interface Comment {
  id: number;
  postId: number;
  author: string;
  content: string;
  createdAt: string;
}

interface Post {
  id: number;
  author: string;
  title: string;
  content: string;
  upvotes: number;
  commentCount: number;
  createdAt: string;
  comments?: Comment[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getWsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/community/ws`;
}

const BASE = "/api/community";

// ── WebSocket hook ────────────────────────────────────────────────────────────

type WsEvent =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "chat_message"; message: ChatMessage }
  | { type: "new_comment"; comment: Comment }
  | { type: "new_post"; post: Post }
  | { type: "post_upvoted"; postId: number; upvotes: number };

function useWs(onEvent: (e: WsEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      ws = new WebSocket(getWsUrl());
      wsRef.current = ws;
      ws.onopen = () => setOnline(true);
      ws.onclose = () => {
        setOnline(false);
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as WsEvent;
          onEventRef.current(data);
        } catch { /* ignore */ }
      };
    }

    connect();
    return () => {
      retryTimer && clearTimeout(retryTimer);
      ws.onclose = null;
      ws.close();
    };
  }, []);

  const send = useCallback((payload: unknown) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  return { send, online };
}

// ── Live Chat section ─────────────────────────────────────────────────────────

function LiveChat({
  address,
  messages,
  onSend,
  online,
}: {
  address: string;
  messages: ChatMessage[];
  onSend: (content: string) => void;
  online: boolean;
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* message feed */}
      <div className="flex-1 overflow-y-auto space-y-1 p-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground/50 text-sm italic py-8">
            No messages yet. Be the first to say something!
          </div>
        )}
        {messages.map((m) => {
          const isMe = m.author.toLowerCase() === address.toLowerCase();
          return (
            <div key={m.id} className={cn("flex gap-2 group", isMe && "flex-row-reverse")}>
              <div className={cn(
                "max-w-[75%] px-3 py-2 rounded-sm text-sm leading-relaxed",
                isMe
                  ? "bg-primary/20 border border-primary/30 text-foreground"
                  : "bg-secondary/60 border border-border text-foreground",
              )}>
                {!isMe && (
                  <div className="text-[10px] font-bold text-primary uppercase tracking-widest mb-1 font-mono">
                    {shortAddr(m.author)}
                  </div>
                )}
                <div>{m.content}</div>
                <div className="text-[10px] text-muted-foreground/60 mt-1 text-right">
                  {timeAgo(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="border-t border-border p-3 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={online ? "Send a message…" : "Connecting…"}
          disabled={!online}
          className="flex-1 bg-secondary/40 border-border font-sans"
          maxLength={2000}
        />
        <Button
          onClick={handleSend}
          disabled={!online || !text.trim()}
          size="sm"
          className="gap-1.5 shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  address,
  liveComments,
  onUpvote,
  onAddComment,
}: {
  post: Post;
  address: string;
  liveComments: Comment[];
  onUpvote: (id: number) => void;
  onAddComment: (postId: number, content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  // Merge loaded comments with live ones
  const allComments = React.useMemo(() => {
    const seen = new Set(comments.map((c) => c.id));
    const live = liveComments.filter((c) => c.postId === post.id && !seen.has(c.id));
    return [...comments, ...live].sort((a, b) => a.id - b.id);
  }, [comments, liveComments, post.id]);

  const handleOpen = async () => {
    setOpen((v) => !v);
    if (!open && comments.length === 0) {
      setLoadingComments(true);
      try {
        const res = await fetch(`${BASE}/posts/${post.id}`);
        const data = await res.json() as Post & { comments: Comment[] };
        setComments(data.comments ?? []);
      } catch { /* ignore */ } finally {
        setLoadingComments(false);
      }
    }
  };

  const handleComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    onAddComment(post.id, trimmed);
    setCommentText("");
  };

  return (
    <div className="border border-border rounded-sm bg-secondary/20">
      {/* post header */}
      <div className="flex gap-3 p-4">
        {/* upvote */}
        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
          <button
            onClick={() => onUpvote(post.id)}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs font-bold text-foreground">{post.upvotes}</span>
        </div>

        {/* body */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm leading-snug mb-1">{post.title}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">{post.content}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground font-sans">
            <span className="font-mono text-primary/70">{shortAddr(post.author)}</span>
            <span>{timeAgo(post.createdAt)}</span>
            <button
              onClick={handleOpen}
              className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
            >
              <MessageSquare className="w-3 h-3" />
              {allComments.length || post.commentCount} comments
              {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* comments section */}
      {open && (
        <div className="border-t border-border bg-black/20 px-4 py-3 space-y-3">
          {loadingComments ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading comments…
            </div>
          ) : allComments.length === 0 ? (
            <div className="text-muted-foreground/50 text-xs italic">No comments yet — be first!</div>
          ) : (
            allComments.map((c) => (
              <div key={c.id} className="flex gap-2 text-sm">
                <div className="w-px bg-primary/30 shrink-0 mx-1" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[10px] text-primary/70 font-bold">{shortAddr(c.author)}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="text-foreground/90 leading-relaxed">{c.content}</p>
                </div>
              </div>
            ))
          )}

          {/* add comment */}
          <div className="flex gap-2 pt-1">
            <Input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleComment()}
              placeholder="Add a comment…"
              className="flex-1 text-sm bg-secondary/40 border-border h-8"
              maxLength={4000}
            />
            <Button onClick={handleComment} disabled={!commentText.trim()} size="sm" className="h-8 px-3 gap-1">
              <Send className="w-3 h-3" /> Post
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New post modal ────────────────────────────────────────────────────────────

function NewPostForm({ onSubmit, onClose }: { onSubmit: (title: string, content: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-sm w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg uppercase tracking-tight">New Post</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="bg-secondary/40"
          maxLength={200}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full min-h-[120px] rounded-sm border border-border bg-secondary/40 text-foreground text-sm p-3 resize-none outline-none focus:border-primary/60 transition-colors"
          maxLength={10000}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { if (title.trim() && content.trim()) onSubmit(title, content); }}
            disabled={!title.trim() || !content.trim()}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "chat" | "forum";

export default function Community() {
  const { activeWallet } = useActiveWallet();
  const address = activeWallet?.address ?? "";

  const [tab, setTab] = useState<Tab>("chat");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [liveComments, setLiveComments] = useState<Comment[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // WebSocket
  const { send, online } = useWs((event) => {
    if (event.type === "history") setChatMessages(event.messages);
    if (event.type === "chat_message") setChatMessages((p) => [...p, event.message].slice(-200));
    if (event.type === "new_comment") setLiveComments((p) => [...p, event.comment].slice(-200));
    if (event.type === "new_post") setPosts((p) => [event.post, ...p]);
    if (event.type === "post_upvoted") {
      setPosts((p) => p.map((post) =>
        post.id === event.postId ? { ...post, upvotes: event.upvotes } : post
      ));
    }
  });

  // Fetch posts on forum tab open
  useEffect(() => {
    if (tab !== "forum" || posts.length > 0) return;
    setLoadingPosts(true);
    fetch(`${BASE}/posts`)
      .then((r) => r.json() as Promise<Post[]>)
      .then(setPosts)
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingPosts(false));
  }, [tab]);

  const handleSendChat = (content: string) => {
    if (!address) return;
    send({ type: "chat", author: address, content });
  };

  const handleAddComment = (postId: number, content: string) => {
    if (!address) return;
    send({ type: "comment", author: address, postId, content });
  };

  const handleUpvote = async (postId: number) => {
    try {
      const res = await fetch(`${BASE}/posts/${postId}/upvote`, { method: "POST" });
      if (res.ok) {
        const { upvotes } = await res.json() as { upvotes: number };
        setPosts((p) => p.map((post) => post.id === postId ? { ...post, upvotes } : post));
      }
    } catch { /* ignore */ }
  };

  const handleNewPost = async (title: string, content: string) => {
    if (!address) return;
    setShowNewPost(false);
    try {
      await fetch(`${BASE}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: address, title, content }),
      });
      // The WebSocket will broadcast new_post and update state
    } catch { /* ignore */ }
  };

  return (
    <Shell requireWallet={false}>
      {showNewPost && (
        <NewPostForm onSubmit={handleNewPost} onClose={() => setShowNewPost(false)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-primary/10 border border-primary/30 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight text-foreground uppercase">
              Forge Community
            </h1>
            <p className="text-sm text-muted-foreground">
              Live chat · discussion · mining talk · sign in with your EMBR wallet
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest px-2 py-1 rounded-sm border",
            online
              ? "text-green-400 border-green-500/30 bg-green-500/10"
              : "text-muted-foreground border-border bg-secondary/30",
          )}>
            <div className={cn("w-1.5 h-1.5 rounded-full", online ? "bg-green-400 animate-pulse" : "bg-muted-foreground")} />
            {online ? "Live" : "Connecting…"}
          </div>

          {address && (
            <div className="text-xs font-mono text-muted-foreground border border-border rounded-sm px-2 py-1 bg-secondary/30">
              {shortAddr(address)}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {[
          { id: "chat" as Tab, label: "Live Chat", icon: Hash },
          { id: "forum" as Tab, label: "Forum", icon: FileText },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wide border-b-2 transition-all",
              tab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === "chat" && (
          <Card className="border-border bg-card overflow-hidden flex flex-col" style={{ height: "62vh" }}>
            <div className="bg-secondary/40 border-b border-border px-4 py-2 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
              <Hash className="w-3.5 h-3.5 text-primary" /> general
              <span className="ml-auto flex items-center gap-1">
                <Users className="w-3 h-3" /> {chatMessages.length > 0 ? `${chatMessages.length} messages` : "Say hello!"}
              </span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {!address ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground font-bold uppercase text-sm">Wallet required to chat</p>
                  <p className="text-muted-foreground text-sm">Connect your EMBR wallet to join the conversation.</p>
                </div>
              ) : (
                <LiveChat
                  address={address}
                  messages={chatMessages}
                  onSend={handleSendChat}
                  online={online}
                />
              )}
            </div>
          </Card>
        )}

        {tab === "forum" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                {posts.length} post{posts.length !== 1 ? "s" : ""}
              </p>
              {address && (
                <Button onClick={() => setShowNewPost(true)} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> New Post
                </Button>
              )}
            </div>

            {loadingPosts ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading posts…
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-muted-foreground font-bold uppercase">No posts yet</p>
                {address && (
                  <Button onClick={() => setShowNewPost(true)} size="sm" variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" /> Start the conversation
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    address={address}
                    liveComments={liveComments}
                    onUpvote={handleUpvote}
                    onAddComment={handleAddComment}
                  />
                ))}
              </div>
            )}

            {!address && (
              <div className="flex items-center gap-3 p-3 rounded-sm border border-border bg-secondary/20 text-sm text-muted-foreground">
                <MessageSquare className="w-4 h-4 shrink-0" />
                Connect your EMBR wallet to post and comment.
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
