/* ══════════════════════════════════════════════════════════════════════════
   Arabic / RTL support (idea #69)

   Non-invasive by design: instead of tagging every element with data-i18n,
   this walks text nodes at runtime and swaps them against an EN→AR map,
   caching the originals so switching back is lossless. Anything missing from
   the dictionary simply stays in English — no broken keys, no empty strings.

   Technical proper nouns (AWS, Odoo, Zoho, Git, Django, LinkedIn, …) are
   deliberately left in Latin script, which is standard practice in Gulf
   professional/technical writing.

   NOTE: the Arabic copy below is Modern Standard Arabic written for a
   professional audience. It should be reviewed by a native speaker before
   being treated as final.
   ══════════════════════════════════════════════════════════════════════════ */

const AR = {
  // ── Chrome / nav ──
  'Skip to content': 'تخطَّ إلى المحتوى',
  'Available · Dubai, UAE': 'متاح · دبي، الإمارات',
  'Night': 'ليلي',
  'Day': 'نهاري',
  'Solar': 'شمسي',
  'Command': 'الأوامر',
  'Scroll to explore': 'مرّر للاستكشاف',

  // ── Hero ──
  '// IT Administrator · Dubai, UAE': '// مسؤول تقنية المعلومات · دبي، الإمارات',
  'Administrator': 'مسؤول تقنية المعلومات',
  'ERP Specialist': 'أخصائي أنظمة تخطيط الموارد',
  'Digital Marketing': 'التسويق الرقمي',
  'Get in Touch': 'تواصل معي',
  'Resume': 'السيرة الذاتية',
  'ERP Systems': 'أنظمة تخطيط الموارد',
  'IT Security': 'أمن المعلومات',
  'Endpoint · Firewall · DR': 'حماية الأجهزة · جدار حماية · التعافي',
  'Cloud & DevOps': 'الحوسبة السحابية',
  'CRM · Campaigns': 'إدارة العملاء · الحملات',
  'Web Management': 'إدارة المواقع',

  // ── Ticker / stats ──
  'UPTIME': 'زمن التشغيل',
  'TICKETS CLOSED': 'التذاكر المغلقة',
  'ERP SYSTEMS': 'أنظمة تخطيط الموارد',
  '3 DEPLOYED': '٣ أنظمة مُطبّقة',
  'SECURITY INCIDENTS': 'الحوادث الأمنية',
  'RESPONSE TIME': 'زمن الاستجابة',
  'SITES MANAGED': 'المواقع المُدارة',
  'LOCATION': 'الموقع',
  'DUBAI, UAE': 'دبي، الإمارات',
  'STATUS': 'الحالة',
  '● OPEN TO WORK': '● متاح للعمل',

  // ── Game panel ──
  'REFLEX TEST': 'اختبار سرعة البديهة',
  'Reflex Test': 'اختبار سرعة البديهة',
  'Click the targets.': 'انقر على الأهداف.',
  'Score': 'النتيجة',
  'Time': 'الوقت',
  'Combo': 'التتابع',
  'Start': 'ابدأ',
  'Complete': 'انتهى',
  'Save': 'حفظ',
  'Again': 'مرة أخرى',
  'New High Score! Enter your name:': 'رقم قياسي جديد! أدخل اسمك:',

  // ── About ──
  'About Me': 'نبذة عني',
  'Results-driven,': 'مدفوع بالنتائج،',
  'always': 'ودائم',
  'evolving': 'التطوّر',
  'IT Administrator with deep expertise in ERP systems, IT infrastructure, and digital marketing. I bridge the gap between technology and business — optimising processes, securing systems, and empowering teams.':
    'مسؤول تقنية معلومات يمتلك خبرة عميقة في أنظمة تخطيط الموارد والبنية التحتية التقنية والتسويق الرقمي. أَصِل بين التقنية والأعمال — بتحسين العمليات وتأمين الأنظمة وتمكين الفرق.',
  'Years Experience': 'سنوات الخبرة',
  'Brands Managed': 'العلامات التجارية المُدارة',
  'CRM Lead Conversion': 'تحويل العملاء المحتملين',
  'Engagement Increase': 'زيادة التفاعل',
  'Email': 'البريد الإلكتروني',
  'UAE Mobile': 'الهاتف (الإمارات)',

  // ── Experience ──
  'Work': 'الخبرة',
  'Experience': 'العملية',
  'CURRENT': 'الحالي',
  'PREVIOUS': 'السابق',
  'IT Administrator': 'مسؤول تقنية المعلومات',
  'May 2025 → Present': 'مايو ٢٠٢٥ ← حتى الآن',
  'Feb 2021 → Mar 2025': 'فبراير ٢٠٢١ ← مارس ٢٠٢٥',
  'Dubai, UAE': 'دبي، الإمارات',
  'May 2025 – Present': 'مايو ٢٠٢٥ – حتى الآن',
  'Feb 2021 – Mar 2025': 'فبراير ٢٠٢١ – مارس ٢٠٢٥',
  'Smart Tech · IoT · Laundry Services': 'تقنيات ذكية · إنترنت الأشياء · خدمات الغسيل',
  'Live Role': 'الدور الحالي',
  'Kerala & Bangalore, India': 'كيرالا وبنغالور، الهند',
  'Food & Beverage · Multi-Location': 'الأغذية والمشروبات · مواقع متعددة',
  "LaundryBox is Dubai's pioneering smart laundry platform — combining custom high-tech lockers, a proprietary IoT system, and a 24/7 facility enabling residents to do laundry anytime without leaving their building. I keep this connected ecosystem running flawlessly around the clock.":
    'LaundryBox هي المنصة الرائدة للغسيل الذكي في دبي — تجمع بين خزائن عالية التقنية ونظام إنترنت أشياء خاص ومنشأة تعمل على مدار الساعة تتيح للسكان غسل ملابسهم في أي وقت دون مغادرة المبنى. أُبقي هذه المنظومة المترابطة تعمل بسلاسة على مدار الساعة.',
  'Infrastructure Management': 'إدارة البنية التحتية',
  'Managing all IT infrastructure for smart locker network deployed across Dubai residential buildings':
    'إدارة كامل البنية التحتية التقنية لشبكة الخزائن الذكية المنتشرة في المباني السكنية بدبي',
  'IoT Security': 'أمن إنترنت الأشياء',
  'Implementing security protocols across connected locker hardware and cloud-backend systems':
    'تطبيق بروتوكولات الأمان على أجهزة الخزائن المتصلة وأنظمة الخوادم السحابية',
  '24/7 System Uptime': 'تشغيل النظام على مدار الساعة',
  'Ensuring zero-downtime operation of the proprietary locker management software platform':
    'ضمان تشغيل منصة إدارة الخزائن دون أي انقطاع',
  'App & Backend Support': 'دعم التطبيق والأنظمة الخلفية',
  'Supporting mobile app integrations, payment systems, and customer-facing digital touchpoints':
    'دعم تكاملات تطبيق الهاتف وأنظمة الدفع ونقاط التواصل الرقمية مع العملاء',
  'Hardware Maintenance': 'صيانة الأجهزة',
  'Coordinating locker hardware diagnostics, firmware updates, and preventive maintenance':
    'تنسيق فحص أجهزة الخزائن وتحديث البرامج الثابتة والصيانة الوقائية',
  'Tech-Led Process Improvement': 'تحسين العمليات تقنيًا',
  'Partnering with ops and engineering on data-driven improvements to service delivery efficiency':
    'التعاون مع فرق التشغيل والهندسة على تحسينات قائمة على البيانات لرفع كفاءة تقديم الخدمة',
  'IoT Systems': 'أنظمة إنترنت الأشياء',
  'Network Admin': 'إدارة الشبكات',
  'Cybersecurity': 'الأمن السيبراني',
  'Mobile App Support': 'دعم تطبيقات الهاتف',
  'Managed end-to-end IT operations across three brands and multiple locations — from server infrastructure and network reliability to ERP deployment, digital marketing campaigns, and vendor management. A high-impact role demanding both technical depth and strategic leadership.':
    'أدرتُ عمليات تقنية المعلومات بالكامل عبر ثلاث علامات تجارية ومواقع متعددة — من بنية الخوادم وموثوقية الشبكات إلى تطبيق أنظمة تخطيط الموارد وحملات التسويق الرقمي وإدارة المورّدين. دور عالي الأثر يتطلب عمقًا تقنيًا وقيادة استراتيجية.',
  'Multi-Site Infrastructure': 'بنية تحتية متعددة المواقع',
  'Managed servers, networks, and hardware across multiple restaurant locations ensuring high performance and uptime':
    'إدارة الخوادم والشبكات والأجهزة عبر عدة فروع لضمان الأداء العالي واستمرارية التشغيل',
  'ERP Integration': 'تكامل أنظمة تخطيط الموارد',
  'Led Odoo, QuickBill & Zoho ERP rollout across business units — data migration, training, go-live support':
    'قدتُ تطبيق أنظمة Odoo وQuickBill وZoho عبر وحدات العمل — ترحيل البيانات والتدريب ودعم الإطلاق',
  'Security Protocols': 'بروتوكولات الأمان',
  'Implemented endpoint protection, firewall policies and data encryption across all systems':
    'طبّقتُ حماية الأجهزة الطرفية وسياسات جدار الحماية وتشفير البيانات عبر جميع الأنظمة',
  'Designed campaigns increasing online engagement by 35% and CRM lead conversion by 20%':
    'صمّمتُ حملات رفعت التفاعل الرقمي بنسبة ٣٥٪ وتحويل العملاء المحتملين بنسبة ٢٠٪',
  'Backup & Disaster Recovery': 'النسخ الاحتياطي والتعافي من الكوارث',
  'Built comprehensive data backup strategies and DR plans for business continuity':
    'بنيتُ استراتيجيات شاملة للنسخ الاحتياطي وخطط التعافي لضمان استمرارية الأعمال',
  'Training & Vendor Mgmt': 'التدريب وإدارة المورّدين',
  'Trained staff on new systems; coordinated IT vendors and procurement within budget':
    'درّبتُ الموظفين على الأنظمة الجديدة ونسّقتُ مع مورّدي التقنية والمشتريات ضمن الميزانية',

  // ── Dashboard ──
  'IT Admin': 'لوحة تحكم',
  'Dashboard': 'تقنية المعلومات',
  'Server Status': 'حالة الخوادم',
  'Network Topology': 'طوبولوجيا الشبكة',
  'System Uptime': 'زمن تشغيل النظام',
  'Monthly Average': 'المتوسط الشهري',
  'Tickets Resolved': 'التذاكر المُنجزة',
  'Total Tickets Closed': 'إجمالي التذاكر المغلقة',
  'ERP & Software Expertise': 'خبرة أنظمة تخطيط الموارد والبرمجيات',
  'Expert · 4+ yrs': 'خبير · أكثر من ٤ سنوات',
  'Advanced · 3 yrs': 'متقدم · ٣ سنوات',
  'Advanced': 'متقدم',
  'Proficient': 'متمكّن',
  'Core Competency': 'الكفاءات الأساسية',
  'Networks': 'الشبكات',
  'ERP': 'تخطيط الموارد',
  'Security': 'الأمن',
  'Activity Log': 'سجل النشاط',

  // ── Skills ──
  'Technical': 'المهارات',
  'Skills': 'التقنية',
  'Core Technologies': 'التقنيات الأساسية',
  'Networking & Security': 'الشبكات والأمن',
  'Firewalls': 'جدران الحماية',
  'Endpoint Security': 'أمن الأجهزة الطرفية',
  'Database Management (SQL)': 'إدارة قواعد البيانات (SQL)',
  'Backup/Recovery': 'النسخ الاحتياطي والاستعادة',
  'Optimization': 'تحسين الأداء',
  'Python Development': 'تطوير Python',
  'Automation Scripts': 'برامج الأتمتة',
  'Data Processing': 'معالجة البيانات',
  'Software & Platforms': 'البرمجيات والمنصات',
  'CRM Platforms': 'منصات إدارة العملاء',
  'Lead Management': 'إدارة العملاء المحتملين',
  'Operating Systems': 'أنظمة التشغيل',
  'Professional Skills': 'المهارات المهنية',
  'Problem Solving': 'حل المشكلات',
  'Team Leadership': 'قيادة الفرق',
  'Vendor Management': 'إدارة المورّدين',
  'Process Improvement': 'تحسين العمليات',
  'Time Management': 'إدارة الوقت',
  'Adaptability': 'المرونة والتكيّف',
  'Data Analysis': 'تحليل البيانات',
  'Technical Support': 'الدعم التقني',
  'User Training': 'تدريب المستخدمين',
  'Languages': 'اللغات',
  'English': 'الإنجليزية',
  '(Fluent)': '(بطلاقة)',
  'Tamil': 'التاميلية',
  '(Native)': '(لغة أم)',
  'Malayalam': 'المالايالامية',
  'Arabic': 'العربية',
  '(Basic)': '(أساسية)',

  // ── Projects ──
  'Key': 'أبرز',
  'Projects': 'المشاريع',
  'Outcome': 'النتيجة',
  '24/7 coverage · faster replies': 'تغطية على مدار الساعة · ردود أسرع',
  'Automation': 'الأتمتة',
  '24/7 WhatsApp Chatbot': 'روبوت محادثة واتساب على مدار الساعة',
  'Built from scratch at LaundryBox — no template. Designed the conversation flows around real customer behaviour so it handles bookings and support around the clock (100+ daily interactions), significantly cutting response times. Built on DoubleTick with Meta Flow automation.':
    'بُني من الصفر في LaundryBox دون أي قالب جاهز. صمّمتُ مسارات المحادثة بناءً على سلوك العملاء الفعلي ليتولى الحجوزات والدعم على مدار الساعة (أكثر من ١٠٠ تفاعل يوميًا)، مما قلّص زمن الاستجابة بشكل كبير. مبني على DoubleTick مع أتمتة Meta Flow.',
  'Order accuracy transformed': 'نقلة في دقة الطلبات',
  'IoT & Ops': 'إنترنت الأشياء والتشغيل',
  'Heat Seal Garment Tracking': 'تتبّع الملابس بملصقات حرارية',
  'Solved a real operational problem at LaundryBox — garments getting mixed up or lost. Every item now gets a heat-seal label tracked through every stage: wash, dry, fold, delivery. A cross-functional rollout across operations, customer service, and IT that transformed accuracy.':
    'حلَّ مشكلة تشغيلية حقيقية في LaundryBox — اختلاط الملابس أو ضياعها. أصبحت كل قطعة تحمل ملصقًا حراريًا يُتتبع عبر كل مرحلة: الغسل والتجفيف والطي والتسليم. تطبيق شامل شمل التشغيل وخدمة العملاء وتقنية المعلومات، وأحدث نقلة في الدقة.',
  'Process Design': 'تصميم العمليات',
  'Tracking': 'التتبّع',
  '15% efficiency gain': 'زيادة كفاءة ١٥٪',
  'Infrastructure': 'البنية التحتية',
  'Enterprise Infrastructure Upgrade': 'ترقية البنية التحتية للمؤسسة',
  'Spearheaded a comprehensive overhaul of IT infrastructure across multiple locations — re-architecting network topology, upgrading server hardware, and integrating cloud services to improve scalability and reduce cost of ownership.':
    'قدتُ إصلاحًا شاملًا للبنية التحتية التقنية عبر مواقع متعددة — بإعادة تصميم طوبولوجيا الشبكة وترقية أجهزة الخوادم ودمج الخدمات السحابية لتحسين القابلية للتوسع وخفض تكلفة التملّك.',
  'Networking': 'الشبكات',
  'Server Admin': 'إدارة الخوادم',
  'Zero critical breaches': 'صفر اختراقات حرجة',
  'Cybersecurity Enhancement Program': 'برنامج تعزيز الأمن السيبراني',
  'Deployed a layered security framework — implementing endpoint protection, firewall rules, VPN configuration, and encryption policies. Conducted staff awareness training and established incident response procedures.':
    'طبّقتُ إطارًا أمنيًا متعدد الطبقات — حماية الأجهزة الطرفية وقواعد جدار الحماية وإعداد الشبكات الافتراضية وسياسات التشفير. ونفّذتُ تدريبًا توعويًا للموظفين وأسّستُ إجراءات الاستجابة للحوادث.',
  'Firewall': 'جدار الحماية',
  'Encryption': 'التشفير',
  '3 brands unified': 'توحيد ٣ علامات تجارية',
  'End-to-End ERP Integration': 'تكامل شامل لأنظمة تخطيط الموارد',
  'Led the full lifecycle Odoo ERP rollout across multiple brands — scoping requirements, managing data migration, building custom modules, training 50+ employees, and post-go-live hypercare. Delivered ahead of schedule.':
    'قدتُ دورة تطبيق Odoo كاملة عبر علامات تجارية متعددة — تحديد المتطلبات وإدارة ترحيل البيانات وبناء وحدات مخصصة وتدريب أكثر من ٥٠ موظفًا والدعم المكثّف بعد الإطلاق. وسُلّم قبل الموعد المحدد.',
  'Migration': 'ترحيل البيانات',
  '+20% conv · +35% reach': '+٢٠٪ تحويل · +٣٥٪ وصول',
  'Marketing & CRM': 'التسويق وإدارة العملاء',
  'CRM & Digital Marketing Overhaul': 'إصلاح شامل لإدارة العملاء والتسويق الرقمي',
  'Implemented Reelo CRM for structured lead tracking and designed a suite of digital campaigns across social and email channels. Built analytics dashboards to measure ROI and continuously optimise campaign performance.':
    'طبّقتُ نظام Reelo لتتبّع منظّم للعملاء المحتملين وصمّمتُ مجموعة حملات رقمية عبر قنوات التواصل والبريد الإلكتروني. وبنيتُ لوحات تحليلات لقياس العائد وتحسين أداء الحملات باستمرار.',
  'Analytics': 'التحليلات',

  // ── Achievements ──
  '// Results': '// النتائج',
  'Real': 'نتائج',
  'results,': 'حقيقية،',
  'measured.': 'ومقاسة.',
  'Every number below is a real, documented business outcome — delivered through technical precision, cross-team leadership, and a relentless focus on measurable impact.':
    'كل رقم أدناه نتيجة أعمال حقيقية وموثّقة — تحققت بدقة تقنية وقيادة عابرة للفرق وتركيز دائم على الأثر القابل للقياس.',
  'Discuss a Project →': 'لنناقش مشروعًا ←',
  'CRM Lead Conversion Uplift': 'ارتفاع تحويل العملاء المحتملين',
  'Implemented a structured CRM system that improved lead tracking workflows and directly increased conversion rates by 20% across sales teams.':
    'طبّقتُ نظامًا منظّمًا لإدارة العملاء حسّن مسارات تتبّع العملاء المحتملين ورفع معدلات التحويل بنسبة ٢٠٪ عبر فرق المبيعات.',
  'Online Engagement Increase': 'زيادة التفاعل الرقمي',
  'Designed and executed targeted digital marketing campaigns that grew audience engagement by 35% across social and email platforms.':
    'صمّمتُ ونفّذتُ حملات تسويق رقمي موجّهة رفعت تفاعل الجمهور بنسبة ٣٥٪ عبر منصات التواصل والبريد الإلكتروني.',
  'IT Process Efficiency Gain': 'تحسين كفاءة عمليات تقنية المعلومات',
  'Streamlined core IT operations, workflows, and vendor management, yielding a 15% improvement in departmental efficiency.':
    'بسّطتُ عمليات تقنية المعلومات الأساسية ومساراتها وإدارة المورّدين، محققًا تحسنًا بنسبة ١٥٪ في كفاءة القسم.',
  'System Uptime Maintained': 'استمرارية تشغيل الأنظمة',
  'Consistently maintained 99%+ uptime across all managed infrastructure including ERP systems, networks, and IoT locker fleets.':
    'حافظتُ باستمرار على تشغيل يتجاوز ٩٩٪ عبر كل البنية التحتية المُدارة، شاملة أنظمة تخطيط الموارد والشبكات وأساطيل الخزائن الذكية.',

  // ── Contact ──
  'Open to Opportunities': 'متاح للفرص',
  "Let's": 'هيا',
  'connect': 'نتواصل',
  'Based in Dubai, UAE · Available for full-time roles & projects':
    'مقيم في دبي، الإمارات · متاح لوظائف بدوام كامل ومشاريع',

  // ── Palette footer hints ──
  'navigate': 'تنقّل',
  'select': 'اختيار',
  'close': 'إغلاق',
  'toggle': 'تبديل',

  // ── First-visit coach tip ──
  'Tip': 'نصيحة',
  'Got it': 'فهمت',
  'Take the tour': 'ابدأ الجولة',
  'Scroll, use ←/→ arrows, or press': 'مرّر، أو استخدم الأسهم ←/→، أو اضغط',
  'to jump anywhere.': 'للانتقال إلى أي قسم.',
  'Swipe or tap the dots to move between sections.': 'اسحب أو انقر على النقاط للتنقل بين الأقسام.',

  // ── Misc chrome ──
  'Welcome back 👋': 'أهلًا بعودتك 👋',
  'Email copied': 'تم نسخ البريد الإلكتروني',
  'Phone copied': 'تم نسخ رقم الهاتف'
};

const PLACEHOLDERS = {
  'Ask about Mohamed…': 'اسأل عن محمد…',
  'Navigate or search…': 'تنقّل أو ابحث…'
};

let arabicOn = false;
const originals = new Map();      // textNode -> original string
const originalPH = new Map();     // input   -> original placeholder
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'CODE', 'svg']);

function textNodes() {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      let p = n.parentNode;
      while (p && p !== document.body) {
        if (SKIP.has(p.nodeName) || SKIP.has(p.nodeName.toLowerCase())) return NodeFilter.FILTER_REJECT;
        if (p.classList && (p.classList.contains('term-body') || p.classList.contains('no-i18n'))) return NodeFilter.FILTER_REJECT;
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let n; while ((n = walker.nextNode())) out.push(n);
  return out;
}

function toArabic() {
  textNodes().forEach(n => {
    const raw = n.nodeValue;
    const key = raw.trim();
    const hit = AR[key];
    if (!hit) return;
    if (!originals.has(n)) originals.set(n, raw);
    n.nodeValue = raw.replace(key, hit);
  });
  document.querySelectorAll('input[placeholder]').forEach(el => {
    const hit = PLACEHOLDERS[el.placeholder];
    if (hit) { if (!originalPH.has(el)) originalPH.set(el, el.placeholder); el.placeholder = hit; }
  });
}

function toEnglish() {
  originals.forEach((val, node) => { if (node.isConnected) node.nodeValue = val; });
  originals.clear();
  originalPH.forEach((val, el) => { if (el.isConnected) el.placeholder = val; });
  originalPH.clear();
}

// Arabic webfont is fetched only when Arabic is first switched on, so
// English visitors never download it.
function ensureArabicFont() {
  if (document.getElementById('ar-font')) return;
  const l = document.createElement('link');
  l.id = 'ar-font'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap';
  document.head.appendChild(l);
}

function apply(lang) {
  const html = document.documentElement;
  arabicOn = lang === 'ar';
  if (arabicOn) {
    ensureArabicFont();
    html.setAttribute('lang', 'ar');
    document.body.classList.add('ar');
    toArabic();
  } else {
    toEnglish();
    html.setAttribute('lang', 'en');
    document.body.classList.remove('ar');
  }
  // NOTE: dir is deliberately NOT set on <html>. This layout positions panels
  // with translateX inside a max-content flex track; flipping the document's
  // layout origin to RTL moves them off-screen. RTL is applied per-container
  // in CSS (body.ar .panel/#nav/.modal-box) so text flips while the slider
  // geometry stays identical.
  const btn = document.getElementById('lang-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', arabicOn ? 'true' : 'false');
    const lbl = btn.querySelector('.lang-lbl');
    if (lbl) lbl.textContent = arabicOn ? 'EN' : 'ع';
    btn.setAttribute('aria-label', arabicOn ? 'Switch to English' : 'التبديل إلى العربية');
  }
  try { localStorage.setItem('yasiefLang', arabicOn ? 'ar' : 'en'); } catch (e) {}
}

function init() {
  const btn = document.getElementById('lang-toggle');
  if (btn) btn.addEventListener('click', () => apply(arabicOn ? 'en' : 'ar'));
  let saved = 'en';
  try { saved = localStorage.getItem('yasiefLang') || 'en'; } catch (e) {}
  if (saved === 'ar') setTimeout(() => apply('ar'), 600); // let the boot animation settle first
  window.setLang = apply;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
