import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/shell/Providers";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { CommandPalette } from "@/components/shell/CommandPalette";

export const metadata: Metadata = {
  title: "Location Analyzer — Offline Location Intelligence",
  description:
    "Offline-first analysis of Google Timeline / Takeout location history: travel audit, attendance, route reconstruction and executive reporting.",
};

const themeInit = `
try {
  const s = localStorage.getItem('la-theme');
  const dark = s ? s === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="antialiased">
        <Providers>
          <div className="flex h-dvh overflow-hidden">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 md:px-8">
                {children}
              </main>
            </div>
          </div>
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
