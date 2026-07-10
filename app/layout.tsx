import type { Metadata } from "next";
import "./globals.css";
import { CommunityProvider } from "@/lib/community-context";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "아나키스트 네트워크",
  description: "Nostr 기반 익명 커뮤니티 UI 프로토타입",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <CommunityProvider>
          <AppHeader />
          <main className="page-shell">{children}</main>
        </CommunityProvider>
      </body>
    </html>
  );
}
