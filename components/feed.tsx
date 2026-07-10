"use client";

import { useState } from "react";
import Link from "next/link";
import { type Post, useCommunity } from "@/lib/community-context";

export function Feed() {
  const { posts, stats, loading, searchPosts, loadMorePosts } = useCommunity();
  const [query, setQuery] = useState("");

  return (
    <section>
      <div className="stats-grid">
        <Stat label="블록" value={stats.blocks} />
        <Stat label="게시글" value={stats.posts} />
        <Stat label="댓글" value={stats.comments} />
        <Stat label={<>총 발행 <span className="point-mark tiny">A</span></>} value={stats.issued} />
      </div>

      <div className="section-heading">
        <h1>메인 게시판</h1>
        <Link href="/write" className="button compose">+ 새 글 쓰기</Link>
      </div>
      <div className="search-form">
        <input className="text-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 본문, 닉네임 검색" />
        <button className="button small" onClick={() => searchPosts(query)}>검색</button>
      </div>

      <div className="feed-list">
        {loading && <p className="muted">글을 불러오는 중입니다.</p>}
        {posts.map((post) => <PostCard post={post} key={post.id} />)}
      </div>
      {posts.length > 0 && <button className="button load-more" onClick={loadMorePosts}>더 보기</button>}
    </section>
  );
}

function Stat({ label, value }: { label: React.ReactNode; value: number }) {
  return <article className="stat-card"><span>{label}</span><strong>{value}</strong></article>;
}

function PostCard({ post }: { post: Post }) {
  const { account, deletePost, toggleLike } = useCommunity();
  const mine = account?.publicKey === post.author;
  const liked = post.liked;

  return (
    <article className="post-card">
      <header className="post-meta">
        <div><b>{post.authorName}</b><span>{shortKey(post.author)}</span></div>
        <time>{formatTimestamp(post.createdAt)}</time>
      </header>
      <Link href={`/posts/${post.id}`}><h2>{post.title}</h2></Link>
      <p>{post.body}</p>

      <footer className="post-actions">
        <button className={liked ? "liked" : ""} onClick={() => toggleLike(post)} aria-label="추천">▲ <span>{post.likeCount}</span></button>
        <Link href={`/posts/${post.id}`} aria-label="댓글">□ <span>{post.commentCount}</span></Link>
        {mine && <button onClick={() => deletePost(post.id)} aria-label="삭제">× <span>삭제</span></button>}
      </footer>
    </article>
  );
}

function shortKey(key: string) {
  return `0x${key.slice(0, 6)}...${key.slice(-6)}`;
}

export function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const pad = (value: number) => String(value).padStart(2, "0");

  if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${pad(date.getFullYear() % 100)}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}
