/**
 * Community platform DB helpers.
 * Tables: community_messages (live chat), community_posts, community_comments.
 * All tables are auto-created on first use (self-bootstrapping).
 */

import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
});

pool.on("error", (err) => {
  console.error("[community-db] Pool error:", err.message);
});

export async function ensureCommunityTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_messages (
        id          SERIAL       PRIMARY KEY,
        author      TEXT         NOT NULL,
        content     TEXT         NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS community_posts (
        id          SERIAL       PRIMARY KEY,
        author      TEXT         NOT NULL,
        title       TEXT         NOT NULL,
        content     TEXT         NOT NULL,
        upvotes     INTEGER      NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS community_comments (
        id          SERIAL       PRIMARY KEY,
        post_id     INTEGER      NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        author      TEXT         NOT NULL,
        content     TEXT         NOT NULL,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS community_comments_post_id_idx
        ON community_comments(post_id);
    `);
  } catch (err) {
    console.error("[community-db] Could not ensure community tables:", (err as Error).message);
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  author: string;
  content: string;
  createdAt: string;
}

export async function getRecentMessages(limit = 80): Promise<ChatMessage[]> {
  const { rows } = await pool.query<{
    id: number; author: string; content: string; created_at: Date;
  }>(
    `SELECT id, author, content, created_at
     FROM community_messages
     ORDER BY id DESC
     LIMIT $1`,
    [limit],
  );
  return rows.reverse().map((r) => ({
    id: r.id,
    author: r.author,
    content: r.content,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function insertMessage(author: string, content: string): Promise<ChatMessage> {
  const { rows } = await pool.query<{
    id: number; author: string; content: string; created_at: Date;
  }>(
    `INSERT INTO community_messages (author, content)
     VALUES ($1, $2)
     RETURNING id, author, content, created_at`,
    [author.toLowerCase(), content.trim()],
  );
  const r = rows[0]!;
  return { id: r.id, author: r.author, content: r.content, createdAt: r.created_at.toISOString() };
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export interface Post {
  id: number;
  author: string;
  title: string;
  content: string;
  upvotes: number;
  commentCount: number;
  createdAt: string;
}

export async function listPosts(): Promise<Post[]> {
  const { rows } = await pool.query<{
    id: number; author: string; title: string; content: string;
    upvotes: number; comment_count: string; created_at: Date;
  }>(`
    SELECT p.id, p.author, p.title, p.content, p.upvotes,
           COUNT(c.id)::text AS comment_count, p.created_at
    FROM community_posts p
    LEFT JOIN community_comments c ON c.post_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    author: r.author,
    title: r.title,
    content: r.content,
    upvotes: r.upvotes,
    commentCount: parseInt(r.comment_count, 10),
    createdAt: r.created_at.toISOString(),
  }));
}

export async function getPost(id: number): Promise<Post | null> {
  const { rows } = await pool.query<{
    id: number; author: string; title: string; content: string;
    upvotes: number; comment_count: string; created_at: Date;
  }>(`
    SELECT p.id, p.author, p.title, p.content, p.upvotes,
           COUNT(c.id)::text AS comment_count, p.created_at
    FROM community_posts p
    LEFT JOIN community_comments c ON c.post_id = p.id
    WHERE p.id = $1
    GROUP BY p.id
  `, [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id, author: r.author, title: r.title, content: r.content,
    upvotes: r.upvotes, commentCount: parseInt(r.comment_count, 10),
    createdAt: r.created_at.toISOString(),
  };
}

export async function insertPost(author: string, title: string, content: string): Promise<Post> {
  const { rows } = await pool.query<{
    id: number; author: string; title: string; content: string;
    upvotes: number; created_at: Date;
  }>(
    `INSERT INTO community_posts (author, title, content)
     VALUES ($1, $2, $3)
     RETURNING id, author, title, content, upvotes, created_at`,
    [author.toLowerCase(), title.trim(), content.trim()],
  );
  const r = rows[0]!;
  return { id: r.id, author: r.author, title: r.title, content: r.content,
    upvotes: r.upvotes, commentCount: 0, createdAt: r.created_at.toISOString() };
}

export async function upvotePost(id: number): Promise<number> {
  const { rows } = await pool.query<{ upvotes: number }>(
    `UPDATE community_posts SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes`,
    [id],
  );
  return rows[0]?.upvotes ?? 0;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface Comment {
  id: number;
  postId: number;
  author: string;
  content: string;
  createdAt: string;
}

export async function getComments(postId: number): Promise<Comment[]> {
  const { rows } = await pool.query<{
    id: number; post_id: number; author: string; content: string; created_at: Date;
  }>(
    `SELECT id, post_id, author, content, created_at
     FROM community_comments
     WHERE post_id = $1
     ORDER BY id ASC`,
    [postId],
  );
  return rows.map((r) => ({
    id: r.id, postId: r.post_id, author: r.author,
    content: r.content, createdAt: r.created_at.toISOString(),
  }));
}

export async function insertComment(postId: number, author: string, content: string): Promise<Comment> {
  const { rows } = await pool.query<{
    id: number; post_id: number; author: string; content: string; created_at: Date;
  }>(
    `INSERT INTO community_comments (post_id, author, content)
     VALUES ($1, $2, $3)
     RETURNING id, post_id, author, content, created_at`,
    [postId, author.toLowerCase(), content.trim()],
  );
  const r = rows[0]!;
  return { id: r.id, postId: r.post_id, author: r.author,
    content: r.content, createdAt: r.created_at.toISOString() };
}
