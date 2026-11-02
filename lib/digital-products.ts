// Digital product catalog for the Zervia Next.js storefront.
// Copy is derived from the marketing listings in ~/workspace/zervia-listings/.
// All prices are in Canadian dollars (CAD).

export interface DigitalProductFaq {
  q: string;
  a: string;
}

export interface DigitalProduct {
  slug: string;
  title: string;
  tagline: string;
  description: string[];
  priceCad: number;
  priceNote?: string;
  compareAtCad?: number;
  category: 'Ebooks' | 'Fitness' | 'Beauty' | 'Trading' | 'Trades' | 'Professional' | 'Languages';
  cover: string;
  /**
   * Optional short preview clip for video courses (MP4 URL, ~1-2 min).
   * When set, customers can watch it in a preview modal before buying.
   * When unset on a course product, the UI shows "Preview coming soon".
   * Admin: paste a video URL here to enable previews for a product.
   */
  previewVideoUrl?: string;
  includes: string[];
  faq: DigitalProductFaq[];
  badge?: string;
}

/**
 * Categories that represent video courses/programs (as opposed to
 * ebooks or in-person services). Only these get preview UI.
 */
const COURSE_CATEGORIES: DigitalProduct['category'][] = [
  'Fitness',
  'Trading',
  'Trades',
  'Professional',
  'Languages',
];

export function isCourseProduct(p: DigitalProduct): boolean {
  return COURSE_CATEGORIES.includes(p.category);
}

export const DIGITAL_PRODUCTS: DigitalProduct[] = [
  {
    slug: 'ebooks',
    title: 'The Complete OFW Ebook Bundle',
    tagline: 'All three ebooks in one package — 55 pages to build your home, track every peso, and grow your savings.',
    description: [
      'Everything in one package. The OFW House Building Guide (13 pages) is written from years of real receipts, real contractor deals, and real mistakes — everything the author wishes someone had told her before she sent her first peso home: real phase-by-phase budget breakdowns, ten contractor red flags, a six-question contractor vetting interview, a thirteen-material price guide, a nine-permit checklist, the caretaker system for managing a build from abroad, and fifteen honest lessons distilled from the expensive education.',
      'The OFW Financial Freedom Bundle (35 pages) gives you four printable money planners: a House Building Budget Tracker with phase targets, room costs, and contractor payment logs; a twelve-month Remittance Tracker with exchange rate and fee tracking; a Debt Payoff Worksheet with snowball vs. avalanche strategy; and the 52-Week Peso Ipon Challenge. The Ipon Challenge Pack (7 pages) stands alone too — save 137,800 pesos in 52 weeks, starting at 100 pesos, with three difficulty options, a no-spend day tracker, and an emergency fund builder.',
      'Fifty-five pages total, delivered as instant PDF downloads formatted for US Letter — print-ready, designed to be reprinted forever. Buying the bundle saves you five dollars off the 19.99 individual total. Written for everyone: no finance or construction background needed, just the willingness to start.',
      'Personal use license included with every purchase. Informational purposes only — not financial advice. Always verify construction costs and financial decisions with qualified local professionals.',
    ],
    priceCad: 14.99,
    priceNote: 'one-time · lifetime access · save $5',
    compareAtCad: 19.99,
    category: 'Ebooks',
    cover: '/products/cover-ebooks.jpg',
    badge: 'Best value',
    includes: [
      'OFW House Building Guide (13 pages) — phase budgets, 10 contractor red flags, contractor vetting interview, 13-material price guide, 9-permit checklist, caretaker system, 15 lessons, pre-construction checklist',
      'House Building Budget Tracker (8 pages) — phase targets, room-by-room costs, contractor payment log with advance tracking, materials comparison',
      'Remittance Tracker (15 pages) — 12 monthly logs with exchange rate and fee tracking, yearly summary',
      'Debt Payoff Worksheet (5 pages) — debt inventory, snowball vs. avalanche picker, payoff trackers',
      '52-Week Peso Ipon Challenge Pack (7 pages) — savings grid to 137,800 pesos, 3 difficulty options, no-spend day tracker, emergency fund builder',
      '55 pages total — instant PDF downloads (US Letter, print-ready), reprint forever',
    ],
    faq: [
      {
        q: 'What format are the ebooks, and how do I receive them?',
        a: 'All files are PDFs. After your purchase is confirmed, you receive an instant download link for each PDF. Download them to your phone, tablet, or computer — they are yours forever.',
      },
      {
        q: 'What is your refund policy?',
        a: 'Because these are digital products delivered instantly, all sales are final. If your download link does not work or a file is corrupted, we will replace it promptly — just reach out.',
      },
      {
        q: 'Can I print them?',
        a: 'Absolutely — they are designed for it. All files are formatted for US Letter paper and print cleanly at home, at an office, or at any print shop. Reprint as many times as you like for your own use.',
      },
      {
        q: 'Are the amounts in pesos or dollars?',
        a: 'The ebooks use Philippine pesos throughout — budgets, challenges, trackers, and examples — because they are written for the OFW and Filipino experience. The Zervia listing prices are in Canadian dollars (CAD).',
      },
    ],
  },
  {
    slug: 'yoga-program',
    title: 'Yoga for Real Life: 4-Week Beginner Program',
    tagline: 'Start where you are. Grow from there — no flexibility required.',
    description: [
      'Yoga for Real Life is a four-week beginner program designed for people who have never set foot on a yoga mat — especially stiff desk workers, busy adults 40+, and anyone who thinks they are not flexible enough for yoga. Across six focused video sessions you build the foundations step by step: breathing, basic poses, strength, balance, and flexibility.',
      'No pretzel poses, no Sanskrit quizzes — just clear instruction, honest encouragement, and modifications for every pose, including chair support, block options, and gentler versions so the program fits your body. Four weekly themes build on each other: Foundations and Breath, Building Strength, Flexibility and Balance, then Flow and Mindfulness.',
      'All you need is a mat (or any non-slip surface), blocks or sturdy books, a strap or towel, and water. If you can get down to the floor and back up — with a chair nearby for support — you can do this program. If you have a medical condition, check with your doctor first, and always move in a pain-free range.',
    ],
    priceCad: 19.99,
    priceNote: 'one-time · lifetime access',
    category: 'Fitness',
    cover: '/products/cover-yoga-program.jpg',
    includes: [
      '6 video sessions (~7 minutes each) — narrated video lessons with visual pose guides and clear on-screen modification cues: a welcome session, four weekly themed sessions, and a technique walkthrough',
      'Written session guide for Week 1 — pose lists, hold times, breathing cues in plain language',
      '4 weekly themes that build: Foundations and Breath, Building Strength, Flexibility and Balance, Flow and Mindfulness',
      'Modifications for every pose — chair support, block options, gentler versions',
      'Lifetime access — repeat the program or individual sessions as often as you like',
    ],
    faq: [
      {
        q: "I've never done yoga. Will I be lost?",
        a: 'Not at all. Week 1 is called Foundations and Breath for a reason — every pose is introduced from scratch, with what to do, how to breathe, and where you should feel it. You will never be expected to know anything in advance.',
      },
      {
        q: 'I have bad knees or a bad back. Can I still do this?',
        a: 'Almost certainly yes. Every pose comes with a modification — bent-knee options, chair-supported standing poses, and blocks to bring the floor closer. If you have a medical condition, check with your doctor first, and always move in a pain-free range. Discomfort from stretching is fine; sharp pain is a stop sign.',
      },
      {
        q: 'How much space do I need?',
        a: 'Just enough to lie down on your mat with your arms stretched wide — roughly 2 by 2 metres. A corner of a living room or bedroom works perfectly.',
      },
      {
        q: 'What if I miss a week?',
        a: 'Nothing breaks. The program is self-paced with lifetime access. Missed a week? Just pick up where you left off — the Week 1 session and guide are always there if you want a refresher. Consistency beats perfection: one focused session a week is still a win.',
      },
    ],
  },
  {
    slug: 'bright-eyes-secrets',
    title: 'Bright Eyes Secrets — The Under-Eye Revival Guide',
    tagline: 'The at-home routines, techniques, and ingredient know-how behind brighter, rested-looking eyes.',
    description: [
      'Dark circles, puffiness, and tired-looking under-eyes can make you look exhausted even when you feel great. The frustrating part: most of it comes down to fluid retention, thin delicate skin, and daily habits — things you can genuinely influence at home, once you know how.',
      'Bright Eyes Secrets is a complete at-home guide to the under-eye area: gentle lymphatic drainage massage sequences with step-by-step illustrations, morning and evening routines that take under five minutes, cooling and de-puffing techniques, an honest ingredient guide (what actually helps in eye creams — and what is just marketing), product layering order, and the lifestyle factors that matter most: sleep, hydration, screen habits, and allergies.',
      'No appointments, no expensive treatments, no miracle promises. Just practical, illustrated routines you can start tonight with your own hands and products you may already own.',
      'This guide is for cosmetic and educational purposes only — it is not medical advice. Results vary from person to person. If your under-eye concerns come with swelling, pain, vision changes, or sudden worsening, please see a doctor or dermatologist before following any routine in this guide.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Beauty',
    cover: '/products/cover-eyebags-removal.jpg',
    includes: [
      'Under-eye massage sequences — illustrated lymphatic drainage routines for puffiness and dullness',
      'Morning routine (under 5 minutes) — de-puff, brighten, and prep for makeup',
      'Evening routine — wind-down massage and overnight hydration steps',
      'Cooling and de-puffing techniques — cold therapy methods you can do at home',
      'Honest ingredient guide — what to look for in eye creams (and what is just marketing)',
      'Product layering order — how to layer serums, creams, and SPF around the eyes',
      'Lifestyle playbook — sleep, hydration, screen habits, and allergy factors that affect the under-eye area',
      'Printable routine cards — one-page morning and evening cheat sheets',
    ],
    faq: [
      {
        q: 'Who is this guide for?',
        a: 'Anyone bothered by dark circles, puffiness, or tired-looking under-eyes who wants practical at-home routines. It suits all skin types and all ages — the techniques are gentle and the routines adjust to your schedule.',
      },
      {
        q: 'Do I need to buy special products?',
        a: 'No. Every technique works with your own hands and products you may already own. The guide includes an honest ingredient guide and recommendations if you want to upgrade, but nothing is required to start.',
      },
      {
        q: 'How long before I see results?',
        a: 'Most people notice less morning puffiness within the first week of consistent routines. Dark circles are trickier — they have many causes (genetics, thin skin, pigmentation), and the guide is honest about which types respond to at-home care and which do not. Consistency matters more than intensity: five minutes daily beats an hour once a month.',
      },
      {
        q: 'What format is the guide?',
        a: 'A downloadable digital guide with illustrated step-by-step routines, printable routine cards, and lifetime access to future updates. Read it on any device — no special software needed.',
      },
    ],
  },
  {
    slug: 'weightloss-program',
    title: 'The 8-Week Reset — Sustainable Weight Loss Program',
    tagline: 'Lose weight without the misery — realistic nutrition, home workouts, and self-guided check-ins.',
    description: [
      'Crash diets do not work — you already know that. The 8-Week Reset is a structured, habit-first program that helps you lose weight the sustainable way: realistic nutrition frameworks (not starvation), beginner-friendly workouts you can do at home, and check-ins that keep you accountable.',
      'No gym required. No rigid meal plans. No Filipino food banned — adobo, sinigang, and rice can all fit. This program works with your real life, not against it: weekly flexible meal frameworks, three beginner bodyweight workouts per week with full warm-ups and cool-downs, printable progress trackers, and milestone check-ins at weeks two, four, six, and eight.',
      'Week eight is all about maintenance — you will have built the habits, learned your body\u2019s patterns, and created a routine you can sustain. The tracker sheets and frameworks are yours to keep, with lifetime access to all materials and future updates.',
      'This program provides general health and fitness information for educational purposes only — it is not medical advice. Consult your doctor before starting any weight loss or exercise program, especially if you are pregnant, nursing, managing a medical condition, taking medication, or have a history of disordered eating. Stop exercising and seek medical attention if you experience pain, dizziness, chest discomfort, shortness of breath, or nausea.',
    ],
    priceCad: 39.99,
    priceNote: 'one-time · lifetime access',
    category: 'Fitness',
    cover: '/products/cover-weightloss-program.jpg',
    includes: [
      'Weekly meal frameworks — flexible nutrition guidance built around protein, veggies, and hydration targets (with Filipino-friendly examples)',
      '3x/week workout plans — beginner bodyweight routines with warm-ups, sets and reps, and cool-downs; no gym or equipment needed',
      'Progress tracker sheets — logs for weigh-ins, measurements, and daily habits',
      'Milestone check-ins at weeks 2, 4, 6, and 8 — structured self-assessment prompts',
      '8 weekly themes that build from habit-building to long-term maintenance',
    ],
    faq: [
      {
        q: 'How much weight can I expect to lose?',
        a: 'A safe, sustainable rate is roughly 0.5–1 kg (1–2 lbs) per week — so 4–8 kg (8–16 lbs) over 8 weeks is a realistic range for many people. Results vary based on starting point, consistency, sleep, and stress. We focus on habits that keep weight off long-term, not on chasing a number on the scale by week 8.',
      },
      {
        q: 'Do I need a gym?',
        a: 'No. The entire workout program uses bodyweight exercises you can do at home with zero equipment. All you need is a bit of floor space and comfortable clothes.',
      },
      {
        q: 'What if I have dietary restrictions?',
        a: 'The nutrition framework is built around targets (protein, vegetables, water, portions) rather than specific foods, so it adapts to almost any restriction — halal, vegetarian, lactose-free, allergies, diabetes-friendly eating. If you have a medical condition affecting your diet, work with your doctor or a registered dietitian alongside this program.',
      },
      {
        q: 'What happens after 8 weeks?',
        a: 'Week 8 is all about maintenance — you will have built the habits, learned your body\u2019s patterns, and created a routine you can sustain. The tracker sheets and frameworks are yours to keep using. Many graduates repeat weeks 5–8 as a maintenance cycle or restart the program at a higher intensity.',
      },
    ],
  },
  {
    slug: 'trading-ecourse',
    title: 'Trading Foundations: Learn the Markets Before You Risk a Dollar',
    tagline: 'Most beginners lose money because they start trading before they understand how markets work.',
    description: [
      'Trading Foundations is a beginner-friendly education program that teaches you how stocks, ETFs, and cryptocurrencies actually work — the mechanics, the account types, the order types, the risk math, and the psychology — before you ever place a trade.',
      'Six self-paced modules cover market foundations, day trading basics, swing trading, long-term investing, crypto essentials, and risk management with trading psychology. Canadian specifics — TFSA, RRSP, and taxable accounts, plus tax considerations — are clearly marked, and the concepts apply globally. Every module includes worked examples, checklists, and practice exercises.',
      'This is EDUCATION, not advice: no stock picks, no "buy this coin" calls, no price targets. The honest promise: after this course you will not have a magic strategy — you will have the knowledge to evaluate any strategy, spot scams, and build your own plan with realistic expectations.',
      'This course is for educational purposes only and is not financial advice. Trading and investing involve risk, including the possible loss of principal. Nothing in this course constitutes a recommendation to buy, sell, or hold any security or cryptocurrency. Past performance does not guarantee future results. Consult a licensed financial advisor or tax professional before making investment decisions. Zervia and the course creators are not registered investment advisors.',
    ],
    priceCad: 34.99,
    priceNote: 'one-time · lifetime access',
    category: 'Trading',
    cover: '/products/cover-trading-ecourse.jpg',
    includes: [
      'Module 1: Trading Foundations — markets, brokerages, Canadian account types, order types, what moves prices',
      'Module 2: Day Trading Basics — price patterns, candlesticks, building a day-trading plan',
      'Module 3: Swing Trading — trends, entry and exit frameworks, moving averages, journaling',
      'Module 4: Long-Term Investing — index funds and ETFs, diversification, dollar-cost averaging, fees',
      'Module 5: Crypto Essentials — blockchains, wallets, exchanges, stablecoins, security, taxes in Canada',
      'Module 6: Risk Management and Trading Psychology — the 1–2% risk rule, position sizing, expectancy, trading journals',
      'Written lessons at your own pace, with worked examples, checklists, and practice exercises in every module',
    ],
    faq: [
      {
        q: 'Is this financial advice? Will you tell me what to buy?',
        a: 'No — and that is the point. This is an education course, not financial advice. We teach methods, mechanics, and risk math. We do not make buy/sell recommendations, give price targets, or tell you what to invest in. For personal financial decisions, consult a licensed financial advisor.',
      },
      {
        q: 'How much money do I need to start trading after this course?',
        a: 'The course itself teaches you how to answer that question based on your own situation. The risk-management principles in Module 6 are designed to be learned with paper trading or very small amounts first. Never trade money you cannot afford to lose.',
      },
      {
        q: 'How long does the course take?',
        a: 'The lessons are self-paced. Most learners finish in 3–6 weeks reading a few lessons per week, but you have lifetime access — revisit any module any time, including as markets and your knowledge evolve.',
      },
      {
        q: 'What do I get for $79 CAD?',
        a: 'All 6 modules, lifetime access to updates, and every worksheet, checklist, and exercise. One-time payment — no subscription, no upsells, no advanced tier locked behind another paywall.',
      },
    ],
  },
  {
    slug: 'youthful-glow-secrets',
    title: 'Youthful Glow Secrets — Face Massage & Anti-Aging Regimen',
    tagline: 'Self-massage techniques, daily routines, and honest anti-aging know-how — your face, your hands, your glow.',
    description: [
      'Long days, screen time, jaw clenching, not enough sleep — it all shows up on your face. The good news: many of the techniques professionals use — lymphatic drainage, gua sha strokes, tension release — can be done on yourself, at home, in minutes a day.',
      'Youthful Glow Secrets is a complete self-massage and anti-aging regimen guide: illustrated step-by-step facial massage sequences for the forehead, eyes, cheeks, jaw, and neck; gua sha and facial roller techniques (including what to do if you own no tools at all); morning and evening routines; product layering guides; and honest guidance on what at-home care can and cannot do for fine lines, firmness, and puffiness.',
      'This is a practical do-it-yourself program — no appointments, no expensive equipment. All you need is your hands, a few minutes a day, and optionally a facial oil and a gua sha stone.',
      'This guide is for cosmetic and educational purposes only — it is not medical advice, and it makes no claim to reverse aging or replace professional dermatological care. Results vary. Avoid facial massage over active breakouts, infections, or irritated skin, and consult a dermatologist if you have skin conditions or concerns.',
    ],
    priceCad: 29.99,
    priceNote: 'one-time · lifetime access',
    category: 'Beauty',
    cover: '/products/cover-face-massage.jpg',
    includes: [
      'Full-face massage sequences — illustrated routines for forehead, eyes, cheeks, jaw, and neck',
      'Lymphatic drainage basics — gentle techniques that support the look of reduced puffiness',
      'Gua sha guide — strokes, pressure, and direction, plus a no-tools alternative using your knuckles',
      'Facial roller techniques — how to use rollers effectively (and when they are simply nice, not necessary)',
      'Morning routine (5–10 minutes) — wake up the face, reduce puffiness, prep skin for the day',
      'Evening routine — tension release for jaw, temples, and brow after long days',
      'Product layering guide — oils, serums, and moisturizers in the right order for massage',
      'Honest anti-aging section — what at-home care can improve, what it cannot, and when to see a professional',
      'Printable routine cards — one-page sequences to keep by the mirror',
    ],
    faq: [
      {
        q: 'Who is this guide for?',
        a: 'Anyone who wants a practical at-home facial routine — for puffiness, tension, dullness, or simply a few calming minutes of self-care. All techniques are gentle and beginner-friendly; no experience needed.',
      },
      {
        q: 'Do I need a gua sha stone or facial roller?',
        a: 'No. Your hands are the main tool, and the guide includes no-tool alternatives for every technique. If you already own a gua sha stone or roller, there are dedicated sections on using them well — but they are optional, never required.',
      },
      {
        q: 'How long before I see results?',
        a: 'Puffiness often looks reduced right after a session, and regular practice builds on that. Changes to fine lines and firmness are gradual and modest — the guide is honest about what self-massage can and cannot do. Most people find the daily ritual itself worthwhile within two weeks: less tension, a calmer face, and a few minutes that are just for them.',
      },
      {
        q: 'What format is the guide?',
        a: 'A downloadable digital guide with illustrated step-by-step sequences, printable routine cards, and lifetime access to future updates. Read it on any device — no special software needed.',
      },
    ],
  },
  {
    slug: 'electrical-course',
    title: 'Home Electrical Basics — Skills Every Homeowner Should Know',
    tagline: 'Stop fearing your breaker panel — and stop being dangerously overconfident about it.',
    description: [
      'Home Electrical Basics is a beginner-friendly course that teaches you how residential electricity actually works — how power flows through your home, how to read a wiring diagram, how to safely handle common repairs like outlets and switches — and, just as important, exactly when to put the tools down and call a licensed electrician.',
      'Built from real construction QA experience: the course creators have spent years inspecting electrical installations on major projects — reviewing wiring against drawings, verifying code compliance, and catching the mistakes that cause fires. Four modules cover safety foundations, reading wiring diagrams, common home repairs, and the DIY toolkit with a clear "call a pro" checklist.',
      'Electricity can kill. Every module leads with safety: de-energizing circuits, testing before you touch, understanding your panel, and knowing your limits. This course will make you more cautious, not less.',
      'Educational content only — not a substitute for a licensed electrician. Electrical work is regulated: always follow your local electrical codes (in Canada, the Canadian Electrical Code / CEC, plus provincial amendments), and obtain required permits and inspections for any electrical work. Some jurisdictions restrict certain electrical work to licensed professionals. When in doubt, call a licensed electrician. The course creators and Zervia accept no liability for injury, damage, or code violations resulting from applying this material.',
    ],
    priceCad: 44.99,
    priceNote: 'one-time · lifetime access',
    category: 'Trades',
    cover: '/products/cover-electrical-course.jpg',
    includes: [
      'Module 1: Electrical Safety Foundations — how electricity works, breaker panels, GFCI and AFCI, shock awareness, what you should NEVER DIY',
      'Module 2: Reading Wiring Diagrams and Schematics — symbols, tracing circuits, wire colors, 3-way switches',
      'Module 3: Common Home Repairs — outlets, switches, breakers, light fixtures, diagnosing dead outlets and flickering lights',
      'Module 4: Tools, Testing and When to Call a Pro — multimeters, voltage testers, verifying your work, the call-a-pro checklist',
      'Repair-Day Checklist — the pre-work safety routine for every repair, included in the lesson text (Module 3)',
      'Call-a-Pro Checklist — when the job belongs to a licensed electrician, included in the lesson text (Module 4)',
      'Tools Guide — exactly what to buy (and what to skip) for basic home electrical work',
    ],
    faq: [
      {
        q: 'Is this safe for beginners?',
        a: 'The course is designed for beginners, and safety is its backbone. Module 1 is entirely about safety foundations — you do not touch a wire until you understand de-energizing, testing, and your limits. That said, electricity is genuinely dangerous, and the course is honest about that: you will learn exactly which jobs are appropriate for a careful DIYer and which require a licensed electrician, no exceptions.',
      },
      {
        q: 'Do I need any experience or background in electrical work?',
        a: 'No. We start from zero — what voltage, current, and resistance actually mean, in plain language. The only prerequisites are the ability to read instructions carefully and the maturity to follow safety rules every single time.',
      },
      {
        q: 'What tools do I need?',
        a: 'For the course itself: nothing — you can learn all the theory first. For the hands-on repairs in Module 3, you will need a non-contact voltage tester, a receptacle tester, insulated screwdrivers, wire strippers, and a multimeter. The included Tools Guide lists exactly what to buy — you can get set up for well under $100 CAD.',
      },
      {
        q: 'Does this course certify me as an electrician?',
        a: 'No. This course provides knowledge and skills only — it does not grant any license, certification, or qualification to perform electrical work professionally. Becoming a licensed electrician requires formal apprenticeship and certification through your province\u2019s regulatory authority.',
      },
    ],
  },
  {
    slug: 'mechanical-course',
    title: 'Mechanical Skills for Beginners',
    tagline: 'A practical short course that teaches you how things work — and how to keep them working.',
    description: [
      'Most people go through life not knowing how a bolt differs from a screw, why a machine stops working, or what a maintenance schedule even is — until something breaks and the bill arrives. This course changes that with real, hands-on mechanical literacy built from zero.',
      'Part 1 (Tools and Fasteners) is available now — essential hand and power tools (and how to use them safely), how fasteners and threads actually work, plus 6 video lectures (~34 min) covering hand tools, power-tool safety, fasteners and torque, reading drawings, basic maintenance, and troubleshooting. Modules 2–4 (Reading Mechanical Drawings, Basic Maintenance, Troubleshooting Like a Pro) are in production and included free with lifetime access.',
      'This course is built by people who do mechanical QA and inspection for a living — years on industrial sites checking equipment installations, reviewing drawings, and watching things fail in every way imaginable. That experience is baked into every lesson: you learn what actually matters in the real world, not textbook theory. This is practical skills and knowledge — it is not a trade certification or license.',
    ],
    priceCad: 44.99,
    priceNote: 'one-time · lifetime access',
    category: 'Trades',
    cover: '/products/cover-mechanical-course.jpg',
    includes: [
      'Part 1 — Tools and Fasteners (available now): hand tools, power tools, bolts, nuts, threads, torque basics',
      '6 video lectures (~34 min): hand tools, power-tool safety, fasteners/threads/torque, reading drawings, basic maintenance, troubleshooting roadmap',
      'Modules 2–4 in production — Reading Mechanical Drawings, Basic Maintenance, Troubleshooting Like a Pro — included free with lifetime access',
      'Lifetime access, self-paced',
    ],
    faq: [
      {
        q: 'Do I need any experience?',
        a: 'No. This course starts from absolute zero. If you have never picked up a wrench, you are exactly who it is for.',
      },
      {
        q: 'What tools do I need?',
        a: 'A basic hand tool set is all you need to follow along — a screwdriver set, an adjustable wrench, a hammer, and a tape measure will cover nearly everything in the course. We also teach you what each tool is for and how to choose quality tools without overspending.',
      },
      {
        q: 'Is this a certification?',
        a: 'No. This course teaches practical skills and knowledge — it is not a trade certification or license. If you want to become a certified millwright, mechanic, or tradesperson, you will need formal apprenticeship training. This course gives you the foundation that makes that training easier.',
      },
      {
        q: 'Will this help me get a job?',
        a: 'Honestly: it builds a strong foundation, not a credential. If you are applying for entry-level maintenance, helper, or apprenticeship roles, the practical knowledge in this course will help you sound like you know what you are talking about in an interview and hit the ground running on day one. It will not replace a trade license, but it absolutely shortens the learning curve.',
      },
    ],
  },
  {
    slug: 'civil-course',
    title: 'Civil Engineering Concepts for Beginners',
    tagline: 'Learn to read drawings, understand concrete, measure a site, and think like an inspector.',
    description: [
      'Every building, road, and bridge starts as a drawing and becomes real through concrete, measurement, and inspection. This course teaches you the foundations — the core concepts of civil engineering, explained in plain language for complete beginners. Part 1 (Reading Construction Drawings) is available now; Parts 2–4 (Concrete Basics, Site Measurement and Layout, Quality Checkpoints) are in production and included free with lifetime access.',
      'Four planned parts cover the skills that matter most. Part 1 (available now): reading construction drawings — plan, elevation, section, scales, symbols, title blocks, revision control, a worked house-plan walkthrough, and five practice drills. Parts 2–4 (in production): understanding concrete (mixes, slump, curing, defects), measuring and laying out a site, and knowing the quality checkpoints inspectors actually look for — rebar, formwork, compaction, hold points, and documentation.',
      'Priced as a premium course because it is taught from genuine professional expertise — developed by civil engineering professionals and QA/QC specialists with years on major construction projects, not content creators reading Wikipedia. This is education for beginners — it does not grant an engineering degree or license, which require accredited study, professional experience, and licensing exams.',
    ],
    priceCad: 49.99,
    priceNote: 'one-time · lifetime access',
    category: 'Trades',
    cover: '/products/cover-civil-course.jpg',
    includes: [
      'Part 1 — Reading Construction Drawings (available now): plan, elevation, section, scales, symbols, worked house-plan walkthrough, five practice drills',
      'Drawing-Reading Practice Sheets — exercises with sample plans, included in the lesson text',
      'Parts 2–4 in production — Concrete Basics, Site Measurement and Layout, Quality Checkpoints — included free with lifetime access',
      'Lifetime access, self-paced',
    ],
    faq: [
      {
        q: 'Do I need a degree to take this course?',
        a: 'No. This course assumes zero engineering background. Everything is explained in plain language, step by step. It is designed for curious beginners, not engineering students.',
      },
      {
        q: 'Will this make me an engineer?',
        a: 'No — and we would be doing you a disservice to suggest otherwise. Becoming a licensed engineer requires an accredited degree, professional experience, and licensing exams. What this course gives you is genuine foundational knowledge: you will understand drawings, concrete, measurement, and inspection the way working professionals think about them.',
      },
      {
        q: 'Is this useful if I am managing my own home build or renovation?',
        a: 'Yes — this is one of the best reasons to take it. Homeowners who can read their own drawings, understand what concrete work should look like, and know the basic quality checkpoints are dramatically harder to overcharge or mislead. You will communicate with your contractor in their language and catch issues while they are cheap to fix.',
      },
      {
        q: 'Can I ask questions as I go?',
        a: 'Yes — email our support team anytime with your course questions and the Zervia Team will get back to you. Drawing-reading questions are especially welcome.',
      },
    ],
  },
  {
    slug: 'plumbing-course',
    title: 'Home Plumbing Basics — Fix Leaks, Unclog Drains and Know When to Call a Pro',
    tagline: 'A dripping faucet wastes up to 11,000 litres a year. Many fixes take twenty minutes — once you know how.',
    description: [
      'Home Plumbing Basics is a beginner-friendly course that teaches you how your home\u2019s plumbing actually works, which repairs are genuinely DIY-friendly, and — just as important — which ones are not. You will learn to replace a faucet cartridge, fix a running toilet, unclog a drain properly, and shut off your water in an emergency.',
      'Built by people who inspect this stuff for a living: the course draws on real construction quality-assurance experience — the careful, methodical approach of verifying the shut-off first, protecting the finishes, and testing before you walk away. Part 1 (Plumbing Basics and Safety) is available now, plus 6 video lectures (~38 min) covering the two plumbing systems and shut-offs, valves and pressure, safety and knowing your limits, the beginner toolkit, fixing leaks and drips, and drains and toilets — every lesson with a "when to call a pro" checkpoint. Modules 2–4 (Tools of the Trade, Fixing Leaks and Drips, Unclogging Drains and Toilet Repairs) are in production and included free with lifetime access.',
      'Safety is woven into every module. Water damage is one of the most expensive things that can happen to a home, and overconfidence is how it starts. The very first thing you learn is how to find and operate your main water shut-off and every fixture shut-off — before any repair lesson begins.',
      'This course is for educational purposes only. Plumbing work is subject to local building and plumbing codes, which vary by province and municipality in Canada — always follow the codes that apply where you live. Some plumbing work legally requires a licensed plumber or a permit (including gas line work, main line connections, and certain fixture installations). When in doubt, call a licensed plumber. Zervia and the course creators are not liable for damage resulting from work performed after taking this course. If water is leaking and you are unsure what to do: shut off the water at the nearest valve, and call a professional.',
    ],
    priceCad: 44.99,
    priceNote: 'one-time · lifetime access',
    category: 'Trades',
    cover: '/products/cover-plumbing-course.jpg',
    includes: [
      'Part 1: Plumbing Basics and Safety (available now) — supply vs. drain systems, main shut-off, pipe materials, safety rules',
      '6 video lectures (~38 min): two systems and shut-offs, valves/pressure/pipes, safety and knowing your limits, beginner toolkit, leaks and drips, drains and toilets',
      'Modules 2–4 in production — Tools of the Trade, Fixing Leaks and Drips, Unclogging Drains and Toilet Repairs — included free with lifetime access',
    ],
    faq: [
      {
        q: 'Will I flood my house?',
        a: 'Honest answer: only if you skip the safety steps — and this course is designed so you cannot. The very first thing you learn is how to find and operate your main water shut-off and every fixture shut-off. Every repair walkthrough starts with "turn off the water and verify it is off." Each module also teaches the clear signs that a job is beyond DIY and it is time to call a licensed plumber.',
      },
      {
        q: 'Do I need any experience to take this course?',
        a: 'None at all. Module 1 assumes you have never thought about your plumbing before. The lessons build from "how does water get to my tap" up to real repairs, and every technical term is explained in plain language the first time it appears.',
      },
      {
        q: 'What tools will I need?',
        a: 'A short, affordable list: a flange plunger, a cup plunger, an adjustable wrench, a hand drain auger, PTFE (Teflon) thread tape, a bucket, and towels. The video lessons walk you through what each tool does and how to choose — most people can assemble the kit for well under $100 CAD.',
      },
      {
        q: 'When should I call a plumber instead of doing it myself?',
        a: 'Call a licensed plumber for anything involving the main water line, sewer line work, gas lines (never touch these), water heater internals, any job where local code requires a permit or licensed professional, and any situation where you are unsure and water is actively leaking. A $200 service call is always cheaper than a $5,000 water damage repair.',
      },
    ],
  },
  {
    slug: 'hvac-course',
    title: 'Home HVAC Basics — Heat, Cool and Save',
    tagline: 'Understand your furnace, change your filter, and cut your bills through a cold winter.',
    description: [
      'When it is minus thirty outside and the furnace quits, "I do not know how this thing works" is a terrible place to be. Home HVAC Basics is a beginner-friendly course that teaches you how your heating and cooling actually works — furnaces, air conditioners, and heat pumps explained in plain language, no engineering degree required.',
      'Built by people who inspect this stuff for a living: the course draws on real construction quality-assurance experience — reviewing mechanical installations, commissioning reports, and system handover documentation on major projects. Part 1 (How Heating and Cooling Works) is available now. Parts 2–4 (Filters and Maintenance, Thermostats, Troubleshooting plus Energy Saving) are in production and included free with lifetime access. It is cold-climate focused, with harsh winters in mind.',
      'Part 1 builds your foundation: the heating and cooling cycles, what each component does, efficiency ratings (AFUE, SEER), and carbon monoxide safety. The hands-on maintenance, thermostat, and troubleshooting playbooks are part of the planned future parts.',
      'This course is for educational purposes only. Heating, ventilation, and air conditioning systems involve gas, high-voltage electricity, and combustion — work inside HVAC equipment must be performed by licensed technicians. Carbon monoxide is odorless, colorless, and potentially lethal: install CO detectors on every floor of your home, test them regularly, and treat any alarm as an emergency — get out and call for help. Never attempt to repair, modify, or bypass safety controls on gas-fired equipment. When in doubt, call a licensed HVAC technician.',
    ],
    priceCad: 44.99,
    priceNote: 'one-time · lifetime access',
    category: 'Trades',
    cover: '/products/cover-hvac-course.jpg',
    includes: [
      'Part 1: How Heating and Cooling Works (available now) — furnaces, boilers, heat pumps, the refrigeration cycle, efficiency ratings (AFUE, SEER), carbon monoxide safety',
      'Parts 2–4 in production — Filters and Maintenance, Thermostats, Troubleshooting and Energy Saving — included free with lifetime access',
    ],
    faq: [
      {
        q: 'Can I service my own furnace?',
        a: 'Honest answer: you can do the maintenance, not the servicing — and the distinction matters. Changing filters, keeping vents clear, checking thermostat batteries, and keeping the area around your furnace clean: absolutely, and the planned maintenance part of this course will teach you how. Anything involving gas lines, burners, heat exchangers, electrical components inside the unit, or refrigerant: that is licensed-technician work, full stop. This course draws the line clearly.',
      },
      {
        q: 'How often should I change my furnace filter?',
        a: 'It depends on your filter, your home, and your life. A basic 1-inch filter in a home with pets might need changing every 30 days; a thick 4-inch media filter in a pet-free home can go 6 months. The course gives you a real decision framework. The one universal rule: a filter you never change is worse than a cheap filter you change on time.',
      },
      {
        q: 'Will this course actually lower my energy bills?',
        a: 'Part 1 builds the understanding that savings rest on: how your system works and what efficiency ratings mean. The hands-on savings playbook is part of the planned future parts. The course is honest that no single tip is magic.',
      },
      {
        q: 'What if my furnace stops working in the middle of winter?',
        a: 'Do not panic — here are the safe first checks while you wait for help. The first-30-minutes checklist: check the thermostat (mode, setpoint, batteries), check the furnace power switch and breaker, check the filter, and check that exterior intake/exhaust vents are not blocked by snow or ice. If you smell gas or the CO detector is alarming — stop, and call for professional help immediately: your gas utility\u2019s emergency line for gas smells, 911 if there is any immediate danger, and an HVAC technician for the repair. A full troubleshooting walkthrough is part of the planned future parts.',
      },
    ],
  },
  {
    slug: 'quality-course',
    title: 'QA/QC Quality Course for Construction and Industrial Projects',
    tagline: 'Learn quality inspection the way it is actually done — taught by QA/QC specialists with experience leading quality on major industrial projects.',
    description: [
      'Every major project lives or dies on quality. A weld that fails, a concrete pour that goes wrong, a document that goes missing — quality failures cost real money, real schedules, and sometimes real safety. Someone has to be the person who catches them before it is too late. That person is the QA/QC inspector.',
      'This five-module professional course teaches you how quality actually works on industrial construction projects — from large industrial plants to major infrastructure builds. Not theory from a textbook: how Inspection Test Plans (ITPs) run a project, how non-conformance reports (NCRs) get written and resolved, what weld inspectors actually look for, and the documentation discipline that turns a construction worker into a quality professional.',
      'The instructor team is made up of QA/QC specialists with experience leading quality functions on major industrial projects — professionals who review ITPs, write and disposition NCRs, verify welds against Welding Procedure Specifications, and manage turnover documentation on industrial-scale work. The course includes working resources you will use in the real world: an ITP build walkthrough with a worked example, an NCR writing guide with a worked example, and a visual weld inspection checklist, all included in the lesson text.',
      'This is not a certification — there is no accredited credential attached, and claiming otherwise would be dishonest. What you get is the working knowledge employers actually test in interviews and value on site. If you later pursue formal inspector certifications (such as CWB or AWS credentials), this course gives you a serious head start on the fundamentals.',
    ],
    priceCad: 79.99,
    priceNote: 'one-time · lifetime access',
    category: 'Professional',
    cover: '/products/cover-quality-course.jpg',
    includes: [
      'Module 1 — Quality Foundations: QC vs QA vs QM, the cost of rework, quality culture, inspector terminology',
      'Module 2 — Reading Inspection Test Plans (ITPs): hold, witness, and review points and how to follow one on site',
      'Module 3 — The NCR Process: writing non-conformance reports, disposition, closing the loop, trending',
      'Module 4 — Weld Inspection Basics: the 4 processes, reading a WPS, common defects, visual inspection checklist',
      'Module 5 — Documentation and Professional Practice: daily reports, traceability, turnover dossiers, contractor relations, career paths',
      'ITP Build Walkthrough — step-by-step guide to building an Inspection Test Plan, with a worked example covering the hold/witness/review point structure, included in the lesson text',
      'NCR Writing Guide — how to write non-conformance reports, with a worked example, included in the lesson text',
      'Visual Weld Inspection Checklist — field checklist for porosity, undercut, lack of fusion, cracks, and more, included in the lesson text',
      'Lifetime access, self-paced',
    ],
    faq: [
      {
        q: 'Do I need experience in construction to take this course?',
        a: 'No. Module 1 starts from zero — it explains what quality means on a construction project, defines every key term (ITP, NCR, hold point, surveillance, audit), and shows you what an inspector actually does day-to-day. If you have construction experience, you will move faster. If you do not, the course is built so you can still follow it from the beginning.',
      },
      {
        q: 'Is this a certification?',
        a: 'No — and we will not pretend it is. There is no accredited credential attached to this course. What you get is genuine practical knowledge of how quality works on real industrial projects — the working knowledge employers actually test in interviews and value on site. If you later pursue formal inspector certifications (such as CWB or AWS credentials), this course gives you a serious head start on the fundamentals.',
      },
      {
        q: 'Will this help me get a QA job?',
        a: 'Honestly: it builds the real working knowledge that employers value, which is the single most important thing you can bring to a QA/QC interview or your first inspection role. Companies hiring QA/QC inspectors look for people who understand ITPs, can write a clear NCR, know what weld defects look like, and document their work properly — exactly what this course teaches. No course can hand you a job, but you will walk in speaking the language and thinking like an inspector.',
      },
      {
        q: 'How is this different from free YouTube content?',
        a: 'YouTube has good quality content — but it is fragmented. This course is a structured curriculum designed by the Zervia Team\u2019s QA/QC specialists: foundations first, then ITPs, then the NCR process, then weld inspection, then documentation and professional practice — in the order a working inspector learns them. You also get working resources included in the lesson text: an NCR writing guide with a worked example, the visual weld inspection checklist, and an ITP build walkthrough with a worked example. Free content teaches you facts. This teaches you the job.',
      },
      {
        q: 'Can I ask questions as I go?',
        a: 'Yes — email our support team anytime with your course questions and the Zervia Team will get back to you. Real ITP and NCR questions from your own projects are especially welcome.',
      },
    ],
  },
  {
    slug: 'welding-course',
    title: 'Welding Fundamentals and Visual Inspection Short Course',
    tagline: 'Before you strike your first arc — learn what a good weld looks like and how defects get spotted.',
    description: [
      'Welding is one of the most respected skilled trades in the world — but before you strike your first arc, you need to understand what is actually happening: how the processes work, what a good weld looks like, and how defects get spotted before they become failures.',
      'This course is taught from a QA specialist\u2019s perspective by the Zervia Team. Every module is built around the question an inspector asks: "What should I be looking for, and why does it matter?" Five modules cover welding safety essentials, the four processes (SMAW, GMAW, FCAW, GTAW), reading a Welding Procedure Specification, weld defects and causes, and visual inspection fundamentals — plus reference materials including a WPS reading guide, a visual defect identification chart, and a field inspection checklist, all included in the lesson text.',
      'Whether your goal is to pick up a welding torch for the first time, move toward a welding inspector role, or just understand the welds you are surrounded by on a job site, this course gives you the foundation most people never get — the knowledge that certification programs assume you already have, so when you do pursue certification, you are ahead, not behind.',
      'Disclaimer: this is a theory and knowledge course. It is not a substitute for hands-on training under a qualified welding instructor, and it does not grant a CWB, AWS, or any other welding ticket. Always follow your workplace safety regulations, and never attempt live welding without proper training, PPE, and supervision.',
    ],
    priceCad: 79.99,
    priceNote: 'one-time · lifetime access',
    category: 'Professional',
    cover: '/products/cover-welding-course.jpg',
    includes: [
      'Module 1 — Welding Safety Essentials',
      'Module 2 — The 4 Processes: SMAW, GMAW, FCAW, GTAW',
      'Module 3 — Reading a WPS (Welding Procedure Specification)',
      'Module 4 — Weld Defects and Causes',
      'Module 5 — Visual Inspection Fundamentals',
      'WPS Reading Guide — walkthrough of a Welding Procedure Specification, section by section, included in the lesson text',
      'Visual Defect Identification Chart — quick-reference for porosity, undercut, overlap, lack of fusion, cracks, and spatter, with causes and prevention tips, included in the lesson text',
      'Visual Inspection Checklist — a practical field checklist: what to check, in what order, and how to document it, included in the lesson text',
      'Lifetime access, self-paced',
    ],
    faq: [
      {
        q: 'Do I need my own welder to take this course?',
        a: 'No. This is a theory and knowledge course — you will learn how each process works, what the equipment does, and how to evaluate welds. When you are ready for hands-on practice, you will know exactly what to look for in a machine and an instructor.',
      },
      {
        q: 'Is this a welding certification?',
        a: 'Honestly: no. This course does not grant a CWB, AWS, or any other welding ticket. Those require supervised, hands-on welding and practical testing. What this course does is build the knowledge that certification programs assume you already have — the processes, the terminology, the defect recognition, the inspection basics.',
      },
      {
        q: 'Will this help me become a welding inspector?',
        a: 'It builds the foundation toward it. Welding inspector certifications (CWI, CWB) require both knowledge and experience. This course gives you the knowledge side: welding processes, WPS reading, defect identification, and visual inspection fundamentals — exactly the concepts inspection exams test. Many people fail inspection courses because they never learned these basics; you will not have that problem.',
      },
      {
        q: 'Is it safe to learn theory before touching a torch?',
        a: 'Yes — and it is the smartest order to do it in. Understanding hazards before you are near them is how professionals are trained. That is also why the very first module is safety, and it is required before anything else: PPE, arc flash, fumes, fire, and electrical hazards, all before a single lesson on welding technique.',
      },
    ],
  },
  {
    slug: 'safety-course',
    title: 'Construction Safety Essentials Short Course',
    tagline: 'Real safety awareness — the ability to spot what is wrong with a task before it hurts you.',
    description: [
      'Every year, construction remains one of the most dangerous industries to work in — and most incidents do not happen to careless people. They happen to ordinary workers on ordinary days, in situations they did not recognize as dangerous.',
      'This course builds the thing that keeps workers alive: real safety awareness. Not memorized rules, but the ability to look at a task and spot what is wrong with it before it hurts you. Four modules cover safety mindset and PPE, fall protection basics, hazard identification, and communication and reporting — plus printable templates: a PPE checklist, a toolbox talk template, and an incident report template.',
      'Whether you are starting your first construction job, supervising a crew, or entering industrial sites for the first time, this course gives you the foundation that good safety cultures are built on. Certified training teaches compliance; this course teaches judgment — and judgment is what prevents incidents between inspections.',
      'Disclaimer: this course provides safety AWARENESS education. It is NOT a substitute for certified safety training (e.g., CSTS, OSSA, fall protection certification, or site-specific orientations). Always follow your employer\u2019s safety program and your province\u2019s Occupational Health and Safety legislation. When in doubt, ask your supervisor or safety representative — never guess.',
    ],
    priceCad: 44.99,
    priceNote: 'one-time · lifetime access',
    category: 'Professional',
    cover: '/products/cover-safety-course.jpg',
    includes: [
      'Module 1 — Safety Mindset and PPE',
      'Module 2 — Fall Protection Basics',
      'Module 3 — Hazard Identification',
      'Module 4 — Communication and Reporting',
      'Lifetime access, self-paced',
    ],
    faq: [
      {
        q: 'Is this a safety certification?',
        a: 'Honestly: no. This course is not CSTS, OSSA, or any other certified safety training. It does not replace your employer\u2019s site-specific orientation or any legally required certification. It builds awareness — which is what certifications assume you already have when you walk in the door.',
      },
      {
        q: "If it's not a certification, why take it?",
        a: 'Because awareness is what employers actually value day to day. A worker who recognizes a struck-by hazard, checks their harness before climbing, and reports a near miss is the worker supervisors want on their crew. Certified training teaches compliance; this course teaches judgment — and judgment is what prevents incidents between inspections.',
      },
      {
        q: 'Do I need experience to take it?',
        a: 'No. The course is designed for people with zero construction background. If you have never set foot on a site, you will finish this course knowing how to protect yourself and where your rights begin.',
      },
      {
        q: 'How long does it take to complete?',
        a: 'It is self-paced. Most learners finish in about 1.5–2 hours of focused study, spread over a week or two. Take it in one sitting or a module a night — it is yours to work through at your own pace.',
      },
    ],
  },
  {
    slug: 'arabic-course',
    title: 'Learn Arabic: Beginner to Conversational',
    tagline: 'Speak real Arabic — in the script, with real people, from your very first lesson.',
    description: [
      'You have thought about learning Arabic before, and one thing stopped you: the script. Here is the truth: the Arabic alphabet has 28 letters and it is phonetic — once you learn the letters, you can read almost anything out loud. This course starts there, script-first and fear-free, with transliteration beside it as training wheels that come off naturally, and builds you lesson by lesson until you are ordering food, haggling in the souq, introducing yourself, and handling travel days in Arabic.',
      'You learn Modern Standard Arabic — the variety used in news, books, and formal settings across 22 countries — with Egyptian, Levantine, and Gulf dialect notes woven in, so you are never confused when a taxi driver in Cairo sounds different from your textbook. Every module ends in situations you will actually use: the restaurant, the souq, the taxi, the hotel, the family dinner. The special sounds are taught with mouth-position coaching, not linguistics lectures, and cultural notes teach you when to say as-salāmu ʿalaykum, how to respond, and why you always eat with your right hand.',
      'The honest promise: this course takes you from zero to confident, polite, conversational Arabic — the kind that opens doors, earns smiles, and gets you through real situations. Full fluency takes years of immersion; what you will have is a rock-solid foundation and the courage to use it.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-arabic-course.jpg',
    includes: [
      '10 modules, 68 bite-sized lessons — from the alphabet to full conversations',
      'Arabic script + transliteration + English in every lesson',
      'Pronunciation coaching for Arabic\u2019s unique sounds',
      '3 dialect survival guides: Egyptian, Levantine, and Gulf',
      'Practice dialogues, quizzes, and a final self-introduction project',
      'Cultural notes that matter — greetings, etiquette, and customs',
    ],
    faq: [
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Yes. This course assumes zero Arabic and zero language-learning experience. You start with the alphabet itself, gently, and build up lesson by lesson to real conversations.',
      },
      {
        q: 'Do I really have to learn the Arabic script?',
        a: 'Yes — and you will be glad you did. The script is phonetic, so once you know the letters you can read almost anything out loud. We teach it from Module 1 with transliteration beside it as training wheels that come off naturally.',
      },
      {
        q: 'Which Arabic will I learn — Egyptian, Gulf, Levantine?',
        a: 'You learn Modern Standard Arabic, understood across all 22 Arab countries — the variety used in news, books, and formal settings. Wherever everyday speech differs, dialect notes (Egyptian, Levantine, Gulf) are woven in so you are prepared for real conversations.',
      },
      {
        q: 'Do I get lifetime access?',
        a: 'Yes. One-time payment, lifetime access — learn at your own pace, revisit any lesson any time, and keep every future update.',
      },
    ],
  },
  {
    slug: 'french-course',
    title: 'Learn French: Beginner to Conversational',
    tagline: 'Speak French with confidence — starting with your very first lesson.',
    description: [
      'This course will not make you fluent in 30 days — no honest course can promise that. What it will do is get you speaking real French from day one: greeting people correctly, ordering food without pointing at the menu, asking for directions, and holding simple conversations. Conversation by conversation, you build the kind of French that works in a café in Paris, at a market in Montréal, or on a video call with a French-speaking colleague.',
      'The method is conversation first, grammar second: you learn French the way you use it, and grammar shows up only when it helps you say something. The famous French sounds — nasal vowels, silent letters, the "r" — are broken down step by step with simple phonetics you can practice at your kitchen table. And the cultural notes save you embarrassment: when to use tu and when it is vous, how many cheek kisses la bise involves, and when to skip it entirely.',
      'Ten modules and more than fifty lessons take you from your first Bonjour to handling travel, dining, shopping, social life, work situations, and emergencies — plus the cultural fluency to do it all with confidence. The honest part: learning a language takes time and practice. This course gives you the words, the sounds, the cultural know-how, and a clear path to keep going. Show up, practice out loud, and you will be amazed how far "just" greetings and café orders take you.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-french-course.jpg',
    includes: [
      '10 modules, 50+ lessons — alphabet and first Bonjour to travel, dining, shopping, work, and emergencies',
      'Conversation-first lessons — greetings, restaurants, shops, road, work events, pharmacy',
      'Pronunciation system for nasal vowels, silent letters, and the French "r"',
      'Cultural fluency: tu vs vous, la bise, table manners, and social etiquette',
      'Real-life scenarios, not textbook dialogues',
      'Lifetime access, learn at your own pace',
    ],
    faq: [
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Absolutely. This course is built for total beginners who have never spoken a word of French. You start with the alphabet and your first Bonjour and build from there.',
      },
      {
        q: 'How long does it take?',
        a: 'It is self-paced, so it depends on your routine. Most learners who practice a little each day move steadily through the ten modules over a few months — and you have lifetime access, so there is no deadline and no pressure.',
      },
      {
        q: 'I tried apps and still freeze when a real person speaks. Will this be different?',
        a: 'That is exactly who this course is for. Apps drill you on flashcards; this course teaches you to hold conversations — greetings, ordering, directions, small talk — with pronunciation coaching and cultural notes that apps skip, so you are ready for real people, not just quizzes.',
      },
      {
        q: 'Is this good for travel to Quebec or France?',
        a: 'Yes. The scenarios — ordering, directions, hotels, taxis, shopping, emergencies — work in Paris and in Montréal alike, and the cultural notes cover French social etiquette on both sides of the Atlantic.',
      },
    ],
  },
  {
    slug: 'spanish-course',
    title: 'Learn Spanish: From Zero to Conversational',
    tagline: 'Real conversations, real life — order the meal, ask the question, make the small talk.',
    description: [
      'Every trip to Mexico, every restaurant menu, every friendly neighbor — you smile, you nod, and you wish you could say more than hola. This course changes that. No verb conjugation tables to memorize: you learn how to order food, ask for directions, check into a hotel, chat with coworkers, and handle a doctor\u2019s visit — the conversations that actually come up in your life.',
      'Spanish is wonderfully phonetic — words sound the way they look — and we show you the few sounds that trip up English speakers (the rolled R, the silent H) and drill them until they feel natural. Alongside the language you get the culture: when to use tú and when usted, how many cheek kisses and when none, which words change meaning between Mexico and Spain. Each module is organized around a situation you will walk into, with the exact phrases you need and dialogues showing how they flow together.',
      'The honest promise: we will not tell you you will be fluent in 30 days — nobody can honestly promise that. What we can promise: finish this course and you will handle everyday conversations with confidence. You will order the meal, ask the question, make the small talk, and understand the answer. That is the Spanish that matters.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-spanish-course.jpg',
    includes: [
      '10 written lessons — pronunciation, greetings, numbers, food, directions, hotels, shopping, doctors, small talk, and putting it all together',
      '5 video lessons — watch-and-repeat pronunciation drills and real dialogues',
      'Real conversations, not grammar drills — restaurants, markets, taxis, airports, pharmacies, offices',
      'Phonetic pronunciation guides for every Spanish phrase, in plain English',
      'Cultural notes: tú vs usted, regional differences between Mexico and Spain, etiquette',
      'Practice dialogues and exercises in every module so the phrases stick',
      '30-day money-back guarantee — email us for a refund, no questions, no hard feelings',
    ],
    faq: [
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Yes. This course is built for absolute beginners. Every lesson is taught in plain English with simple phonetic pronunciation guides, and 15 minutes a day is enough to make steady progress.',
      },
      {
        q: 'How long does it take?',
        a: 'It is self-paced with lifetime access. With a little daily practice, most learners work through the ten written lessons and five video lessons over a few weeks — and there is no deadline, so the course fits your life, not the other way around.',
      },
      {
        q: 'Will I learn the Spanish of Mexico, Spain, or somewhere else?',
        a: 'The core Spanish works everywhere. Where it matters, we flag the differences — like which words change meaning between Mexico and Spain, and when to use tú versus usted — so you are never caught off guard.',
      },
      {
        q: 'What if the course is not for me?',
        a: 'Every purchase comes with a 30-day money-back guarantee. If the course is not for you, email us and we will refund you — no questions, no hard feelings.',
      },
    ],
  },
  {
    slug: 'mandarin-course',
    title: 'Speak Mandarin: Beginner to Conversational',
    tagline: 'Pinyin first — start speaking in your very first lesson, long before characters block you.',
    description: [
      'Mandarin has a reputation: four tones, thousands of characters, a language that feels like a wall. Here is the truth nobody tells beginners: you do not need the wall to come down all at once — you need a door. This course is that door. It is built on one simple idea, pinyin first: every phrase is shown three ways — Chinese characters, pinyin (Mandarin written in the Roman alphabet), and English — so you start speaking in your very first lesson. The characters are there when you are ready for them; they never block you from talking.',
      'The four tones are the hardest part of Mandarin, and we will not pretend otherwise — but they are learnable, with the hand-gesture method, tone-pair drills, and ear training that turns "they all sound the same" into "oh, I hear it now." Every lesson is built around a real situation — a restaurant, a market stall, a first meeting — so what you learn is what you will use: greetings for a taxi driver and a business client, ordering and bargaining, getting around, handling emergencies, and doing business respectfully, with culture in every module explaining the why behind the customs.',
      'The honest note: Mandarin takes effort — anyone who tells you otherwise is selling something. The tones will feel strange and the characters will look impossible; that is normal, and it is temporary. What this course promises is simpler: a clear path, real conversations from week one, and the cultural understanding that makes people want to talk with you. Show up, speak out loud, and the language opens up.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-mandarin-course.jpg',
    includes: [
      '10 modules, 79 lessons — from your first tones to a full 5-minute conversation',
      'Characters + pinyin + English in every lesson, with tone marks on pronunciation guidance',
      'The four tones made approachable — hand-gesture method, tone-pair drills, ear training',
      'Real-life scenario modules: greetings, numbers, food and dining, shopping, travel, family, work and business, emergencies',
      'Role-play conversations at the end of each module — rehearse under friendly pressure',
      'Cultural notes in every module — etiquette, customs, and the details that build real connection',
    ],
    faq: [
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Yes. No prior Chinese needed — if you can read this page, you can start. The course is built for complete beginners who have always felt intimidated by Mandarin.',
      },
      {
        q: 'Do I have to memorize thousands of characters?',
        a: 'No. The course is pinyin-first: every phrase appears with characters, pinyin, and English, so you start speaking in your first lesson. Characters are introduced gradually and never block you from talking.',
      },
      {
        q: 'Are the tones really learnable?',
        a: 'Yes — they are the hardest part of Mandarin, but they are learnable. The hand-gesture method, tone-pair drills, and ear training turn "they all sound the same" into "oh, I hear it now." Most students get comfortable with tones in the first two weeks.',
      },
      {
        q: 'Is this useful for heritage learners or professionals?',
        a: 'Yes. Heritage learners reconnecting with family language, travelers heading to China, Taiwan, Singapore, or Malaysia, and professionals working with Chinese colleagues or clients all get real conversations plus the cultural understanding — like guanxi and business-card etiquette — that makes people want to talk with them.',
      },
    ],
  },
  {
    slug: 'tagalog-course',
    title: 'Learn Tagalog: Beginner to Conversational',
    tagline: 'Speak with confidence, connect with heart — real conversations, not textbook drills.',
    description: [
      'Tagalog is spoken by over 80 million people — and if you have Filipino family, friends, coworkers, or travel plans, you have felt the gap: the smile when you say salamat right, and the wall when the conversation moves past it. This course closes that gap. No academic grammar lectures, no verb conjugation tables you will never use at a dinner table — just the words, phrases, and cultural know-how you need to hold real conversations, taught step by step in English.',
      'Every module centers on dialogues you will actually have, broken down line by line: greeting anyone properly from Kumusta with friends to the respectful po and opo with elders, ordering food like a local, shopping and bargaining with Magkano po, getting around by jeepney and tricycle, handling family gatherings with ate, kuya, tito, and tita addressed correctly, and navigating emergencies. Pronunciation uses simple romanized phonetics under every phrase — Tagalog vowels are consistent, and we prove it to you in Module 1 — with cultural notes everywhere explaining why you say po, when to do mano, and why refusing food twice matters.',
      'The honest note: no course can make you fluent in 30 days, and we will not pretend this one does. What it will do is give you a solid, confident conversational foundation — the greetings, daily phrases, cultural fluency, and practice habits that turn "I wish I could speak Tagalog" into actual conversations. Fluency comes from using it; this course gets you using it fast.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-tagalog-course.jpg',
    includes: [
      '10 modules — from your first Kumusta to confident everyday conversation',
      'Conversational dialogues broken down line by line in every module',
      'Simple romanized phonetics under every phrase',
      'Cultural notes throughout — po and opo, mano, food etiquette, family respect',
      'Real-life scenarios: the market, the family dinner, the airport, the workplace',
      'Emergency phrases for getting help and describing symptoms',
      'Warm, encouraging pace — short lessons designed for busy adults',
    ],
    faq: [
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Yes. This is a beginner-to-conversational course taught entirely in plain English. Lessons are short and practical, designed for busy adults learning a few phrases at a time.',
      },
      {
        q: 'I understand Tagalog but cannot speak it. Is this course for me?',
        a: 'Perfectly. Many heritage learners follow conversations but freeze when it is their turn to talk. This course is built around speaking — dialogues you break down, repeat, and practice — so understanding turns into actual conversation.',
      },
      {
        q: 'Will this help me at family gatherings?',
        a: 'That is one of the best reasons to take it. You will learn to address ate, kuya, tito, and tita correctly, use po and opo with elders, and never feel lost at the table again.',
      },
      {
        q: 'Do I get lifetime access?',
        a: 'Yes. One-time payment, lifetime access — learn at your own pace and revisit any lesson any time.',
      },
    ],
  },
  {
    slug: 'portuguese-course',
    title: 'Learn Portuguese: From Zero to Conversational',
    tagline: 'Brazilian Portuguese, front and center — go from "I wish I could" to real conversation.',
    description: [
      'This course was built for one simple goal: so you can hold real conversations with real people. Not recite verb conjugations, not translate sentences on paper — talk. Every lesson teaches you words and phrases you will use the same day: at a restaurant, in a taxi, at a Brazilian friend\u2019s table. Academic grammar drills are skipped in favor of what gets you speaking.',
      'It is unapologetically Brazilian — the accent, the vocabulary, the expressions you will actually hear in São Paulo, Rio, Salvador, or Fortaleza — with clear side notes wherever European Portuguese differs (trem vs. comboio, pronunciation, grammar), so Lisbon and Porto will not catch you off guard. The nasal sounds that trip up every English speaker — the ão in não, the ã in mão, the sneaky lh/nh/r sounds — are broken down into simple, physical techniques you can practice in minutes. Each module ends with mini-dialogues you can role-play today, and culture is built in: the beijinho greeting, você vs. tu vs. o senhor, why lunch is sacred.',
      'The honest truth: learning Portuguese will not happen in a weekend. But most learners are surprised at how fast they can order a meal, ask for directions, introduce themselves, and make a Brazilian smile — when the lessons are practical and the pronunciation is demystified. That is exactly what this course does.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-portuguese-course.jpg',
    includes: [
      '10 modules, 59 bite-size lessons — beginner to conversational, in a clear order',
      '70+ essential phrases with simple phonetic pronunciation guides',
      '20+ realistic dialogues from cafés, markets, hotels, offices, and family dinners',
      'Pronunciation system covering nasal vowels, the -ão sound, and the sneaky lh/nh/r sounds',
      'Brazilian Portuguese front and center, with European Portuguese differences clearly noted',
      'Cultural notes throughout — etiquette, regional differences, do\u2019s and don\u2019ts',
      'Practice exercises in every module, lifetime access, and free updates',
    ],
    faq: [
      {
        q: 'Is this Brazilian or European Portuguese?',
        a: 'Brazilian, front and center — the accent, vocabulary, and expressions you will actually hear in Brazil. European Portuguese differences (pronunciation, vocabulary, grammar) are clearly noted throughout, so travelers to Portugal will not be caught off guard.',
      },
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Yes. No prior experience needed — if you can read this page, you can start Lesson 1 today. Lessons are short, warm, and encouraging.',
      },
      {
        q: 'How long does it take?',
        a: 'It is self-paced with lifetime access. With regular practice, most learners move through the ten modules over a few months — and there is no deadline, so you learn at your own pace.',
      },
      {
        q: 'Will it help me as a traveler?',
        a: 'That is a core audience. You will order food, haggle at markets, check into hotels, describe symptoms at a pharmacy, and make small talk at parties — the exact situations travelers face.',
      },
    ],
  },
  {
    slug: 'igbo-course',
    title: 'Learn Igbo: Beginner to Conversational',
    tagline: 'From your first Ndewo to real conversation — tones, culture, and everyday phrases.',
    description: [
      'Imagine walking into a family gathering, a market in Onitsha, or a video call with relatives — and instead of smiling politely while everyone switches to Igbo around you, you greet them properly, in their language, and watch their faces light up. That is what this course is for. Igbo is spoken by tens of millions of people, but for many learners — especially second-generation speakers — it feels just out of reach: you understand a little, you can follow a joke, but speaking feels impossible. This course closes that gap, from zero or from "I understand but cannot speak," step by step to real, everyday conversations.',
      'You will not spend weeks on grammar tables before saying a word. Every lesson teaches phrases you will actually use — greeting an elder, ordering food, bargaining at the market, introducing yourself at a family event. Igbo is a tonal language, and most courses gloss over that; we coach tones from day one with clear explanations and practice drills, so you build good habits instead of guessing. Culture is woven in, not bolted on: why greetings matter so much, how titles like Mazi and Da show respect, what the kola nut ritual means, and the etiquette that keeps you welcome in any Igbo home.',
      'The honest note: no course can make you fluent in 30 days, and we will not claim this one does. What it will do is give you a genuine foundation — correct pronunciation, the tones that make Igbo Igbo, the phrases for daily life, and the cultural understanding to use them well. Fluency comes from practice; this course makes sure your practice starts on the right foot.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-igbo-course.jpg',
    includes: [
      '10 modules, 71 lessons — pronunciation and tones through culture and etiquette',
      'Tones taught properly from day one — clear explanations and practice drills',
      'Mini-dialogues in every module so you practice speaking, not just reading',
      'Cultural notes explaining the why behind the words — greetings, titles, kola nut ritual',
      'Real-life scenarios: market day, a wedding, a taxi ride, the family compound',
      'Lifetime access — learn at your own pace, revisit anytime',
    ],
    faq: [
      {
        q: 'Igbo is a tonal language. Can I really learn the tones?',
        a: 'Yes. Tones are the heart of Igbo, and this course treats them as a first-class skill from lesson one — with clear explanations and practice drills, so you build correct habits instead of guessing.',
      },
      {
        q: 'I understand Igbo but cannot speak it. Is this course for me?',
        a: 'That is one of the main audiences. Many diaspora learners understand a little but cannot speak; this course is conversational from lesson one, turning passive understanding into real, everyday conversation.',
      },
      {
        q: 'How long does it take?',
        a: 'It is self-paced with lifetime access. With consistent practice, most learners build a genuine conversational foundation over a few months — and there is no deadline.',
      },
      {
        q: 'Is this respectful of Igbo culture?',
        a: 'Culture is woven into every module, not added as an afterthought. You learn why greetings matter, how respect titles work, and the etiquette that keeps you welcome — so you speak Igbo respectfully and confidently.',
      },
    ],
  },
  {
    slug: 'hausa-course',
    title: 'Learn Hausa: Beginner to Conversational',
    tagline: 'The language of 60 million people — and the warmest greetings in West Africa.',
    description: [
      'Planning a trip to northern Nigeria or Niger? Working with Hausa-speaking colleagues? Married into a Hausa family? Or simply drawn to one of Africa\u2019s great languages? Whatever brought you here, this course was built for one thing: getting you talking. Not memorizing grammar tables — actually talking. Ordering food at a roadside spot, haggling at the market, greeting someone\u2019s grandmother properly and watching her face light up.',
      'Every module is built around real situations — the market, the taxi rank, the family visit, the office — so everything you learn is something you will actually say. Hausa\u2019s special sounds (ƙ ɗ ɓ ƴ) are broken down with plain-English mouth guides and drills, and the famously elaborate greeting rituals are taught properly — because in Hausa life, the greeting is the relationship. Culture is woven in: the Islamic customs behind daily rhythms, when to use your right hand, and how to greet elders and women respectfully — the notes that turn "correct words" into genuine connection.',
      'The honest note: this course will not make you fluent in 30 days — no honest course can promise that. What it will do is give you the phrases, the pronunciation, and the cultural confidence to have real, warm, everyday conversations in Hausa — and a solid foundation to keep building on, with a realistic 30-day practice plan so your Hausa keeps growing after the last lesson. Show up and practice, and you will be understood, welcomed, and surprising people.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-hausa-course.jpg',
    includes: [
      '10 modules, 57 lessons — from your first Sannu to confident everyday conversation',
      'Pronunciation and the Boko script — master the special sounds (ƙ ɗ ɓ ƴ), tones, and the Latin-based writing system',
      'The famously elaborate Hausa greeting rounds, done right',
      'Real-life scenario modules: food and dining, markets, travel, family, work, emergencies',
      'Cultural notes: Islamic customs, right-hand etiquette, greeting elders and women respectfully',
      'Realistic 30-day practice plan so your Hausa keeps growing after the last lesson',
      'Lifetime access — learn at your own pace, revisit anytime',
    ],
    faq: [
      {
        q: 'I have never learned a language — can I start here?',
        a: 'Yes. This course is built for complete beginners. Every lesson uses plain English with simple mouth guides and drills, and you start speaking from the very first lesson.',
      },
      {
        q: 'How hard are the special Hausa sounds?',
        a: 'Hausa has a few sounds English does not — ƙ, ɗ, ɓ, ƴ — but they are very learnable. Each one is broken down with plain-English mouth guides and practice drills, so you sound like yourself trying, not like a phrasebook.',
      },
      {
        q: 'Is this good for aid workers and travelers?',
        a: 'Yes — travelers, professionals, aid and development workers, and students are core audiences. The scenarios cover negotiating taxi fares, finding your way, markets, family visits, and everyday help — the situations you will genuinely face.',
      },
      {
        q: 'Do I get lifetime access?',
        a: 'Yes. One-time payment, lifetime access — learn at your own pace and revisit any lesson any time.',
      },
    ],
  },
  {
    slug: 'yoruba-course',
    title: 'Learn Yoruba: Beginner to Conversational',
    tagline: 'Speak with confidence. Connect with culture — the language of Lagos markets and Nollywood.',
    description: [
      'Yoruba is spoken by more than 45 million people across Nigeria, Benin, Togo, and a thriving global diaspora — the language of Lagos markets, Nollywood films, and Afrobeat lyrics, and of grandparents whose stories deserve to be heard in their own words. This course teaches you to actually hold conversations, not to recite grammar tables.',
      'You will learn to greet anyone at any time of day with the right greeting and the respect forms Yoruba culture expects. Yoruba is a tonal language, and this course treats pronunciation as a first-class skill from lesson one — high, mid, and low tone marks on every new word, so you learn pronunciation correctly from day one. Real-life scenarios carry you through ordering food, bargaining at the market, taking a taxi, checking into a hotel, and seeing a doctor, while cultural notes in every module — proverbs (owé), etiquette, and the "why" behind the customs — teach you why elders receive special greetings, what a proverb really means, and how respect is shown and earned.',
      'The honest note: learning a language takes time and practice, and we will not promise fluency in 30 days — nobody honest can. What we promise is a course built around real conversations, clear pronunciation guidance, and the cultural understanding that makes your Yoruba welcome wherever you use it. Put in the practice, and you will surprise yourself — and the people you speak to.',
    ],
    priceCad: 24.99,
    priceNote: 'one-time · lifetime access',
    category: 'Languages',
    cover: '/products/cover-yoruba-course.jpg',
    includes: [
      '10 modules, 58 lessons — from your first sounds to full conversation practice',
      'Tone-marked vocabulary throughout — high, mid, and low marks on every new word',
      'Cultural notes in every module — proverbs (owé), etiquette, and the why behind the customs',
      'Real-life scenario dialogues — the market, the taxi rank, the restaurant, the family visit',
      'Practice in every lesson — short exercises that get you speaking, not just reading',
      'Lifetime access — learn at your own pace, revisit anytime',
    ],
    faq: [
      {
        q: 'Yoruba is tonal. Can I really learn the tones?',
        a: 'Yes. Tones are treated as a first-class skill from lesson one — high, mid, and low marks on every new word — so you learn correct pronunciation from day one instead of guessing.',
      },
      {
        q: 'I am a heritage learner reconnecting with my roots. Is this for me?',
        a: 'Absolutely — heritage learners are a core audience. The course gives you real conversations plus the cultural understanding (greetings, respect forms, proverbs) that makes your Yoruba welcome at home.',
      },
      {
        q: 'How long does it take?',
        a: 'It is self-paced with lifetime access. With consistent practice, most learners build genuine conversational ability over a few months — and there is no deadline.',
      },
      {
        q: 'Is this good for travel to Nigeria, Benin, or Togo?',
        a: 'Yes. The scenarios — markets, taxis, restaurants, hotels, doctors — are the exact situations travelers face, and the cultural notes teach you the greetings and etiquette that open doors.',
      },
    ],
  },
];

export function getDigitalProduct(slug: string): DigitalProduct | undefined {
  return DIGITAL_PRODUCTS.find((p) => p.slug === slug);
}

export const DIGITAL_PRODUCT_SLUGS: string[] = DIGITAL_PRODUCTS.map((p) => p.slug);
