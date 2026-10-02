import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';
import Link from 'next/link';
import './globals.css';

// Aspekta is the typeface of chift.eu. Open source (SIL Open Font License), served from this repository.
const aspekta = localFont({ src: '../fonts/AspektaVF.woff2', variable: '--font-sans', weight: '100 900', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Connectivity Benchmark',
  description: 'Which accounting software your competitors connect to, country by country. Public, sourced, dated.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${aspekta.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <Link href="/" className="brand">
            <span className="mark" aria-hidden="true" />
            Connectivity Benchmark
          </Link>
          <span className="proto">Prototype for Chift · by Arthur Grebert</span>
          <nav>
            <Link href="/#method">Method</Link>
            {/* Hosted demo: the internal view is shared by link with its key, not shown to every visitor. */}
            {!process.env.INTERNAL_KEY && <Link href="/internal">Internal view</Link>}
          </nav>
        </header>
        <main>{children}</main>
        <footer className="foot">
          <p>
            Every connection shown here comes from a public page, with its link and its collection date.
            Not found publicly never means not connected. No market share is shown anywhere: importance is a level, with its sources.
          </p>
        </footer>
      </body>
    </html>
  );
}
