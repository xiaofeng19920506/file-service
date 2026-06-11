import type { Metadata } from 'next';
import '../index.css';
import '../App.css';
import '../styles/apple-design.css';
import '../styles/ppt-editor.css';
import '../styles/mobile.css';
import '../styles/responsive.css';
import '../styles/playlists-mobile-video.css';

export const metadata: Metadata = {
  title: '敬拜诗库',
  other: { 'color-scheme': 'light dark' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="theme-color" content="#fbfbfd" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Inline theme script runs before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=localStorage.getItem('theme'),p=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',s==='dark'||s==='light'?s:p?'dark':'light');})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
