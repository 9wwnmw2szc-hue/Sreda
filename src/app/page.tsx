import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { APP_NAME, APP_DESCRIPTION } from "@/config/brand";
import { LANDING_ASSETS, LANDING_COPY } from "@/components/landing/landing-config";

export const metadata: Metadata = {
  title: LANDING_COPY.title,
  description: LANDING_COPY.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: LANDING_COPY.title,
    description: LANDING_COPY.description,
    url: "/",
    siteName: APP_NAME,
    locale: "ru_RU",
    type: "website",
    images: [
      {
        url: LANDING_ASSETS.og,
        width: 1200,
        height: 630,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: LANDING_COPY.title,
    description: LANDING_COPY.description,
    images: [LANDING_ASSETS.og],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: APP_NAME,
      url: "https://biznesoty.ru",
      logo: "https://biznesoty.ru/assets/soty/brand/logo-mark.svg",
    },
    {
      "@type": "SoftwareApplication",
      name: APP_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: APP_DESCRIPTION,
      url: "https://biznesoty.ru",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "RUB",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
