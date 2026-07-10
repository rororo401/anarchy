import type { Metadata } from "next";
import "./globals.css";
import { CommunityProvider } from "@/lib/community-context";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = {
  title: "Anarchy Relay",
  description: "A self-hosted community network synchronized across signed-event relays",
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
