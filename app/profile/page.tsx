"use client";

import { useEffect, useState } from "react";
import { accountDisplayName, useCommunity } from "@/lib/community-context";
import { copyText } from "@/lib/copy-text";

export default function ProfilePage() {
  const { account, accountStats, pointBalance, requestAccount, updateProfile, logout } = useCommunity();
  const [copied, setCopied] = useState(false);
  const [nickname, setNickname] = useState(account?.fixedNickname ?? "");

  useEffect(() => {
    setNickname(account?.fixedNickname ?? "");
  }, [account?.fixedNickname]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!account) {
    return (
      <section className="empty-state">
        <h1>네트워크 참여하기</h1>
        <br />
        <div className="empty-state-actions">
          <button className="button primary" onClick={() => requestAccount("generate")}>키 생성</button>
          <button className="button" onClick={() => requestAccount("import")}>키 불러오기</button>
        </div>
      </section>
    );
  }

  const copy = async () => {
    if (await copyText(account.npub)) setCopied(true);
  };

  return (
    <section>
      <h1 className="page-title">프로필</h1>
      <div className="profile-card">
        <div className="avatar">{accountDisplayName(account).slice(-2)}</div>
        <div>
          <h2>{accountDisplayName(account)}</h2>
          <code>{account.npub}</code>
        </div>
        <button className="button" onClick={copy}>{copied ? "복사됨" : "NPUB 복사"}</button>
        <button className="button" onClick={logout}>로그아웃</button>
      </div>
      <div className="profile-settings">
        <label className="toggle-row">
          <span>고정닉 사용</span>
          <input type="checkbox" checked={account.fixedNicknameEnabled} onChange={(event) => updateProfile(event.target.checked, account.fixedNickname)} />
        </label>
        <div className="profile-nickname-form">
          <input id="fixedNickname" className="text-input" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="이름을 입력하세요" />
          <button className="button small" onClick={() => updateProfile(account.fixedNicknameEnabled, nickname)}>저장</button>
        </div>
      </div>
      <div className="profile-stats">
        <article><span>작성한 게시글</span><b>{accountStats.posts}</b></article>
        <article><span>등록한 댓글</span><b>{accountStats.comments}</b></article>
        <article><span>보유 잔액</span><b>{pointBalance} <i className="point-mark tiny">A</i></b></article>
      </div>
    </section>
  );
}
