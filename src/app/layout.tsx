import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const siteName = 'NeonVest';
const siteDescription = 'Calculate your investment growth and get AI-powered tips with NeonVest. Plan your financial future with our easy-to-use investment calculator.';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'; // Replace with your actual domain in .env.production

export const metadata: Metadata = {
  title: {
    default: `${siteName} - Investment Calculator`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: ['investment calculator', 'future value', 'compound interest', 'financial planning', 'AI investment tips', 'neonvest', 'investment projection'],
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: `${siteName} - Brighten Your Financial Future`,
    description: siteDescription,
    siteName: siteName,
    images: [
      {
        url: 'https://placehold.co/1200x630.png?text=NeonVest+Investment+Calculator', // Replace with your actual OG image
        width: 1200,
        height: 630,
        alt: `${siteName} - Investment Planning Tool`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} - Brighten Your Financial Future`,
    description: siteDescription,
    images: ['https://placehold.co/1200x630.png?text=NeonVest+Investment+Calculator'], // Replace with your actual Twitter image
    // creator: '@yourtwitterhandle', // Optional: Add your Twitter handle
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // If you add a favicon.ico to your /public directory:
  // icons: {
  //   icon: '/favicon.ico',
  //   shortcut: '/favicon.ico',
  //   apple: '/apple-touch-icon.png', // Example for Apple touch icon
  // },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning={true} className="font-body antialiased bg-background text-foreground min-h-screen flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
