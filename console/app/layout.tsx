import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MASA Orchestrator Console",
  description: "Internal operator console for MASA orchestration and MCP governance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
