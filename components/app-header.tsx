"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountDialog } from "@/components/account-dialog";
import { useCommunity } from "@/lib/community-context";

const links = [
  { href: "/", label: "게시판" },
  { href: "/write", label: "작성" },
  { href: "/wallet", label: "지갑" },
  { href: "/profile", label: "프로필" },
];

export function AppHeader() {
  const pathname = usePathname();
  const { pointBalance } = useCommunity();

  return (
    <>
      <header className="app-header">
        <Link className="brand" href="/">Anarchy Relay</Link>
        <nav className="main-nav" aria-label="주요 메뉴">
          {links.map((link) => (
            <Link className={pathname === link.href ? "active" : ""} href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
          <Link className="point-pill" href="/wallet"><span className="point-mark">A</span>{pointBalance}</Link>
        </nav>
      </header>
      <AccountDialog />
    </>
  );
}
