import type { Metadata } from 'next';
import { Poppins, Plus_Jakarta_Sans, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import Providers from '@/app/providers';
import { ChatWidget } from '@/components/chat-widget/chat-widget';
import { auth } from '@/auth';

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const notoSansThai = Noto_Sans_Thai({
  variable: '--font-noto-thai',
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'BidNest',
  description: 'BidNest — Auction & Marketplace',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Handed to `SessionProvider` below so its first client render already
  // knows what the server knew, instead of starting at "loading" and
  // resolving a moment later — the mismatch between those two first paints
  // was showing up as a hydration warning on every `aria-pressed` gated by
  // `useAuthToken()`'s `ready` flag.
  const session = await auth();

  return (
    <html
      lang="th"
      className={`${poppins.variable} ${jakarta.variable} ${notoSansThai.variable} h-full antialiased`}
      // Grammar-checker extensions (LanguageTool and friends) stamp their own
      // attributes onto <html> before React hydrates, which reads as a mismatch
      // no one can fix from here. This only reaches one level deep, so every
      // child is still checked normally.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers session={session}>
          {children}
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
