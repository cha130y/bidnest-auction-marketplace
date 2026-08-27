import type { Metadata } from 'next';
import { Poppins, Plus_Jakarta_Sans, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import Providers from '@/app/providers';
import { ChatWidget } from '@/components/chat-widget/chat-widget';

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
        <Providers>
          {children}
          <ChatWidget />
        </Providers>
      </body>
    </html>
  );
}
