"use client";

import { useEffect, useState } from "react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { useCommunity } from "@/lib/community-context";
import { copyText } from "@/lib/copy-text";

export function AccountDialog() {
  const { authOpen, authMode, closeAuth, requestAccount, setAccount } = useCommunity();
  const [generatedSecret, setGeneratedSecret] = useState("");
  const [generatedNpub, setGeneratedNpub] = useState("");
  const [importSecret, setImportSecret] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const finishClose = () => {
    setGeneratedSecret("");
    setGeneratedNpub("");
    setImportSecret("");
    setError("");
    setCopied("");
    closeAuth();
  };

  useEffect(() => {
    if (!authOpen || authMode !== "generate") return;
    const secret = generateSecretKey();
    const publicKey = getPublicKey(secret);
    const nsec = nip19.nsecEncode(secret);
    const npub = nip19.npubEncode(publicKey);
    setAccount({ publicKey, npub, secretKey: secret, fixedNicknameEnabled: false, fixedNickname: "" });
    setGeneratedSecret(nsec);
    setGeneratedNpub(npub);
    requestAccount("create");
  }, [authMode, authOpen, requestAccount, setAccount]);

  if (!authOpen) return null;

  const importAccount = () => {
    try {
      const decoded = nip19.decode(importSecret.trim());
      if (decoded.type !== "nsec") throw new Error("nsec 형식이 아닙니다.");
      const publicKey = getPublicKey(decoded.data);
      setAccount({ publicKey, npub: nip19.npubEncode(publicKey), secretKey: decoded.data, fixedNicknameEnabled: false, fixedNickname: "" });
      finishClose();
    } catch {
      setError("올바른 nsec 비밀키를 입력해 주세요.");
    }
  };

  const copy = async (value: string, label: string) => {
    if (await copyText(value)) setCopied(label);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        {authMode === "choice" && (
          <>
            <button className="modal-close" onClick={finishClose} aria-label="닫기">×</button>
            <h1 id="account-title">키가 필요합니다</h1>
            <p className="muted">키는 서버와 브라우저에 저장되지 않습니다.</p>
            <div className="modal-actions split">
              <button className="button primary" onClick={() => requestAccount("generate")}>+ 키 생성</button>
              <button className="button" onClick={() => requestAccount("import")}>키 불러오기</button>
            </div>
          </>
        )}

        {authMode === "create" && (
          <>
            <h1 id="account-title">비밀키를 지금 보관하세요</h1>
            <p className="warning critical">비밀키는 이 화면에서 한 번만 표시됩니다.<br />닫은 뒤에는 다시 확인할 수 없습니다.</p>
            <KeyBox label="PUBLIC KEY" value={generatedNpub} onCopy={() => copy(generatedNpub, "npub")} copied={copied === "npub"} />
            <KeyBox label="SECRET KEY" value={generatedSecret} onCopy={() => copy(generatedSecret, "nsec")} copied={copied === "nsec"} secret />
            <button className="button primary full" onClick={finishClose}>보관했습니다</button>
          </>
        )}

        {authMode === "import" && (
          <>
            <button className="modal-close" onClick={finishClose} aria-label="닫기">×</button>
            <h1 id="account-title">키 불러오기</h1>
            <p className="muted">입력한 키는 공개키를 계산한 직후 폐기됩니다.</p>
            <label className="field-label" htmlFor="nsec">NSEC SECRET KEY</label>
            <input id="nsec" className="text-input" type="password" value={importSecret} onChange={(event) => { setImportSecret(event.target.value); setError(""); }} placeholder="nsec1..." />
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button className="button" onClick={() => requestAccount("choice")}>이전</button>
              <button className="button primary" onClick={importAccount}>불러오기</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function KeyBox({ label, value, onCopy, copied, secret = false }: { label: string; value: string; onCopy: () => void; copied: boolean; secret?: boolean }) {
  return (
    <div className={`key-box ${secret ? "secret" : ""}`}>
      <span className="field-label">{label}</span>
      <code>{value}</code>
      <button className="copy-button" onClick={onCopy}>{copied ? "복사됨" : "복사"}</button>
    </div>
  );
}
