import type { Slide } from "./types";

/**
 * A polished example story presentation — data-driven, short copy, clear arc:
 * hook → problem → market → product → traction → the ask → close. Used by the
 * "New from example" action so the feature has something real to show + comment on.
 */
export const EXAMPLE_PRESENTATION = {
  title: "CaneyCloud — Investor Story",
  subtitle: "The operating system for Venezuela's tourism comeback",
  slides: [
    {
      id: "s1",
      layout: "cover",
      theme: "brand",
      eyebrow: "Investor briefing · 2026",
      title: "Venezuela, rebuilt by its people.",
      body: "CaneyCloud is the software, the capital, and the community powering the country's tourism recovery — in one house.",
    },
    {
      id: "s2",
      layout: "statement",
      theme: "dark",
      eyebrow: "The problem",
      title: "Posadas run the country's tourism. None of them run on software.",
      body: "Bookings live in WhatsApp. Payments in cash. Records in notebooks. Every guest is a manual scramble — and growth is impossible without a system.",
    },
    {
      id: "s3",
      layout: "metrics",
      theme: "dark",
      eyebrow: "The opportunity",
      title: "A large, underserved market turning back on.",
      metrics: [
        { value: "4,000+", label: "Posadas nationwide", sub: "addressable today" },
        { value: "0", label: "With an operating system", sub: "greenfield" },
        { value: "3", label: "Modules", sub: "Stays · Restaurants · Concierge" },
      ],
    },
    {
      id: "s4",
      layout: "bullets",
      theme: "light",
      eyebrow: "The product",
      title: "One platform, the whole operation.",
      bullets: [
        "Stays — property management, calendar, and anti-oversell channel sync.",
        "Restaurants — reservations + point-of-sale built for LATAM.",
        "WhatsApp Concierge — a multilingual agent that books and answers, 24/7.",
        "Accounting + payments — SENIAT-ready books, cash and card in one ledger.",
      ],
    },
    {
      id: "s5",
      layout: "split",
      theme: "dark",
      eyebrow: "How it works",
      title: "Guests arrive through WhatsApp. Operators run everything from one screen.",
      body: "The concierge captures demand where guests already are. Availability, payments, and records sync automatically — so a 6-room posada operates like a hotel chain.",
    },
    {
      id: "s6",
      layout: "metrics",
      theme: "brand",
      eyebrow: "Early traction",
      title: "Live, in production, with real operators.",
      metrics: [
        { value: "59%", label: "Stays MVP complete", sub: "92 / 155 stories" },
        { value: "Wave 4", label: "Restaurant vertical", sub: "shipped" },
        { value: "10", label: "Beta posadas", sub: "target by Jul 4" },
      ],
    },
    {
      id: "s7",
      layout: "quote",
      theme: "light",
      body: "For the first time, I can see every booking, every payment, and every guest in one place. It feels like running a real hotel.",
      quoteAuthor: "Pilot posada operator",
    },
    {
      id: "s8",
      layout: "statement",
      theme: "brand",
      eyebrow: "The ask",
      title: "Fund the rail. Own the recovery.",
      body: "We're raising to put CaneyCloud in 100 posadas and turn on payments — the infrastructure layer for a tourism economy coming back online.",
    },
  ] satisfies Slide[],
};
