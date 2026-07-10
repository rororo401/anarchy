"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCommunity } from "@/lib/community-context";

export default function WritePage() {
  const router = useRouter();
  const { account, requestAccount, addPost } = useCommunity();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    if (await addPost(title.trim(), body.trim(), account?.fixedNicknameEnabled ? account.fixedNickname : authorName)) router.push("/");
  };

  return (
    <section className="narrow-page">
      <h1 className="page-title">새 글 작성</h1>
      {!account && <button className="identity-notice" onClick={() => requestAccount()}>현재 게스트로 접속 중입니다. 계정을 생성하거나 불러오세요.</button>}
      {account && !account.fixedNicknameEnabled && (
        <>
          <input id="authorName" className="text-input half-width" value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder="ㅇㅇ" />
        </>
      )}
      <input id="title" className="text-input large write-field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="제목을 입력하세요" />
      <textarea id="body" className="text-input textarea write-field" value={body} onChange={(event) => setBody(event.target.value)} placeholder="내용을 입력하세요" />
      <div className="form-actions">
        <button className="button" onClick={() => router.push("/")}>취소</button>
        <button className="button primary" onClick={submit}>게시글 등록</button>
      </div>
    </section>
  );
}
