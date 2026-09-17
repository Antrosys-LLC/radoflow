import type { Metadata } from "next";
import Link from "next/link";
import { Oswald } from "next/font/google";

import "./home.css";

/**
 * The company's own website, served at the root to anybody not signed in.
 *
 * Everything on it is the mill's copy, unembellished: the processes it runs,
 * the fastness standards it tests to, and where it is. Nothing here is
 * generated from the portal's data, and nothing claims a figure the office has
 * not stated — a public page that overstates a capability is a page the
 * production desk has to apologise for.
 *
 * The middleware rewrites `/` here for a signed-out visitor, so this page and
 * the dashboard share one address and the domain root is what gets indexed.
 */

const display = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

const SITE_URL = process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://www.radodyeing.com";
const COMPANY = "Rado Dyeing & Textile Mills";
const ADDRESS = {
  street: "Plot No. 80, Sector F, Quaid-e-Azam Industrial Estate (Kot Lakhpat)",
  city: "Lahore",
  region: "Punjab",
  country: "PK",
};

/**
 * The plant's landlines, as the trade directories print them.
 *
 * `dial` is what the button calls — the same number in international form, so
 * it works from a phone abroad as well as from Lahore. The first is the one a
 * quote request rings.
 */
const PHONES = [
  { label: "+92 42 5118585", dial: "+92425118585" },
  { label: "+92 42 5843180", dial: "+92425843180" },
  { label: "+92 42 5841679", dial: "+92425841679" },
];

/**
 * Where the plant is, for the embedded map and the directions link.
 *
 * The pin the mill dropped on its own gate, not a line of text a map has to
 * guess at: a plot number inside an industrial estate lands a text search at
 * the estate, somewhere among a few hundred neighbours. A coordinate lands it
 * on the mill.
 */
const MAP_PIN = { lat: 31.454278, lng: 74.326935 };
const MAP_QUERY = `${MAP_PIN.lat},${MAP_PIN.lng}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    absolute: "Rado Dyeing & Textile Mills | Fabric Dyeing & Finishing, Lahore",
  },
  description:
    "Fabric wet processing in Lahore: reactive and disperse dyeing, bleaching and scouring, pigment and reactive printing, and chemical and mechanical finishing, with in-house fastness testing to ISO standards.",
  keywords: [
    "fabric dyeing Lahore",
    "textile wet processing Pakistan",
    "knit dyeing mill",
    "bleaching and scouring",
    "textile printing Lahore",
    "stenter finishing",
    "colour fastness testing",
    "Kot Lakhpat textile processing",
    "APTPMA member mill",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: COMPANY,
    title: "Precision fabric dyeing and industrial textile finishing",
    description:
      "High-capacity wet processing, bleaching and precision printing for domestic brands and garment exporters, from Lahore's industrial corridor.",
    locale: "en_PK",
    images: [{ url: "/rado-logo.png", width: 150, height: 147, alt: COMPANY }],
  },
  twitter: {
    card: "summary",
    title: "Rado Dyeing & Textile Mills",
    description:
      "Fabric dyeing, bleaching, printing and finishing in Lahore, with in-house fastness and shrinkage testing.",
    images: ["/rado-logo.png"],
  },
  robots: { index: true, follow: true },
};

/**
 * What a search engine is told about the business itself.
 *
 * Only facts the mill has stated: its name, where it is, what it does and how
 * to reach it. No invented review count, no opening hours nobody confirmed.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: COMPANY,
  url: SITE_URL,
  logo: `${SITE_URL}/rado-logo.png`,
  description:
    "Fabric wet-processing facility offering dyeing, bleaching and scouring, textile printing, and chemical and mechanical finishing.",
  address: {
    "@type": "PostalAddress",
    streetAddress: ADDRESS.street,
    addressLocality: ADDRESS.city,
    addressRegion: ADDRESS.region,
    addressCountry: ADDRESS.country,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: MAP_PIN.lat,
    longitude: MAP_PIN.lng,
  },
  hasMap: `https://www.google.com/maps/search/?api=1&query=${MAP_QUERY}`,
  telephone: PHONES.map((phone) => phone.label),
  memberOf: {
    "@type": "Organization",
    name: "All Pakistan Textile Processing Mills Association (APTPMA)",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "technical inquiries",
      email: "contact@radodyeing.com",
      availableLanguage: ["en", "ur"],
    },
    {
      "@type": "ContactPoint",
      contactType: "production and dispatch",
      email: "dispatch@radodyeing.com",
      availableLanguage: ["en", "ur"],
    },
  ],
};

/** The dye classes the mill runs, as a shade card. */
const SHADES = [
  { name: "Reactive", colour: "#b3121b" },
  { name: "Vat", colour: "#1f2d4a" },
  { name: "Disperse", colour: "#0f5c56" },
  { name: "Pigment", colour: "#c07c1f" },
  { name: "Optical white", colour: "#f2efe9", tone: "white" as const },
];

const CAPABILITIES = [
  {
    title: "Fabric dyeing & wet processing",
    body: "High-temperature and atmospheric exhaust soft-flow vessels run at low liquor ratios, so yardage comes through without abrasion marks.",
    points: [
      "100% cotton, cotton/lycra, polyester-cotton, CVC blends and synthetic knits",
      "Deep shade penetration with no side-to-centre variation across large lots",
    ],
  },
  {
    title: "Preparatory bleaching & scouring",
    body: "Continuous and semi-continuous optical whitening, desizing and enzymatic bio-polishing.",
    points: [
      "Grounds free of seed coats, waxes and pectin",
      "Even dye pickup afterwards, and bright white bases",
    ],
  },
  {
    title: "Textile printing",
    body: "Pigment and reactive printing for knitwear and casual lifestyle apparel.",
    points: [
      "Sharp screen definition and clean outlines",
      "Tonal contrast held without stiffening the fabric hand",
    ],
  },
  {
    title: "Chemical & mechanical finishing",
    body: "Stenter processing for width fixation, dimensional stability and skew control.",
    points: [
      "Silicone and cationic softeners, anti-pilling, moisture-wicking, anti-microbial, water-repellent",
      "GSM and shrinkage brought to buying-house benchmarks",
    ],
  },
];

const LAB = [
  {
    test: "Colour matching",
    detail:
      "Spectrophotometer formulation and automated micro-pipetting for lab dips against Pantone or a physical swatch",
  },
  { test: "Wash fastness", detail: "ISO 105-C06" },
  { test: "Rubbing fastness, wet and dry", detail: "ISO 105-X12" },
  { test: "Perspiration and water fastness", detail: "ISO 105-E01 / E04" },
  {
    test: "Dimensional stability",
    detail:
      "Residual shrinkage, torque and spirality, and GSM uniformity, checked per batch before a lot is cleared",
  },
];

const ADVANTAGES = [
  {
    title: "Central industrial hub",
    body: "Inside Lahore's industrial corridor, which keeps dispatch schedules workable against regional cut-offs.",
  },
  {
    title: "Process automation",
    body: "Automated chemical dosing and temperature-controlled cycles limit thermal and mechanical shock on delicate fibres.",
  },
  {
    title: "Industrial stewardship",
    body: "Resource-efficient water cycles and wastewater treatment, against the regulatory standards the sector is held to.",
  },
];

export default function HomePage() {
  return (
    <div className={`rado-site ${display.variable}`}>
      <script
        type="application/ld+json"
        // Our own object, serialised here: nothing in it comes from a request.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      <a
        href="#capabilities"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-[var(--ink)] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to capabilities
      </a>

      <header className="sticky top-0 z-40 border-b border-[var(--rule)] bg-[var(--bone)]/95 backdrop-blur">
        <nav
          className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6"
          aria-label="Main"
        >
          <span className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rado-logo.png"
              alt={`${COMPANY} logo`}
              width={40}
              height={39}
              className="h-10 w-auto"
            />
            <span className="leading-none">
              <span className="display block text-lg text-[var(--ink)]">Rado</span>
              <span className="block text-[0.62rem] uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                Dyeing &amp; Textile Mills
              </span>
            </span>
          </span>

          <span className="ms-auto hidden items-center gap-6 text-sm font-medium text-[var(--ink-soft)] md:flex">
            <a href="#capabilities" className="hover:text-[var(--red)]">
              Capabilities
            </a>
            <a href="#laboratory" className="hover:text-[var(--red)]">
              Laboratory
            </a>
            <a href="#contact" className="hover:text-[var(--red)]">
              Contact
            </a>
          </span>

          <Link
            href="/login"
            className="ms-auto inline-flex items-center rounded-none border border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--red)] hover:border-[var(--red)] md:ms-0"
          >
            Staff login
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero: the claim, then the shade card that has to back it up. */}
        <section className="border-b border-[var(--rule)]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-20">
            <div>
              <p className="eyebrow rise">Wet processing · Lahore</p>
              <h1
                className="display rise mt-4 text-[clamp(2.4rem,6vw,4.4rem)] text-[var(--ink)]"
                style={{ "--delay": "60ms" } as React.CSSProperties}
              >
                Precision fabric dyeing
                <span className="block text-[var(--red)]">&amp; industrial finishing</span>
              </h1>
              <p
                className="rise mt-6 max-w-xl text-base leading-relaxed text-[var(--ink-soft)] sm:text-lg"
                style={{ "--delay": "120ms" } as React.CSSProperties}
              >
                High-capacity wet processing, bleaching and precision printing for domestic brands
                and global garment exporters, from Lahore&rsquo;s premier industrial corridor.
              </p>

              {/* A quote starts with a phone call here, not a form nobody
                  watches — so the button dials the plant. */}
              <div
                className="rise mt-8 flex flex-wrap gap-3"
                style={{ "--delay": "180ms" } as React.CSSProperties}
              >
                <a
                  href={`tel:${PHONES[0]!.dial}`}
                  className="press inline-flex items-center rounded-none bg-[var(--red)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--red-deep)]"
                >
                  Request a quote · {PHONES[0]!.label}
                </a>
                <a
                  href="#capabilities"
                  className="press inline-flex items-center rounded-none border border-[var(--ink)] px-6 py-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--ink)] hover:text-white"
                >
                  Explore technical capabilities
                </a>
              </div>

              <ul className="mt-10 space-y-2 text-sm text-[var(--ink-soft)]">
                <li className="border-t border-[var(--rule)] pt-2">
                  High-capacity daily wet-processing output
                </li>
                <li className="border-t border-[var(--rule)] pt-2">
                  Batch-to-batch shade consistency with automated dispensing
                </li>
                <li className="border-t border-[var(--rule)] pt-2">
                  Member, All Pakistan Textile Processing Mills Association (APTPMA)
                </li>
              </ul>
            </div>

            <div className="self-center">
              <div
                className="shade-card"
                role="img"
                aria-label="Dye classes run at the mill: reactive, vat, disperse, pigment and optical white"
              >
                {SHADES.map((shade) => (
                  <span
                    key={shade.name}
                    className="shade"
                    style={{ background: shade.colour }}
                    data-tone={shade.tone}
                  >
                    {shade.name}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--ink-soft)]">
                Shade card · matched in the lab, held in the vessel
              </p>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="border-b border-[var(--rule)] bg-[var(--paper)]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="eyebrow">About the mill</p>
              <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">
                Engineering excellence in textile wet processing
              </h2>
            </div>
            <div className="space-y-4 text-[var(--ink-soft)]">
              <p>
                Operating from the Quaid-e-Azam Industrial Estate (Kot Lakhpat), {COMPANY} is an
                established fabric wet-processing facility built on precision chemistry, modern
                mechanical engineering and tight turnaround cycles.
              </p>
              <p>
                As a registered member of APTPMA, we partner with spinning units, knitters, garment
                manufacturers and institutional brands. From bulk cotton jersey to complex synthetic
                and poly-cotton blends, our dye house bridges raw knitted and woven yardage with
                retail-ready textile standards.
              </p>
              <dl className="mt-8 space-y-5">
                {ADVANTAGES.map((item) => (
                  <div key={item.title} className="border-t border-[var(--rule)] pt-4">
                    <dt className="display text-base text-[var(--ink)]">{item.title}</dt>
                    <dd className="mt-1 text-sm">{item.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section id="capabilities" className="border-b border-[var(--rule)]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <p className="eyebrow">Core capabilities</p>
            <h2 className="display mt-3 max-w-2xl text-[clamp(1.8rem,3.4vw,2.6rem)]">
              Four processes, run under one roof
            </h2>

            <div className="mt-10 grid gap-px border border-[var(--ink)] bg-[var(--ink)] sm:grid-cols-2">
              {CAPABILITIES.map((item) => (
                <article key={item.title} className="lift bg-[var(--paper)] p-6 sm:p-8">
                  <h3 className="display text-xl text-[var(--ink)]">{item.title}</h3>
                  <p className="mt-3 text-sm text-[var(--ink-soft)]">{item.body}</p>
                  <ul className="mt-4 space-y-2 text-sm text-[var(--ink-soft)]">
                    {item.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span aria-hidden className="mt-2 h-px w-4 shrink-0 bg-[var(--red)]" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Laboratory: set as a spec sheet, because that is what it is. */}
        <section
          id="laboratory"
          className="border-b border-[var(--rule)] bg-[var(--ink)] text-[var(--bone)]"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="eyebrow">Quality control</p>
              <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] text-white">
                Every yard verified in our own laboratory
              </h2>
              <p className="mt-4 max-w-md text-sm text-[var(--bone-deep)]">
                Systematic verification before a lot is cleared, against the standards buying houses
                test to themselves.
              </p>
            </div>

            <div>
              {LAB.map((row) => (
                <div key={row.test} className="spec-row border-[rgba(244,241,236,0.22)]">
                  <span className="display text-base text-white">{row.test}</span>
                  <span className="text-sm text-[var(--bone-deep)]">{row.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="bg-[var(--paper)]">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="eyebrow">Contact &amp; plant operations</p>
              <h2 className="display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)]">
                Connect with our production desk
              </h2>
              <p className="mt-4 max-w-md text-[var(--ink-soft)]">
                High-volume contract dyeing, seasonal colour runs, or sample shade development — the
                technical team can take it from a specification or a swatch.
              </p>
              <a
                href="mailto:contact@radodyeing.com?subject=Plant%20visit%20/%20lot%20specifications"
                className="mt-8 inline-flex items-center rounded-none bg-[var(--red)] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--red-deep)]"
              >
                Schedule a plant visit
              </a>
            </div>

            <address className="not-italic">
              <div className="border-t border-[var(--rule)] pt-4">
                <p className="eyebrow">Facility</p>
                <p className="mt-2 text-[var(--ink-soft)]">
                  Plot No. 80, Sector F,
                  <br />
                  Quaid-e-Azam Industrial Estate (Kot Lakhpat),
                  <br />
                  Lahore, Punjab, Pakistan.
                </p>
              </div>
              <div className="mt-6 border-t border-[var(--rule)] pt-4">
                <p className="eyebrow">Plant telephone</p>
                <ul className="mt-2 space-y-1">
                  {PHONES.map((phone) => (
                    <li key={phone.dial}>
                      <a
                        href={`tel:${phone.dial}`}
                        className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
                      >
                        {phone.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-6 border-t border-[var(--rule)] pt-4">
                <p className="eyebrow">Technical inquiries</p>
                <a
                  href="mailto:contact@radodyeing.com"
                  className="mt-2 block font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
                >
                  contact@radodyeing.com
                </a>
              </div>
              <div className="mt-6 border-t border-[var(--rule)] pt-4">
                <p className="eyebrow">Production &amp; dispatch</p>
                <a
                  href="mailto:dispatch@radodyeing.com"
                  className="mt-2 block font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
                >
                  dispatch@radodyeing.com
                </a>
              </div>
              <div className="mt-6 border-t border-[var(--rule)] pt-4">
                <p className="eyebrow">Operational scope</p>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Commercial wet processing · Technical lab-dip approvals · Bulk inquiries and
                  quality sampling
                </p>
              </div>
            </address>
          </div>

          {/* The plant on the map, and a route to it. Lazy: it is the heaviest
              thing on the page and it is the last thing anybody scrolls to. */}
          <div className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
            <div className="map-frame">
              <iframe
                title="Rado Dyeing &amp; Textile Mills on the map"
                src={`https://www.google.com/maps?q=${MAP_QUERY}&z=17&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${MAP_QUERY}`}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-flex items-center text-sm font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
            >
              Open in Google Maps for directions →
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--rule)] bg-[var(--bone)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-[var(--ink-soft)] sm:flex-row sm:items-center sm:px-6">
          <p>
            © {new Date().getFullYear()} {COMPANY}
          </p>
          <p className="sm:ms-auto">
            Website and systems by{" "}
            <a
              href="https://www.antrosys.com"
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
            >
              Antrosys
            </a>
          </p>
          <Link
            href="/login"
            className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline"
          >
            Staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}
