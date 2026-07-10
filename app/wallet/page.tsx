"use client";

import { formatTimestamp } from "@/components/feed";
import { useCommunity } from "@/lib/community-context";

export default function WalletPage() {
  const { account, stats, pointBalance, transactions } = useCommunity();

  return (
    <section>
      <h1 className="page-title">지갑</h1>
      <div className="wallet-grid">
        <article className="balance-card secondary">
          <span>보유 잔액</span>
          <strong><i className="point-mark">A</i>{pointBalance}</strong>
        </article>
        <article className="balance-card secondary">
          <span>총 발행량</span>
          <strong><i className="point-mark">A</i>{stats.issued}</strong>
        </article>
      </div>
      <div className="list-heading"><h2>거래 내역</h2></div>
      <div className="transaction-list">
        {transactions.map((transaction) => (
          <article className="transaction" key={transaction.id}>
            <div><b>{transaction.description}</b><span>{formatTimestamp(transaction.createdAt)}</span></div>
            <strong>+{transaction.amount} <i className="point-mark tiny">A</i></strong>
          </article>
        ))}
      </div>
    </section>
  );
}
