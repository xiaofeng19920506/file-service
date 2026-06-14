import type { Metadata, Viewport } from 'next';
import '../index.css';
import '../App.css';
import '../styles/apple-design.css';
import '../styles/ppt-editor.css';
import '../styles/mobile.css';
import '../styles/playlist-audio.css';
import '../styles/playlist-now-playing.css';
import '../styles/responsive.css';
import '../styles/playlists-mobile-video.css';
import '../styles/playlists-desktop-watch.css';
import '../styles/playlists-youtube-watch.css';
import '../styles/playlists-audio-layout.css';

export const metadata: Metadata = {
  title: 'Music Playlist Player',
  description: 'Search, organize, and play music playlists — YouTube search, MP3 and video playback',
  applicationName: 'Music Playlist Player',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Music Playlist Player',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: { 'color-scheme': 'light dark' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
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
