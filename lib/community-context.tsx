"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { finalizeEvent, type Event } from "nostr-tools";

export type Account = {
  publicKey: string;
  npub: string;
  secretKey: Uint8Array;
  fixedNicknameEnabled: boolean;
  fixedNickname: string;
};

export type Post = {
  id: string;
  author: string;
  authorName: string;
  title: string;
  body: string;
  createdAt: number;
  commentCount: number;
  likeCount: number;
  liked: boolean;
  likedEventId?: string;
};

export type Comment = {
  id: string;
  author: string;
  authorName: string;
  body: string;
  createdAt: number;
};

export type PointTransaction = {
  id: string;
  description: string;
  amount: number;
  createdAt: number;
};

type Stats = { blocks: number; posts: number; comments: number; issued: number };
export type AuthMode = "choice" | "generate" | "create" | "import";

type CommunityContextValue = {
  account: Account | null;
  posts: Post[];
  stats: Stats;
  pointBalance: number;
  transactions: PointTransaction[];
  accountStats: { posts: number; comments: number };
  authOpen: boolean;
  authMode: AuthMode;
  loading: boolean;
  setAccount: (account: Account) => void;
  logout: () => void;
  updateProfile: (fixedNicknameEnabled: boolean, fixedNickname: string) => Promise<void>;
  requestAccount: (mode?: AuthMode) => void;
  closeAuth: () => void;
  addPost: (title: string, body: string, authorName: string) => Promise<boolean>;
  deletePost: (postId: string) => Promise<void>;
  toggleLike: (post: Post) => Promise<boolean>;
  addComment: (postId: string, postAuthor: string, body: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  searchPosts: (query: string) => Promise<void>;
  loadMorePosts: () => Promise<void>;
};

const emptyStats = { blocks: 0, posts: 0, comments: 0, issued: 0 };
const CommunityContext = createContext<CommunityContextValue | null>(null);

export function accountDisplayName(account: Account) {
  return account.fixedNicknameEnabled && account.fixedNickname.trim() ? account.fixedNickname.trim() : "ㅇㅇ";
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [account, setAccountState] = useState<Account | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [pointBalance, setPointBalance] = useState(0);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [accountStats, setAccountStats] = useState({ posts: 0, comments: 0 });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("choice");
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const requestAccount = useCallback((mode: AuthMode = "choice") => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    setAuthMode("choice");
  }, []);

  const loadFeed = useCallback(async (query = "", append = false, cursor?: number | null) => {
    const params = new URLSearchParams();
    if (account) params.set("pubkey", account.publicKey);
    if (query) params.set("q", query);
    if (append && cursor) params.set("cursor", String(cursor));
    const response = await fetch(`/api/feed?${params}`);
    if (!response.ok) throw new Error("글을 불러오지 못했습니다.");
    const data = await response.json();
    const mapped = data.posts.map(mapPost);
    setPosts((current) => append ? [...current, ...mapped] : mapped);
    setNextCursor(data.nextCursor ? Number(data.nextCursor) : null);
  }, [account]);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/stats");
    if (!response.ok) throw new Error("통계를 불러오지 못했습니다.");
    setStats(await response.json());
  }, []);

  const loadWallet = useCallback(async () => {
    if (!account) {
      setPointBalance(0);
      setTransactions([]);
      return;
    }
    const response = await fetch(`/api/wallet/${account.publicKey}`);
    if (!response.ok) throw new Error("지갑을 불러오지 못했습니다.");
    const data = await response.json();
    setPointBalance(data.balance);
    setTransactions(data.transactions.map((item: Record<string, unknown>) => ({
      id: String(item.id),
      description: item.reason === "post" ? "게시글 작성 보상" : "댓글 작성 보상",
      amount: Number(item.amount),
      createdAt: Number(item.created_at) * 1000,
    })));
  }, [account]);

  const loadAccountStats = useCallback(async () => {
    if (!account) {
      setAccountStats({ posts: 0, comments: 0 });
      return;
    }
    const response = await fetch(`/api/profile/${account.publicKey}`);
    if (!response.ok) throw new Error("프로필 통계를 불러오지 못했습니다.");
    const profile = await response.json();
    setAccountStats({ posts: Number(profile.post_count ?? 0), comments: Number(profile.comment_count ?? 0) });
  }, [account]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadFeed(searchQuery), loadStats(), loadWallet(), loadAccountStats()]);
    } finally {
      setLoading(false);
    }
  }, [loadAccountStats, loadFeed, loadStats, loadWallet, searchQuery]);

  const searchPosts = useCallback(async (query: string) => {
    setSearchQuery(query);
    setLoading(true);
    try {
      await loadFeed(query);
    } finally {
      setLoading(false);
    }
  }, [loadFeed]);

  const loadMorePosts = useCallback(async () => {
    if (!nextCursor) return;
    await loadFeed(searchQuery, true, nextCursor);
  }, [loadFeed, nextCursor, searchQuery]);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  const setAccount = useCallback((next: Account) => {
    setAccountState(next);
    setAuthOpen(false);
    fetch(`/api/profile/${next.publicKey}`).then((response) => response.json()).then((profile) => {
      setAccountState((current) => current?.publicKey === next.publicKey ? {
        ...current,
        fixedNicknameEnabled: Boolean(profile.fixed_nickname_enabled),
        fixedNickname: String(profile.fixed_nickname ?? ""),
      } : current);
      setAccountStats({ posts: Number(profile.post_count ?? 0), comments: Number(profile.comment_count ?? 0) });
    }).catch(console.error);
  }, []);

  const signAndSubmit = useCallback(async (kind: number, content: string, tags: string[][]) => {
    if (!account) {
      requestAccount();
      return null;
    }
    const event = finalizeEvent({ kind, content, tags, created_at: Math.floor(Date.now() / 1000) }, account.secretKey);
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "이벤트 등록에 실패했습니다.");
    return event;
  }, [account, requestAccount]);

  const addPost = useCallback(async (title: string, body: string, authorName: string) => {
    const event = await signAndSubmit(1, body, [["subject", title], ["display_name", authorName.trim() || "ㅇㅇ"]]);
    if (!event) return false;
    await refresh();
    return true;
  }, [refresh, signAndSubmit]);

  const deletePost = useCallback(async (postId: string) => {
    if (await signAndSubmit(5, "", [["e", postId]])) await refresh();
  }, [refresh, signAndSubmit]);

  const toggleLike = useCallback(async (post: Post) => {
    const event = post.liked && post.likedEventId
      ? await signAndSubmit(5, "", [["e", post.likedEventId]])
      : await signAndSubmit(7, "+", [["e", post.id]]);
    if (!event) return false;
    await refresh();
    return true;
  }, [refresh, signAndSubmit]);

  const addComment = useCallback(async (postId: string, postAuthor: string, body: string) => {
    const event = await signAndSubmit(1111, body, [
      ["E", postId, process.env.NEXT_PUBLIC_RELAY_URL ?? ""],
      ["K", "1"],
      ["P", postAuthor],
      ["e", postId, process.env.NEXT_PUBLIC_RELAY_URL ?? ""],
      ["k", "1"],
      ["p", postAuthor],
      ["display_name", account ? accountDisplayName(account) : "ㅇㅇ"],
    ]);
    if (!event) return false;
    await refresh();
    return true;
  }, [account, refresh, signAndSubmit]);

  const updateProfile = useCallback(async (fixedNicknameEnabled: boolean, fixedNickname: string) => {
    if (!account) return;
    const next = { fixedNicknameEnabled, fixedNickname: Array.from(fixedNickname.trim()).slice(0, 40).join("") };
    setAccountState({ ...account, ...next });
    await signAndSubmit(0, JSON.stringify({ name: next.fixedNickname }), []);
    await signAndSubmit(30078, JSON.stringify({ enabled: next.fixedNicknameEnabled }), [["d", "anarchos:fixed-nickname"]]);
  }, [account, signAndSubmit]);

  const logout = useCallback(() => {
    setAccountState(null);
    setPointBalance(0);
    setTransactions([]);
    setAccountStats({ posts: 0, comments: 0 });
  }, []);

  const value = useMemo(() => ({
    account, posts, stats, pointBalance, transactions, accountStats, authOpen, authMode, loading,
    setAccount, logout, updateProfile, requestAccount, closeAuth, addPost, deletePost, toggleLike, addComment, refresh, searchPosts, loadMorePosts,
  }), [account, posts, stats, pointBalance, transactions, accountStats, authOpen, authMode, loading, setAccount, logout, updateProfile, requestAccount, closeAuth, addPost, deletePost, toggleLike, addComment, refresh, searchPosts, loadMorePosts]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

function mapPost(row: Record<string, unknown>): Post {
  return {
    id: String(row.id),
    author: String(row.author),
    authorName: String(row.author_name),
    title: String(row.title),
    body: String(row.body),
    createdAt: Number(row.created_at) * 1000,
    commentCount: Number(row.comment_count ?? 0),
    likeCount: Number(row.like_count ?? 0),
    liked: Boolean(row.liked),
    likedEventId: row.liked_event_id ? String(row.liked_event_id) : undefined,
  };
}

export function useCommunity() {
  const context = useContext(CommunityContext);
  if (!context) throw new Error("useCommunity must be used inside CommunityProvider");
  return context;
}
