"use client";

import { useState, type FormEvent } from "react";
import { MessageSquare, Phone, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { siteConfig, whatsAppLink } from "@/config/site";

/** Message composed from the form, ready to hand over to WhatsApp. */
function composeMessage(data: FormData) {
  const name = String(data.get("name") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  const message = String(data.get("message") ?? "").trim();
  return [
    `Hi ${siteConfig.name}, I'd like to know more.`,
    "",
    `Name: ${name}`,
    `Phone: ${phone}`,
    "",
    message,
  ].join("\n");
}

export function Contact() {
  const [sent, setSent] = useState(false);

  /**
   * Hands the composed message over to WhatsApp in a new tab. No backend, so
   * the visitor still lands in a real conversation where the shop can reply.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.open(
      whatsAppLink(composeMessage(new FormData(event.currentTarget))),
      "_blank",
      "noopener,noreferrer",
    );
    setSent(true);
    event.currentTarget.reset();
  }

  return (
    <section
      id="contact"
      className="border-border bg-muted/40 scroll-mt-20 border-t"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 md:py-16 lg:py-24">
        <div className="reveal-up mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Get in touch
          </h2>
          <p className="text-muted-foreground">
            Send us a quick message and we&apos;ll get back to you shortly.
          </p>
        </div>
        {/*
          Two-up only from `lg`: between 768-1023 a split card leaves each
          field ~160px (placeholders truncate, the footer hint squeezes), so
          tablets get the stacked full-width form instead. Desktop 2-up is
          unchanged.
        */}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/*
            Tinted gradient card: a whisper of the brand greens in the corners
            over the plain card surface, with the same gradient rule on top as
            the map so the pair reads as one set.
          */}
          <form
            className="reveal-up border-border bg-card relative flex flex-col gap-3 overflow-hidden rounded-3xl border p-5 shadow-sm sm:gap-4 sm:p-6"
            onSubmit={handleSubmit}
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 z-10 h-1 rounded-t-3xl bg-gradient-to-r from-[var(--primary)] via-[var(--primary)] to-[var(--accent)]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent),transparent_80%),transparent)] blur-2xl"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="contact-name"
                  className="text-muted-foreground text-xs font-medium"
                >
                  Name
                </label>
                <div className="relative">
                  <User
                    aria-hidden="true"
                    className="text-primary/70 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <input
                    id="contact-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    className="border-input bg-background/60 focus-visible:ring-ring focus-visible:border-ring w-full rounded-xl border py-2 pr-3 pl-9 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    placeholder="Your name"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="contact-phone"
                  className="text-muted-foreground text-xs font-medium"
                >
                  Phone number
                </label>
                <div className="relative">
                  <Phone
                    aria-hidden="true"
                    className="text-primary/70 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  />
                  <input
                    id="contact-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    className="border-input bg-background/60 focus-visible:ring-ring focus-visible:border-ring w-full rounded-xl border py-2 pr-3 pl-9 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                    placeholder="+91 00000 00000"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="contact-message"
                className="text-muted-foreground text-xs font-medium"
              >
                Message
              </label>
              <div className="relative">
                <MessageSquare
                  aria-hidden="true"
                  className="text-primary/70 pointer-events-none absolute top-3 left-3 size-4"
                />
                <textarea
                  id="contact-message"
                  name="message"
                  rows={3}
                  required
                  className="border-input bg-background/60 focus-visible:ring-ring focus-visible:border-ring w-full resize-y rounded-xl border py-2 pr-3 pl-9 text-sm shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  placeholder="Tell us how we can help"
                />
              </div>
            </div>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-xs" role="status">
                {sent
                  ? "Opening WhatsApp with your message ready to send."
                  : "We'll open WhatsApp so you can send it in one tap."}
              </p>
              {/*
                Below `sm` the pair shares one full-width row (each `flex-1`
                fills half); from `sm` they drop back to natural width beside
                the status text.
              */}
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  type="submit"
                  size="sm"
                  className="shadow-primary/30 hover:shadow-primary/40 flex-1 rounded-xl px-3 text-xs shadow-md transition-shadow hover:shadow-lg sm:flex-none sm:px-5 sm:text-sm"
                >
                  Send message
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl px-2 text-xs sm:flex-none sm:px-3 sm:text-sm"
                >
                  <a
                    href={whatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Chat on WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          </form>
          <div className="reveal-up border-border bg-card relative overflow-hidden rounded-3xl border shadow-sm">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 z-10 h-1 bg-gradient-to-r from-[var(--primary)] via-[var(--primary)] to-[var(--accent)]"
            />
            <iframe
              title={"Map showing " + siteConfig.name + " store location"}
              src={siteConfig.mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-56 w-full sm:h-64 md:h-80 lg:h-full lg:min-h-64"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
