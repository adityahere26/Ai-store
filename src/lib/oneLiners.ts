/**
 * One-liner suggestions from the creator's Instagram username (and, when the
 * profile is public, its name and bio).
 *
 * Deliberately deterministic, not an LLM call: it runs on every keystroke, costs
 * no quota, responds instantly and can't invent anything. If nothing niche-like
 * is found (e.g. "@riya.sharma"), we fall back to generic one-liners.
 */

type Mode = "sub" | "prefix" | "exact";

interface Niche {
  id: string;
  label: string;
  /** [keyword, how to match]. "sub" = anywhere (safe, long words); "prefix" = a word starts with it; "exact" = a whole word. */
  keys: [string, Mode][];
  lines: string[];
}

// Order matters: specific niches first (yoga before fitness, exam prep before teaching).
const NICHES: Niche[] = [
  {
    id: "exam",
    label: "exam prep",
    keys: [["upsc", "sub"], ["neet", "exact"], ["neetug", "sub"], ["neetpg", "sub"], ["neetprep", "sub"], ["jee", "exact"], ["ssc", "exact"], ["ias", "exact"], ["gate", "exact"], ["cat", "exact"], ["ca", "exact"], ["cma", "exact"], ["cs", "exact"], ["bankpo", "sub"], ["exam", "sub"], ["ielts", "sub"], ["clat", "sub"]],
    lines: [
      "I help students crack competitive exams with simple notes, strategy and daily practice",
      "I teach exam toppers' study methods in Hindi and English, made simple for first-time aspirants",
      "I share last-minute revision tips, PYQ solutions and mock-test strategy for serious aspirants",
    ],
  },
  {
    id: "yoga",
    label: "yoga",
    keys: [["yoga", "sub"], ["yogi", "exact"], ["asana", "sub"], ["pranayam", "sub"], ["meditat", "sub"], ["mindful", "sub"]],
    lines: [
      "I teach simple yoga routines for beginners that fit into a busy day, no experience needed",
      "I help working women fix back pain and stress with 15-minute yoga at home",
      "I share yoga, breathwork and meditation for a calmer mind and a stronger body",
    ],
  },
  {
    id: "nutrition",
    label: "nutrition",
    keys: [["diet", "sub"], ["nutri", "sub"], ["weightloss", "sub"], ["keto", "sub"], ["healthyeat", "sub"], ["protein", "sub"]],
    lines: [
      "I help people lose weight with simple Indian home food, no crash diets",
      "I'm a nutritionist sharing easy veg meal plans for weight loss and better energy",
      "I share high-protein Indian recipes and diet tips that actually fit family meals",
    ],
  },
  {
    id: "fitness",
    label: "fitness",
    keys: [["fitness", "sub"], ["fit", "exact"], ["fitwith", "sub"], ["fitlife", "sub"], ["fitmom", "sub"], ["fitfam", "sub"], ["fitgirl", "sub"], ["fitguy", "sub"], ["fitby", "sub"], ["fitindia", "sub"], ["getfit", "sub"], ["stayfit", "sub"], ["fitcoach", "sub"], ["gym", "prefix"], ["workout", "sub"], ["muscle", "sub"], ["strength", "sub"], ["hiit", "sub"], ["trainer", "sub"], ["lifting", "sub"], ["abs", "exact"], ["zumba", "sub"]],
    lines: [
      "I help busy people get fit at home with short workouts, no gym needed",
      "I'm a fitness coach sharing workout plans and diet tips for real, lasting results",
      "I help beginners build strength and lose fat with simple, science-backed training",
    ],
  },
  {
    id: "cooking",
    label: "cooking",
    keys: [["cook", "sub"], ["kitchen", "sub"], ["recipe", "sub"], ["chef", "sub"], ["food", "sub"], ["bake", "sub"], ["baking", "sub"], ["khana", "sub"], ["rasoi", "sub"], ["tiffin", "sub"], ["masala", "sub"], ["foodie", "sub"]],
    lines: [
      "I share quick, everyday Indian recipes anyone can cook at home in under 30 minutes",
      "I teach home baking and desserts step by step, no oven skills needed",
      "I help busy families plan healthy tiffin and dinner recipes for the whole week",
    ],
  },
  {
    id: "finance",
    label: "personal finance",
    keys: [["finance", "sub"], ["money", "sub"], ["invest", "sub"], ["stock", "sub"], ["trader", "sub"], ["trading", "sub"], ["mutualfund", "sub"], ["wealth", "sub"], ["paisa", "sub"], ["sip", "exact"], ["tax", "exact"], ["fintech", "sub"]],
    lines: [
      "I explain personal finance and investing in simple Hindi and English for first-time earners",
      "I help salaried people save tax, start SIPs and build wealth step by step",
      "I share stock market basics and smart money habits for beginners in India",
    ],
  },
  {
    id: "design",
    label: "design",
    keys: [["design", "sub"], ["figma", "sub"], ["ui", "exact"], ["ux", "exact"], ["uiux", "sub"], ["graphicdesign", "sub"], ["graphic", "exact"], ["graphics", "exact"], ["illustrat", "sub"], ["artist", "sub"], ["art", "exact"], ["sketch", "sub"], ["draw", "prefix"], ["canva", "sub"]],
    lines: [
      "I'm a designer sharing Figma tips and UI/UX lessons for beginners",
      "I teach drawing and illustration step by step, even if you can't draw a straight line",
      "I help students build a design portfolio and land their first freelance clients",
    ],
  },
  {
    id: "tech",
    label: "tech & coding",
    keys: [["code", "sub"], ["coding", "sub"], ["coder", "sub"], ["developer", "sub"], ["dev", "exact"], ["python", "sub"], ["java", "exact"], ["tech", "sub"], ["datascience", "sub"], ["ai", "exact"], ["program", "sub"]],
    lines: [
      "I teach coding from zero in simple language, for students and career switchers",
      "I share tech career tips, interview prep and projects that get you hired",
      "I explain AI and new tech tools in simple Hindi and English for everyday use",
    ],
  },
  {
    id: "beauty",
    label: "fashion & beauty",
    keys: [["fashion", "sub"], ["style", "sub"], ["styling", "sub"], ["makeup", "sub"], ["mua", "exact"], ["beauty", "sub"], ["skin", "sub"], ["skincare", "sub"], ["hair", "prefix"], ["nail", "prefix"], ["saree", "sub"], ["ootd", "sub"]],
    lines: [
      "I share affordable fashion and styling tips for everyday Indian outfits",
      "I teach easy makeup looks and skincare routines for Indian skin",
      "I help women find their personal style on a budget, from office wear to festive looks",
    ],
  },
  {
    id: "astrology",
    label: "astrology",
    keys: [["astro", "sub"], ["tarot", "sub"], ["jyotish", "sub"], ["numerolog", "sub"], ["vastu", "sub"], ["horoscope", "sub"], ["kundli", "sub"], ["zodiac", "sub"]],
    lines: [
      "I share Vedic astrology readings and daily horoscopes in simple language",
      "I help people understand their birth chart for career, money and relationships",
      "I offer tarot and numerology guidance for clarity in life's big decisions",
    ],
  },
  {
    id: "dance",
    label: "dance",
    keys: [["dance", "sub"], ["dancer", "sub"], ["choreo", "sub"], ["kathak", "sub"], ["bharatanatyam", "sub"], ["bollywood", "sub"]],
    lines: [
      "I teach Bollywood and wedding choreography step by step for beginners",
      "I'm a classical dancer teaching Kathak basics online for kids and adults",
      "I share easy dance routines anyone can learn at home and perform with confidence",
    ],
  },
  {
    id: "music",
    label: "music",
    keys: [["music", "sub"], ["singer", "sub"], ["singing", "sub"], ["vocal", "sub"], ["guitar", "sub"], ["piano", "sub"], ["tabla", "sub"], ["ukulele", "sub"], ["flute", "sub"]],
    lines: [
      "I teach singing and voice training for beginners, online and in Hindi",
      "I teach guitar from zero with simple Bollywood songs you'll love to play",
      "I share music lessons and practice routines that help you improve every week",
    ],
  },
  {
    id: "parenting",
    label: "parenting",
    keys: [["mom", "prefix"], ["mommy", "sub"], ["mumma", "sub"], ["mama", "exact"], ["parent", "sub"], ["baby", "sub"], ["kids", "sub"], ["toddler", "sub"]],
    lines: [
      "I share honest parenting tips and activities for toddlers and young kids",
      "I help new moms with baby care, routines and postpartum recovery",
      "I share easy learning activities and healthy recipes for kids at home",
    ],
  },
  {
    id: "english",
    label: "spoken English",
    keys: [["english", "sub"], ["spoken", "sub"], ["grammar", "sub"], ["vocab", "sub"], ["communication", "sub"]],
    lines: [
      "I help Hindi speakers speak fluent English with confidence in daily conversations",
      "I teach spoken English and interview skills for students and job seekers",
      "I share daily English vocabulary and grammar tips in simple Hindi",
    ],
  },
  {
    id: "teaching",
    label: "teaching",
    keys: [["teach", "sub"], ["teacher", "sub"], ["tutor", "sub"], ["classes", "sub"], ["academy", "sub"], ["learn", "sub"], ["study", "sub"], ["edu", "prefix"], ["maths", "sub"], ["math", "exact"], ["science", "sub"], ["physics", "sub"], ["chemistry", "sub"], ["biology", "sub"], ["sir", "exact"], ["maam", "sub"], ["school", "sub"]],
    lines: [
      "I teach school students maths and science in simple, easy-to-remember ways",
      "I'm a teacher sharing study tips and concept videos for board exam students",
      "I help students learn faster with short lessons, notes and doubt-solving sessions",
    ],
  },
  {
    id: "business",
    label: "business & marketing",
    keys: [["marketing", "sub"], ["business", "sub"], ["startup", "sub"], ["brand", "sub"], ["socialmedia", "sub"], ["growth", "sub"], ["sales", "sub"], ["entrepreneur", "sub"], ["freelanc", "sub"], ["seo", "exact"]],
    lines: [
      "I help small businesses grow on Instagram with simple marketing tips",
      "I share freelancing and side-income ideas for students and working professionals",
      "I teach personal branding and content strategy for new creators and founders",
    ],
  },
  {
    id: "travel",
    label: "travel",
    keys: [["travel", "sub"], ["trip", "exact"], ["trips", "exact"], ["wander", "sub"], ["backpack", "sub"], ["explore", "sub"], ["nomad", "sub"]],
    lines: [
      "I share budget travel guides and itineraries for India and abroad",
      "I help people plan affordable trips with hidden gems, stays and local food tips",
      "I share solo travel tips for women travelling across India safely",
    ],
  },
  {
    id: "wellness",
    label: "wellness & coaching",
    keys: [["therap", "sub"], ["mental", "sub"], ["coach", "sub"], ["wellness", "sub"], ["healing", "sub"], ["selfcare", "sub"], ["counsel", "sub"]],
    lines: [
      "I'm a life coach helping people build confidence, clarity and better habits",
      "I share mental wellness tips to manage stress and anxiety in everyday life",
      "I help young professionals find clarity in their career and personal growth",
    ],
  },
];

const GENERIC = [
  "I share what I know and help my followers learn it the easy way",
  "I'm a creator sharing tips, honest advice and my everyday learnings",
  "I help people with simple, practical advice from my own experience",
];

/** Split "fit_with.riya2024" into ["fit", "with", "riya"]; plain text into words. */
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-zऀ-ॿ]+/)
    .filter(Boolean);
}

function matches(text: string, [key, mode]: [string, Mode]): boolean {
  const flat = text.toLowerCase().replace(/[^a-z]/g, "");
  if (mode === "sub") return flat.includes(key);
  const words = tokens(text);
  if (mode === "exact") return words.includes(key);
  return words.some((w) => w.startsWith(key));
}

export interface OneLinerSuggestions {
  /** null = nothing niche-like found, generic suggestions. */
  niche: string | null;
  /** Where the niche was spotted, for the label ("username" or "Instagram bio"). */
  from: "username" | "profile" | null;
  lines: string[];
}

function detect(text: string): Niche | null {
  if (!text.trim()) return null;
  return NICHES.find((n) => n.keys.some((k) => matches(text, k))) ?? null;
}

function withFollowers(line: string, followers?: number): string {
  if (!followers || followers < 500) return line;
  const f = followers >= 1e6 ? `${(followers / 1e6).toFixed(1).replace(/\.0$/, "")}M` : followers >= 1e3 ? `${Math.round(followers / 1e3)}K` : String(followers);
  return `${line}. ${f} followers on Instagram`;
}

/**
 * Suggest one-liners for a handle. The username is checked first (the creator's
 * own words for their brand); if it is just a name, the public profile's name
 * and bio are checked next; otherwise generic lines.
 */
export function suggestOneLiners(handle: string, profile?: { fullName?: string; bio?: string; followers?: number }): OneLinerSuggestions {
  const h = handle.trim().replace(/^@+/, "");
  let niche = detect(h);
  let from: OneLinerSuggestions["from"] = niche ? "username" : null;
  if (!niche && profile) {
    niche = detect(`${profile.fullName ?? ""} ${profile.bio ?? ""}`);
    if (niche) from = "profile";
  }
  const base = niche ? niche.lines : GENERIC;
  return { niche: niche?.label ?? null, from, lines: base.map((l) => withFollowers(l, profile?.followers)) };
}
