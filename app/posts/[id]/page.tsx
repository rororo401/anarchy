"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useCommunity, type Comment, type Post } from "@/lib/community-context";
import { formatTimestamp } from "@/components/feed";

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { account, addComment, deletePost, toggleLike } = useCommunity();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [comment, setComment] = useState("");

  const load = useCallback(async (append = false) => {
    const query = new URLSearchParams();
    if (account) query.set("pubkey", account.publicKey);
    if (append && nextCursor) query.set("cursor", String(nextCursor));
    const response = await fetch(`/api/posts/${id}?${query}`);
    if (!response.ok) return;
    const data = await response.json();
    setPost({
      id: data.post.id,
      author: data.post.author,
      authorName: data.post.author_name,
      title: data.post.title,
      body: data.post.body,
      createdAt: Number(data.post.created_at) * 1000,
      commentCount: data.comments.length,
      likeCount: Number(data.post.like_count),
      liked: Boolean(data.post.liked),
      likedEventId: data.post.liked_event_id ? String(data.post.liked_event_id) : undefined,
    });
    const mappedComments = data.comments.map((item: Record<string, unknown>) => ({
      id: String(item.id),
      author: String(item.author),
      authorName: String(item.author_name),
      body: String(item.body),
      createdAt: Number(item.created_at) * 1000,
    }));
    setComments((current) => append ? [...current, ...mappedComments] : mappedComments);
    setNextCursor(data.nextCursor ? Number(data.nextCursor) : null);
  }, [account, id, nextCursor]);

  useEffect(() => {
    const initialLoad = async () => {
      const query = account ? `?pubkey=${account.publicKey}` : "";
      const response = await fetch(`/api/posts/${id}${query}`);
      if (!response.ok) return;
      const data = await response.json();
      setPost({
        id: data.post.id, author: data.post.author, authorName: data.post.author_name, title: data.post.title,
        body: data.post.body, createdAt: Number(data.post.created_at) * 1000, commentCount: data.comments.length,
        likeCount: Number(data.post.like_count), liked: Boolean(data.post.liked),
        likedEventId: data.post.liked_event_id ? String(data.post.liked_event_id) : undefined,
      });
      setComments(data.comments.map((item: Record<string, unknown>) => ({
        id: String(item.id), author: String(item.author), authorName: String(item.author_name),
        body: String(item.body), createdAt: Number(item.created_at) * 1000,
      })));
      setNextCursor(data.nextCursor ? Number(data.nextCursor) : null);
    };
    initialLoad().catch(console.error);
  }, [account, id]);

  if (!post) return <p className="muted">게시글을 불러오는 중입니다.</p>;
  const mine = account?.publicKey === post.author;

  return (
    <section className="post-detail">
      <article className="post-card">
        <header className="post-meta"><b>{post.authorName}</b><time>{formatTimestamp(post.createdAt)}</time></header>
        <h1>{post.title}</h1>
        <p>{post.body}</p>
        <footer className="post-actions">
          <button className={post.liked ? "liked" : ""} onClick={async () => { await toggleLike(post); await load(); }}>▲ <span>{post.likeCount}</span></button>
          {mine && <button onClick={() => deletePost(post.id)}>× <span>삭제</span></button>}
        </footer>
      </article>
      <div className="comments">
        {comments.map((item) => <div className="comment" key={item.id}><span><b>{item.authorName}</b> {formatTimestamp(item.createdAt)}</span><p>{item.body}</p></div>)}
      </div>
      {comments.length >= 50 && <button className="button load-more" onClick={() => load(true)}>댓글 더 보기</button>}
      <div className="comment-form">
        <input className="text-input" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="댓글을 입력하세요" />
        <button className="button small" onClick={async () => {
          if (!comment.trim()) return;
          if (await addComment(post.id, post.author, comment.trim())) {
            setComment("");
            await load();
          }
        }}>등록</button>
      </div>
    </section>
  );
}
