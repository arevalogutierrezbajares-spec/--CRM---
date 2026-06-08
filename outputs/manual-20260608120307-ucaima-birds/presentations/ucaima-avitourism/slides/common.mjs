import path from "node:path";

const P = {
  bg: "#071B16",
  bg2: "#0C2A23",
  panel: "#112F27",
  panel2: "#173A31",
  cream: "#F5EED8",
  muted: "#B7C2AE",
  faint: "#6F806F",
  gold: "#E1B85A",
  gold2: "#F0D184",
  leaf: "#78A65A",
  moss: "#405B3E",
  clay: "#C9824A",
  red: "#B96050",
  white: "#FFFFFF",
  black: "#000000",
  transparent: "#00000000",
};

const SRC = {
  canaima: "Sources: Inparques; Avibase; UNESCO WHC.",
  demand: "Sources: USFWS 2022 National Survey; Colombia Travel; MinCIT Colombia.",
  model: "Scenario math. Replace with Ucaima ADR, rooms, and seasonality.",
  season: "Sources: Colombia Travel; seasonality to validate with Ucaima/local guides.",
};

function addBg(slide, ctx, color = P.bg) {
  ctx.addShape(slide, { x: 0, y: 0, width: ctx.W, height: ctx.H, fill: color });
  ctx.addShape(slide, { x: 0, y: 0, width: ctx.W, height: 9, fill: P.gold });
}

function addFooter(slide, ctx, source = "") {
  ctx.addShape(slide, { x: 48, y: 666, width: 1184, height: 1, fill: "#FFFFFF22" });
  ctx.addText(slide, {
    text: source,
    x: 48,
    y: 680,
    width: 860,
    height: 20,
    fontSize: 9,
    color: "#EDE4C088",
    typeface: ctx.fonts.mono,
  });
  ctx.addText(slide, {
    text: `Ucaima Avitourism Field Base / ${String(ctx.slideNumber).padStart(2, "0")}`,
    x: 960,
    y: 680,
    width: 270,
    height: 20,
    fontSize: 9,
    color: "#EDE4C088",
    typeface: ctx.fonts.mono,
    align: "right",
  });
}

function label(slide, ctx, text, x = 64, y = 54) {
  ctx.addShape(slide, {
    x,
    y,
    width: 250,
    height: 26,
    fill: "#E1B85A18",
    line: ctx.line("#E1B85A66", 1),
  });
  ctx.addText(slide, {
    text,
    x: x + 12,
    y: y + 6,
    width: 226,
    height: 16,
    fontSize: 9,
    color: P.gold2,
    typeface: ctx.fonts.mono,
  });
}

function title(slide, ctx, text, x = 64, y = 100, w = 760, size = 44) {
  ctx.addText(slide, {
    text,
    x,
    y,
    width: w,
    height: Math.ceil(size * 2.4),
    fontSize: size,
    color: P.cream,
    bold: true,
    typeface: ctx.fonts.title,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function subtitle(slide, ctx, text, x = 64, y = 216, w = 640, h = 80, size = 19) {
  ctx.addText(slide, {
    text,
    x,
    y,
    width: w,
    height: h,
    fontSize: size,
    color: P.muted,
    typeface: ctx.fonts.body,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function card(slide, ctx, { x, y, width, height, fill = P.panel, stroke = "#E1B85A2F" }) {
  ctx.addShape(slide, { x, y, width, height, fill, line: ctx.line(stroke, 1) });
}

function metric(slide, ctx, { x, y, width, height, value, labelText, note, accent = P.gold }) {
  card(slide, ctx, { x, y, width, height, fill: "#0E2A23CC", stroke: `${accent}55` });
  ctx.addText(slide, {
    text: value,
    x: x + 22,
    y: y + 18,
    width: width - 44,
    height: 52,
    fontSize: 34,
    color: accent,
    bold: true,
    typeface: ctx.fonts.title,
  });
  ctx.addText(slide, {
    text: labelText,
    x: x + 22,
    y: y + 76,
    width: width - 44,
    height: 44,
    fontSize: 15,
    color: P.cream,
    bold: true,
  });
  ctx.addText(slide, {
    text: note,
    x: x + 22,
    y: y + 122,
    width: width - 44,
    height: height - 132,
    fontSize: 11,
    color: P.muted,
  });
}

async function iconPill(slide, ctx, { icon, text, x, y, width, color = P.gold }) {
  ctx.addShape(slide, { x, y, width, height: 38, fill: "#FFFFFF0C", line: ctx.line("#FFFFFF18", 1) });
  await ctx.addLucideIcon(slide, { icon, x: x + 13, y: y + 9, width: 18, height: 18, color, strokeWidth: 2 });
  ctx.addText(slide, { text, x: x + 40, y: y + 10, width: width - 52, height: 20, fontSize: 12, color: P.cream, bold: true });
}

function smallCaps(slide, ctx, text, x, y, width, color = P.gold2) {
  ctx.addText(slide, {
    text,
    x,
    y,
    width,
    height: 18,
    fontSize: 9,
    color,
    bold: true,
    typeface: ctx.fonts.mono,
  });
}

function bulletList(slide, ctx, items, x, y, width, lineHeight = 32, size = 16) {
  items.forEach((item, i) => {
    const yy = y + i * lineHeight;
    ctx.addShape(slide, { x, y: yy + 8, width: 7, height: 7, fill: P.gold });
    ctx.addText(slide, { text: item, x: x + 20, y: yy, width, height: lineHeight, fontSize: size, color: P.cream });
  });
}

function miniBar(slide, ctx, { x, y, width, labelText, valueText, pct, color = P.gold }) {
  ctx.addText(slide, { text: labelText, x, y, width: 210, height: 18, fontSize: 11, color: P.muted, typeface: ctx.fonts.mono });
  ctx.addShape(slide, { x, y: y + 22, width, height: 12, fill: "#FFFFFF16" });
  ctx.addShape(slide, { x, y: y + 22, width: Math.max(8, width * pct), height: 12, fill: color });
  ctx.addText(slide, { text: valueText, x: x + width + 14, y: y + 17, width: 130, height: 24, fontSize: 15, color: P.cream, bold: true });
}

function assetPath(ctx, file) {
  return path.join(ctx.assetDir, file);
}

async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  await ctx.addImage(slide, { path: assetPath(ctx, "laguna-canaima.jpg"), x: 0, y: 0, width: ctx.W, height: ctx.H, fit: "cover", alt: "Laguna de Canaima" });
  ctx.addShape(slide, { x: 0, y: 0, width: ctx.W, height: ctx.H, fill: "#06140FAA" });
  ctx.addShape(slide, { x: 0, y: 0, width: 560, height: ctx.H, fill: "#071B16DD" });
  label(slide, ctx, "PROPOSAL VISION / CANAIMA", 64, 58);
  title(slide, ctx, "Ucaima as Canaima's responsible avitourism field base", 64, 116, 720, 50);
  subtitle(slide, ctx, "A practical plan to turn Ucaima's quiet, nature-first identity into year-round birding demand, founder-funded upgrades, and a defensible position in the future of Canaima tourism.", 66, 302, 560, 110, 19);
  await iconPill(slide, ctx, { icon: "Bird", text: "587+ official bird species", x: 64, y: 454, width: 234 });
  await iconPill(slide, ctx, { icon: "MapPinned", text: "3M ha World Heritage park", x: 314, y: 454, width: 254 });
  await iconPill(slide, ctx, { icon: "Users", text: "42.6M U.S. away-from-home birders", x: 64, y: 506, width: 334 });
  ctx.addText(slide, { text: "Prepared for Campamento Ucaima", x: 64, y: 606, width: 430, height: 26, fontSize: 14, color: P.gold2, typeface: ctx.fonts.mono });
  addFooter(slide, ctx, "Sources: Inparques; UNESCO WHC; USFWS 2022 National Survey. Image: Wikimedia Commons / Wilfredor.");
  return slide;
}

async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "THE CHOICE");
  ctx.addText(slide, {
    text: "Canaima does not need\nmore noise.\nIt needs a stronger\nconservation lane.",
    x: 64,
    y: 104,
    width: 590,
    height: 196,
    fontSize: 42,
    color: P.cream,
    bold: true,
    typeface: ctx.fonts.title,
    insets: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  subtitle(slide, ctx, "The opportunity is to grow without diluting the sacredness, silence, and natural seriousness that make Canaima different.", 66, 320, 600, 70, 19);
  const futures = [
    {
      x: 710,
      y: 104,
      h: 210,
      tag: "DRIFT RISK",
      head: "Party / luxe pressure",
      body: "Higher visibility, but weaker fit with place. Overcrowding, louder stays, fragile guest expectations, and less respect for nature.",
      color: P.red,
    },
    {
      x: 710,
      y: 348,
      h: 230,
      tag: "UCAIMA LANE",
      head: "Quiet specialist tourism",
      body: "Small groups, dawn departures, naturalist guides, birding data, respectful protocols, and a guest segment that values silence.",
      color: P.gold,
    },
  ];
  futures.forEach((f) => {
    card(slide, ctx, { x: f.x, y: f.y, width: 460, height: f.h, fill: "#0D251FCC", stroke: `${f.color}66` });
    smallCaps(slide, ctx, f.tag, f.x + 28, f.y + 26, 220, f.color);
    ctx.addText(slide, { text: f.head, x: f.x + 28, y: f.y + 58, width: 360, height: 46, fontSize: 28, color: P.cream, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: f.body, x: f.x + 28, y: f.y + 118, width: 396, height: 76, fontSize: 16, color: P.muted });
  });
  ctx.addShape(slide, { x: 66, y: 432, width: 510, height: 124, fill: "#E1B85A14", line: ctx.line("#E1B85A66", 1) });
  ctx.addText(slide, { text: "Core pitch line", x: 92, y: 454, width: 180, height: 18, fontSize: 10, color: P.gold2, typeface: ctx.fonts.mono, bold: true });
  ctx.addText(slide, { text: "Ucaima can become the gateway for people who come to Canaima to listen, study, photograph, and protect.", x: 92, y: 488, width: 450, height: 44, fontSize: 20, color: P.cream, bold: true });
  addFooter(slide, ctx, "Strategic framing based on Ucaima positioning discussion; validate tone with owners.");
  return slide;
}

async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "THE ASSET");
  title(slide, ctx, "Canaima is already a world-class birding asset. The missing layer is packaging.", 64, 96, 800, 42);
  metric(slide, ctx, { x: 64, y: 242, width: 248, height: 198, value: "587+", labelText: "bird species", note: "Official Inparques fauna statement for Canaima.", accent: P.gold });
  metric(slide, ctx, { x: 340, y: 242, width: 248, height: 198, value: "736", labelText: "species in checklist", note: "Avibase Canaima checklist, last modified 2026-02-17.", accent: P.leaf });
  metric(slide, ctx, { x: 616, y: 242, width: 248, height: 198, value: "5", labelText: "globally threatened", note: "Avibase/BirdLife status tags in regional checklist.", accent: P.clay });
  metric(slide, ctx, { x: 892, y: 242, width: 248, height: 198, value: "3M ha", labelText: "World Heritage park", note: "UNESCO property scale; roughly 65% tepui formations.", accent: P.gold2 });
  await ctx.addImage(slide, { path: assetPath(ctx, "harpy-eagle.jpg"), x: 70, y: 478, width: 300, height: 130, fit: "cover", alt: "Harpy eagle" });
  ctx.addShape(slide, { x: 390, y: 478, width: 748, height: 130, fill: "#FFFFFF0A", line: ctx.line("#FFFFFF22", 1) });
  ctx.addText(slide, { text: "What this means commercially", x: 416, y: 502, width: 280, height: 22, fontSize: 11, color: P.gold2, typeface: ctx.fonts.mono, bold: true });
  ctx.addText(slide, { text: "The base asset is strong enough to support a specialist travel product. Ucaima's advantage is not inventing the attraction. It is becoming the organized, respectful, easy-to-book field base around it.", x: 416, y: 532, width: 666, height: 52, fontSize: 19, color: P.cream, bold: true });
  addFooter(slide, ctx, SRC.canaima);
  return slide;
}

async function slide04(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "TARGET BIRDS");
  title(slide, ctx, "The story is not generic birding. It is tepui and Guianan Shield access.", 64, 96, 760, 42);
  await ctx.addImage(slide, { path: assetPath(ctx, "roraiman-barbtail.jpg"), x: 820, y: 80, width: 360, height: 472, fit: "cover", alt: "Roraiman Barbtail" });
  ctx.addShape(slide, { x: 820, y: 80, width: 360, height: 472, fill: "#00000022" });
  ctx.addText(slide, { text: "Roraiman Barbtail, Gran Sabana, Venezuela", x: 842, y: 568, width: 320, height: 26, fontSize: 10, color: P.muted, typeface: ctx.fonts.mono });
  const rows = [
    ["Country/region endemics", "Tepui Tinamou, Tepui Goldenthroat, Tepui Spinetail"],
    ["Tepui specialties", "Roraiman Barbtail, Tepui Wren, Pantepui Thrush"],
    ["Guianan Shield icons", "Guianan Cock-of-the-rock, White Bellbird, cotingas"],
    ["Visible canopy species", "Macaws, hummingbirds, toucans, Harpy Eagle as icon"],
  ];
  rows.forEach((row, i) => {
    const y = 242 + i * 78;
    card(slide, ctx, { x: 66, y, width: 684, height: 58, fill: "#0E2A23D8", stroke: "#FFFFFF20" });
    smallCaps(slide, ctx, row[0], 90, y + 13, 220);
    ctx.addText(slide, { text: row[1], x: 304, y: y + 14, width: 410, height: 28, fontSize: 17, color: P.cream, bold: true });
  });
  ctx.addShape(slide, { x: 66, y: 574, width: 684, height: 58, fill: "#C9824A18", line: ctx.line("#C9824A66", 1) });
  ctx.addText(slide, { text: "Important caveat", x: 90, y: 588, width: 160, height: 18, fontSize: 10, color: P.gold2, typeface: ctx.fonts.mono, bold: true });
  ctx.addText(slide, { text: "Do not claim Canaima-only endemics yet. Publish a target list only after a local guide and eBird/field-record validation pass.", x: 250, y: 587, width: 450, height: 28, fontSize: 14, color: P.cream, bold: true });
  addFooter(slide, ctx, "Sources: Avibase Canaima checklist; Inparques. Image: Wikimedia Commons / J. A. Jacomelli.");
  return slide;
}

async function slide05(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "DEMAND PROOF");
  title(slide, ctx, "North America has the birders. Colombia proves the regional playbook.", 64, 96, 900, 42);
  card(slide, ctx, { x: 64, y: 230, width: 520, height: 324, fill: "#0E2A23DD", stroke: "#E1B85A55" });
  smallCaps(slide, ctx, "U.S. BIRDING DEMAND", 94, 262, 240);
  ctx.addText(slide, { text: "96.3M", x: 94, y: 298, width: 190, height: 52, fontSize: 46, color: P.gold, bold: true, typeface: ctx.fonts.title });
  ctx.addText(slide, { text: "U.S. wild bird observers in 2022", x: 286, y: 310, width: 230, height: 34, fontSize: 19, color: P.cream, bold: true });
  miniBar(slide, ctx, { x: 94, y: 380, width: 250, labelText: "Away-from-home bird observers", valueText: "42.6M", pct: 0.44, color: P.leaf });
  miniBar(slide, ctx, { x: 94, y: 446, width: 250, labelText: "Total wildlife-watching spend", valueText: "$250.2B", pct: 0.78, color: P.gold2 });
  card(slide, ctx, { x: 638, y: 230, width: 520, height: 324, fill: "#0E2A23DD", stroke: "#78A65A55" });
  smallCaps(slide, ctx, "COLOMBIA BENCHMARK", 668, 262, 260, P.leaf);
  ctx.addText(slide, { text: "1,900+ species", x: 668, y: 298, width: 250, height: 46, fontSize: 34, color: P.gold, bold: true, typeface: ctx.fonts.title });
  ctx.addText(slide, { text: "79 endemic species and 27 birdwatching reserves/routes promoted by Colombia Travel.", x: 668, y: 352, width: 414, height: 56, fontSize: 17, color: P.cream, bold: true });
  ctx.addText(slide, { text: "2024 proof point: Colombia recorded 1,558 species and 12,007 checklists in Global Big Day, then used the result to promote nature tourism.", x: 668, y: 430, width: 410, height: 74, fontSize: 15, color: P.muted });
  ctx.addShape(slide, { x: 64, y: 590, width: 1094, height: 42, fill: "#E1B85A14", line: ctx.line("#E1B85A66", 1) });
  ctx.addText(slide, { text: "Implication: Ucaima should not sell only rooms. It should sell organized access to a rare birding landscape, built for the North American naturalist segment.", x: 90, y: 600, width: 1040, height: 20, fontSize: 17, color: P.cream, bold: true });
  addFooter(slide, ctx, SRC.demand);
  return slide;
}

async function slide06(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "PRODUCT ARCHITECTURE");
  title(slide, ctx, "Build the field base, not a generic hotel package.", 64, 96, 790, 42);
  subtitle(slide, ctx, "Birders pay for confidence: dawn logistics, route design, trained guides, clean data, quiet operations, and reliable communication.", 66, 200, 660, 56, 18);
  ctx.addShape(slide, { x: 514, y: 292, width: 250, height: 118, fill: "#E1B85A22", line: ctx.line("#E1B85A99", 2) });
  ctx.addText(slide, { text: "UCAIMA FIELD BASE", x: 540, y: 318, width: 198, height: 26, fontSize: 23, color: P.gold2, bold: true, typeface: ctx.fonts.title, align: "center" });
  ctx.addText(slide, { text: "lodging + logistics + knowledge", x: 546, y: 356, width: 188, height: 24, fontSize: 12, color: P.cream, typeface: ctx.fonts.mono, align: "center" });
  const nodes = [
    ["Binoculars", "Guided dawn routes", 84, 286],
    ["NotebookTabs", "Checklist + field notes", 84, 414],
    ["CalendarDays", "Year-round departures", 464, 506],
    ["Radio", "Safety + comms protocol", 832, 414],
    ["GraduationCap", "Guide training via Caney Learn", 832, 286],
    ["Handshake", "VAV / CaneyCloud CRM + member ops", 464, 162],
  ];
  for (const [icon, text, x, y] of nodes) {
    card(slide, ctx, { x, y, width: 270, height: 72, fill: "#0E2A23E6", stroke: "#FFFFFF22" });
    await ctx.addLucideIcon(slide, { icon, x: x + 20, y: y + 22, width: 28, height: 28, color: P.gold, strokeWidth: 2 });
    ctx.addText(slide, { text, x: x + 62, y: y + 20, width: 180, height: 34, fontSize: 15, color: P.cream, bold: true });
  }
  addFooter(slide, ctx, "Operating model: VAV / CaneyCloud enablement concept; final scope to be confirmed.");
  return slide;
}

async function slide07(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "YEAR-ROUND DEMAND");
  title(slide, ctx, "Birdwatching can smooth the calendar because the product changes by season.", 64, 96, 900, 40);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  months.forEach((m, i) => {
    const x = 64 + i * 92;
    ctx.addShape(slide, { x, y: 218, width: 78, height: 36, fill: i < 4 || i === 11 ? "#E1B85A28" : "#78A65A24", line: ctx.line("#FFFFFF22", 1) });
    ctx.addText(slide, { text: m, x, y: 229, width: 78, height: 16, fontSize: 12, color: P.cream, bold: true, typeface: ctx.fonts.mono, align: "center" });
  });
  const products = [
    ["JAN-APR", "Dry-season trail weeks", "Clearer access windows, dawn routes, field courses, first founder visits.", P.gold],
    ["MAY-AUG", "Green-season waterfall + bird photography", "Dramatic landscape, audio recording, photography, rainforest immersion.", P.leaf],
    ["SEP-NOV", "Shoulder specialist weeks", "Small groups, route validation, research/naturalist residencies, lower crowd pressure.", P.clay],
    ["DEC", "Holiday naturalist retreats", "Short premium groups, families, alumni trips, founders' annual gathering.", P.gold2],
  ];
  products.forEach((p, i) => {
    const x = 64 + (i % 2) * 560;
    const y = 304 + Math.floor(i / 2) * 142;
    card(slide, ctx, { x, y, width: 512, height: 110, fill: "#0E2A23DD", stroke: `${p[3]}66` });
    smallCaps(slide, ctx, p[0], x + 24, y + 22, 120, p[3]);
    ctx.addText(slide, { text: p[1], x: x + 118, y: y + 18, width: 310, height: 28, fontSize: 22, color: P.cream, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: p[2], x: x + 24, y: y + 60, width: 448, height: 34, fontSize: 14, color: P.muted });
  });
  addFooter(slide, ctx, SRC.season);
  return slide;
}

async function slide08(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "WHAT FUNDS BUILD");
  title(slide, ctx, "The basecamp upgrades are practical, visible, and fundable.", 64, 96, 820, 42);
  const lanes = [
    ["Field Ops", ["Dawn coffee / early breakfast", "Boxed lunches + water refills", "Quiet hours and low-light protocol", "Route briefing wall"]],
    ["Birding Infrastructure", ["Observation deck or blind", "Marked low-impact trails", "Gear room and cleaning bench", "Binocular/camera charging shelf"]],
    ["Science + Data", ["Local checklist and seasonal boards", "eBird / field-note protocol", "Small data station / Wi-Fi window", "Annual biodiversity report"]],
    ["People + Safety", ["Guide training modules", "English birding vocabulary", "First-aid and comms procedure", "Guest code of conduct"]],
  ];
  lanes.forEach((lane, i) => {
    const x = 64 + i * 284;
    card(slide, ctx, { x, y: 232, width: 250, height: 320, fill: i % 2 ? "#112F27DD" : "#0E2A23DD", stroke: "#FFFFFF22" });
    ctx.addText(slide, { text: lane[0], x: x + 22, y: 260, width: 196, height: 30, fontSize: 24, color: P.gold2, bold: true, typeface: ctx.fonts.title });
    lane[1].forEach((b, j) => {
      const yy = 314 + j * 48;
      ctx.addShape(slide, { x: x + 24, y: yy + 7, width: 8, height: 8, fill: P.leaf });
      ctx.addText(slide, { text: b, x: x + 42, y: yy, width: 176, height: 34, fontSize: 14, color: P.cream, bold: true });
    });
  });
  ctx.addShape(slide, { x: 64, y: 590, width: 1088, height: 42, fill: "#FFFFFF0B", line: ctx.line("#FFFFFF22", 1) });
  ctx.addText(slide, { text: "Design principle: every upgrade must either improve field credibility, extend usable hours, increase spend per guest, or make Ucaima easier for clubs/operators to sell.", x: 92, y: 601, width: 1014, height: 20, fontSize: 16, color: P.cream, bold: true });
  addFooter(slide, ctx, "Infrastructure list is a proposal. Final budget requires Ucaima site audit.");
  return slide;
}

async function slide09(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "FUNDING VEHICLE");
  title(slide, ctx, "Pre-sell future stays to fund the birding field base before the full demand curve arrives.", 64, 96, 960, 40);
  subtitle(slide, ctx, "Make supporters founding members, not donors. They get future-night credits, hosted access, and visible conservation/basecamp benefits.", 66, 190, 780, 58, 18);
  const tiers = [
    ["Individual Founder", "$2.5k", "4 future nights for 2 people + founder birding week invite"],
    ["Bird Club Circle", "$15k", "30 pooled night credits + private club departure window"],
    ["Institutional Partner", "$50k", "120 night credits + field course / research residency block"],
    ["Founding Patron", "$100k+", "250 night credits + named basecamp upgrade + annual field report"],
  ];
  tiers.forEach((t, i) => {
    const y = 298 + i * 76;
    card(slide, ctx, { x: 86, y, width: 1058, height: 58, fill: i === 3 ? "#E1B85A20" : "#0E2A23DD", stroke: i === 3 ? "#E1B85A88" : "#FFFFFF20" });
    ctx.addText(slide, { text: t[0], x: 116, y: y + 16, width: 280, height: 26, fontSize: 20, color: P.cream, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: t[1], x: 426, y: y + 15, width: 110, height: 26, fontSize: 22, color: P.gold, bold: true, typeface: ctx.fonts.title, align: "right" });
    ctx.addText(slide, { text: t[2], x: 582, y: y + 18, width: 504, height: 22, fontSize: 15, color: P.muted, bold: true });
  });
  ctx.addShape(slide, { x: 86, y: 620, width: 1058, height: 34, fill: "#78A65A18", line: ctx.line("#78A65A66", 1) });
  ctx.addText(slide, { text: "Launch target: pre-sell 300-600 room-nights across 3 years, then convert founders into annual birding weeks and referrals.", x: 110, y: 629, width: 1008, height: 18, fontSize: 15, color: P.cream, bold: true });
  addFooter(slide, ctx, "Illustrative launch architecture. Pricing and nights must be calibrated with Ucaima capacity and ADR.");
  return slide;
}

async function slide10(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "GO-TO-MARKET");
  title(slide, ctx, "Sell the founding circle to organized birding demand, not random tourists.", 64, 96, 880, 40);
  const channels = [
    ["Bird clubs + Audubon chapters", "Group night blocks, speaker events, member-only trip windows"],
    ["Natural history museums", "Curator-led trips, patron circles, biodiversity education"],
    ["Universities + field schools", "Course blocks, research stays, annual capstone trips"],
    ["Specialist tour operators", "Route validation FAM trips, commissionable departures"],
    ["Expedition networks", "Founder events, explorer-led routes, media credibility"],
    ["Conservation donors", "Named upgrade, guide training, annual impact report"],
  ];
  channels.forEach((c, i) => {
    const x = 64 + (i % 3) * 370;
    const y = 218 + Math.floor(i / 3) * 142;
    card(slide, ctx, { x, y, width: 330, height: 112, fill: "#0E2A23DD", stroke: "#FFFFFF20" });
    ctx.addText(slide, { text: c[0], x: x + 22, y: y + 20, width: 276, height: 28, fontSize: 19, color: P.gold2, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: c[1], x: x + 22, y: y + 58, width: 270, height: 36, fontSize: 13, color: P.muted });
  });
  ctx.addShape(slide, { x: 64, y: 540, width: 1086, height: 82, fill: "#FFFFFF0A", line: ctx.line("#FFFFFF22", 1) });
  ctx.addText(slide, { text: "Outbound package", x: 92, y: 560, width: 190, height: 20, fontSize: 10, color: P.gold2, typeface: ctx.fonts.mono, bold: true });
  ctx.addText(slide, { text: "1. Founding-member invitation  2. Birding field-base one-pager  3. Future-night credit terms  4. Low-season hosted week  5. To be confirmed: Charles Brewer-Carias / senior Venezuelan explorer-led event", x: 92, y: 588, width: 1016, height: 26, fontSize: 15, color: P.cream, bold: true });
  addFooter(slide, ctx, "Channel list is a launch hypothesis. Names and contacts live in CRM Ucaima Transformation project.");
  return slide;
}

async function slide11(presentation, ctx) {
  const slide = presentation.slides.add();
  addBg(slide, ctx);
  label(slide, ctx, "MEASURABLE OUTCOMES");
  title(slide, ctx, "The first measurable win is designed room-night demand.", 64, 96, 820, 42);
  card(slide, ctx, { x: 74, y: 230, width: 450, height: 310, fill: "#0E2A23DD", stroke: "#E1B85A55" });
  smallCaps(slide, ctx, "ONE DESIGNED DEPARTURE", 104, 264, 240);
  const mathRows = [
    ["10 guests", "small birding group"],
    ["6 nights", "serious field itinerary"],
    ["60 room-nights", "before extensions"],
  ];
  mathRows.forEach((r, i) => {
    ctx.addText(slide, { text: r[0], x: 104, y: 310 + i * 62, width: 180, height: 30, fontSize: 28, color: i === 2 ? P.gold : P.cream, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: r[1], x: 298, y: 317 + i * 62, width: 160, height: 22, fontSize: 13, color: P.muted });
  });
  card(slide, ctx, { x: 600, y: 230, width: 520, height: 310, fill: "#0E2A23DD", stroke: "#78A65A55" });
  smallCaps(slide, ctx, "YEAR 1 TARGET SCENARIO", 630, 264, 240, P.leaf);
  const bars = [
    ["4 departures", "240 room-nights", 0.5, P.leaf],
    ["8 departures", "480 room-nights", 1.0, P.gold],
    ["12 departures", "720 room-nights", 1.0, P.gold2],
  ];
  bars.forEach((b, i) => {
    const y = 318 + i * 62;
    ctx.addText(slide, { text: b[0], x: 630, y, width: 136, height: 20, fontSize: 14, color: P.cream, bold: true });
    ctx.addShape(slide, { x: 790, y: y + 4, width: 230, height: 16, fill: "#FFFFFF16" });
    ctx.addShape(slide, { x: 790, y: y + 4, width: 230 * b[2], height: 16, fill: b[3] });
    ctx.addText(slide, { text: b[1], x: 1032, y: y - 2, width: 86, height: 24, fontSize: 13, color: P.muted, align: "right" });
  });
  ctx.addShape(slide, { x: 74, y: 580, width: 1046, height: 48, fill: "#C9824A18", line: ctx.line("#C9824A66", 1) });
  ctx.addText(slide, { text: "Use Ucaima's real ADR and room count to convert this into revenue. The deck model is designed to show controllable levers: groups, nights, departures, extensions, and founder pre-sales.", x: 102, y: 592, width: 990, height: 24, fontSize: 15, color: P.cream, bold: true });
  addFooter(slide, ctx, SRC.model);
  return slide;
}

async function slide12(presentation, ctx) {
  const slide = presentation.slides.add();
  await ctx.addImage(slide, { path: assetPath(ctx, "laguna-canaima.jpg"), x: 0, y: 0, width: ctx.W, height: ctx.H, fit: "cover", alt: "Laguna de Canaima" });
  ctx.addShape(slide, { x: 0, y: 0, width: ctx.W, height: ctx.H, fill: "#06140FCC" });
  ctx.addShape(slide, { x: 0, y: 0, width: ctx.W, height: 9, fill: P.gold });
  label(slide, ctx, "THE ASK", 64, 58);
  title(slide, ctx, "Approve the lane. Validate the routes. Launch the founding circle.", 64, 118, 840, 48);
  const asks = [
    ["Position", "Align on Ucaima as Canaima's responsible birding and naturalist field base."],
    ["Validation", "Confirm first birding routes, guide capacity, seasonal products, and target species list."],
    ["Launch", "Open founding-member outreach to clubs, institutions, operators, and patrons."],
  ];
  asks.forEach((a, i) => {
    const x = 64 + i * 374;
    card(slide, ctx, { x, y: 348, width: 330, height: 150, fill: "#071B16DD", stroke: "#E1B85A55" });
    ctx.addText(slide, { text: `0${i + 1}`, x: x + 24, y: 372, width: 54, height: 40, fontSize: 32, color: P.gold, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: a[0], x: x + 92, y: 378, width: 180, height: 26, fontSize: 24, color: P.cream, bold: true, typeface: ctx.fonts.title });
    ctx.addText(slide, { text: a[1], x: x + 24, y: 426, width: 280, height: 48, fontSize: 14, color: P.muted });
  });
  ctx.addShape(slide, { x: 64, y: 552, width: 1078, height: 54, fill: "#E1B85A18", line: ctx.line("#E1B85A66", 1) });
  ctx.addText(slide, { text: "Proposal owner: VAV / CaneyCloud support for CRM, member operations, guide learning, outreach content, and reporting.", x: 92, y: 568, width: 1006, height: 22, fontSize: 17, color: P.cream, bold: true });
  addFooter(slide, ctx, "Image: Wikimedia Commons / Wilfredor. Charles Brewer-Carias collaboration remains to be confirmed.");
  return slide;
}

const slides = {
  1: slide01,
  2: slide02,
  3: slide03,
  4: slide04,
  5: slide05,
  6: slide06,
  7: slide07,
  8: slide08,
  9: slide09,
  10: slide10,
  11: slide11,
  12: slide12,
};

export async function addNumberedSlide(presentation, ctx, number) {
  return slides[number](presentation, ctx);
}
