import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'CoinFlip — PvP Heads or Tails on Axiome',
  description: 'Wager LAUNCH tokens in a provably fair peer-to-peer coin flip game on Axiome Chain.',
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
