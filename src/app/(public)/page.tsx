import type { Metadata } from "next";

import { readPricingCatalog } from "@/db/queries/pricing";
import { createClient } from "@/db/server";

import { About } from "@/components/sections/about";
import { Contact } from "@/components/sections/contact";
import { Hero } from "@/components/sections/hero";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Services } from "@/components/sections/services";
import { WhyUClean } from "@/components/sections/why-uclean";
import {
  formattedAddress,
  openingHoursSpecification,
  siteConfig,
} from "@/config/site";

export const metadata: Metadata = {
  title: `${siteConfig.name} | Laundry Pickup and Delivery`,
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  /*
   * The pricing overview reads the `pricing_*` tables directly instead of a
   * checked-in list, so an admin price edit shows up here on the next request.
   * A read failure is not worth a dead home page: the section just renders its
   * categories from nothing rather than dropping the whole route.
   */
  const supabase = await createClient();
  const catalog = await readPricingCatalog(supabase).catch(() => null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    telephone: siteConfig.phone,
    email: siteConfig.email,
    image: `${siteConfig.url}/opengraph-image`,
    priceRange: "₹₹",
    address: {
      "@type": "PostalAddress",
      streetAddress: [siteConfig.address.line1, siteConfig.address.line2]
        .filter(Boolean)
        .join(", "),
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.state,
      postalCode: siteConfig.address.postalCode,
      addressCountry: siteConfig.address.country,
    },
    areaServed: `Within ${siteConfig.deliveryRadiusKm} km of ${formattedAddress()}`,
    openingHoursSpecification: openingHoursSpecification(),
    sameAs: siteConfig.social
      .map((item) => item.href)
      .filter((href) => href !== "#"),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Config-derived and static, so there is no untrusted input here.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <About />
      {catalog ? <Services regular={catalog.regular} /> : null}
      <WhyUClean />
      <HowItWorks />
      <Contact />
    </>
  );
}
