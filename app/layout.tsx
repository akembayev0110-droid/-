import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Тихая гавань · Морской бой",
  description: "Морской бой с друзьями и компьютером. Три уровня сложности, игра по ссылке и случайный соперник.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
