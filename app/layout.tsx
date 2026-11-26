import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "가계도 관리",
  description: "한국식 가계도 관리 및 시각화 웹 애플리케이션",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
