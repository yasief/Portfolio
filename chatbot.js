// chatbot.js — Portfolio AI Assistant
// Human-like responses · Firebase message logging · EmailJS contact notifications

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore, serverTimestamp, doc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// ─── Firebase (reuse existing app if already initialised by script.js) ──────
const _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const _db  = getFirestore(_app);

// ─── EmailJS ─────────────────────────────────────────────────────────────────
// Public (client-side) EmailJS identifiers. These are safe to expose, but abuse
// is prevented in the EmailJS dashboard (Allowed Origins locked to this domain +
// reCAPTCHA on the template), not here.
const EJS_PUBLIC_KEY  = 'f48Iu19MCWIawh5lQ';
const EJS_SERVICE_ID  = 'service_ygvqn9d';
const EJS_TEMPLATE_ID = 'template_ejz8rtj';

// ─── Session ID (groups all messages from one visitor) ────────────────────────
// Prefer a collision-resistant UUID so session docs can't be guessed/overwritten.
const SESSION_ID = (self.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const SESSION_START = new Date();

// ─── Visitor info collected once per session ──────────────────────────────────
function getVisitorInfo() {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const isTablet = /iPad|Tablet/i.test(ua);

  let browser = 'Unknown';
  if (/Edg\//i.test(ua))         browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua))browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  else if (/OPR\//i.test(ua))    browser = 'Opera';

  let os = 'Unknown';
  if (/Windows NT/i.test(ua))    os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua))  os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua))    os = 'Linux';

  const dubaiTime = SESSION_START.toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });

  return {
    sessionId:       SESSION_ID,
    sessionStart:    SESSION_START.toISOString(),
    sessionStartDubai: dubaiTime,
    pageUrl:         window.location.href,
    referrer:        document.referrer || 'Direct / No referrer',
    device:          isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop',
    browser:         browser,
    os:              os,
    screenWidth:     screen.width,
    screenHeight:    screen.height,
    language:        navigator.language || 'Unknown',
    timezone:        Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
    userAgent:       ua,
  };
}

// ─── State ────────────────────────────────────────────────────────────────────
let awaitingContactMsg = false;
let conversationHistory = [];
const MAX_HISTORY = 10;
let userType = null;
let conversationPhase = 0;

// ─── Firebase: save every message to a single session document ───────────────
async function updateSessionDocument(role, text, isContactMsg = false) {
  const sessionDocRef = doc(_db, 'chatbot_messages', SESSION_ID);

  const now = new Date();
  const dubaiTime = now.toLocaleString('en-AE', {
    timeZone: 'Asia/Dubai',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });

  const messageEntry = {
    role:         role === 'user' ? 'Visitor' : 'Bot',
    content:      text,
    timestamp:    now.toISOString(),
    timestampDubai: dubaiTime,
    isContactMsg: isContactMsg,
  };

  try {
    await setDoc(sessionDocRef, {
      ...getVisitorInfo(),
      lastUpdated:      serverTimestamp(),
      lastUpdatedDubai: dubaiTime,
      messages:         arrayUnion(messageEntry),
    }, { merge: true });
  } catch (e) { /* silent — never break chat UX on log failure */ }
}

// ─── EmailJS: notify Mohamed when someone leaves a direct message ──────────────
// Returns true only if the email was actually accepted, so the UI can tell the
// visitor the truth instead of a blanket "Done ✓".
async function notifyByEmail(text) {
  if (!window.emailjs) return false;
  try {
    await window.emailjs.send(EJS_SERVICE_ID, EJS_TEMPLATE_ID, {
      visitor_message: text,
      sent_at:         new Date().toLocaleString('en-AE', { timeZone: 'Asia/Dubai' }),
      session_id:      SESSION_ID,
    }, EJS_PUBLIC_KEY);
    return true;
  } catch (e) { return false; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Clean query: lowercase, remove extra spaces, handle contractions
function cleanQuery(q) {
  return q.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/what'?s/g, 'what is')
    .replace(/he'?s/g, 'he is')
    .replace(/don'?t/g, 'do not')
    .replace(/can'?t/g, 'cannot')
    .replace(/won'?t/g, 'will not')
    .replace(/it'?s/g, 'it is')
    .replace(/i'?ve/g, 'i have')
    .replace(/you'?re/g, 'you are')
    .trim();
}

// Detect user type from query patterns
function detectUserType(q) {
  if (/\b(hiring|hire|recruit|position|role|vacancy|job opening|opportunity)\b/.test(q)) return 'recruiter';
  if (/\b(intern|learning|student|studying|course|tutorial|guide|teach)\b/.test(q)) return 'student';
  if (/\b(invest|investor|startup|funding|capital|equity|revenue|profit|business model)\b/.test(q)) return 'investor';
  if (/\b(freelance|contract|project|consult|engagement|scope|deliverable|timeline)\b/.test(q)) return 'employee';
  return 'curious';
}

// Calculate intent match confidence (0-100)
function calculateConfidence(query, intentKeywords) {
  const queryWords = query.split(/\s+/).filter(w => w.length > 1); // Ignore short, common words
  if (queryWords.length === 0) return 0;
  let matchCount = 0;
  
  queryWords.forEach(word => {
    if (intentKeywords.some(kw => kw.includes(word) || word.includes(kw))) {
      matchCount++;
    }
  });

  return Math.min(100, Math.round((matchCount / queryWords.length) * 100));
}

// Get context-aware follow-up suggestions
function getContextualSuggestions(intentType, userType, phaseNumber) {
  const suggestionMap = {
    'greeting': {
      'recruiter': ['Current job', 'Available roles', 'Technical stack', 'Leave a message'],
      'student': ['Who is Mohamed?', 'Technical skills', 'How to learn?', 'Projects'],
      'investor': ['Key achievements', 'Performance metrics', 'Business impact', 'Contact info'],
      'employee': ['Project details', 'Previous work', 'Skills', 'Contact Mohamed'],
      'curious': ['Current job', 'Technical skills', 'Projects', 'Key achievements'],
    },
    'who_is': {
      'recruiter': ['Current job details', 'Available now?', 'Technical stack', 'Leave message'],
      'student': ['Technical skills', 'Projects', 'Career path', 'Education'],
      'investor': ['Achievements', 'Business impact', 'Growth metrics', 'Contact'],
      'employee': ['Experience level', 'Leadership style', 'Team size managed', 'Contact'],
      'curious': ['Current job', 'Previous work', 'Technical expertise', 'Contact info'],
    },
    'current_job': {
      'recruiter': ['Available to hire?', 'Notice period?', 'Rates?', 'Leave message'],
      'student': ['Technologies used', 'What I learned', 'Project details', 'Technical skills'],
      'investor': ['Team size', 'Impact metrics', 'Revenue influence', 'Performance'],
      'employee': ['Full scope', 'Team structure', 'Success metrics', 'Contact'],
      'curious': ['Previous role', 'Key achievements', 'Technical skills', 'Projects'],
    },
  };
  
  return suggestionMap[intentType]?.[userType || 'curious'] || ['More details', 'Technical skills', 'Contact info', 'Leave message'];
}

// Get phase-aware greeting
function getPhaseAwareGreeting(phase, userType) {
  if (phase === 0) {
    // First exchange - establish rapport
    const greetings = {
      'recruiter': `Hey! 👋 I'm Mohamed's AI assistant. Looking to **hire** or discuss an **opportunity**? I can help!`,
      'investor': `Hi there! 💼 I'm Mohamed's AI assistant. Interested in his **achievements** or **business impact**? Let me tell you!`,
      'student': `Hello! 📚 I'm Mohamed's AI assistant. Curious about **IT careers** or **technical skills**? Ask away!`,
      'employee': `Hi! 👋 I'm Mohamed's AI assistant. Want to know about **past projects** or **technical expertise**? I've got details!`,
      'curious': `Hey! 👋 I'm Mohamed's AI assistant. Ask me anything about his **experience**, **skills**, or **projects**!`,
    };
    return greetings[userType] || greetings['curious'];
  } else if (phase <= 2) {
    // Mid conversation - go deeper
    return `Still here! 😊 Want to explore more about Mohamed's **expertise** or **projects**?`;
  } else {
    // Late conversation - decision phase
    return `Great questions! Ready to **contact Mohamed** or need more specific details?`;
  }
}

// Minimal markdown → HTML: **bold** and newlines only.
// Escapes first so untrusted text (e.g. an echoed user query) can never inject markup.
function md(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
function esc(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ─── Intents ──────────────────────────────────────────────────────────────────
// Each intent has: match(query) → bool, respond(query) → string, suggestions[]
// RULE: every string in suggestions[] must match exactly one intent's regex below.
const INTENTS = [

  // Greeting
  {
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy', 'greetings', 'welcome'],
    match: q => /\b(hi|hello|hey|good\s*(morning|afternoon|evening|day)|howdy|greetings|welcome)\b/.test(q) && !/\b(where|what|how|when|why)\b/.test(q.substring(0, 20)),
    respond: () => pick([
      `Hey! 👋 I'm Mohamed's AI assistant. Ask me about his experience, skills, projects, or how to get in touch!`,
      `Hi there! I can help with questions about Mohamed's career, expertise, achievements, or contact details.`,
      `Hello! Welcome! I'm here to tell you everything about Mohamed's IT leadership journey and skills.`,
      `Hey! What would you like to know? I cover his background, current role, technical skills, and projects.`,
    ]),
    suggestions: ['Who is Mohamed?', 'Current job', 'Technical skills', 'Key achievements'],
  },

  // Who is Mohamed
  {
    intentType: 'who_is',
    keywords: ['who is', 'about him', 'about mohamed', 'overview', 'summary', 'background', 'profile', 'biography'],
    match: q => /\b(who (is|are)|about (him|mohamed)|overview|summary|introduce|profile|background|tell me about|biography|career summary|quick bio)\b/.test(q),
    respond: () => pick([
      `Mohamed Yasief is an IT Administrator with **5+ years** of hands-on experience. He's currently **IT Administrator at LaundryBox Dubai** (since May 2025), where he manages smart locker infrastructure, IoT systems, a custom WhatsApp chatbot, digital marketing, and operations tech. Previously, he was IT Administrator at a multi-brand F&B group in India (2021-2025), where he deployed ERP systems, built CRM solutions, and led digital campaigns. His unique blend: deep technical expertise (ERP, cloud, security) + business acumen (marketing, strategy, operations).`,
      `Mohamed is a Dubai-based IT Administrator with proven expertise in **ERP systems, cloud infrastructure, cybersecurity, and digital marketing**. Currently IT Administrator at LaundryBox Dubai, he oversees a 24/7 IoT operation across Dubai. He's deployed 3+ ERP systems, trained 50+ staff, achieved 99.7% uptime, and grew online engagement by 35% through strategic digital initiatives. Available for IT administration, ERP, and digital-transformation roles.`,
    ]),
    suggestions: ['Current job', 'Previous job', 'Key achievements', 'Is he available to hire?'],
  },

  // Current job
  {
    intentType: 'current_job',
    keywords: ['current job', 'current role', 'laundrybox', 'head of it', 'present role', 'what does he do'],
    match: q => /\b(current (job|role|position)|laundrybox|laundry box|head of it|present role|what does he do|what do you do|2025 role|latest role)\b/.test(q),
    respond: () => pick([
      `**IT Administrator at LaundryBox Dubai** — since May 2025. LaundryBox operates 24/7 smart laundry lockers across Dubai's residential buildings. Mohamed's scope: IoT infrastructure (locker firmware, cloud sync), the **24/7 WhatsApp chatbot** he built for bookings/support, mobile app backend, enterprise systems (QuickBill ERP, hardware tracking), digital marketing, SEO, CCTV, telephony systems, and the **Heat Seal Garment Label System**. He's the sole IT lead — everything digital and operational tech goes through him. It's a hybrid role: 70% tech infrastructure, 30% business ops.`,
      `He's the **IT Administrator at LaundryBox Dubai** — a fast-growing smart laundry locker company. His full responsibilities: manage the entire IoT network (100+ lockers across Dubai), built and maintain the WhatsApp chatbot (100+ daily interactions), oversee QuickBill ERP and operational systems, implement security protocols (zero breaches to date), drive digital strategy and SEO, and ensure 99%+ uptime of all systems. One-person IT department running a 24/7 operation. It's demanding but incredibly rewarding.`,
    ]),
    suggestions: ['Technical skills', 'WhatsApp chatbot', 'IoT systems', 'Contact Mohamed'],
  },

  // Previous job
  {
    keywords: ['previous job', 'past job', 'muffin house', 'mfoods', 'india', 'bangalore', 'kerala', 'earlier role', 'where did he work before'],
    match: q => /\b(previous (job|role|work|experience)|past (job|role)|muffin house|yumm|mfoods|india|bangalore|kerala|2021|2022|2023|2024|earlier role|where did he work|work history)\b/.test(q),
    respond: () => pick([
      `He was **IT Administrator at The Muffin House / Yumm Bites / MFoods** (Feb 2021 – March 2025) in Kerala and Bangalore, India. Managed IT for 3 F&B brands: server infrastructure, network security, Odoo ERP rollout across multiple locations (50+ staff trained), CRM implementation (Reelo — drove **+20% lead conversion**), cybersecurity, backups, and spearheaded digital marketing campaigns that increased online engagement by **+35%**. Key learning: IT can directly impact revenue when aligned with business strategy.`,
      `His previous role was **IT Administrator** at a multi-brand F&B group in India (4 years, 2021-2025). Responsibilities: full IT infrastructure for 3 brands across 2 states, enterprise ERP implementation, cybersecurity framework, CRM setup, digital marketing strategy, and staff training. Tangible results: **20% conversion lift**, **35% engagement growth**, **99%+ uptime**, **zero security breaches**. That experience showed him how to run IT like a business unit, not just a support function.`,
    ]),
    suggestions: ['Current job', 'ERP expertise', 'Key achievements', 'Technical skills'],
  },

  // WhatsApp chatbot
  {
    keywords: ['whatsapp chatbot', 'chatbot', 'bot', 'doubletick', 'whatsapp bot'],
    match: q => /\b(chatbot|whatsapp (bot|chatbot|chat)|bot|doubletick|messaging bot|ai bot|24.?7 bot)\b/.test(q),
    respond: () => `One of Mohamed's standout projects is the **24/7 WhatsApp chatbot** he built at LaundryBox — completely from scratch, no template. He started by analysing real user behaviour patterns, then designed the conversation flows around how customers actually use the service. It handles bookings and support around the clock, significantly cut response times, and is built on DoubleTick with Meta Flow automation. It's not just a FAQ bot — it's a proper customer experience tool built on data.`,
    suggestions: ['Heat Seal label system', 'All projects', 'Current job', 'Key achievements'],
  },

  // Heat Seal
  {
    keywords: ['heat seal', 'heat seal label system', 'garment tracking', 'label system', 'garment label'],
    match: q => /\b(heat seal|garment track|label system|garment label|heat seal label)\b/.test(q),
    respond: () => `The Heat Seal Label System is something Mohamed implemented at LaundryBox to solve a real operational problem — garments getting mixed up or lost in the process. Every item that comes in now gets a heat seal label, and it's tracked through every stage: wash, dry, fold, delivery. It transformed accuracy and completely changed how departments communicate about orders. It was a cross-functional rollout involving operations, customer service, and IT — the kind of project that looks simple but requires careful coordination to actually work.`,
    suggestions: ['WhatsApp chatbot', 'All projects', 'Current job', 'Contact Mohamed'],
  },

  // ERP
  {
    keywords: ['erp', 'odoo', 'zoho', 'quickbill', 'tally', 'cleancloud', 'erp expertise', 'erp systems'],
    match: q => /\b(erp|odoo|zoho|quickbill|tally|enterprise resource|cleancloud|erp expertise|erp systems|erp experience|erp rollout|erp implementation)\b/.test(q),
    respond: () => `ERP is genuinely Mohamed's deepest technical area. He's been doing **Odoo** for 4+ years at expert level — custom modules, data migration, go-live support, the full cycle. He also knows **Zoho Suite**, **QuickBill** (currently at LaundryBox), **Tally**, and **Cleancloud**. He's led end-to-end ERP rollouts across multi-brand businesses, training 50+ staff and handling everything from requirements through post-go-live. It's a real differentiator — a lot of IT people know ERP in theory, fewer have actually shipped one.`,
    suggestions: ['CRM experience', 'Previous job', 'Technical skills', 'All projects'],
  },

  // CRM
  {
    keywords: ['crm', 'reelo', 'freshdesk', 'zoho crm', 'customer relationship', 'crm experience'],
    match: q => /\b(crm|customer rel|reelo|freshdesk|zoho crm|crm experience|crm platform|lead conversion)\b/.test(q),
    respond: () => `He's worked with several CRM platforms — **Zoho CRM**, **Reelo** (which drove a 20% conversion lift at MFoods), **DoubleTick** for WhatsApp CRM at LaundryBox, and **Freshdesk** for support ticketing. The Reelo CRM implementation at MFoods is a good example of his approach: he didn't just deploy it, he structured the lead tracking process and tied it to measurable outcomes. The 20% conversion improvement came from that whole redesign, not just the tool.`,
    suggestions: ['ERP expertise', 'WhatsApp chatbot', 'Digital marketing', 'Key achievements'],
  },

  // Security
  {
    keywords: ['security', 'cybersecurity', 'firewall', 'vpn', 'endpoint', 'cyber'],
    match: q => /\b(security|cybersecurity|cyber|firewall|vpn|encrypt|endpoint|threat|breach|protect|data safe|zero breach|incident response)\b/.test(q),
    respond: () => `Security is something he takes seriously at every role. He's done firewall configuration, endpoint protection, VPN setup, data encryption, and IoT security for the locker network at LaundryBox. He's run staff security awareness training and built incident response procedures. The most telling stat: **zero critical security incidents** across his entire career. That's not luck — that's consistent, layered security practice.`,
    suggestions: ['Cloud & DevOps', 'IoT systems', 'Key achievements', 'Current job'],
  },

  // Cloud / DevOps
  {
    keywords: ['cloud', 'aws', 'azure', 'devops', 'github', 'hosting', 'cloud & devops'],
    match: q => /\b(aws|cloud|azure|git|github|devops|server|hosting|cpanel|ec2|cloud infra|cloud & devops)\b/.test(q),
    respond: () => `Cloud-wise he works with **AWS** (EC2, S3), **Azure PaaS**, and manages hosting through cPanel and Hostinger. He uses Git and GitHub for version control. It's more infrastructure and deployment focused — managing cloud environments, web hosting, backend services — rather than deep DevOps engineering. He keeps things running reliably rather than over-engineering the pipeline.`,
    suggestions: ['Cybersecurity', 'Programming', 'Technical skills', 'Current job'],
  },

  // Programming
  {
    keywords: ['python', 'javascript', 'programming', 'coding', 'automation', 'django'],
    match: q => /\b(python|javascript|django|html|css|programming|develop|script|automation|web dev|coding)\b/.test(q),
    respond: () => `He codes in **Python** and **JavaScript** mainly. Python he uses for automation scripts and Django web apps, JavaScript for frontend work. He's comfortable with HTML and CSS too. It's practical applied coding — building internal tools, automating workflows, custom dashboards — rather than pure software engineering. Gets the job done without over-architecting.`,
    suggestions: ['Cloud & DevOps', 'Database skills', 'Technical skills', 'All projects'],
  },

  // Database
  {
    keywords: ['database', 'sql', 'sql server', 't-sql', 'database skills'],
    match: q => /\b(sql|database|db|t-sql|sql server|backup|recovery|data management|database skills)\b/.test(q),
    respond: () => `He manages databases with **SQL Server** — query writing, stored procedures, performance tuning, and backup/recovery. He's used SQL Server Profiler for diagnosing performance issues. His database work is mostly tied to ERP systems and operational data — keeping business-critical data clean, performant, and recoverable. He's built full disaster recovery plans for multi-location businesses.`,
    suggestions: ['ERP expertise', 'Programming', 'Cloud & DevOps', 'Previous job'],
  },

  // Digital marketing
  {
    keywords: ['digital marketing', 'marketing', 'seo', 'google ads', 'analytics', 'campaign'],
    match: q => /\b(marketing|seo|campaign|social media|google ads|analytics|digital marketing|engagement|clarity|appsflyer)\b/.test(q),
    respond: () => `This is where Mohamed stands out from most IT people — he genuinely runs digital marketing. **SEO** (including AI SEO), **Google Analytics**, **Google Ads**, social campaigns. At MFoods he co-led campaigns that grew online engagement by 35%. At LaundryBox he drives digital strategy alongside the marketing team. He uses **MS Clarity** for heatmaps, **Firebase** and **AppsFlyer** for app analytics. It's data-driven marketing, not just social posting.`,
    suggestions: ['CRM experience', 'Key achievements', 'Design & creative', 'Contact Mohamed'],
  },

  // Design
  {
    keywords: ['design', 'figma', 'photoshop', 'adobe', 'canva', 'design & creative'],
    match: q => /\b(design|figma|photoshop|illustrator|adobe|canva|creative|graphic|video|premiere|after effects|visual design|design & creative)\b/.test(q),
    respond: () => `He's comfortable across the full **Adobe Creative Suite** — Photoshop, Illustrator, After Effects, Premiere Pro — plus Figma and Canva. He uses these for campaign assets, brand materials, and UI mockups. It means he can close the loop on visual work without pulling in a designer every time. For a technical lead, that's a genuinely useful extra skill.`,
    suggestions: ['Digital marketing', 'Technical skills', 'All projects', 'Contact Mohamed'],
  },

  // IoT / Smart Systems
  {
    keywords: ['iot', 'iot systems', 'smart locker', 'cctv', 'yeastar', 'tracksolid', 'locker'],
    match: q => /\b(iot|iot systems|locker|smart locker|hardware|tracksolid|pabx|yeastar|cctv|smart system|firmware|iot infrastructure|iot network)\b/.test(q),
    respond: () => `**IoT & Smart Systems** is a growing part of his expertise at LaundryBox. He manages:\n\n• **100+ Smart Lockers** — firmware updates, cloud sync, 24/7 uptime\n• **Locker Management Software** — custom backend, user app integration\n• **Hardware Tracking** — Tracksolid platform for device monitoring\n• **CCTV Infrastructure** — security cameras, remote monitoring\n• **IP Telephony** — Yeastar PABX system for customer support\n• **IoT Security** — encryption, access control, threat detection\n\nThis is cutting-edge work — most IT people don't have hands-on IoT experience. He's doing industrial-grade operational technology, not just office IT.`,
    suggestions: ['Current job', 'Cybersecurity', 'Technical skills', 'Contact Mohamed'],
  },

  // Leadership
  {
    keywords: ['leadership', 'team', 'management', 'training', 'soft skills'],
    match: q => /\b(leadership|manage|team|communicate|people skills|soft skills|train|mentoring|culture|cross.?functional|delegation|how does he lead)\b/.test(q),
    respond: () => `**Leadership & Communication** — often overlooked technical strength:\n\n• **Training & Knowledge Transfer** — trained 50+ staff on Odoo ERP, created documentation, ran workshops\n• **Cross-Functional Work** — aligns IT with operations, marketing, finance teams\n• **Problem-Solving** — explains complex tech to non-technical stakeholders\n• **Ownership Culture** — takes full responsibility for infrastructure uptime and security\n• **Documentation** — maintains detailed runbooks, disaster recovery procedures\n• **Stakeholder Management** — manages executives, operations teams, and customers\n\nHe views IT leadership as a partnership between tech and business. That mindset is rare and valuable.`,
    suggestions: ['Current job', 'Key achievements', 'ERP expertise', 'Technical skills'],
  },

  // Performance metrics
  {
    intentType: 'metrics',
    keywords: ['uptime', 'metrics', 'performance numbers', 'statistics', 'sla'],
    match: q => /\b(uptime|metric|performance number|stat|sla|reliability|how reliable|statistics|proven numbers|kpi)\b/.test(q),
    respond: () => `**Documented Performance Metrics:**\n\n• **99.7% Uptime** — across all managed infrastructure (enterprise-grade)\n• **347 Support Tickets Closed** — average response time <2 hours\n• **Zero Critical Security Incidents** — across entire 7+ year career\n• **3 ERP Systems Deployed** — Odoo, Zoho, QuickBill (50+ users trained per system)\n• **+20% Lead Conversion** — through CRM optimization (MFoods)\n• **+35% Online Engagement** — through digital marketing strategy\n• **+15% Operational Efficiency** — through process optimization\n• **8+ Sites Managed** — across multiple countries and business models\n\nThese aren't buzzwords — all documented and verified through business operations.`,
    suggestions: ['Key achievements', 'Current job', 'Technical skills', 'Contact Mohamed'],
  },

  // Certifications
  {
    keywords: ['certifications', 'certified', 'qualifications', 'credentials', 'courses'],
    match: q => /\b(certificate|certified|qualification|license|accred|credential|course|what certifications|certifications)\b/.test(q),
    respond: () => `He doesn't chase certification letters, but his **practical qualifications** speak louder:\n\n• **5+ years hands-on IT experience** — more valuable than any certificate\n• **ERP Expert** — 4+ years deep Odoo experience, trained 50+ users, deployed across multiple businesses\n• **Cybersecurity Framework** — built from scratch at MFoods, maintained zero-breach record\n• **Cloud Architecture** — deployed and maintained AWS, Azure, and hybrid infrastructures\n• **Digital Marketing Proficiency** — SEO, CRM, analytics, campaign strategy\n• **IoT Systems Management** — currently managing 100+ connected smart devices\n• **B.Tech Mechanical Engineering** — from PRIST College (2021-2024) — shows ability to pivot and learn\n\nHe believes in learning-by-doing over collecting badges. His portfolio is his resume.`,
    suggestions: ['Technical skills', 'Education', 'Current job', 'Key achievements'],
  },

  // Resume / CV
  {
    keywords: ['resume', 'cv', 'download resume', 'pdf', 'download cv'],
    match: q => /\b(resume|cv|download|pdf|full profile|send resume|your resume|download resume|download cv)\b/.test(q),
    respond: () => `His **full resume** is available for download — covers all positions, skills, achievements, and certifications. The resume includes:\n\n✓ Work history (2021-present)\n✓ Technical stack (ERP, Cloud, Security, Marketing Tech)\n✓ Key projects and measurable results\n✓ Education & certifications\n✓ Contact information\n\nYou can download it directly from the portfolio page using the Download Resume button, or email him at **mohamedyasief@gmail.com** to request it.`,
    suggestions: ['Contact Mohamed', 'Current job', 'Key achievements', 'Is he available to hire?'],
  },

  // Rates / Consulting
  {
    keywords: ['rates', 'consulting', 'pricing', 'how much', 'fees'],
    match: q => /\b(rate|price|cost|fee|hourly|consult|budget|how much|charge|pricing|affordable|rates)\b/.test(q),
    respond: () => `He's available for **full-time roles** and **project-based consulting** in Dubai and beyond. For rates and terms:\n\n📧 Email him: **mohamedyasief@gmail.com**\n📱 Call/WhatsApp: **+971 50 359 3856**\n💼 LinkedIn: **linkedin.com/in/yasief**\n\nHe customizes his engagement model based on your needs — could be:\n• **Full-time IT Leadership**\n• **ERP Implementation Projects** (3-12 months)\n• **Digital Transformation Consulting**\n• **Fractional CTO / Tech Advisory**\n\nAvailable for immediate starts. Happy to discuss details on a call.`,
    suggestions: ['Contact Mohamed', 'Is he available to hire?', 'Technical skills', 'Leave a message'],
  },

  // Achievements
  {
    intentType: 'achievements',
    keywords: ['key achievements', 'achievements', 'accomplishments', 'results', 'impact'],
    match: q => /\b(key achievements|achievements|accomplish|result|outcome|impact|success|milestone|what did he|deliver|numbers)\b/.test(q),
    respond: () => `The numbers that stand out from his career:\n\n• Built a **24/7 WhatsApp chatbot** from scratch at LaundryBox\n• Implemented the **Heat Seal garment tracking system**\n• **+20%** CRM lead conversion at MFoods\n• **+35%** online engagement through digital campaigns\n• **+15%** operational efficiency gain\n• **99%+** system uptime across all managed infrastructure\n• **Zero** critical security incidents, ever\n\nAll documented real-world outcomes.`,
    suggestions: ['WhatsApp chatbot', 'ERP expertise', 'Contact Mohamed', 'Previous job'],
  },

  // All projects
  {
    keywords: ['all projects', 'projects', 'portfolio', 'what has he built', 'key projects'],
    match: q => /\b(all projects|projects|portfolio|built|created|implement|launch|deploy|key projects|what has he (done|built)|worked on)\b/.test(q),
    respond: () => `His key projects:\n\n**01 · 24/7 WhatsApp Chatbot** — built from scratch at LaundryBox for bookings and support\n**02 · Heat Seal Label System** — garment tracking that transformed LaundryBox operations\n**03 · End-to-End ERP Rollout** — Odoo across 3 brands, 50+ staff trained\n**04 · Enterprise Infrastructure Upgrade** — network re-architecture, cloud integration, 15% efficiency gain\n**05 · Cybersecurity Program** — layered security framework, zero breaches\n**06 · CRM & Marketing Overhaul** — +20% conversions, +35% engagement`,
    suggestions: ['WhatsApp chatbot', 'ERP expertise', 'Heat Seal label system', 'Key achievements'],
  },

  // Education
  {
    keywords: ['education', 'degree', 'college', 'university', 'studied', 'prist'],
    match: q => /\b(education|study|degree|college|university|graduate|academic|school|prist|studied)\b/.test(q),
    respond: () => `He has a **Bachelor of Technology in Mechanical Engineering** from PRIST College of Engineering (2021–2024). A bit of a pivot from mechanical to IT — but honestly, that's what makes him interesting. His entire tech skillset was built through hands-on real-world experience, not a CS degree. He's deployed actual ERP systems, run production IoT networks, and built AI chatbots. That's worth more than most textbooks.`,
    suggestions: ['Previous job', 'Technical skills', 'Key achievements', 'Contact Mohamed'],
  },

  // Languages
  {
    keywords: ['languages', 'speaks', 'english', 'arabic', 'tamil', 'multilingual'],
    match: q => /\b(language|speak|spoken|english|arabic|tamil|malayalam|multilingual|languages)\b/.test(q),
    respond: () => `He speaks four languages: **English** (fluent), **Tamil** (native), **Malayalam** (fluent), and **Arabic** (basic). Being genuinely multilingual is a real asset in Dubai's international work environment — it's not just a line on a CV.`,
    suggestions: ['Who is Mohamed?', 'Where is he based?', 'Contact Mohamed', 'Previous job'],
  },

  // Location
  {
    keywords: ['where is he based?', 'dubai', 'uae', 'location', 'relocate'],
    match: q => /\b(where.*based|where.*located|dubai|uae|united arab emirates|based in|located in|relocate|kerala|bangalore|current location|where is he)\b/.test(q),
    respond: () => `He's based in **Dubai, UAE**. Relocated there in May 2025 for the LaundryBox role. Before that he was in Kerala and Bangalore, India for about 4 years. He's available for roles in Dubai and open to discussing other arrangements.`,
    suggestions: ['Current job', 'Previous job', 'Contact Mohamed', 'Is he available to hire?'],
  },

  // Availability / hiring
  {
    intentType: 'availability',
    keywords: ['available to hire', 'is he available', 'hiring', 'open to work', 'freelance'],
    match: q => /\b(available|hire|open to|opportunity|looking for|job hunting|full.?time|freelance|remote|contract|open to work|recruit|is he available|available to hire)\b/.test(q),
    respond: () => `He's **open to work**. Available for full-time IT leadership and digital transformation roles in Dubai, ERP implementation projects, or digital strategy and marketing tech consulting. Immediate start is possible.\n\nBest way to reach him: **mohamedyasief@gmail.com** or **+971 50 359 3856**.`,
    suggestions: ['Leave a message', 'Previous job', 'Technical skills', 'Key achievements'],
  },

  // Contact
  {
    keywords: ['contact mohamed', 'contact', 'email', 'phone', 'linkedin', 'get in touch'],
    match: q => /\b(contact|reach|email|phone|number|linkedin|connect|get in touch|how to contact|call)\b/.test(q),
    respond: () => `You can reach Mohamed at:\n\n📧 **mohamedyasief@gmail.com**\n📱 **+971 50 359 3856**\n💼 **linkedin.com/in/yasief**\n\nHe's based in Dubai and open to full-time roles and project work.`,
    suggestions: ['Leave a message', 'Who is Mohamed?', 'Current job', 'Key achievements'],
  },

  // Leave a message
  {
    keywords: ['leave a message', 'send a message', 'message him', 'reach out'],
    match: q => /\b(leave a message|leave.*message|send.*(him|a).*(message|note)|message.*(for|to|him)|write.*(to|him)|tell him|reach out|inquire|contact him directly)\b/.test(q),
    respond: () => {
      awaitingContactMsg = true;
      return `Sure! Go ahead and type your message for Mohamed below. I'll make sure he gets it. 👇`;
    },
    suggestions: [],
  },

  // Skills overview
  {
    keywords: ['technical skills', 'skills', 'tech stack', 'all skills', 'expertise'],
    match: q => /\b(technical skills|skill|tech stack|tool|what can|capabilities|all skills|full skill|expertise)\b/.test(q),
    respond: () => `He covers a wide range. The main areas:\n\n• **ERP** — Odoo, Zoho, QuickBill, Tally, Cleancloud\n• **CRM & Marketing** — Zoho CRM, Reelo, DoubleTick, Google Analytics, SEO\n• **Cloud & DevOps** — AWS, Azure, Git, cPanel\n• **Programming** — Python, JavaScript, Django, HTML/CSS\n• **Security** — Firewalls, VPN, endpoint protection, IoT security\n• **Databases** — SQL Server, T-SQL\n• **Design** — Adobe Suite, Figma, Canva\n\nHe's one of those IT people who can work across the full stack — from server room to Google Ads.`,
    suggestions: ['ERP expertise', 'Cloud & DevOps', 'Cybersecurity', 'Digital marketing'],
  },

  // Thanks / Appreciation
  {
    keywords: ['thank', 'thanks', 'appreciate', 'helpful', 'awesome', 'great'],
    match: q => /\b(thank|thanks|cheers|appreciate|helpful|great|perfect|awesome|nice one|good job|well done|brilliant|useful|many thanks)\b/.test(q),
    respond: () => pick([
      `Glad I could help! Anything else you'd like to know about Mohamed or his work?`,
      `Happy to help! Feel free to ask more about his projects, skills, or how to reach him.`,
      `Of course! Let me know if there's anything else — I've got plenty more details about his career.`,
      `No problem! Want to know anything else, or ready to get in touch with Mohamed?`,
    ]),
    suggestions: ['Leave a message', 'Contact Mohamed', 'Key achievements', 'Technical skills'],
  },

  // Off-topic / Nonsensical query — detect completely unrelated questions
  {
    keywords: ['off-topic', 'unrelated', 'nonsense'], // General keywords for off-topic
    match: q => {
      // Check if query is completely unrelated to Mohamed or business
      const offTopicKeywords = ['pants|shirt|clothes|food|recipe|movie|game|sport|car|house|pet|animal|weather|school|university|homework|love|dating|girlfriend|boyfriend|wife|baby|child|family members|music|song|concert|actor|celebrity|tv show|book|novel|videogame|pizza|coffee|tea|drink|alcohol|beer|wine|smoking|drugs|medicine|doctor|hospital|pain|illness|disease|virus|covid|vaccination|politics|election|president|government|law|lawyer|court|police|crime|prison|bomb|gun|weapon|hack|steal|money|debt|loan|bank|stock|bitcoin|crypto|nsfw|adult|xxx|porn|sex'];
      const isOffTopic = new RegExp(`\\b(${offTopicKeywords})\\b`).test(q);
      
      // If it has Mohamed/business keywords, don't match this
      const hasRelevantKeywords = /\b(mohamed|yasief|job|work|skill|experience|project|erp|chatbot|laundrybox|hiring|hire|available|contact|email|phone)\b/.test(q);
      
      return isOffTopic && !hasRelevantKeywords;
    },
    respond: () => pick([
      `Ha! That's outside my wheelhouse. 😄 I'm specifically here to help with questions about **Mohamed's career, skills, and projects**. What would you like to know about him?`,
      `Fun question, but I'm focused on Mohamed's professional profile! Ask me about his **ERP expertise**, **current job**, **projects**, or **how to contact him**.`,
      `That's not something I know about! But I'm great at answering questions about **Mohamed's IT leadership journey**. What can I tell you about him?`,
      `I think you've got the wrong AI for that! 😊 I'm here to help with questions about **Mohamed's work experience and skills**. What else would you like to know?`,
    ]),
    suggestions: ['Who is Mohamed?', 'Current job', 'Technical skills', 'Contact info'],
  },

  // Fallback / Unknown query — always matches last
  {
    keywords: ['unknown', 'fallback'], // General keywords for fallback
    match: () => true,
    respond: () => pick([
      `I don't have that info, but I'm great at answering questions about Mohamed's **experience**, **skills**, **projects**, **achievements**, or **how to contact** him. What would you like to know?`,
      `Good question, but that's outside my knowledge base! Try asking: What's his current job? What are his technical skills? What projects has he built? How can I contact him?`,
      `Not sure about that one! I can help with: **Who is Mohamed?** · **His current role** · **ERP expertise** · **Key achievements** · **Contact details**. Pick one!`,
      `That's a bit beyond what I know. But I can answer almost anything about Mohamed's **career**, **tech skills**, **leadership experience**, or **availability**. Ask away!`,
    ]),
    suggestions: ['Who is Mohamed?', 'Technical skills', 'Current job', 'Contact info'],
  },
];

// ─── DOM builders ─────────────────────────────────────────────────────────────
function buildWidget() {
  const widget = document.createElement('div');
  widget.id = 'chatbot-widget';
  widget.setAttribute('aria-label', 'Chat assistant');
  widget.innerHTML = `
    <button id="chat-toggle-btn" type="button" aria-label="Open Mohamed's AI assistant">
      <span class="chat-icon-open" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M8 10h8M8 14h5"/>
        </svg>
      </span>
      <span class="chat-icon-close" aria-hidden="true">✕</span>
      <span class="chat-notif-dot" aria-hidden="true"></span>
    </button>

    <div id="chat-panel" role="dialog" aria-modal="true" aria-label="Chat with Mohamed's assistant">
      <div class="chat-header">
        <div class="chat-header-avatar" aria-hidden="true">MY</div>
        <div class="chat-header-info">
          <div class="chat-header-name">Mohamed's AI</div>
          <div class="chat-header-status">● Online · Ask me anything</div>
        </div>
        <button class="chat-close-btn" type="button" aria-label="Close chat">✕</button>
      </div>

      <div class="chat-messages" id="chat-messages" role="log" aria-live="polite"></div>
      <div class="chat-quick-replies" id="chat-quick-replies" aria-label="Quick replies"></div>

      <div class="chat-input-row">
        <input
          id="chat-input" type="text"
          placeholder="Ask about Mohamed…"
          autocomplete="off" spellcheck="false" maxlength="300"
          aria-label="Type your question"
        >
        <button id="chat-send-btn" type="button" aria-label="Send">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);
  return widget;
}

// ─── Message rendering ────────────────────────────────────────────────────────
function scrollBottom() {
  const el = document.getElementById('chat-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function addUserMsg(text) {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg user';
  el.innerHTML = `<div class="chat-msg-bubble">${esc(text)}</div>`;
  container.appendChild(el);
  scrollBottom();
}

function addBotMsg(text, suggestions = []) {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-msg bot';
  el.innerHTML = `
    <div class="chat-msg-avatar" aria-hidden="true">MY</div>
    <div class="chat-msg-bubble">${md(text)}</div>
  `;
  container.appendChild(el);
  scrollBottom();
  if (suggestions.length) setQuickReplies(suggestions);
}

let isTyping = false;

function showTypingThen(text, suggestions, delay) {
  isTyping = true;
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-typing';
  el.id = 'chat-typing-indicator';
  el.innerHTML = `
    <div class="chat-msg-avatar" aria-hidden="true">MY</div>
    <div class="chat-typing-dots" aria-hidden="true">
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
    </div>
  `;
  container.appendChild(el);
  scrollBottom();
  setTimeout(() => {
    el.remove();
    isTyping = false;
    addBotMsg(text, suggestions);
  }, delay);
}

function setQuickReplies(suggestions) {
  const qr = document.getElementById('chat-quick-replies');
  qr.innerHTML = '';
  suggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'chat-qr-btn';
    btn.type = 'button';
    btn.textContent = s;
    btn.addEventListener('click', () => sendMessage(s));
    qr.appendChild(btn);
  });
}

function clearQuickReplies() {
  const qr = document.getElementById('chat-quick-replies');
  if (qr) qr.innerHTML = '';
}

// ─── Core send + response logic ───────────────────────────────────────────────
async function sendMessage(rawText) {
  const text = rawText.trim();
  if (!text || isTyping) return;

  const input = document.getElementById('chat-input');
  if (input) input.value = '';
  clearQuickReplies();
  addUserMsg(text);

  // Track in conversation history
  conversationHistory.push({ role: 'user', content: text });
  if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();

  // Detect user type on first meaningful interaction
  if (!userType && conversationHistory.length >= 2) {
    userType = detectUserType(text);
  }

  // Increase conversation phase
  conversationPhase = Math.min(3, conversationPhase + 0.5);

  // ── Contact message flow ─────────────────────────────────────────────────
  if (awaitingContactMsg) {
    awaitingContactMsg = false;
    updateSessionDocument('user', text, true); // Log user's contact message
    conversationHistory.push({ role: 'bot', content: 'Contact message received' });
    // Wait for the actual send result before confirming — never claim success on a
    // silent failure. On failure, fall back to direct email/phone.
    notifyByEmail(text).then(sent => {
      const botResponse = sent
        ? `Done! ✓ Mohamed will see your message. For urgent matters, you can also email him directly at **mohamedyasief@gmail.com** or call **+971 50 359 3856**.`
        : `I couldn't send that just now — sorry about that. Please email Mohamed directly at **mohamedyasief@gmail.com** or call **+971 50 359 3856** and he'll get right back to you.`;
      updateSessionDocument('bot', botResponse, false); // Log bot's response
      showTypingThen(botResponse, ['Who is Mohamed?', 'Technical skills', 'Contact info'], 1200);
    });
    return;
  }

  // ── Regular message: save to Firebase (analytics) ─────────────────────────
  updateSessionDocument('user', text, false); // Log user's regular message

  // ── Match intent with confidence scoring ──────────────────────────────────
  const cleanedQ = cleanQuery(text);
  let bestMatch = null;
  let bestConfidence = 0;

  for (const intent of INTENTS) {
    if (intent.match(cleanedQ)) {
      // Simple confidence: check how many keywords match
      const intentKeywords = intent.keywords || [];
      const confidence = intentKeywords.length > 0 ? 
        calculateConfidence(cleanedQ, intentKeywords) : 85; // Default confidence if no keywords defined
      
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = intent;
      }
    }
  }

  // Only respond if confidence > 40%, otherwise use fallback
  if (!bestMatch || bestConfidence < 40) {
    bestMatch = INTENTS[INTENTS.length - 1]; // Use fallback
  }

  // Get context-aware suggestions
  const intentType = bestMatch.intentType || 'general';
  const suggestions = bestMatch.suggestions || getContextualSuggestions(intentType, userType, Math.floor(conversationPhase));

  let responseText = bestMatch.respond(cleanedQ);
  
  // Enhance response with user type awareness for certain intents
  if (userType === 'recruiter' && ['current_job', 'who_is', 'achievements'].includes(intentType)) {
    responseText += '\n\n💼 **Interested in hiring?** Leave me a message or contact directly!';
  } else if (userType === 'investor' && ['achievements', 'metrics'].includes(intentType)) {
    responseText += '\n\n📊 **Want to discuss opportunities?** I can connect you with Mohamed!';
  }

  conversationHistory.push({ role: 'bot', content: responseText });
  updateSessionDocument('bot', responseText, false); // Log bot's response

  const delay = Math.min(600 + (responseText.length || 100) * 2, 2500);
  showTypingThen(responseText, suggestions, delay);
}

// ─── Panel / widget controls ──────────────────────────────────────────────────
function togglePanel() {
  document.getElementById('chatbot-widget').classList.toggle('open');
}
function closePanel() {
  document.getElementById('chatbot-widget').classList.remove('open');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  const widget = buildWidget();

  widget.querySelector('#chat-toggle-btn').addEventListener('click', togglePanel);
  widget.querySelector('.chat-close-btn').addEventListener('click', closePanel);
  widget.querySelector('#chat-send-btn').addEventListener('click', () => {
    sendMessage(document.getElementById('chat-input').value);
  });
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e.target.value); }
  });

  // Prevent wheel events inside the open panel from triggering page navigation
  widget.querySelector('#chat-panel').addEventListener('wheel', e => {
    e.stopPropagation();
  }, { passive: true });

  // Welcome message
  setTimeout(() => {
    addBotMsg(
      `**Hi! 👋 I'm Mohamed's AI assistant.** I answer questions about his **5+ years** of IT administration, **ERP expertise**, **smart systems**, and **digital transformation** work. Ask me anything — or pick a quick reply below to get started!`,
      ['Who is Mohamed?', 'Current job', 'Key achievements', 'Leave a message']
    );
  }, 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
