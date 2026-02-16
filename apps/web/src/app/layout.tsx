import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CoinFlip — PvP Heads or Tails on Axiome',
  description: 'Wager LAUNCH tokens in a provably fair peer-to-peer coin flip game on Axiome Chain.',
};

/** Prevent iOS auto-zoom on input focus (minimum-scale=1, maximum-scale=1) */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
