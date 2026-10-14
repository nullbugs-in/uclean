import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name} - ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Generated Open Graph image - no external image host required.
 * Colours are inlined here because ImageResponse renders outside the app's
 * CSS context and cannot read the design tokens.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px",
        background:
          "linear-gradient(135deg, #ecfccb 0%, #d9f99d 45%, #bae6fd 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "#a3e635",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 32 32">
            <path
              d="M16 6.5c-4.1 5-6.6 8.1-6.6 11.2a6.6 6.6 0 0 0 13.2 0c0-3.1-2.5-6.2-6.6-11.2Z"
              fill="#22322a"
            />
          </svg>
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, color: "#22322a" }}>
          {siteConfig.name}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1.1,
          color: "#1f2c24",
          maxWidth: 900,
        }}
      >
        Fresh laundry, picked up and delivered to your door.
      </div>

      <div style={{ display: "flex", fontSize: 30, color: "#37493d" }}>
        {`Free pickup and delivery within ${siteConfig.deliveryRadiusKm} km`}
      </div>
    </div>,
    { ...size },
  );
}
