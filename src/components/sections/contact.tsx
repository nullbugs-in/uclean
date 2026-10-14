import { Mail, MapPin, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formattedAddress,
  openingHoursRows,
  siteConfig,
  whatsAppLink,
} from "@/config/site";

export function Contact() {
  return (
    <section
      id="contact"
      className="border-border bg-muted/40 scroll-mt-20 border-t"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16 lg:py-24">
        <div className="reveal-up max-w-2xl space-y-3">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Visit or message us
          </h2>
          <p className="text-muted-foreground">
            Drop by the store, give us a call, or chat on WhatsApp - whatever is
            easiest.
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div className="reveal-up space-y-6">
            <div className="border-border bg-card flex gap-4 rounded-2xl border p-5 shadow-sm">
              <MapPin
                aria-hidden="true"
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              <div>
                <h3 className="font-semibold">Our store</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {formattedAddress()}
                </p>
              </div>
            </div>

            <div className="border-border bg-card flex gap-4 rounded-2xl border p-5 shadow-sm">
              <Phone
                aria-hidden="true"
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              <div>
                <h3 className="font-semibold">Call us</h3>
                <a
                  href={`tel:${siteConfig.phone.replace(/\s/g, "")}`}
                  className="text-muted-foreground hover:text-foreground mt-1 block rounded text-sm transition-colors"
                >
                  {siteConfig.phone}
                </a>
              </div>
            </div>

            <div className="border-border bg-card flex gap-4 rounded-2xl border p-5 shadow-sm">
              <Mail
                aria-hidden="true"
                className="text-primary mt-0.5 size-5 shrink-0"
              />
              <div>
                <h3 className="font-semibold">Email us</h3>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="text-muted-foreground hover:text-foreground mt-1 block rounded text-sm break-all transition-colors"
                >
                  {siteConfig.email}
                </a>
              </div>
            </div>

            <div className="border-border bg-card rounded-2xl border p-5 shadow-sm">
              <h3 className="font-semibold">Opening hours</h3>
              <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                {openingHoursRows().map((entry) => (
                  <li key={entry.days} className="flex justify-between gap-4">
                    <span className="text-foreground font-medium">
                      {entry.days}
                    </span>
                    <span>{entry.hours}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button asChild size="lg">
              <a
                href={whatsAppLink()}
                target="_blank"
                rel="noopener noreferrer"
              >
                Chat on WhatsApp
              </a>
            </Button>
          </div>

          <div className="reveal-up border-border bg-card overflow-hidden rounded-3xl border shadow-sm">
            <iframe
              title={`Map showing ${siteConfig.name} store location`}
              src={siteConfig.mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full sm:h-80 md:h-full md:min-h-96"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
