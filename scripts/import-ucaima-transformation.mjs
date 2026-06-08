#!/usr/bin/env node
import { config } from "dotenv";
import postgres from "postgres";

config({ path: new URL("../.env.local", import.meta.url).pathname, override: true, quiet: true });

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const VAV_PROJECT_TITLE = "VAV - Vamos a Venezuela";
const ALT_VAV_PROJECT_TITLE = "VAV — Vamos a Venezuela";
const UCAIMA_PROJECT_TITLE = "Ucaima Transformation";

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: "require",
});

const TAGS = [
  { name: "vav", kind: "venture", color: "#1565c0" },
  { name: "ucaima-transformation", kind: "custom", color: "#0f766e" },
  { name: "science-basecamp", kind: "custom", color: "#2563eb" },
  { name: "founding-member-prospect", kind: "custom", color: "#9333ea" },
  { name: "field-course-buyer", kind: "custom", color: "#16a34a" },
  { name: "naturalist-travel-buyer", kind: "custom", color: "#ca8a04" },
  { name: "venezuelan-legitimacy", kind: "custom", color: "#dc2626" },
  { name: "flagship-credibility", kind: "custom", color: "#7c3aed" },
  { name: "funder", kind: "custom", color: "#0891b2" },
  { name: "to-verify", kind: "custom", color: "#64748b" },
];

const categoryTag = {
  "anchor-host": "ucaima-transformation",
  "field-course-buyer": "field-course-buyer",
  "naturalist-travel-buyer": "naturalist-travel-buyer",
  "venezuelan-legitimacy": "venezuelan-legitimacy",
  "flagship-credibility": "flagship-credibility",
  "science-advisory": "science-basecamp",
  funder: "funder",
  "standards-network": "founding-member-prospect",
};

const prospects = [
  {
    org: "Campamento Ucaima",
    category: "anchor-host",
    priority: 1,
    fit: "Host site and core partner",
    offer: "Transformation partner: field basecamp, responsible tourism operating model, CaneyCloud/VAV demand generation.",
    officialSite: "https://campamentoucaima.com/en/",
    orgLinkedIn: null,
    emails: [],
    phones: [],
    notes: "Existing CRM contact may already be named Ucaima. This importer updates/links it rather than duplicating if found.",
    contacts: [],
  },
  {
    org: "Fundacion Manoa",
    category: "venezuelan-legitimacy",
    priority: 1,
    fit: "Canaima cultural heritage and rock art legitimacy partner",
    offer: "Invite as Venezuelan Science Partner; position Ucaima as a serious base for cultural heritage, rock art, archaeology, and respectful interpretation.",
    officialSite: "https://fundacionmanoa.org",
    orgLinkedIn: null,
    emails: ["fundacionmanoa@gmail.com"],
    phones: [],
    notes: "Strong local legitimacy. Personal LinkedIn profiles were not confidently verified for the main Manoa contacts.",
    contacts: [
      { name: "Jose Miguel Perez-Gomez", title: "Archaeology / Canaima cultural heritage lead", linkedin: null, officialUrl: "https://www.josemiguelperezgomez.com", status: "official-site" },
      { name: "Roger Swidorowicz", title: "Rock art / 3D documentation researcher", linkedin: null, officialUrl: "https://fundacionmanoa.org/virtual_museum/", status: "needs-linkedin-verification" },
    ],
  },
  {
    org: "SOS Orinoco",
    category: "venezuelan-legitimacy",
    priority: 1,
    fit: "Conservation and anti-extractive tourism credibility",
    offer: "Invite as advisory/legitimacy partner for Canaima stewardship, anti-overcrowding, and conservation guardrails.",
    officialSite: "https://sosorinoco.org",
    orgLinkedIn: null,
    emails: ["info@sosorinoco.org"],
    phones: [],
    notes: "Useful for framing tourism risk, conservation ethics, mining/overcrowding concerns, and seriousness of Canaima protection.",
    contacts: [
      { name: "Cristina Burelli", title: "Founder / international liaison", linkedin: "https://www.linkedin.com/in/cristina-burelli-20513028", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Provita",
    category: "venezuelan-legitimacy",
    priority: 1,
    fit: "Venezuelan biodiversity NGO",
    offer: "Invite as Venezuelan conservation partner; potential field report, biodiversity programming, staff training, and student/researcher fellowships.",
    officialSite: "https://www.provita.org.ve",
    orgLinkedIn: "https://ve.linkedin.com/in/provita-ong-5a2197170",
    emails: ["bsucre@provitaonline.org", "ingrid.zager@provitaonline.org"],
    phones: [],
    notes: "Good local credibility for birds, threatened species, and conservation reporting.",
    contacts: [
      { name: "Jon Paul Rodriguez", title: "President / cofounder", linkedin: "https://ve.linkedin.com/in/jonparod", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Bibiana Sucre Smith", title: "Executive Director", linkedin: null, officialUrl: "https://iucncongress2025.org/speakers/bibiana-sucre-smith", status: "official-bio" },
      { name: "Rodrigo Lazo", title: "Provita contact surfaced in research", linkedin: "https://ve.linkedin.com/in/rlazo/es", officialUrl: null, status: "linkedin-needs-role-check" },
    ],
  },
  {
    org: "The Explorers Club",
    category: "flagship-credibility",
    priority: 2,
    fit: "Exploration credibility and member network",
    offer: "Invite to Founding Member Circle as a flagship exploration partner once Ucaima Field Base one-pager is ready.",
    officialSite: "https://www.explorers.org",
    orgLinkedIn: "https://www.linkedin.com/company/the-explorers-club",
    emails: ["reservations@explorers.org"],
    phones: [],
    notes: "Best path may be event/salon/speaker first, then field-base partnership.",
    contacts: [
      { name: "Richard Wiese", title: "Past President", linkedin: "https://www.linkedin.com/in/richard-wiese", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Barbara Doran", title: "President", linkedin: null, officialUrl: "https://www.linkedin.com/company/the-explorers-club", status: "org-linkedin-only" },
      { name: "James Robinson", title: "Corporate outreach / annual dinner contact surfaced", linkedin: null, officialUrl: "https://www.linkedin.com/company/the-explorers-club", status: "needs-linkedin-verification" },
    ],
  },
  {
    org: "National Geographic Society",
    category: "flagship-credibility",
    priority: 2,
    fit: "Explorer network, storytelling, science credibility",
    offer: "Approach after local partners are attached; pitch Ucaima as a serious Canaima base for responsible exploration and field storytelling.",
    officialSite: "https://www.nationalgeographic.org",
    orgLinkedIn: "https://www.linkedin.com/company/national-geographic-society",
    emails: ["funding@ngs.org"],
    phones: [],
    notes: "Longer-cycle flagship target, not first revenue buyer.",
    contacts: [
      { name: "Jill Tiefenthaler", title: "CEO", linkedin: "https://www.linkedin.com/in/jill-tiefenthaler", officialUrl: "https://www.nationalgeographic.org/society/our-leadership/", status: "linkedin-confirmed" },
      { name: "Ian Miller", title: "Chief Science and Innovation Officer", linkedin: "https://www.linkedin.com/in/ian-miller-paleo", officialUrl: "https://www.nationalgeographic.org/society/our-leadership/", status: "linkedin-confirmed" },
      { name: "Kaitlin Yarnall", title: "Chief Storytelling Officer", linkedin: "https://www.linkedin.com/in/kaitlin-yarnall-8aaa866", officialUrl: "https://www.nationalgeographic.org/society/our-leadership/", status: "linkedin-confirmed" },
      { name: "Alexander Moen", title: "Chief Explorer Engagement Officer", linkedin: null, officialUrl: "https://www.nationalgeographic.org/society/our-leadership/", status: "official-bio" },
    ],
  },
  {
    org: "Rolex Perpetual Planet",
    category: "funder",
    priority: 3,
    fit: "Flagship sponsor/funder credibility",
    offer: "Do not cold pitch first. Route through NatGeo, Explorers Club, La Venta, or confirmed Perpetual Planet explorers.",
    officialSite: "https://www.rolex.org/environment/perpetual-planet",
    orgLinkedIn: "https://www.linkedin.com/company/rolex",
    emails: [],
    phones: [],
    notes: "Direct individual contacts not cleanly verified. Keep as to-confirm flagship funding path.",
    contacts: [],
  },
  {
    org: "Re:wild",
    category: "flagship-credibility",
    priority: 2,
    fit: "Biodiversity and threatened ecosystem credibility",
    offer: "Pitch after Venezuelan conservation partners are attached; frame around tepui biodiversity, endemic species, and respectful field support.",
    officialSite: "https://www.rewild.org",
    orgLinkedIn: "https://www.linkedin.com/company/rewild",
    emails: ["hello@rewild.org"],
    phones: [],
    notes: "Better credibility/funding partner than immediate room-night buyer.",
    contacts: [
      { name: "Barney Long", title: "Senior conservation leader", linkedin: "https://www.linkedin.com/in/barney-long-3a1a1957", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Wes Sechrest", title: "CEO / Board Chair", linkedin: null, officialUrl: "https://www.rewild.org/team/wes-sechrest-ph-d", status: "official-bio" },
      { name: "Penny Langhammer", title: "Chief Programs Officer", linkedin: null, officialUrl: "https://www.rewild.org/team", status: "official-bio" },
    ],
  },
  {
    org: "Earthwatch",
    category: "field-course-buyer",
    priority: 1,
    fit: "Paid citizen-science expeditions and private group programs",
    offer: "Invite as Field or Expedition Partner; Ucaima can host a citizen-science pilot and recurring conservation travel blocks.",
    officialSite: "https://earthwatch.org",
    orgLinkedIn: "https://www.linkedin.com/company/earthwatch",
    emails: ["info@earthwatch.org", "rlubitz@earthwatch.org"],
    phones: [],
    notes: "Strong model for paid volunteer science trips. Official leadership confirmed; personal LinkedIn still needs a clean pass.",
    contacts: [
      { name: "Johanna Chao Kreilick", title: "Interim CEO", linkedin: null, officialUrl: "https://earthwatch.org/about/leadership", status: "official-bio" },
      { name: "Heather Wilcox", title: "Director of Development", linkedin: null, officialUrl: "https://earthwatch.org/about/leadership", status: "official-bio" },
      { name: "Ray Lubitz", title: "Senior Program Manager", linkedin: null, officialUrl: "https://earthwatch.org/about/leadership", status: "official-bio" },
    ],
  },
  {
    org: "Operation Wallacea",
    category: "field-course-buyer",
    priority: 1,
    fit: "Highest-probability recurring field-course buyer",
    offer: "Pitch a new Venezuela/Canaima field site exploration with future room-night credits and scout visit.",
    officialSite: "https://www.opwall.com",
    orgLinkedIn: "https://www.linkedin.com/company/operation-wallacea",
    emails: ["info@opwall.com", "usa@opwall.com"],
    phones: ["+44 1790 763194"],
    notes: "Very strong commercial fit for student field blocks and annual recurring demand.",
    contacts: [
      { name: "Pippa Disney-Tozer", title: "Managing Director", linkedin: "https://uk.linkedin.com/in/pippa-disney-tozer-0a90b248", officialUrl: "https://www.opwall.com/team/pippa-tozer/", status: "linkedin-confirmed" },
      { name: "Tom Martin", title: "Research Director", linkedin: "https://uk.linkedin.com/in/tom-martin-a163805a", officialUrl: "https://www.opwall.com/team/dr-tom-martin/", status: "linkedin-confirmed" },
      { name: "Frankie Smith", title: "Marine Research and Operations Manager", linkedin: "https://uk.linkedin.com/in/frankie-smith-95a638a7", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Helen Clark", title: "School/account manager", linkedin: "https://uk.linkedin.com/in/helen-clark-7605a51b6", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "School for Field Studies",
    category: "field-course-buyer",
    priority: 1,
    fit: "Annual field-course buyer",
    offer: "Pitch a Canaima field-course block: ecology, conservation, culture, field methods, and responsible tourism.",
    officialSite: "https://fieldstudies.org",
    orgLinkedIn: "https://www.linkedin.com/school/the-school-for-field-studies/",
    emails: [],
    phones: ["978-741-3567"],
    notes: "Very strong fit for recurring undergrad field programs.",
    contacts: [
      { name: "Katlyn Osgood Armstrong", title: "President", linkedin: "https://www.linkedin.com/in/katlynarmstrong", officialUrl: "https://fieldstudies.org/about/staff/", status: "linkedin-confirmed" },
      { name: "Devin Foxall", title: "VP Enrollment / partnerships", linkedin: "https://www.linkedin.com/in/devinfoxall", officialUrl: "https://fieldstudies.org/about/staff/", status: "linkedin-confirmed" },
      { name: "Fernando Mendive", title: "Peru Center Director", linkedin: "https://pe.linkedin.com/in/fernando-mendive-0b9975101/en", officialUrl: "https://fieldstudies.org/about/staff/", status: "linkedin-confirmed" },
      { name: "Katie Goodall", title: "Dean", linkedin: null, officialUrl: "https://fieldstudies.org/about/staff/", status: "official-bio" },
    ],
  },
  {
    org: "Amazon Conservation",
    category: "science-advisory",
    priority: 1,
    fit: "Field station model, remote sensing, Amazon conservation intelligence",
    offer: "Ask for field-station benchmarking/advice and potential technology/data collaboration.",
    officialSite: "https://www.amazonconservation.org",
    orgLinkedIn: "https://www.linkedin.com/company/amazon-conservation-association",
    emails: ["info@amazonconservation.org", "jbeavers@amazonconservation.org", "mfiner@amazonconservation.org"],
    phones: [],
    notes: "Useful model for Los Amigos style science hub and MAAP-style monitoring.",
    contacts: [
      { name: "John Beavers", title: "President", linkedin: "https://www.linkedin.com/in/john-beavers-b8811614", officialUrl: "https://www.amazonconservation.org/about/staff/", status: "linkedin-confirmed" },
      { name: "Matt Finer", title: "MAAP / monitoring lead", linkedin: "https://www.linkedin.com/in/matt-finer-a8209016b", officialUrl: "https://www.amazonconservation.org/about/staff/", status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Cornell Lab of Ornithology / eBird",
    category: "science-advisory",
    priority: 2,
    fit: "Birding, citizen-science data, Macaulay/eBird credibility",
    offer: "Pitch Ucaima as a birding/citizen-science basecamp with eBird-style observation protocols.",
    officialSite: "https://www.birds.cornell.edu",
    orgLinkedIn: "https://www.linkedin.com/company/cornell-lab-of-ornithology",
    emails: ["cornellbirds@cornell.edu", "ebird@cornell.edu", "clw37@cornell.edu"],
    phones: [],
    notes: "Good for credibility and naturalist products. Need another LinkedIn pass for individual profiles.",
    contacts: [
      { name: "Ian Owens", title: "Executive Director", linkedin: null, officialUrl: "https://www.birds.cornell.edu/home/staff/ian-owens/", status: "official-bio" },
      { name: "Christopher Wood", title: "eBird Director", linkedin: null, officialUrl: "https://www.birds.cornell.edu/home/staff/christopher-wood/", status: "official-bio" },
    ],
  },
  {
    org: "BirdLife International",
    category: "science-advisory",
    priority: 2,
    fit: "Bird conservation network and Americas regional credibility",
    offer: "Pitch via birding baseline / conservation education; likely advisory/network before revenue.",
    officialSite: "https://www.birdlife.org",
    orgLinkedIn: "https://www.linkedin.com/company/birdlife-international",
    emails: [],
    phones: ["+593 (02) 4518276"],
    notes: "Americas office in Quito. Stuart Butchart LinkedIn confirmed; second individual needs verification.",
    contacts: [
      { name: "Stuart Butchart", title: "Chief Scientist", linkedin: "https://uk.linkedin.com/in/stuart-butchart", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Martin Harper", title: "CEO", linkedin: null, officialUrl: "https://www.birdlife.org", status: "official-role-needs-linkedin" },
    ],
  },
  {
    org: "Smithsonian Tropical Research Institute",
    category: "science-advisory",
    priority: 3,
    fit: "Field-station benchmark and tropical research credibility",
    offer: "Ask for advice and benchmark guidance; not a direct sales target at first.",
    officialSite: "https://stri.si.edu",
    orgLinkedIn: "https://www.linkedin.com/company/smithsonianpanama",
    emails: [],
    phones: ["+507 212.8000"],
    notes: "High credibility but not Canaima-specific. Use for field-station standards and research support model.",
    contacts: [
      { name: "Joshua Tewksbury", title: "Director", linkedin: null, officialUrl: "https://stri.si.edu/people/meet-the-director", status: "official-bio" },
      { name: "Oris Sanjur", title: "Deputy Director", linkedin: null, officialUrl: "https://stri.si.edu/phonebook", status: "official-directory" },
      { name: "Stuart Davies", title: "ForestGEO Director", linkedin: null, officialUrl: "https://stri.si.edu", status: "official-reference-needs-linkedin" },
    ],
  },
  {
    org: "Natural Habitat Adventures / Earthwatch Expeditions",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "High-end quiet naturalist and citizen-science travel buyer",
    offer: "Pitch a serious Canaima naturalist departure with science/conservation contribution and future-night credits.",
    officialSite: "https://www.nathab.com",
    orgLinkedIn: "https://www.linkedin.com/company/natural-habitat-adventures",
    emails: ["info@nathab.com"],
    phones: ["800-543-8917", "+1-303-449-3711"],
    notes: "Strong commercial fit for premium quiet travelers.",
    contacts: [
      { name: "Ben Bressler", title: "Founder", linkedin: null, officialUrl: "https://www.nathab.com/our-story/staff-bios/ben-bressler", status: "official-bio" },
      { name: "Renata Haas", title: "Managing Director / SVP Adventures", linkedin: "https://www.linkedin.com/in/renata-haas", officialUrl: "https://www.nathab.com/earthwatch-expeditions/about/staff-bios/renata-haas", status: "linkedin-confirmed" },
      { name: "Wendy Redal", title: "Editorial Director", linkedin: "https://www.linkedin.com/in/wendy-redal-phd-9a93712", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Organization for Tropical Studies",
    category: "field-course-buyer",
    priority: 2,
    fit: "University consortium field-course benchmark",
    offer: "Pitch Ucaima as a future tropical field-base candidate and ask for field-course partnership advice.",
    officialSite: "https://tropicalstudies.org",
    orgLinkedIn: "https://www.linkedin.com/company/tropicalstudies",
    emails: [],
    phones: [],
    notes: "Need a second current individual LinkedIn. Useful benchmark because of university consortium model.",
    contacts: [
      { name: "Elizabeth Braker", title: "OTS contact surfaced in research", linkedin: "https://www.linkedin.com/in/elizabeth-braker-b3367010", officialUrl: null, status: "linkedin-confirmed-needs-current-role-check" },
    ],
  },
  {
    org: "Round River Conservation Studies",
    category: "field-course-buyer",
    priority: 1,
    fit: "Recurring undergraduate conservation field programs",
    offer: "Pitch a Ucaima field-course block with future room-night credits and a quiet-season scout trip.",
    officialSite: "https://roundriver.org",
    orgLinkedIn: "https://www.linkedin.com/company/round-river-conservation-studies",
    emails: ["studyabroad@roundriver.org", "info@roundriver.org"],
    phones: ["801-359-4250"],
    notes: "Strong near-term fit.",
    contacts: [
      { name: "Benjamin Szydlowski", title: "Student programs", linkedin: "https://www.linkedin.com/in/benjaminszydlowski", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Maggie Triska", title: "Round River contact surfaced", linkedin: "https://www.linkedin.com/in/maggie-triska", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Doug Milek", title: "Executive Director", linkedin: null, officialUrl: "https://roundriver.org", status: "official-role-needs-linkedin" },
    ],
  },
  {
    org: "Wildlands Studies",
    category: "field-course-buyer",
    priority: 1,
    fit: "Small field teams and undergraduate credit travel",
    offer: "Pitch Ucaima as a future South America conservation/ecology field program site.",
    officialSite: "https://www.wildlandsstudies.com",
    orgLinkedIn: "https://www.linkedin.com/school/wildlands-studies/",
    emails: ["wildlands@wildlandsstudies.com"],
    phones: ["831-684-9999"],
    notes: "Good near-term buyer type.",
    contacts: [
      { name: "Jenna Spackeen", title: "Wildlands Studies contact surfaced", linkedin: "https://www.linkedin.com/in/jenna-spackeen-45454789", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Tristen Thron", title: "Wildlands Studies contact surfaced", linkedin: "https://www.linkedin.com/in/tristen-thron-013193a9", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Institute for Field Research",
    category: "field-course-buyer",
    priority: 2,
    fit: "Archaeology and cultural heritage field schools",
    offer: "Pitch only with Fundacion Manoa or other Venezuelan cultural heritage partner attached.",
    officialSite: "https://ifrglobal.org",
    orgLinkedIn: "https://www.linkedin.com/company/institute-for-field-research",
    emails: [],
    phones: [],
    notes: "Good for rock art/cultural heritage angle rather than ecology.",
    contacts: [
      { name: "Kate Rose", title: "IFR contact surfaced", linkedin: "https://www.linkedin.com/in/kate-rose-b5406a31", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Gabrielle Longo", title: "IFR contact surfaced", linkedin: "https://it.linkedin.com/in/brielongo", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Field Projects International",
    category: "field-course-buyer",
    priority: 2,
    fit: "Field training and conservation research courses",
    offer: "Pitch Ucaima as a field methods site: bioacoustics, camera traps, primates/wildlife methods, conservation training.",
    officialSite: "https://fieldprojects.org",
    orgLinkedIn: null,
    emails: [],
    phones: [],
    notes: "Amazon field training model. Contacts below have strong LinkedIn matches from research.",
    contacts: [
      { name: "Gideon Erkenswick", title: "Field Projects International contact", linkedin: "https://www.linkedin.com/in/gideon-erkenswick-38a3284", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Mrinalini Erkenswick Watsa", title: "Field Projects International contact", linkedin: "https://www.linkedin.com/in/mrinalini-erkenswick-watsa-31a0b765", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Adventure Scientists",
    category: "science-advisory",
    priority: 2,
    fit: "Outdoor data collection/citizen science protocols",
    offer: "Ask for citizen-science protocol advice and potential Canaima data collection project.",
    officialSite: "https://www.adventurescientists.org",
    orgLinkedIn: "https://www.linkedin.com/company/adventurescientists",
    emails: ["projectcreation@adventurescientists.org", "info@adventurescientists.org"],
    phones: ["406-624-3320"],
    notes: "Good for turning naturalist/explorer visitors into data collectors.",
    contacts: [
      { name: "Lara Birkes", title: "Executive Director", linkedin: "https://www.linkedin.com/in/larabirkes", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Gregg Treinish", title: "Founder", linkedin: "https://www.linkedin.com/in/gregg-treinish-4175073", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Devynn Maclure", title: "Adventure Scientists contact", linkedin: "https://www.linkedin.com/in/devynn-maclure-653942160", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Biosphere Expeditions",
    category: "naturalist-travel-buyer",
    priority: 2,
    fit: "Paid citizen-science conservation expeditions",
    offer: "Pitch Ucaima as a conservation expedition site with measurable field outputs.",
    officialSite: "https://www.biosphere-expeditions.org",
    orgLinkedIn: "https://www.linkedin.com/company/biosphere-expeditions",
    emails: ["info@biosphere-expeditions.org"],
    phones: [],
    notes: "Direct personal LinkedIn URLs were not cleanly exposed; org page shows relevant people.",
    contacts: [
      { name: "Matthias Hammer", title: "Founder / Executive Director", linkedin: null, officialUrl: "https://www.biosphere-expeditions.org", status: "org-linkedin-only" },
      { name: "Malika Fettak", title: "Operations / expedition leadership", linkedin: null, officialUrl: "https://www.biosphere-expeditions.org", status: "org-linkedin-only" },
    ],
  },
  {
    org: "Scientific Exploration Society",
    category: "flagship-credibility",
    priority: 2,
    fit: "Exploration credibility and expedition network",
    offer: "Invite to Founding Member Circle / exploration salon path.",
    officialSite: "https://ses-explore.org",
    orgLinkedIn: "https://www.linkedin.com/company/scientific-exploration-society",
    emails: ["admin@ses-explore.org", "gail@ses-explore.org"],
    phones: ["+44 1747 853353"],
    notes: "Good for expedition credibility.",
    contacts: [
      { name: "Nikki Skinner", title: "SES contact surfaced", linkedin: "https://uk.linkedin.com/in/nikki-skinner-a0a96711", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Henrietta Thorpe", title: "SES contact surfaced", linkedin: "https://uk.linkedin.com/in/henrietta-thorpe-3572454a", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "British Exploring Society",
    category: "flagship-credibility",
    priority: 3,
    fit: "Youth expeditions and future explorer programming",
    offer: "Pitch a sponsored young Venezuelan explorers / responsible field leadership fellowship only after Ucaima operations are ready.",
    officialSite: "https://www.britishexploring.org",
    orgLinkedIn: "https://uk.linkedin.com/company/british-exploring-society",
    emails: ["development@britishexploring.org"],
    phones: [],
    notes: "Not first revenue buyer; useful for youth/explorer fellowship framing.",
    contacts: [
      { name: "Joseph Howes", title: "British Exploring contact surfaced", linkedin: "https://uk.linkedin.com/in/joseph-howes-impact", officialUrl: null, status: "linkedin-confirmed" },
      { name: "David Charles", title: "British Exploring contact surfaced", linkedin: "https://uk.linkedin.com/in/david-charles-outdoors", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Honor Wilson-Fletcher", title: "Chief Executive", linkedin: "https://uk.linkedin.com/in/hwfjanuary", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Royal Geographical Society",
    category: "flagship-credibility",
    priority: 2,
    fit: "Exploration grants, fieldwork credibility, speaker/event network",
    offer: "Use as credibility and grants route; ask for expedition advice once concept is packaged.",
    officialSite: "https://www.rgs.org",
    orgLinkedIn: "https://www.linkedin.com/company/royal-geographical-society",
    emails: ["explore@rgs.org", "grants@rgs.org", "rhed@rgs.org"],
    phones: [],
    notes: "Need individual LinkedIn pass if this becomes a priority.",
    contacts: [],
  },
  {
    org: "ACOANA",
    category: "venezuelan-legitimacy",
    priority: 1,
    fit: "Guayana/Caura biodiversity and Indigenous community work",
    offer: "Invite as Venezuelan advisory partner for community/conservation ethics.",
    officialSite: "https://www.acoana.org",
    orgLinkedIn: "https://ve.linkedin.com/company/acoanaorg",
    emails: ["contacto@acoana.org"],
    phones: ["+58 212-763-1054"],
    notes: "Strong local legitimacy; personal LinkedIn pass still needed.",
    contacts: [
      { name: "Mariapia Bevilacqua", title: "ACOANA-associated contact surfaced", linkedin: null, officialUrl: "https://www.acoana.org", status: "needs-linkedin-verification" },
    ],
  },
  {
    org: "Sociedad Conservacionista Audubon de Venezuela",
    category: "venezuelan-legitimacy",
    priority: 1,
    fit: "Birding, education, ecotourism, local conservation legitimacy",
    offer: "Invite for birding baseline, guide training, and quiet naturalist product design.",
    officialSite: "https://www.audubonvenezuela.org",
    orgLinkedIn: null,
    emails: ["info@audubonvenezuela.org", "audubonve@gmail.com"],
    phones: ["+58 212-272-8708"],
    notes: "Good fit for birding/naturalist credibility. Personal LinkedIn pass still needed.",
    contacts: [
      { name: "Carmen Cabello", title: "Audubon Venezuela contact surfaced", linkedin: null, officialUrl: "https://www.audubonvenezuela.org", status: "needs-linkedin-verification" },
      { name: "Mauricio Zanoletti", title: "Audubon Venezuela contact surfaced", linkedin: null, officialUrl: "https://www.audubonvenezuela.org", status: "needs-linkedin-verification" },
    ],
  },
  {
    org: "Coleccion Ornitologica Phelps / Fundacion William H. Phelps",
    category: "venezuelan-legitimacy",
    priority: 2,
    fit: "Venezuela ornithology credibility",
    offer: "Invite for birding baseline/advisory role and species list credibility.",
    officialSite: "https://www.fundacionwhphelps.org",
    orgLinkedIn: null,
    emails: ["info@fundacionwhphelps.org"],
    phones: [],
    notes: "Important for Venezuelan bird science credibility.",
    contacts: [],
  },
  {
    org: "Sociedad Venezolana de Ecologia",
    category: "science-advisory",
    priority: 3,
    fit: "Venezuelan academic ecology network",
    offer: "Invite for advisory committee / Ucaima Field Report reviewer network.",
    officialSite: "https://svecologia.org",
    orgLinkedIn: null,
    emails: [],
    phones: [],
    notes: "Contact information and personal LinkedIn need deeper verification.",
    contacts: [],
  },
  {
    org: "Sociedad Venezolana de Espeleologia",
    category: "science-advisory",
    priority: 2,
    fit: "Caves, tepuis, geology, Brewer-Carias/La Venta adjacency",
    offer: "Invite if expedition program includes caves/geology/tepui research.",
    officialSite: "https://sve-espeleologia.org.ve",
    orgLinkedIn: null,
    emails: [],
    phones: [],
    notes: "Relevant for tepui cave science; contacts need verification.",
    contacts: [],
  },
  {
    org: "Fundacion Tierra Viva",
    category: "venezuelan-legitimacy",
    priority: 2,
    fit: "Sustainable development and community programming",
    offer: "Invite as responsible tourism/community guardrails partner.",
    officialSite: "https://www.tierraviva.org",
    orgLinkedIn: "https://ve.linkedin.com/company/fundaci%C3%B3n-tierra-viva-venezuela",
    emails: ["info@tierraviva.org", "alejandro@tierraviva.org"],
    phones: ["+58 212-576-6242"],
    notes: "Good for responsible tourism and community framing.",
    contacts: [
      { name: "Alejandro Luy", title: "CEO / General Manager", linkedin: null, officialUrl: "https://www.tierraviva.org", status: "official-role-needs-linkedin" },
    ],
  },
  {
    org: "Wataniba",
    category: "venezuelan-legitimacy",
    priority: 2,
    fit: "Amazonia socio-environmental lens and Indigenous/community ethics",
    offer: "Invite as ethics/advisory partner if Indigenous/community interface is involved.",
    officialSite: "https://watanibasocioambiental.org",
    orgLinkedIn: "https://ve.linkedin.com/in/watanibasocioambiental",
    emails: ["convocatorias@watanibasocioambiental.org"],
    phones: [],
    notes: "Use carefully: consult, do not tokenize. Personal LinkedIn contacts need verification.",
    contacts: [],
  },
  {
    org: "Phynatura",
    category: "venezuelan-legitimacy",
    priority: 3,
    fit: "Biodiversity/community org in Bolivar",
    offer: "Potential local partner; verify contact and current activity first.",
    officialSite: null,
    orgLinkedIn: null,
    emails: [],
    phones: [],
    notes: "Needs deeper verification before outreach.",
    contacts: [],
  },
  {
    org: "La Venta Esplorazioni Geografiche",
    category: "flagship-credibility",
    priority: 1,
    fit: "Tepui cave science and Venezuela expedition credibility",
    offer: "Pitch as flagship exploration/science credibility partner, possibly with Francesco Sauro and Charles Brewer-Carias angle.",
    officialSite: "https://www.laventa.it",
    orgLinkedIn: "https://it.linkedin.com/company/laventaesplorazioni",
    emails: [],
    phones: [],
    notes: "Very relevant if Ucaima wants real tepui/geology/cave science credibility.",
    contacts: [
      { name: "Francesco Sauro", title: "Tepui cave scientist / explorer", linkedin: "https://it.linkedin.com/in/francesco-sauro-0b2509a0", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Amazon Conservation Team",
    category: "science-advisory",
    priority: 2,
    fit: "Biocultural conservation and Indigenous partnership model",
    offer: "Ask for advice/partnership around biocultural stewardship and respectful field programming.",
    officialSite: "https://www.amazonteam.org",
    orgLinkedIn: "https://www.linkedin.com/company/amazon-conservation-team",
    emails: ["info@amazonteam.org"],
    phones: ["+1 703-522-4684"],
    notes: "More philosophical/guardrails partner than immediate room-night buyer.",
    contacts: [
      { name: "Liliana Madrigal", title: "ACT leadership", linkedin: null, officialUrl: "https://www.amazonteam.org/contact/", status: "official-role-needs-linkedin" },
    ],
  },
  {
    org: "Conservation International",
    category: "funder",
    priority: 3,
    fit: "Large NGO, Americas network, biodiversity credibility",
    offer: "Approach once local partners and Ucaima Field Base concept are packaged.",
    officialSite: "https://www.conservation.org",
    orgLinkedIn: "https://www.linkedin.com/company/conservation-international",
    emails: [],
    phones: [],
    notes: "Large NGO; do not pitch as first buyer.",
    contacts: [
      { name: "Rachel Biderman", title: "SVP Americas", linkedin: "https://br.linkedin.com/in/rachel-biderman-2186aa38", officialUrl: "https://www.conservation.org/about/our-people/senior-staff", status: "linkedin-confirmed" },
      { name: "Kelvin Alie", title: "CI leadership contact surfaced", linkedin: null, officialUrl: "https://www.conservation.org/about/our-people/senior-staff", status: "official-bio" },
    ],
  },
  {
    org: "WCS Andes-Amazon-Orinoco",
    category: "science-advisory",
    priority: 2,
    fit: "Regional Amazon-Orinoco science/technical ally",
    offer: "Ask for technical advice around regional biodiversity monitoring and conservation safeguards.",
    officialSite: "https://colombia.wcs.org",
    orgLinkedIn: "https://www.linkedin.com/company/wildlife-conservation-society",
    emails: ["rramirezdelgado@wcs.org", "jparra@wcs.org"],
    phones: [],
    notes: "Regional, not Venezuela-specific, but useful science network.",
    contacts: [
      { name: "Rocio Ramirez Delgado", title: "WCS Colombia / regional contact", linkedin: null, officialUrl: "https://colombia.wcs.org/en-us/WCS-Colombia/Staff.aspx", status: "official-directory" },
      { name: "Jorge Enrique Parra Bastos", title: "WCS Colombia / regional contact", linkedin: null, officialUrl: "https://colombia.wcs.org/en-us/WCS-Colombia/Staff.aspx", status: "official-directory" },
    ],
  },
  {
    org: "Rainforest Trust",
    category: "funder",
    priority: 3,
    fit: "Potential protected-area funding/network",
    offer: "Only approach with a local NGO/protected-area conservation angle.",
    officialSite: "https://www.rainforesttrust.org",
    orgLinkedIn: "https://www.linkedin.com/company/rainforesttrust",
    emails: [],
    phones: [],
    notes: "Funder/network, not direct occupancy buyer.",
    contacts: [],
  },
  {
    org: "Andes Amazon Fund",
    category: "funder",
    priority: 3,
    fit: "Protected areas and Andes-Amazon conservation funding",
    offer: "Potential funder/network if attached to a local conservation partner.",
    officialSite: "https://www.andesamazonfund.org",
    orgLinkedIn: "https://www.linkedin.com/company/andes-amazon-fund",
    emails: ["info@andesamazonfund.org"],
    phones: [],
    notes: "Funding/network only; not direct occupancy.",
    contacts: [
      { name: "Megan MacDowell", title: "AAF team", linkedin: null, officialUrl: "https://www.andesamazonfund.org/about/team/", status: "official-bio" },
      { name: "Enrique Ortiz", title: "AAF team", linkedin: null, officialUrl: "https://www.andesamazonfund.org/about/team/", status: "official-bio" },
      { name: "Peter Oesterling", title: "AAF team", linkedin: null, officialUrl: "https://www.andesamazonfund.org/about/team/", status: "official-bio" },
    ],
  },
  {
    org: "Field Guides Birding Tours",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "Private birding and specialist naturalist groups",
    offer: "Pitch a quiet Canaima specialist birding/naturalist itinerary based at Ucaima.",
    officialSite: "https://fieldguides.com",
    orgLinkedIn: "https://www.linkedin.com/company/field-guides",
    emails: ["fieldguides@fieldguides.com"],
    phones: ["800-728-4953"],
    notes: "Direct buyer for high-intent nature travelers; individual LinkedIn pass still needed.",
    contacts: [],
  },
  {
    org: "Victor Emanuel Nature Tours",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "High-end birding/nature tours",
    offer: "Pitch a quiet, serious Canaima departure with birding and conservation framing.",
    officialSite: "https://ventbird.com",
    orgLinkedIn: null,
    emails: ["info@ventbird.com"],
    phones: ["512-328-5221"],
    notes: "Strong buyer type. Need individual LinkedIn pass.",
    contacts: [],
  },
  {
    org: "Tropical Birding",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "Birding and photography tours",
    offer: "Pitch Canaima/Ucaima as a premium birding/photo extension or exploratory departure.",
    officialSite: "https://www.tropicalbirding.com",
    orgLinkedIn: "https://www.linkedin.com/company/tropical-birding",
    emails: ["info@tropicalbirding.com", "phototours@tropicalbirding.com"],
    phones: ["800-348-5941"],
    notes: "Strong buyer type. Need individual LinkedIn pass.",
    contacts: [],
  },
  {
    org: "Rockjumper Birding Tours",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "Global birding company with South America operations",
    offer: "Pitch a serious birding/naturalist Canaima trip with Ucaima as the quiet field base.",
    officialSite: "https://www.rockjumperbirding.com",
    orgLinkedIn: "https://www.linkedin.com/company/rockjumper-birding-tours",
    emails: ["info@rockjumper.com"],
    phones: ["1-888-990-5552"],
    notes: "Strong commercial fit.",
    contacts: [
      { name: "Tarryne Dickerson", title: "Rockjumper contact surfaced", linkedin: "https://za.linkedin.com/in/tarryne-dickerson-4a3a7130", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Clayton Burne", title: "Rockjumper contact surfaced", linkedin: "https://za.linkedin.com/in/clayton-burne-a1b50811b", officialUrl: null, status: "linkedin-confirmed" },
      { name: "George Armistead", title: "Rockjumper contact surfaced", linkedin: "https://www.linkedin.com/in/george-armistead-0a40ba24", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Wildside Nature Tours",
    category: "naturalist-travel-buyer",
    priority: 2,
    fit: "Birding/photo workshops and ethical nature tours",
    offer: "Pitch a small-group photo/nature Ucaima exploratory departure.",
    officialSite: "https://wildsidenaturetours.com",
    orgLinkedIn: null,
    emails: ["info@WildsideNatureTours.com"],
    phones: ["888-875-9453"],
    notes: "Need individual LinkedIn pass.",
    contacts: [],
  },
  {
    org: "Holbrook Travel",
    category: "field-course-buyer",
    priority: 1,
    fit: "Educational travel, citizen science, birding, student groups",
    offer: "Pitch Ucaima as an educational/naturalist group base with measurable field and conservation outcomes.",
    officialSite: "https://www.holbrooktravel.com",
    orgLinkedIn: "https://www.linkedin.com/company/holbrook-travel",
    emails: ["travel@holbrooktravel.com", "andrea@holbrooktravel.com"],
    phones: [],
    notes: "Very strong commercial fit; needs second LinkedIn profile.",
    contacts: [
      { name: "Andrea Holbrook", title: "CEO", linkedin: "https://www.linkedin.com/in/andrea-holbrook-53a3357", officialUrl: "https://www.holbrooktravel.com/about-us/meet-our-staff", status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Cheesemans' Ecology Safaris",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "Premium ecology and wildlife travelers",
    offer: "Pitch a small high-margin naturalist/science patron departure at Ucaima.",
    officialSite: "https://cheesemans.com",
    orgLinkedIn: "https://www.linkedin.com/company/cheesemans-ecology-safaris",
    emails: ["info@cheesemans.com"],
    phones: ["800-527-5330"],
    notes: "Strong premium naturalist buyer.",
    contacts: [
      { name: "Adam Walter", title: "Cheesemans contact surfaced", linkedin: "https://www.linkedin.com/in/adamcavedowalter", officialUrl: null, status: "linkedin-confirmed" },
      { name: "Krista Hanni", title: "Cheesemans contact surfaced", linkedin: "https://www.linkedin.com/in/krista-hanni-83729bb", officialUrl: null, status: "linkedin-confirmed" },
    ],
  },
  {
    org: "Naturetrek",
    category: "naturalist-travel-buyer",
    priority: 1,
    fit: "Large wildlife holiday operator",
    offer: "Pitch a UK-channel quiet Canaima wildlife/nature itinerary once ground logistics and safety are packaged.",
    officialSite: "https://www.naturetrek.co.uk",
    orgLinkedIn: "https://www.linkedin.com/company/naturetrek",
    emails: [],
    phones: ["+44 1962 733051"],
    notes: "Strong channel but individual LinkedIn pass still needed.",
    contacts: [],
  },
  {
    org: "Adventure Travel Trade Association",
    category: "standards-network",
    priority: 3,
    fit: "Adventure travel trade distribution and networking",
    offer: "Use for visibility, network, and trade connections after Ucaima package is concrete.",
    officialSite: "https://www.adventuretravel.biz",
    orgLinkedIn: "https://www.linkedin.com/company/adventure-travel-trade-association",
    emails: [],
    phones: [],
    notes: "Not direct buyer; distribution and trade network.",
    contacts: [],
  },
  {
    org: "Global Sustainable Tourism Council",
    category: "standards-network",
    priority: 3,
    fit: "Sustainable tourism standards and certification framing",
    offer: "Use for standards language and credibility, not immediate sales.",
    officialSite: "https://www.gstc.org",
    orgLinkedIn: "https://www.linkedin.com/company/gstc",
    emails: [],
    phones: [],
    notes: "Standards/network only.",
    contacts: [],
  },
  {
    org: "Center for Responsible Travel / CREST",
    category: "standards-network",
    priority: 3,
    fit: "Responsible tourism credibility and research",
    offer: "Use materials/network for anti-overcrowding and responsible tourism positioning.",
    officialSite: "https://www.responsibletravel.org",
    orgLinkedIn: "https://www.linkedin.com/company/center-for-responsible-travel",
    emails: ["staff@responsibletravel.org"],
    phones: ["+1 202-347-9203"],
    notes: "Appears to be winding down; verify before outreach.",
    contacts: [],
  },
  {
    org: "Transformational Travel Council",
    category: "standards-network",
    priority: 3,
    fit: "Quiet, intentional travel positioning",
    offer: "Use for language and possible aligned travel community, not first revenue.",
    officialSite: "https://www.transformational.travel",
    orgLinkedIn: "https://www.linkedin.com/company/the-transformational-travel-council",
    emails: [],
    phones: [],
    notes: "Useful for non-party, meaning-oriented travel framing.",
    contacts: [],
  },
  {
    org: "Rufford Foundation",
    category: "funder",
    priority: 3,
    fit: "Small conservation grants",
    offer: "Use only with Venezuelan/local researcher partner; not hotel funding.",
    officialSite: "https://www.rufford.org",
    orgLinkedIn: "https://www.linkedin.com/company/the-rufford-foundation",
    emails: [],
    phones: [],
    notes: "Grant path for conservation work/fellowships.",
    contacts: [],
  },
  {
    org: "Mohamed bin Zayed Species Conservation Fund",
    category: "funder",
    priority: 3,
    fit: "Species-specific conservation grants",
    offer: "Tie only to a species/endemic tepui biodiversity project through a scientist/NGO.",
    officialSite: "https://www.speciesconservation.org",
    orgLinkedIn: "https://www.linkedin.com/company/mbz-species-conservation-fund",
    emails: ["enquiries@mbzf.org"],
    phones: ["+971 2 632 9117"],
    notes: "Funding path, not direct occupancy.",
    contacts: [],
  },
  {
    org: "Whitley Fund for Nature",
    category: "funder",
    priority: 3,
    fit: "Conservation leader funding",
    offer: "Use if a Venezuelan conservation lead fronts the application/program.",
    officialSite: "https://whitleyaward.org",
    orgLinkedIn: "https://www.linkedin.com/company/whitley-fund-for-nature",
    emails: ["info@whitleyaward.org"],
    phones: ["+44 20 7221 9752"],
    notes: "Not a direct hotel partner; fund conservation leadership.",
    contacts: [],
  },
  {
    org: "Conservation Leadership Programme",
    category: "funder",
    priority: 3,
    fit: "Young conservationist team grants",
    offer: "Use for Venezuelan student/scientist fellowships attached to Ucaima Field Base.",
    officialSite: "https://www.conservationleadershipprogramme.org",
    orgLinkedIn: "https://www.linkedin.com/company/conservation-leadership-programme",
    emails: [],
    phones: [],
    notes: "Potential fellowships/grants, not direct occupancy.",
    contacts: [],
  },
  {
    org: "Charles Brewer-Carias Expedition Series",
    category: "flagship-credibility",
    priority: 1,
    fit: "To be confirmed flagship expedition/salon concept",
    offer: "Subject to confirmation: explore Charles Brewer-Carias-led or inspired Ucaima expedition journeys, explorer salons, patron trips, and Venezuelan youth explorer fellowship.",
    officialSite: null,
    orgLinkedIn: null,
    emails: [],
    phones: [],
    notes: "Do not present as committed. Use only as a to-confirm flagship option dependent on interest, availability, permissions, and structure.",
    contacts: [
      { name: "Charles Brewer-Carias", title: "Explorer / naturalist; potential flagship expedition collaborator to confirm", linkedin: null, officialUrl: null, status: "to-confirm" },
    ],
  },
];

const installationChecklist = `# Ucaima Field Base - Installation Checklist

Position this as a field science basecamp, not a full laboratory on day one.

## Non-negotiable basecamp installations

1. Reliable power
- Solar plus battery backup.
- Dedicated charging wall for laptops, cameras, GPS, radios, drones, camera traps.
- Surge protection and labeled outlets.
- 24-hour charging capacity for research groups.

2. Reliable internet and comms
- Starlink or equivalent.
- Backup satellite phone.
- VHF/UHF radios for local excursions.
- Emergency contact board with evacuation chain.
- Daily check-in/check-out protocol for field teams.

3. Field classroom / workroom
- 12-24 person classroom.
- Tables, whiteboard, projector/screen, map wall.
- Lockable cabinets.
- Small science library: Canaima ecology, tepuis, geology, birds, plants, Indigenous history, conservation.
- Evening lecture setup for visiting researchers.

4. Basic field lab / sample prep room
- Clean benches.
- Sink with filtered water.
- Microscope and stereo microscope.
- Sample drying rack.
- Label printer / QR code system.
- Lockable sample cabinet.
- Small fridge/freezer for permitted non-hazardous samples.
- PPE: gloves, goggles, lab coats, masks.
- Chemical and biohazard storage policy.

5. Gear room
- Lockable, dry, ventilated storage.
- Shelves for camera gear, packs, field kits.
- Charging lockers.
- Boot racks.
- Waterproof bins.
- Dehumidifier or drying fans if possible.

6. Drying and decontamination area
- Boot wash station.
- Gear drying racks.
- Disinfection station for boots, nets, waders, tripods, camera traps.
- Especially important for amphibian/reptile pathogen transfer prevention.

7. Field equipment library
- Binoculars, headlamps, GPS units, tablets with offline maps.
- Weather station, camera traps, acoustic recorders.
- Water quality test kits.
- Measuring tapes, calipers, compasses.
- Field notebooks / waterproof paper.
- First-aid field kits.

8. Mapped trail / site system
- Geo-referenced trails.
- Numbered observation points.
- Habitat zones, birding points, river/water monitoring points.
- No-go sacred/ecologically sensitive areas clearly defined.
- Basic trail signage that does not over-commercialize the place.

9. Safety / medical installation
- Dedicated first-aid room or station.
- Trauma kit, snakebite protocol, heat/dehydration protocol.
- Evacuation plan by boat/air/vehicle.
- Emergency oxygen if feasible.
- Incident log.
- Staff trained in wilderness first aid.

10. Data and reporting system
- Shared digital archive.
- Guest/researcher project intake form.
- Species observation database.
- Camera trap / acoustic data storage.
- Annual Ucaima Field Report.
- Dashboard: groups hosted, nights, research themes, student fellows, equipment funded.

## Credibility layer
- Named Science Coordinator or Field Base Coordinator.
- Visiting researcher code of conduct.
- Permit checklist.
- Sample collection policy.
- Indigenous/community consultation protocol.
- Conservation ethics policy.
- Visitor carrying-capacity rules.
- Quiet hours and low-impact conduct rules.
- Waste management for batteries, sharps, chemicals, plastics, and biological material.

## Premium layer, only after basics work
- eDNA kit.
- Drone mapping station with permits.
- Observation platform.
- Permanent weather station with public data feed.
- Acoustic monitoring network.
- Camera trap grid.
- Plant drying cabinet.
- Water-quality monitoring station.
- Fellowship room for Venezuelan students/researchers.
- Explorer Salon for talks, archive displays, and donor/member events.
`;

const membershipStructure = `# Ucaima Field Base - Founding Member Circle

Positioning:

We are helping Ucaima become Canaima's most serious base for responsible science, conservation, exploration, and quiet nature travel. We are inviting a small group of founding organizations to help build that capacity now in exchange for future field access, room-night credits, priority booking, and visible impact.

Do not call this an investment, loan, security, or timeshare without legal review. Call it prepaid field access plus infrastructure sponsorship plus founding member benefits.

## Core mechanic

1. Future Stay Credits
Members receive a bank of future nights they can use for field courses, research stays, scout trips, donor trips, naturalist departures, staff retreats, or student fellowships.

2. Field Base Contribution
A portion funds infrastructure: internet, solar-backed charging, workroom/classroom, gear storage, field kits, binoculars, camera traps, weather station, water testing, first-aid/safety protocols.

3. Founding Member Access
Priority quiet-season booking, annual field report, advisory invitations, partner recognition, and first access to new Ucaima science/nature programming.

## Suggested tiers

Founding Advisor: $3k-$5k/year
- 6-10 field nights.
- Best for Venezuelan NGOs, small science orgs, advisors.
- Recognition, annual report, 2-person downtime visit, partner rate, ability to nominate student/researcher stays.

Field Partner: $10k-$15k/year
- 25-40 field nights.
- Best for universities, field schools, birding/science groups.
- Priority shoulder-season access, field workspace use, itinerary support, pilot group planning session, discounted extra nights.

Expedition Partner: $25k-$40k/year
- 75-120 field nights over 3 years.
- Best for OpWall, SFS, Holbrook, NatHab, Cheesemans, Rockjumper.
- Reserved future group block, co-designed expedition/course, scout trip for 2-4 people, equipment sponsorship visibility, annual impact dashboard.

Anchor Partner: $75k-$150k over 3 years
- 250-500 field nights.
- Best for major university consortiums, foundations, NatGeo-style funders, premium operators.
- Named field-base component, annual reserved departure, advisory council seat, fellowships for Venezuelan students/guides, co-branded field report/event.

Legacy Patron: custom, $150k+
- Major infrastructure package, named fellowship, annual patron expedition, multi-year conservation/science program.

## Credit rules

- A field night means one person, one night at Ucaima with lodging, meals, and base services.
- Boats, flights, permits, specialist guides, research permits, and premium excursions quoted separately.
- Credits usable over 24-36 months.
- Best redemption during downtime / shoulder periods agreed with Ucaima.
- Peak dates subject to availability and possible surcharge.
- Credits transferable inside the member organization.
- Unused credits can convert into sponsored stays for Venezuelan students, researchers, guides, or conservation fellows.
- Credits are not equity, ownership, or refundable investment capital.
- Ucaima keeps final approval over dates, group size, permits, and cultural/environmental protocols.

## Pitch line

We are not asking you to sponsor a hotel. We are inviting you to become a founding member of a field base that can help protect the future of responsible exploration in Canaima.
`;

function prospectSummaryMarkdown() {
  const groups = new Map();
  for (const p of prospects) {
    if (!groups.has(p.category)) groups.set(p.category, []);
    groups.get(p.category).push(p);
  }

  const lines = [
    "# Ucaima Transformation - Prospect Pipeline",
    "",
    "This pipeline is organized by buyer/partner type so outreach can be sequenced by likelihood of direct impact.",
    "",
    "Best first-wave targets: Operation Wallacea, School for Field Studies, Round River, Wildlands Studies, Holbrook Travel, Natural Habitat Adventures, Cheesemans, Rockjumper, Fundacion Manoa, Provita, SOS Orinoco, ACOANA, Audubon Venezuela.",
    "",
  ];

  for (const [category, rows] of groups) {
    lines.push(`## ${category}`);
    for (const p of rows.sort((a, b) => a.priority - b.priority || a.org.localeCompare(b.org))) {
      const linkedinCount = p.contacts.filter((c) => c.linkedin).length;
      lines.push(`- ${p.org} | P${p.priority} | ${p.fit}`);
      lines.push(`  - Offer: ${p.offer}`);
      lines.push(`  - Site: ${p.officialSite ?? "TBD"}`);
      lines.push(`  - Org LinkedIn: ${p.orgLinkedIn ?? "TBD"}`);
      lines.push(`  - Email: ${p.emails.length ? p.emails.join(", ") : "TBD"}`);
      lines.push(`  - Phone: ${p.phones.length ? p.phones.join(", ") : "TBD"}`);
      lines.push(`  - Personal LinkedIn count: ${linkedinCount}`);
      if (p.contacts.length) {
        lines.push("  - People:");
        for (const c of p.contacts) {
          lines.push(`    - ${c.name} - ${c.title}${c.linkedin ? ` - ${c.linkedin}` : ""} (${c.status})`);
        }
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const outreachPlan = `# Ucaima Transformation - CRM Outreach Plan

## CRM structure

- Parent portfolio project: VAV - Vamos a Venezuela.
- Child project: Ucaima Transformation.
- Org contacts are stored as type=org.
- People are stored as type=person, organization=<org name>, primary_org_id=<org contact id>.
- Official websites, LinkedIn URLs, and public contact pages are stored as domain channels.
- Emails and phones are stored as email/phone channels.
- Project links include the membership structure, installation checklist, and prospect pipeline.
- Research notes are stored as manual touches linked to the Ucaima Transformation project.

## First outreach waves

Wave 1 - direct occupancy buyers:
Operation Wallacea, School for Field Studies, Round River, Wildlands Studies, Holbrook Travel, Natural Habitat Adventures, Cheesemans, Rockjumper, Field Guides, Tropical Birding.

Wave 2 - Venezuelan legitimacy:
Fundacion Manoa, Provita, SOS Orinoco, ACOANA, Audubon Venezuela, Phelps, Tierra Viva, Wataniba.

Wave 3 - science/exploration credibility:
La Venta, Explorers Club, Royal Geographical Society, National Geographic Society, Re:wild, Adventure Scientists.

Wave 4 - funders and standards:
Rufford, MBZ Species Conservation Fund, Whitley Fund for Nature, Conservation Leadership Programme, Andes Amazon Fund, Rainforest Trust, GSTC, ATTA.

## First asks

For field-course buyers:
"Would you be open to a 30-minute discussion about whether Ucaima could become a future Canaima field-course base? We are creating founding member access with future room-night credits and would like your input before we finalize the field-base requirements."

For naturalist travel buyers:
"We are helping Ucaima build the quiet, serious, science-aligned Canaima experience before the destination gets over-commercialized. Would you consider a scout visit or founding expedition block?"

For Venezuelan partners:
"We want this to be locally grounded and scientifically serious. Would you be open to advising the Ucaima Field Base concept so it protects Canaima and does not become another extractive tourism product?"

For flagship/funders:
"We are assembling a small founding circle to help Ucaima become a responsible field base for Canaima. The first phase funds field infrastructure, student/researcher access, and an annual field report."
`;

function nowIso() {
  return new Date().toISOString();
}

async function tableExists(tx, name) {
  const [row] = await tx`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    ) as exists
  `;
  return row.exists;
}

async function firstUserForWorkspace(tx) {
  const [member] = await tx`
    select wm.user_id
    from workspace_members wm
    join users u on u.id = wm.user_id
    where wm.workspace_id = ${WORKSPACE_ID}
    order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.created_at asc
    limit 1
  `;
  if (!member) throw new Error(`No user found for workspace ${WORKSPACE_ID}`);
  return member.user_id;
}

async function firstStage(tx) {
  const [stage] = await tx`
    select id from pipeline_stages
    where template_id = 'bd-courtship'
    order by "order" asc
    limit 1
  `;
  return stage?.id ?? null;
}

async function findProjectByTitle(tx, title) {
  const [row] = await tx`
    select id from projects
    where workspace_id = ${WORKSPACE_ID} and title = ${title}
    limit 1
  `;
  return row?.id ?? null;
}

async function ensureUcaimaProject(tx, actorId) {
  const vavId =
    (await findProjectByTitle(tx, ALT_VAV_PROJECT_TITLE)) ??
    (await findProjectByTitle(tx, VAV_PROJECT_TITLE));
  const currentStageId = await firstStage(tx);
  const existing = await findProjectByTitle(tx, UCAIMA_PROJECT_TITLE);
  const summary =
    "Transform Campamento Ucaima into Canaima's serious base for responsible science, conservation, exploration, education, and quiet nature travel. Direct impact pillars: infrastructure, operations, and mission-aligned occupancy.";
  const objectives = [
    "Create Ucaima Field Base installation plan and budget.",
    "Launch Founding Member Circle with future field-night credits.",
    "Build pipeline of field-course buyers, naturalist operators, Venezuelan legitimacy partners, and flagship science/funding partners.",
    "Use CaneyCloud, CaneyLearn, and VAV to improve operations, language readiness, demand capture, and direct bookings.",
  ];
  const objectivesJson = sql.json(objectives);

  if (existing) {
    await tx`
      update projects
      set status = 'active',
          template_id = coalesce(template_id, 'bd-courtship'),
          current_stage_id = coalesce(current_stage_id, ${currentStageId}),
          parent_project_id = coalesce(parent_project_id, ${vavId}),
          tagline = 'Ucaima Field Base for science, conservation, exploration, and quiet nature travel',
          summary = ${summary},
          status_text = 'Research pipeline and founding member structure being organized',
          objectives = ${objectivesJson},
          updated_at = now()
      where id = ${existing}
    `;
    return existing;
  }

  const [inserted] = await tx`
    insert into projects (
      workspace_id, title, status, template_id, current_stage_id, created_by,
      health_color, parent_project_id, tagline, summary, status_text, objectives
    )
    values (
      ${WORKSPACE_ID}, ${UCAIMA_PROJECT_TITLE}, 'active', 'bd-courtship', ${currentStageId}, ${actorId},
      'green', ${vavId}, 'Ucaima Field Base for science, conservation, exploration, and quiet nature travel',
      ${summary}, 'Research pipeline and founding member structure being organized',
      ${objectivesJson}
    )
    returning id
  `;
  return inserted.id;
}

async function ensureTag(tx, tag) {
  await tx`
    insert into tags (name, kind, color)
    values (${tag.name}, ${tag.kind}, ${tag.color})
    on conflict (name) do update set color = excluded.color
  `;
  const [row] = await tx`select id from tags where name = ${tag.name} limit 1`;
  return row.id;
}

async function ensureContact(tx, actorId, input) {
  const [existing] = await tx`
    select id from contacts
    where workspace_id = ${WORKSPACE_ID}
      and lower(name) = lower(${input.name})
      and type = ${input.type}
    limit 1
  `;

  const values = {
    organization: input.organization ?? null,
    primaryOrgId: input.primaryOrgId ?? null,
    relationshipType: input.relationshipType ?? "prospect",
    intro: input.introChainFromText ?? null,
  };

  if (existing) {
    await tx`
      update contacts
      set organization = ${values.organization},
          primary_org_id = coalesce(${values.primaryOrgId}, primary_org_id),
          relationship_type = ${values.relationshipType},
          intro_chain_from_text = ${values.intro},
          archived = false,
          updated_at = now()
      where id = ${existing.id}
    `;
    return existing.id;
  }

  const [inserted] = await tx`
    insert into contacts (
      workspace_id, name, type, organization, primary_org_id, relationship_type,
      created_by, intro_chain_from_text
    )
    values (
      ${WORKSPACE_ID}, ${input.name}, ${input.type}, ${values.organization},
      ${values.primaryOrgId}, ${values.relationshipType}, ${actorId}, ${values.intro}
    )
    returning id
  `;
  return inserted.id;
}

async function ensureChannel(tx, contactId, kind, value, isPrimary = false) {
  if (!value) return;
  const clean = value.trim();
  if (!clean) return;
  const [existing] = await tx`
    select id from contact_channels
    where contact_id = ${contactId} and kind = ${kind} and value = ${clean}
    limit 1
  `;
  if (!existing) {
    await tx`
      insert into contact_channels (contact_id, kind, value, is_primary)
      values (${contactId}, ${kind}, ${clean}, ${isPrimary})
    `;
  }
}

async function tagContact(tx, contactId, tagId) {
  await tx`
    insert into contact_tags (contact_id, tag_id)
    values (${contactId}, ${tagId})
    on conflict do nothing
  `;
}

async function linkContactToProject(tx, projectId, contactId, role) {
  await tx`
    insert into project_contacts (project_id, contact_id, role)
    values (${projectId}, ${contactId}, ${role})
    on conflict (project_id, contact_id) do update set role = excluded.role
  `;
}

async function ensureTouch(tx, actorId, projectId, contactId, marker, body) {
  const prefix = `[UCAIMA:${marker}]`;
  const [existing] = await tx`
    select id from touches
    where workspace_id = ${WORKSPACE_ID}
      and project_id = ${projectId}
      and contact_id = ${contactId}
      and body like ${prefix + "%"}
    limit 1
  `;
  const fullBody = `${prefix}\n${body}`;
  if (existing) {
    await tx`update touches set body = ${fullBody} where id = ${existing.id}`;
  } else {
    await tx`
      insert into touches (workspace_id, contact_id, project_id, channel, body, created_by)
      values (${WORKSPACE_ID}, ${contactId}, ${projectId}, 'manual', ${fullBody}, ${actorId})
    `;
  }
  await tx`update contacts set last_touch_at = now(), updated_at = now() where id = ${contactId}`;
}

async function ensureProjectDoc(tx, actorId, projectId, label, category, text, description) {
  const [existing] = await tx`
    select id from project_links
    where workspace_id = ${WORKSPACE_ID}
      and project_id = ${projectId}
      and label = ${label}
    limit 1
  `;
  let linkId = existing?.id;
  if (linkId) {
    await tx`
      update project_links
      set kind = 'doc',
          category = ${category},
          description = ${description},
          updated_at = now(),
          updated_by = ${actorId}
      where id = ${linkId}
    `;
  } else {
    const [{ next_order }] = await tx`
      select coalesce(max(sort_order), -1) + 1 as next_order
      from project_links
      where project_id = ${projectId} and category = ${category}
    `;
    const [inserted] = await tx`
      insert into project_links (
        workspace_id, project_id, kind, category, label, description,
        sort_order, created_by, updated_at, updated_by
      )
      values (
        ${WORKSPACE_ID}, ${projectId}, 'doc', ${category}, ${label}, ${description},
        ${next_order}, ${actorId}, now(), ${actorId}
      )
      returning id
    `;
    linkId = inserted.id;
  }

  await tx`
    insert into project_doc_contents (link_id, workspace_id, text, updated_at, updated_by)
    values (${linkId}, ${WORKSPACE_ID}, ${text}, now(), ${actorId})
    on conflict (link_id) do update
      set text = excluded.text,
          updated_at = now(),
          updated_by = ${actorId}
  `;
}

async function ensureMilestone(tx, actorId, projectId, title, dueDate, order) {
  const [existing] = await tx`
    select id from milestones
    where workspace_id = ${WORKSPACE_ID} and project_id = ${projectId} and title = ${title}
    limit 1
  `;
  if (existing) {
    await tx`
      update milestones
      set due_date = ${dueDate}, "order" = ${order}, priority = coalesce(priority, 'now')
      where id = ${existing.id}
    `;
    return;
  }
  await tx`
    insert into milestones (workspace_id, project_id, title, due_date, created_by, status, "order", priority)
    values (${WORKSPACE_ID}, ${projectId}, ${title}, ${dueDate}, ${actorId}, 'pending', ${order}, 'now')
  `;
}

function orgTouchBody(p) {
  const people = p.contacts.length
    ? p.contacts.map((c) => `- ${c.name}: ${c.title}${c.linkedin ? ` | LinkedIn: ${c.linkedin}` : ""} | status: ${c.status}`).join("\n")
    : "- No personal LinkedIn contacts confirmed yet.";

  return [
    `Org: ${p.org}`,
    `Category: ${p.category}`,
    `Priority: P${p.priority}`,
    `Fit: ${p.fit}`,
    `Founding member offer: ${p.offer}`,
    `Official site: ${p.officialSite ?? "TBD"}`,
    `Org LinkedIn: ${p.orgLinkedIn ?? "TBD"}`,
    `Emails: ${p.emails.length ? p.emails.join(", ") : "TBD"}`,
    `Phones: ${p.phones.length ? p.phones.join(", ") : "TBD"}`,
    `Notes: ${p.notes}`,
    "People:",
    people,
  ].join("\n");
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Check AGB-CRM/.env.local.");
  }

  if (!(await tableExists(sql, "projects"))) {
    throw new Error("Expected projects table not found.");
  }

  const actorId = await firstUserForWorkspace(sql);
  const projectId = await ensureUcaimaProject(sql, actorId);
  console.log(`Project ready: ${UCAIMA_PROJECT_TITLE} (${projectId})`);

  const tagIds = new Map();
  for (const tag of TAGS) {
    tagIds.set(tag.name, await ensureTag(sql, tag));
  }
  console.log(`Tags ready: ${TAGS.length}`);

  const orgIds = new Map();
  for (let i = 0; i < prospects.length; i++) {
    const p = prospects[i];
    console.log(`[${i + 1}/${prospects.length}] ${p.org}`);

    await sql.begin(async (tx) => {
      const orgId = await ensureContact(tx, actorId, {
        name: p.org === "Campamento Ucaima" ? "Ucaima" : p.org,
        type: "org",
        organization: p.org,
        relationshipType: p.category === "anchor-host" ? "partner" : "prospect",
        introChainFromText: `Ucaima Transformation prospect: ${p.fit}`,
      });
      orgIds.set(p.org, orgId);

      await ensureChannel(tx, orgId, "domain", p.officialSite, true);
      await ensureChannel(tx, orgId, "domain", p.orgLinkedIn, false);
      for (const email of p.emails) await ensureChannel(tx, orgId, "email", email, p.emails[0] === email);
      for (const phone of p.phones) await ensureChannel(tx, orgId, "phone", phone, p.phones[0] === phone);

      await tagContact(tx, orgId, tagIds.get("vav"));
      await tagContact(tx, orgId, tagIds.get("ucaima-transformation"));
      await tagContact(tx, orgId, tagIds.get("founding-member-prospect"));
      const specificTag = categoryTag[p.category];
      if (specificTag) await tagContact(tx, orgId, tagIds.get(specificTag));
      if (p.notes.toLowerCase().includes("verify") || p.contacts.some((c) => c.status.includes("verify"))) {
        await tagContact(tx, orgId, tagIds.get("to-verify"));
      }

      await linkContactToProject(tx, projectId, orgId, p.category === "anchor-host" ? "host" : `org:${p.category}`);
      await ensureTouch(tx, actorId, projectId, orgId, `org:${p.org}`, orgTouchBody(p));

      for (const c of p.contacts) {
        const personId = await ensureContact(tx, actorId, {
          name: c.name,
          type: "person",
          organization: p.org,
          primaryOrgId: orgId,
          relationshipType: "prospect",
          introChainFromText: `Relevant Ucaima Transformation contact at ${p.org}. ${c.status}.`,
        });
        await ensureChannel(tx, personId, "domain", c.linkedin, true);
        await ensureChannel(tx, personId, "domain", c.officialUrl, false);
        await tagContact(tx, personId, tagIds.get("vav"));
        await tagContact(tx, personId, tagIds.get("ucaima-transformation"));
        await tagContact(tx, personId, tagIds.get("founding-member-prospect"));
        const specificTag = categoryTag[p.category];
        if (specificTag) await tagContact(tx, personId, tagIds.get(specificTag));
        if (!c.linkedin || c.status.includes("verify") || c.status.includes("to-confirm")) {
          await tagContact(tx, personId, tagIds.get("to-verify"));
        }
        await linkContactToProject(tx, projectId, personId, `person:${p.category}`);
        await ensureTouch(
          tx,
          actorId,
          projectId,
          personId,
          `person:${p.org}:${c.name}`,
          [
            `Org: ${p.org}`,
            `Name: ${c.name}`,
            `Title/context: ${c.title}`,
            `LinkedIn: ${c.linkedin ?? "TBD"}`,
            `Official URL: ${c.officialUrl ?? "TBD"}`,
            `Verification status: ${c.status}`,
            `Pitch angle: ${p.offer}`,
          ].join("\n"),
        );
      }
    });
  }

  await ensureProjectDoc(
      sql,
      actorId,
      projectId,
      "Ucaima Founding Member Circle",
      "business",
      membershipStructure,
      "Membership tiers, future-night credits, credit rules, and pitch language.",
    );
    await ensureProjectDoc(
      sql,
      actorId,
      projectId,
      "Ucaima Science Basecamp Installation Checklist",
      "ops",
      installationChecklist,
      "Installations needed for Ucaima to function as a proper field science basecamp.",
    );
    await ensureProjectDoc(
      sql,
      actorId,
      projectId,
      "Ucaima Prospect Pipeline",
      "business",
      prospectSummaryMarkdown(),
      "All researched organizations, contacts, LinkedIn status, official contact channels, and pitch angles.",
    );
    await ensureProjectDoc(
      sql,
      actorId,
      projectId,
      "Ucaima Outreach Plan",
      "marketing",
      outreachPlan,
      "CRM structure and first outreach waves for Ucaima Transformation.",
    );

    const milestones = [
      ["Confirm Ucaima owner approval for Field Base concept", "2026-06-14"],
      ["Package founding member one-pager and tier sheet", "2026-06-16"],
      ["Validate installation budget and operating constraints with Ucaima", "2026-06-18"],
      ["Outreach wave 1 - field-course buyers", "2026-06-21"],
      ["Outreach wave 2 - naturalist travel buyers", "2026-06-24"],
      ["Outreach wave 3 - Venezuelan legitimacy partners", "2026-06-27"],
      ["Outreach wave 4 - flagship science and funders", "2026-07-01"],
      ["Design first downtime founding member site visit", "2026-07-05"],
    ];
    for (let i = 0; i < milestones.length; i++) {
      await ensureMilestone(sql, actorId, projectId, milestones[i][0], milestones[i][1], i + 1);
    }

    const [{ contact_count }] = await sql`
      select count(*)::int as contact_count
      from project_contacts
      where project_id = ${projectId}
    `;
    const [{ doc_count }] = await sql`
      select count(*)::int as doc_count
      from project_links
      where project_id = ${projectId}
    `;
    console.log(
      JSON.stringify(
        {
          ok: true,
          projectId,
          projectTitle: UCAIMA_PROJECT_TITLE,
          prospects: prospects.length,
          linkedContacts: contact_count,
          projectDocs: doc_count,
          importedAt: nowIso(),
        },
        null,
        2,
      ),
    );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
