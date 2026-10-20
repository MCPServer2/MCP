/**
 * Flare Studio — text-only i18n (Arabic default = the original UI, English translation).
 * The layout/design never changes: only strings are swapped, and the document
 * direction follows the language (rtl for ar, ltr for en) via providers.tsx.
 */

export type Lang = "ar" | "en";

const ar = {
  docTitle: "استوديو Flare — توليد الصور بـ GPT Image 2.5 Flare",

  common: {
    cancel: "إلغاء",
  },

  langToggle: {
    aria: "تبديل اللغة",
  },

  header: {
    title: "استوديو Flare",
    subtitle: "توليد الصور بنموذج GPT Image 2.5 Flare عبر CometAPI",
    copyTokenAria: "نسخ معرفك الخاص",
    tokenCopied: "تم نسخ معرّفك الخاص",
    copyFailed: "تعذر النسخ، انسخ المعرف يدوياً",
    tokenTooltip: "معرّفك الخاص — اضغط للنسخ",
    rotateAria: "تجديد المعرف",
    rotateTitle: "تجديد معرّفك الخاص؟",
    rotateDesc:
      "سيتم إصدار معرّف جديد وفصل معرضك الحالي عن هذه الجلسة. الصور المحفوظة سابقاً تبقى مرتبطة بالمعرّف القديم ولن تظهر مع المعرّف الجديد.",
    rotateConfirm: "نعم، أصدر معرّفاً جديداً",
    rotated: "تم إصدار معرّف جديد",
    themeAria: "تبديل المظهر",
  },

  apiKey: {
    sectionAria: "إدارة مفتاح CometAPI",
    heading: "مفتاح CometAPI الخاص بك",
    getLink: "احصل على مفتاح من cometapi.com",
    inputAria: "مفتاح CometAPI",
    showKey: "إظهار المفتاح",
    hideKey: "إخفاء المفتاح",
    save: "حفظ",
    check: "فحص وتفعيل",
    enterFirst: "أدخل المفتاح أولاً",
    saved: "تم حفظ المفتاح في متصفحك بنجاح",
    savedDesc: "المفتاح مرتبط بمعرّفك ولا يمكن لأي مستخدم آخر الوصول إليه.",
    invalid: "المفتاح غير صالح",
    checkFailed: "تعذر الاتصال بالخادم للتحقق",
    valid: "المفتاح صالح وجاهز للاستخدام 🎉",
    balanceDesc: "الرصيد المتاح: {q}",
    badgeValid: "مفتاح صالح",
    badgeChecking: "جارٍ الفحص…",
    badgeInvalid: "مفتاح غير صالح",
    badgeSaved: "محفوظ — لم يُفحص",
    badgeNone: "لم يُضف مفتاح بعد",
    keyName: "اسم المفتاح: ",
    balance: "الرصيد المتاح: ",
    used: "المستخدم: ",
    privacyA: "مفتاحك يُحفظ محلياً في متصفحك فقط ومرتبط بمعرّفك الخاص",
    privacyB:
      "— لا يُخزَّن على خادمنا إطلاقاً، ويُرسل مشفّراً مع كل طلب توليد مباشرة إلى CometAPI. لا يمكن لأي مستخدم آخر رؤيته أو استخدامه.",
    unlimited: "غير محدود",
    unit: "وحدة",
  },

  footer: {
    tagline: "استوديو Flare — توليد الصور بنموذج",
    perVisitor: "معرّف خاص لكل زائر",
    keysLocal: "مفاتيحك محفوظة في متصفحك فقط",
  },

  generator: {
    panelAria: "لوحة التوليد",
    tabGenerate: "توليد من نص",
    tabSketch: "رسم إلى صورة (Sketch)",
    promptLabel: "وصف الصورة",
    promptPlaceholder:
      "مثال: قارب ورقي يطفو على ماء هادئ عند شروق الشمس، إضاءة ذهبية دافئة، تفاصيل واقعية عالية…",
    promptHint:
      "اكتب وصفاً تفصيلياً — المشهد، الإضاءة، الأسلوب، الزاوية… يدعم النموذج النصوص المكتوبة بدقة داخل الصورة.",
    refLabel: "صورة مرجعية (اختياري)",
    size: "المقاس",
    quality: "الجودة",
    format: "صيغة الإخراج",
    background: "الخلفية",
    bgHint: "الشفافة تعمل مع PNG/WEBP",
    count: "عدد الصور",
    sketchSource: "مصدر الرسم",
    sketchSourceAria: "طريقة إدخال الرسم",
    draw: "رسم مباشر",
    upload: "رفع صورة",
    optional: "(اختياري)",
    uploadHint: "الرفع اختياري — يمكنك بدلاً منه الرسم مباشرة في اللوحة من زر «رسم مباشر».",
    sketchPromptLabel: "تعليمات التحويل (اختياري)",
    sketchPromptPlaceholder:
      "مثال: حوّل الرسم إلى مشهد غروب واقعي بألوان برتقالية دافئة مع سماء سحابية…",
    autoEnhance: "التحسين التلقائي للأمر",
    autoEnhanceDesc:
      "يضيف تعليمات احترافية تحافظ على تكوين رسمك مع إضافة الألوان والإضاءة والتفاصيل — ميزة Sketch في GPT Image 2.5.",
    generating: "جارٍ التوليد… ({n} ث)",
    btnGenerate: "ولّد الصورة",
    btnSketch: "حوّل الرسم إلى صورة",
    infoNote:
      "Flare هو النسخة السريعة من GPT Image 2.5 — نتائج عالية الجودة بزمن استجابة قصير. التوليد قد يستغرق من 10 إلى 60 ثانية، ويمكنك تحديث الصفحة بأمان — سنكمل العملية ونحفظ النتيجة في معرضك تلقائياً.",
    needKey: "أضف مفتاح CometAPI أولاً من الشريط العلوي",
    needPrompt: "اكتب وصفاً للصورة أولاً",
    needSketch: "ارسم في لوحة الرسم أو ارفع صورة أولاً",
    startFailed: "فشل بدء التوليد، حاول مجدداً",
    network: "تعذر الاتصال بالخادم. تحقق من الشبكة وحاول مجدداً.",
    jobLost: "فُقدت مهمة التوليد. حاول مجدداً.",
    pollDropped:
      "انقطع الاتصال أثناء متابعة الحالة — التوليد مستمر على الخادم وستجد النتيجة في معرضك تلقائياً.",
    successOne: "تم توليد الصورة بنجاح 🎉",
    successMany: "تم توليد {n} صور بنجاح 🎉",
    generateFailed: "فشل التوليد، حاول مجدداً",
    timeout: "استغرق التوليد وقتاً أطول من المتوقع — قد يكتمل لاحقاً وتظهر صورته في معرضك.",
    resumeFound: "وجدنا عملية توليد قيد التنفيذ — سنكملها ونجلب النتيجة تلقائياً.",
  },

  results: {
    sectionAria: "أحدث النتائج",
    title: "أحدث النتائج",
    emptyTitle: "لا توجد نتائج بعد",
    emptyGenerate: "اكتب وصفاً في لوحة التوليد واضغط «ولّد الصورة» لتظهر نتائجك هنا.",
    emptySketch:
      "ارسم في لوحة الرسم أو ارفع رسمك في تبويب Sketch ثم اضغط «حوّل الرسم إلى صورة» لتظهر نتائجك هنا.",
    altPrefix: "صورة مولدة: ",
    expand: "تكبير",
    download: "تحميل",
    useAsSketch: "استخدم كرسم مدخل",
    remove: "حذف",
    downloadFailed: "تعذر تحميل الصورة",
    usedAsSketch: "تم استخدام الصورة كمدخل في تبويب Sketch",
    convertFailed: "تعذر تحويل الصورة إلى مدخل",
    deleted: "تم حذف الصورة من معرضك",
    deleteFailed: "تعذر حذف الصورة",
    refBadge: "مرجع بصري",
    generateBadge: "توليد",
    qualityBadge: "جودة {q}",
    qualityAuto: "تلقائية",
    qualityLow: "منخفضة",
    qualityMedium: "متوسطة",
    qualityHigh: "عالية",
    tokensBadge: "{n} توكن",
  },

  gallery: {
    sectionAria: "معرضك الخاص",
    title: "معرضك الخاص",
    countOne: "{n} صورة",
    countMany: "{n} صورة",
    refreshAria: "تحديث المعرض",
    refreshTitle: "تحديث",
    clearAria: "مسح المعرض",
    clearTitle: "مسح الكل",
    clearDialogTitle: "مسح كل صور معرضك؟",
    clearDialogDesc: "سيتم حذف جميع الصور المرتبطة بمعرّفك نهائياً ولا يمكن التراجع.",
    clearConfirm: "نعم، امسح الكل",
    cleared: "تم مسح المعرض بالكامل",
    clearFailed: "تعذر مسح المعرض",
    emptyGallery: "معرضك فارغ حالياً — كل صورة تولّدها تُحفظ هنا تلقائياً ومرتبطة بمعرّفك فقط.",
    preparing: "جارٍ تحضير معرّفك الخاص…",
    viewAria: "عرض صورة: {p}",
    altPrefix: "صورة معرض: ",
    note: "الصور تُحفظ مرتبطة بمعرّفك الخاص — من يملك المعرّف فقط يراها. حذف الصور من المعرض يحذفها نهائياً من الخادم.",
  },

  lightbox: {
    title: "تفاصيل الصورة",
    createdAt: "وُلّدت في {d}",
    altPrefix: "صورة مولدة: ",
    promptUsed: "الوصف المستخدم",
    revised: "الوصف المحسّن من النموذج (revised prompt)",
    withRef: "مع صورة مرجعية",
    quality: "جودة: {q}",
    format: "صيغة: {f}",
    background: "خلفية: {b}",
    bgTransparent: "شفافة",
    bgOpaque: "معتمة",
    tokens: "توكنات: {n}",
    download: "تحميل",
    copyPrompt: "نسخ الوصف",
    useAsSketch: "استخدام كرسم",
    remove: "حذف",
    downloadFailed: "تعذر تحميل الصورة",
    copied: "تم نسخ الوصف",
    copyFailed: "تعذر النسخ",
    usedAsSketch: "تم استخدام الصورة كمدخل في تبويب Sketch",
    convertFailed: "تعذر تحويل الصورة إلى مدخل",
    deleted: "تم حذف الصورة",
    deleteFailed: "تعذر حذف الصورة",
  },

  dropzone: {
    notImage: "الملف يجب أن يكون صورة (PNG / JPG / WEBP)",
    tooBig: "حجم الصورة كبير جداً (الحد الأقصى 10 ميجابايت)",
    readFailed: "تعذر قراءة الملف",
    remove: "إزالة",
  },

  refUpload: {
    previewAlt: "الصورة المرجعية المرفوعة",
    ready: "الصورة المرجعية جاهزة ✓",
    remove: "إزالة",
    hint: "سيوجّه النموذج توليده وفق هذه الصورة (المحتوى، الأسلوب، التكوين) ويطبّق وصفك النصي عليها.",
    addAria: "إضافة صورة مرجعية اختيارية",
    add: "إضافة صورة مرجعية",
    optional: "(اختياري)",
    dropTitle: "اسحب صورتك هنا أو اضغط للاختيار",
    dropSubtitle: "PNG / JPG / WEBP — حتى 10 ميجابايت (يدعم اللصق Ctrl+V)",
    successToast: "تم تحميل الصورة المرجعية بنجاح",
  },

  sketchUpload: {
    dropTitle: "اسحب رسمك هنا أو اضغط للاختيار",
    dropSubtitle: "PNG / JPG / WEBP — حتى 10 ميجابايت (يدعم اللصق Ctrl+V)",
    ready: "الرسم المصدر جاهز ✓",
    alt: "الرسم المرفوع",
    successToast: "تم تحميل الرسم بنجاح",
  },

  sketch: {
    toolsAria: "أدوات الرسم",
    pen: "قلم",
    eraser: "ممحاة",
    sizeAria: "حجم الفرشاة",
    sizeLabel: "الحجم",
    colorsAria: "الألوان",
    colorAria: "لون {n}",
    colorBlack: "أسود",
    colorGray: "رمادي",
    colorRed: "أحمر",
    colorOrange: "برتقالي",
    colorGreen: "أخضر",
    colorBlue: "أزرق",
    undo: "تراجع",
    redo: "إعادة",
    clear: "مسح اللوحة",
    canvasAria: "لوحة الرسم — ارسم بإصبعك أو بالفأرة",
    placeholder: "ارسم تخطيطك هنا بإصبعك أو بالفأرة ✏️",
    ready: "رسمك جاهز للتحويل",
    hint: "كل خط ترسمه يُحفظ تلقائياً كمصدر للتحويل — يمكنك رفع صورة بدلاً من الرسم من زر «رفع صورة» في الأعلى، أو الدمج بينهما.",
  },

  options: {
    sizeSquare: "مربع 1024×1024",
    sizeWide: "عريض 1536×1024",
    sizeTall: "طولي 1024×1536",
    auto: "تلقائي",
    qualityLow: "منخفضة (سريع)",
    qualityMedium: "متوسطة",
    qualityHigh: "عالية (مفصل)",
    formatPng: "PNG (يدعم الشفافية)",
    formatJpeg: "JPEG (أصغر حجماً)",
    formatWebp: "WebP (يدعم الشفافية)",
    bgTransparent: "شفاف",
    bgOpaque: "معتم",
  },

  mcp: {
    cardTitle: "ربط الموقع مع ChatGPT (MCP)",
    cardSubtitle: "استخدم مولّد الصور من داخل ChatGPT أو أي أداة تدعم MCP",
    expandAria: "إظهار أو إخفاء تفاصيل الربط",
    serverNameLabel: "اسم الخادم (Name)",
    serverUrlLabel: "رابط الاتصال (Connection server URL)",
    urlPlaceholder: "أضف مفتاحك ومعرّفك لبناء الرابط…",
    copyAria: "نسخ",
    copied: "تم النسخ إلى الحافظة",
    copyFailed: "تعذر النسخ",
    needKey: "أضف مفتاح CometAPI في الشريط العلوي أولاً — الرابط يحتاجه ليعمل التوليد من داخل ChatGPT.",
    needToken: "جارٍ تحضير معرّفك الخاص…",
    stepsTitle: "خطوات الإعداد في ChatGPT",
    step1: "افتح الإعدادات ⚙ ثم Apps & Connectors (التطبيقات والموصلات).",
    step2: "فعّل Developer mode (وضع المطوّر) من الإعدادات المتقدمة إن لم يكن مفعّلاً.",
    step3:
      "اضغط Create (إنشاء) واملأ: Name ← اسم الخادم أعلاه، MCP Server URL ← رابط الاتصال أعلاه، Authentication ← No authentication.",
    step4:
      "احفظ الموصل، ثم داخل المحادثة من زر (+) فعّل «Flare Image Generator» (Developer mode).",
    step5:
      "اطلب مثلاً: «ولّد صورة قطة رائد فضاء باستخدام Flare Image Generator» — ستظهر الصورة في الشات وتُحفظ في معرضك هنا.",
    otherTools:
      "يعمل أيضاً مع Claude وCursor وأي أداة تدعم Remote MCP: أضف خادماً من نوع URL (Streamable HTTP) والصق الرابط نفسه.",
    toolsList: "الأدوات المتاحة عبر الخادم:",
    toolGenerate: "توليد صورة من نص",
    toolEdit: "توليد بصورة مرجعية أو رسم (عبر رابط صورة)",
    toolCheck: "متابعة مهمة قيد التوليد",
    toolGet: "جلب صورة محفوظة بمعرّفها وعرضها داخل الشات",
    toolList: "عرض أحدث صور معرضك",
    privacy: "الرابط يحتوي مفتاحك ومعرّفك الخاص — لا تشاركه مع أي شخص.",
  },
};

export type Dict = typeof ar;

const en: Dict = {
  docTitle: "Flare Studio — Image generation with GPT Image 2.5 Flare",

  common: {
    cancel: "Cancel",
  },

  langToggle: {
    aria: "Switch language",
  },

  header: {
    title: "Flare Studio",
    subtitle: "Image generation with GPT Image 2.5 Flare via CometAPI",
    copyTokenAria: "Copy your personal ID",
    tokenCopied: "Your personal ID copied",
    copyFailed: "Copy failed — copy the ID manually",
    tokenTooltip: "Your personal ID — click to copy",
    rotateAria: "Renew ID",
    rotateTitle: "Renew your personal ID?",
    rotateDesc:
      "A new ID will be issued and your current gallery will be detached from this session. Previously saved images stay tied to the old ID and will not appear with the new one.",
    rotateConfirm: "Yes, issue a new ID",
    rotated: "New ID issued",
    themeAria: "Toggle appearance",
  },

  apiKey: {
    sectionAria: "Manage CometAPI key",
    heading: "Your CometAPI key",
    getLink: "Get a key from cometapi.com",
    inputAria: "CometAPI key",
    showKey: "Show key",
    hideKey: "Hide key",
    save: "Save",
    check: "Check & activate",
    enterFirst: "Enter the key first",
    saved: "Key saved in your browser successfully",
    savedDesc: "The key is tied to your ID and no other user can access it.",
    invalid: "Invalid key",
    checkFailed: "Could not reach the server to verify",
    valid: "Key is valid and ready to use 🎉",
    balanceDesc: "Available balance: {q}",
    badgeValid: "Valid key",
    badgeChecking: "Checking…",
    badgeInvalid: "Invalid key",
    badgeSaved: "Saved — not verified",
    badgeNone: "No key added yet",
    keyName: "Key name: ",
    balance: "Available balance: ",
    used: "Used: ",
    privacyA: "Your key is stored locally in your browser only and tied to your personal ID",
    privacyB:
      "— it is never stored on our servers, and it is sent encrypted with every generation request straight to CometAPI. No other user can see or use it.",
    unlimited: "Unlimited",
    unit: "units",
  },

  footer: {
    tagline: "Flare Studio — image generation with",
    perVisitor: "Personal ID for every visitor",
    keysLocal: "Your keys stay in your browser only",
  },

  generator: {
    panelAria: "Generation panel",
    tabGenerate: "Text to image",
    tabSketch: "Sketch to image (Sketch)",
    promptLabel: "Image description",
    promptPlaceholder:
      "Example: a paper boat floating on calm water at sunrise, warm golden light, highly realistic details…",
    promptHint:
      "Write a detailed description — scene, lighting, style, angle… The model supports text rendered accurately inside the image.",
    refLabel: "Reference image (optional)",
    size: "Size",
    quality: "Quality",
    format: "Output format",
    background: "Background",
    bgHint: "Transparent works with PNG/WEBP",
    count: "Number of images",
    sketchSource: "Sketch source",
    sketchSourceAria: "Sketch input method",
    draw: "Draw directly",
    upload: "Upload image",
    optional: "(optional)",
    uploadHint:
      "Uploading is optional — you can instead draw directly on the canvas from the “Draw directly” button.",
    sketchPromptLabel: "Conversion instructions (optional)",
    sketchPromptPlaceholder:
      "Example: turn the sketch into a realistic sunset scene with warm orange colors and a cloudy sky…",
    autoEnhance: "Automatic prompt enhancement",
    autoEnhanceDesc:
      "Adds professional instructions that preserve your sketch's composition while adding colors, lighting and details — the GPT Image 2.5 Sketch feature.",
    generating: "Generating… ({n}s)",
    btnGenerate: "Generate image",
    btnSketch: "Turn sketch into image",
    infoNote:
      "Flare is the fast version of GPT Image 2.5 — high-quality results with short response times. Generation may take 10 to 60 seconds, and you can safely refresh the page — we will continue the process and save the result to your gallery automatically.",
    needKey: "Add your CometAPI key first from the top bar",
    needPrompt: "Write an image description first",
    needSketch: "Draw on the canvas or upload an image first",
    startFailed: "Failed to start generation, please try again",
    network: "Could not reach the server. Check your connection and try again.",
    jobLost: "The generation job was lost. Please try again.",
    pollDropped:
      "Connection lost while tracking progress — generation continues on the server and you will find the result in your gallery automatically.",
    successOne: "Image generated successfully 🎉",
    successMany: "{n} images generated successfully 🎉",
    generateFailed: "Generation failed, please try again",
    timeout:
      "Generation took longer than expected — it may complete later and its image will appear in your gallery.",
    resumeFound: "We found a generation in progress — we will resume it and fetch the result automatically.",
  },

  results: {
    sectionAria: "Latest results",
    title: "Latest results",
    emptyTitle: "No results yet",
    emptyGenerate:
      "Write a description in the generation panel and press “Generate image” to see your results here.",
    emptySketch:
      "Draw on the canvas or upload your sketch in the Sketch tab then press “Turn sketch into image” to see your results here.",
    altPrefix: "Generated image: ",
    expand: "Zoom in",
    download: "Download",
    useAsSketch: "Use as sketch input",
    remove: "Delete",
    downloadFailed: "Could not download the image",
    usedAsSketch: "Image used as input in the Sketch tab",
    convertFailed: "Could not convert the image to input",
    deleted: "Image deleted from your gallery",
    deleteFailed: "Could not delete the image",
    refBadge: "Visual reference",
    generateBadge: "Generated",
    qualityBadge: "Quality: {q}",
    qualityAuto: "auto",
    qualityLow: "low",
    qualityMedium: "medium",
    qualityHigh: "high",
    tokensBadge: "{n} tokens",
  },

  gallery: {
    sectionAria: "Your private gallery",
    title: "Your private gallery",
    countOne: "{n} image",
    countMany: "{n} images",
    refreshAria: "Refresh gallery",
    refreshTitle: "Refresh",
    clearAria: "Clear gallery",
    clearTitle: "Clear all",
    clearDialogTitle: "Delete all gallery images?",
    clearDialogDesc: "All images tied to your ID will be permanently deleted. This cannot be undone.",
    clearConfirm: "Yes, clear everything",
    cleared: "Gallery cleared completely",
    clearFailed: "Could not clear the gallery",
    emptyGallery:
      "Your gallery is empty — every image you generate is saved here automatically, tied only to your ID.",
    preparing: "Preparing your personal ID…",
    viewAria: "View image: {p}",
    altPrefix: "Gallery image: ",
    note: "Images are saved tied to your personal ID — only whoever holds the ID can see them. Deleting images from the gallery deletes them permanently from the server.",
  },

  lightbox: {
    title: "Image details",
    createdAt: "Generated at {d}",
    altPrefix: "Generated image: ",
    promptUsed: "Prompt used",
    revised: "Model-improved prompt (revised prompt)",
    withRef: "With reference image",
    quality: "Quality: {q}",
    format: "Format: {f}",
    background: "Background: {b}",
    bgTransparent: "transparent",
    bgOpaque: "opaque",
    tokens: "Tokens: {n}",
    download: "Download",
    copyPrompt: "Copy prompt",
    useAsSketch: "Use as sketch",
    remove: "Delete",
    downloadFailed: "Could not download the image",
    copied: "Prompt copied",
    copyFailed: "Copy failed",
    usedAsSketch: "Image used as input in the Sketch tab",
    convertFailed: "Could not convert the image to input",
    deleted: "Image deleted",
    deleteFailed: "Could not delete the image",
  },

  dropzone: {
    notImage: "The file must be an image (PNG / JPG / WEBP)",
    tooBig: "Image is too large (maximum 10 MB)",
    readFailed: "Could not read the file",
    remove: "Remove",
  },

  refUpload: {
    previewAlt: "Uploaded reference image",
    ready: "Reference image ready ✓",
    remove: "Remove",
    hint: "The model will guide its generation by this image (content, style, composition) and apply your text prompt on top of it.",
    addAria: "Add an optional reference image",
    add: "Add reference image",
    optional: "(optional)",
    dropTitle: "Drag your image here or click to choose",
    dropSubtitle: "PNG / JPG / WEBP — up to 10 MB (paste with Ctrl+V supported)",
    successToast: "Reference image uploaded successfully",
  },

  sketchUpload: {
    dropTitle: "Drag your sketch here or click to choose",
    dropSubtitle: "PNG / JPG / WEBP — up to 10 MB (paste with Ctrl+V supported)",
    ready: "Source sketch ready ✓",
    alt: "Uploaded sketch",
    successToast: "Sketch uploaded successfully",
  },

  sketch: {
    toolsAria: "Drawing tools",
    pen: "Pen",
    eraser: "Eraser",
    sizeAria: "Brush size",
    sizeLabel: "Size",
    colorsAria: "Colors",
    colorAria: "{n} color",
    colorBlack: "black",
    colorGray: "gray",
    colorRed: "red",
    colorOrange: "orange",
    colorGreen: "green",
    colorBlue: "blue",
    undo: "Undo",
    redo: "Redo",
    clear: "Clear canvas",
    canvasAria: "Drawing canvas — draw with your finger or mouse",
    placeholder: "Draw your layout here with your finger or mouse ✏️",
    ready: "Your sketch is ready to convert",
    hint: "Every stroke you draw is automatically saved as the conversion source — you can upload an image instead from the “Upload image” button above, or combine both.",
  },

  options: {
    sizeSquare: "Square 1024×1024",
    sizeWide: "Wide 1536×1024",
    sizeTall: "Tall 1024×1536",
    auto: "Auto",
    qualityLow: "Low (fast)",
    qualityMedium: "Medium",
    qualityHigh: "High (detailed)",
    formatPng: "PNG (supports transparency)",
    formatJpeg: "JPEG (smaller size)",
    formatWebp: "WebP (supports transparency)",
    bgTransparent: "Transparent",
    bgOpaque: "Opaque",
  },

  mcp: {
    cardTitle: "Connect this site to ChatGPT (MCP)",
    cardSubtitle: "Use the image generator from inside ChatGPT or any MCP-capable tool",
    expandAria: "Show or hide connection details",
    serverNameLabel: "Server name (Name)",
    serverUrlLabel: "Connection server URL",
    urlPlaceholder: "Add your key and ID to build the URL…",
    copyAria: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Copy failed",
    needKey: "Add your CometAPI key in the top bar first — the URL needs it to generate from inside ChatGPT.",
    needToken: "Preparing your personal ID…",
    stepsTitle: "Setup steps in ChatGPT",
    step1: "Open Settings ⚙ → Apps & Connectors.",
    step2: "Enable Developer mode in the advanced settings if it is not enabled yet.",
    step3:
      "Press Create and fill in: Name → the server name above, MCP Server URL → the connection URL above, Authentication → No authentication.",
    step4:
      "Save the connector, then inside the chat enable “Flare Image Generator” from the (+) button (Developer mode).",
    step5:
      "Ask for example: “Generate an astronaut cat using Flare Image Generator” — the image appears in the chat and is saved to your gallery here.",
    otherTools:
      "Also works with Claude, Cursor and any tool supporting Remote MCP: add a URL (Streamable HTTP) server and paste the same URL.",
    toolsList: "Tools exposed by the server:",
    toolGenerate: "Text to image",
    toolEdit: "Generate with a reference image or sketch (via image URL)",
    toolCheck: "Follow a running generation",
    toolGet: "Fetch a stored image by id and show it in the chat",
    toolList: "List your latest gallery images",
    privacy: "The URL contains your key and personal ID — do not share it with anyone.",
  },
};

export const translations: Record<Lang, Dict> = { ar, en };

/** Replaces "{name}" placeholders in dictionary strings. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

export function sizeLabel(lang: Lang, value: string): string {
  const o = translations[lang].options;
  switch (value) {
    case "1024x1024":
      return o.sizeSquare;
    case "1536x1024":
      return o.sizeWide;
    case "1024x1536":
      return o.sizeTall;
    case "auto":
      return o.auto;
    default:
      return value;
  }
}

export function qualityOptionLabel(lang: Lang, value: string): string {
  const o = translations[lang].options;
  switch (value) {
    case "auto":
      return o.auto;
    case "low":
      return o.qualityLow;
    case "medium":
      return o.qualityMedium;
    case "high":
      return o.qualityHigh;
    default:
      return value;
  }
}

export function formatOptionLabel(lang: Lang, value: string): string {
  const o = translations[lang].options;
  switch (value) {
    case "png":
      return o.formatPng;
    case "jpeg":
      return o.formatJpeg;
    case "webp":
      return o.formatWebp;
    default:
      return value;
  }
}

export function backgroundOptionLabel(lang: Lang, value: string): string {
  const o = translations[lang].options;
  switch (value) {
    case "auto":
      return o.auto;
    case "transparent":
      return o.bgTransparent;
    case "opaque":
      return o.bgOpaque;
    default:
      return value;
  }
}

/** Short quality word used inside the results badge ("جودة {q}"). */
export function shortQualityLabel(lang: Lang, value: string): string {
  const t = translations[lang].results;
  switch (value) {
    case "auto":
      return t.qualityAuto;
    case "low":
      return t.qualityLow;
    case "medium":
      return t.qualityMedium;
    case "high":
      return t.qualityHigh;
    default:
      return value;
  }
}

/**
 * The API returns human-readable Arabic error messages. In English mode we
 * translate the known ones client-side; unknown messages pass through as-is.
 */
const SERVER_ERROR_EN: Record<string, string> = {
  "مفتاح API غير صالح أو منتهي الصلاحية. تأكد من إضافة مفتاح CometAPI صحيح.":
    "Invalid or expired API key. Make sure you added a correct CometAPI key.",
  "تم تجاوز حد معدل الطلبات (429). انتظر قليلاً ثم أعد المحاولة.":
    "Rate limit exceeded (429). Wait a moment and try again.",
  "الرصيد غير كافٍ في مفتاح CometAPI الخاص بك.":
    "Insufficient balance in your CometAPI key.",
  "خطأ في خوادم CometAPI. أعد المحاولة بعد قليل.":
    "CometAPI server error. Please try again shortly.",
  "صورة الإدخال غير صالحة.": "Invalid input image.",
  "توكن المستخدم مطلوب.": "User token is required.",
  "توقفت عملية التوليد قبل اكتمالها. جرّب مرة أخرى.":
    "The generation stopped before completing. Please try again.",
  "طلب غير صالح.": "Invalid request.",
  "أضف مفتاح CometAPI أولاً من الشريط في الأعلى.":
    "Add your CometAPI key first using the bar above.",
  "توكن المستخدم غير صالح.": "Invalid user token.",
  "اكتب وصفاً للصورة أولاً.": "Write an image description first.",
  "اكتب تعليمات لتحويل الرسم، أو فعّل التحسين التلقائي.":
    "Write instructions for the sketch conversion, or enable auto-enhance.",
  "أضف صورة الرسم المصدر أولاً — ارسمها في اللوحة أو ارفعها.":
    "Add the source sketch image first — draw it on the canvas or upload it.",
  "انتهت مهلة الطلب. النموذج قد يكون تحت ضغط، جرّب مرة أخرى.":
    "The request timed out. The model may be under load — please try again.",
  "حدث خطأ غير متوقع أثناء الاتصال بـ CometAPI.":
    "An unexpected error occurred while contacting CometAPI.",
  "لم يُرجع المزود أي صورة. جرّب تعديل الوصف أو المعاملات.":
    "The provider returned no images. Try adjusting the prompt or parameters.",
  "المهمة غير موجودة.": "Job not found.",
  "فشل التوليد، حاول مجدداً.": "Generation failed. Please try again.",
  "أدخل مفتاح CometAPI أولاً.": "Enter your CometAPI key first.",
  "المفتاح غير صالح.": "Invalid key.",
  "انتهت مهلة التحقق من المفتاح.": "Key verification timed out.",
  "تعذر الاتصال بـ CometAPI للتحقق.": "Could not reach CometAPI for verification.",
  "العنصر غير موجود أو لا يخصك.": "Item not found or not yours.",
  "الصورة غير موجودة أو لا يحق لك الوصول.": "Image not found or you cannot access it.",
};

export function serverMsg(message: string | null | undefined, lang: Lang): string {
  if (!message) return "";
  if (lang !== "en") return message;
  const exact = SERVER_ERROR_EN[message];
  if (exact) return exact;
  const rejectedPrefix = "رفض المزود الطلب: ";
  if (message.startsWith(rejectedPrefix)) {
    return "Provider rejected the request: " + message.slice(rejectedPrefix.length);
  }
  const failed = /^فشل الطلب \((\d+)\)\. أعد المحاولة\.$/.exec(message);
  if (failed) return `Request failed (${failed[1]}). Please try again.`;
  return message;
}
