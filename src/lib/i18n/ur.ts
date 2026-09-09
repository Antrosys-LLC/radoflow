import type { Dictionary } from "./index";

/**
 * Urdu (اردو).
 *
 * ⚠️ NEEDS REVIEW BY A NATIVE URDU SPEAKER BEFORE THIS IS OFFERED AS A DEFAULT.
 * English stays everyone's default until that review happens; nobody is
 * switched automatically.
 *
 * Written to be natural rather than literal, but a factory has its own words
 * for its own trades. Check these first, because a dictionary-correct term
 * nobody on the floor uses is worse than leaving it in English:
 *   duty hours · overtime · grace period · flexible hours · shift ·
 *   contract firm · attendance · payroll · leave ·
 *   the pay-run stages "draft" (کچا حساب) and "in review" (جانچ میں) ·
 *   the machine states "offline" (رابطہ نہیں) against "disabled" (بند),
 *   which must stay tellable apart · the "Engineered by" byline
 *
 * Added for Wave 2's floor screens, and least sure of these:
 *   "Person" as a table column and a filter (ملازم), which is not what a
 *   contract firm's man is · "Close" on a dialog (بند کریں) against the
 *   machine state "disabled" (بند), which must stay tellable apart ·
 *   "Nobody matches these filters" (اِس تلاش میں کوئی نہیں ملا) ·
 *   the attendance-log approval sentences, above all "will not be
 *   recalculated" (حساب دوبارہ نہیں ہوگا) and "reports to you" (ماتحت)
 *
 * Added by the attendance log, and least sure of these:
 *   "Earned" as a money column (بنی رقم) · "Clocked" (لگے گھنٹے) against
 *   "Duty" (ڈیوٹی) and "Hours clocked" (لگے ہوئے گھنٹے), which are three
 *   different figures on the same row and must stay tellable apart ·
 *   "unpaid" for overtime past the daily ceiling (بلا معاوضہ) ·
 *   "Counts" as the column that says whether a day was counted (شمار) ·
 *   the four attendance states the log added, now in `status.attendance`
 *   with the other three:
 *   "holiday" (تعطیل), "off" (آرام کا دن), "partial" (ادھورا دن) and
 *   "pending" (پینڈنگ), which must all stay tellable apart from
 *   "on leave" (چھٹی پر) · "Contract" on a worker's badge (ٹھیکہ)
 *
 * Added by the export buttons, and least sure of these:
 *   the download caption, which is assembled from a file-format name and a
 *   noun ("{format} {label}" — ایکسل ڈاؤن لوڈ, and with the attendance log's
 *   own noun, PDF تنخواہ کی پرچی). The English reads "Payslip PDF"; whether
 *   the format name should lead in Urdu, or whether a floor reader would
 *   rather see "تنخواہ کی پرچی PDF میں", is the open question ·
 *   "Download failed" (ڈاؤن لوڈ نہیں ہو سکا) against "Could not build the
 *   file" (فائل نہیں بن سکی), which are two different failures — the second
 *   is the server refusing or breaking, the first is the browser — and must
 *   stay tellable apart · "{name} downloaded" (ڈاؤن لوڈ ہو گئی), whose
 *   feminine ending assumes the thing named is a فائل
 *
 * Added by the check in/out register, and least sure of these:
 *   "Still in" — checked in, not yet out (ابھی اِن ہیں) — against "Present"
 *   (حاضر), which sit next to each other as two tiles and two badges and must
 *   stay tellable apart · "Not required" for someone the terminals do not
 *   track, which is not absence (حاضری لازمی نہیں) · "A settled day" for a
 *   past date whose figures can no longer change (گزرا ہوا دن)
 *
 * Added by the canteen. Read these out loud before reading them on paper —
 * they are shown at a serving hatch, in the largest type in the product, to
 * a man in a queue who may not read confidently in any language. Plain beats
 * elegant here, and short beats complete.
 *
 * The three refusals matter most, because a worker reads one while being
 * turned away from food:
 *   "Already taken" (پہلے لے چکا ہے) — he ate inside the last 24 hours ·
 *   "Not recognised" (پہچان نہیں ہوئی) — the finger matched nobody, which is
 *   the machine's failure and not his, and the wording should not sound like
 *   an accusation · "Counter closed" (کھانے کا وقت نہیں) — no serving is open
 *   Alongside them, "Second attempts" (دوسری بار کوشش), the tally that counts
 *   those refusals, and "Give food" (کھانا دے دیں), the one instruction the
 *   counter staff act on. These four and "Scan a finger" (انگلی لگائیں) were
 *   already on the counter screen before it was translated — they are the
 *   wording the floor has been reading, moved into this file unchanged rather
 *   than reworded, so a change to them is a change to something in use.
 *
 * And in the settings screen behind it, least sure of these:
 *   `canteenSettings.noServingSwitchedOn` quotes the counter's own refusal, so
 *   the words inside its ”…“ must stay identical to `canteen.counterClosed` ·
 *   "serving time" for a meal window (کھانے کا وقت), the noun the whole
 *   settings screen is built on, against "Opens"/"Closes" (کھلنے کا وقت /
 *   بند ہونے کا وقت) which are the two ends of one · three near-neighbours
 *   that must stay tellable apart: a terminal that is "Inactive" (غیر فعال),
 *   a serving time that is "Off" (بند), and the machine state "disabled"
 *   (بند) in `status.device`
 *
 * Added by the biometric terminals, and least sure of these:
 *   the two connection modes, which are transliterated rather than translated
 *   — "push" (پش) and above all "pull" (پُل), which is spelt like the word for
 *   a bridge and may read wrong to somebody who does not already know the
 *   English term. They sit in `status.deviceMode` next to the protocol names
 *   ADMS and TCP, which stay Latin · "mode" itself (موڈ) ·
 *   `devices.ipAddressHint` quotes the button's own caption, so the words
 *   inside its ”…“ must stay identical to `devices.testConnection`
 *   (رابطہ جانچیں) · "Last seen" for a terminal, rendered as last *contact*
 *   (آخری رابطہ) rather than last sight, against `status.device.offline`
 *   (رابطہ نہیں), which must stay tellable apart · the three machine words
 *   this screen adds around the existing ones: a terminal that is "Active"
 *   (چالو) in the add/edit form, one whose address is "Not set"
 *   (کوئی ایڈریس نہیں), and one that has never reported (کبھی نہیں) ·
 *   "firmware" (فرم ویئر) and "enrolment id" (انرولمنٹ آئی ڈی), both
 *   transliterated because the floor's electrician uses the English words
 *
 *   `common.unassigned` was "کوئی شعبہ نہیں" — "no department" — and is now
 *   "مقرر نہیں", because the terminals list is the third screen to use it and
 *   the thing missing there is a factory, not a department. That change is
 *   visible on the dashboard and the canteen settings screen too.
 *
 * Added by the live floor and Ask, and least sure of these:
 *   "Answer in" (جواب کس زبان میں) — a new label, added because a row of
 *   language names in an app that also has a language setting reads as that
 *   setting, and it is not one. If this does not say plainly "the assistant
 *   will reply in this language", it has failed ·
 *   the five effort levels, which are a dial nobody on the floor has a word
 *   for: "Fast" (تیز), "Balanced" (متوازن), "Thorough" (مکمل), "Deeper"
 *   (گہرا) and "Maximum" (سب سے زیادہ), which must read as one ladder from
 *   quickest to most careful and must stay tellable apart ·
 *   their short forms — تیز, وسط, پورا, گہرا, زیادہ — which are what the
 *   floating widget shows on a phone and are constrained to six characters ·
 *   "Thinking…" (سوچ رہا ہوں…), where a machine speaks in the first person ·
 *   "(nothing heard)" (کچھ نہیں سنا), shown after a failed voice attempt, and
 *   "Didn't catch that" (بات سمجھ نہیں آئی), which must sound like the
 *   machine's failure rather than the speaker's
 *
 * Names, employee codes, CNICs and money are NOT translated anywhere.
 * Neither is anything a terminal *is*: its model, serial number, IP address,
 * port, timezone, firmware string, the menu paths on its own screen, or the
 * protocol names ADMS and TCP.
 */
const ur: Dictionary = {
  nav: {
    workspace: "کام",
    administration: "انتظامیہ",
    antrosys: "اینٹروسس",
    myRecords: "میرا ریکارڈ",
    dashboard: "ڈیش بورڈ",
    ask: "پوچھیں",
    attendance: "حاضری",
    checkInOut: "آمد / روانگی",
    attendanceLog: "حاضری کا ریکارڈ",
    workingCalendar: "کام کا کیلنڈر",
    devices: "بایومیٹرک مشینیں",
    liveFloor: "فلور، براہِ راست",
    rates: "اجرت کے ریٹ",
    canteen: "کینٹین",
    claudeSpend: "کلاڈ کا خرچ",
    canteenSettings: "کینٹین کی ترتیبات",
    reports: "رپورٹیں",
    payroll: "تنخواہ",
    users: "یوزر اکاؤنٹس",
    roles: "کردار اور رسائی",
    settings: "ترتیبات",
    signOut: "سائن آؤٹ",
  },
  common: {
    save: "محفوظ کریں",
    saving: "محفوظ ہو رہا ہے…",
    cancel: "منسوخ کریں",
    loading: "کھل رہا ہے…",
    nothingYet: "ابھی دکھانے کو کچھ نہیں",
    today: "آج",
    hours: "گھنٹے",
    late: "دیر سے",
    checkedIn: "اِن",
    checkedOut: "آؤٹ",
    yes: "ہاں",
    no: "نہیں",
    noRole: "کوئی کردار نہیں دیا گیا",
    // پہلے یہ ”کوئی شعبہ نہیں“ تھا، لیکن یہی لفظ فیکٹری کے لیے بھی استعمال
    // ہوتا ہے — اِس لیے اب دونوں پر پورا اترنے والا لفظ رکھا گیا ہے۔
    unassigned: "مقرر نہیں",
    minutesLate: "{minutes} منٹ دیر",
    identifyMethods: "فنگر پرنٹ، کارڈ، چہرہ یا پاس کوڈ",
    identifyMethodsHint: "مشینیں فنگر پرنٹ، کارڈ، چہرہ یا پاس کوڈ قبول کرتی ہیں",
    engineeredBy: "بنایا ہے {company} نے",
    nameFallback: "جی",
    person: "ملازم",
    date: "تاریخ",
    search: "تلاش",
    searchPlaceholder: "نام، کوڈ یا شناختی کارڈ",
    department: "شعبہ",
    everyDepartment: "ہر شعبہ",
    site: "فیکٹری",
    show: "دکھائیں",
    close: "بند کریں",
    nobodyMatches: "اِس تلاش میں کوئی نہیں ملا۔",
    status: "حالت",
    download: "ڈاؤن لوڈ",
    // انگریزی میں "{label} {format}" ہے؛ اردو میں فائل کی قسم پہلے آتی ہے۔
    downloadFormat: "{format} {label}",
    downloaded: "{name} ڈاؤن لوڈ ہو گئی۔",
    downloadFailed: "ڈاؤن لوڈ نہیں ہو سکا۔",
    downloadNotBuilt: "فائل نہیں بن سکی ({status})۔",
    clear: "صاف کریں",
    showingOfTotal: "{total} میں سے {showing} دکھائے جا رہے ہیں",
  },
  errors: {
    notFoundTitle: "صفحہ نہیں ملا",
    notFoundBody: "یہ صفحہ موجود نہیں، یا اسے منتقل کر دیا گیا ہے۔",
    goHome: "شروع پر جائیں",
    loadFailedTitle: "یہ صفحہ نہیں کھل سکا",
    loadFailedBody: "ہماری طرف سے کوئی خرابی ہوئی۔ دوبارہ کوشش کریں، یا شروع پر واپس جائیں۔",
    tryAgain: "دوبارہ کوشش کریں",
    deniedTitle: "آپ کے کردار کے لیے دستیاب نہیں",
    deniedBody:
      "{role} کردار میں یہ حصہ شامل نہیں۔ کسی منتظم سے اجازت دلوائیں — کچھ دوبارہ نصب یا اپ ڈیٹ کرنے کی ضرورت نہیں۔",
    backToDashboard: "اپنے ڈیش بورڈ پر واپس",
  },
  spend: {
    title: "کلاڈ کا خرچ",
    subtitle: "براہِ راست اینتھراپک اکاؤنٹ سے، ٹیکس جوڑ کر روپوں میں",
    perSecond: "فی سیکنڈ",
    averagedOver: "{days} دنوں کا اوسط",
    today: "آج",
    thisPeriod: "اس عرصے میں",
    acrossDays: "{days} دنوں میں",
    sinceMidnight: "رات بارہ بجے سے تخمینہ",
    notConfigured: "اینتھراپک کی ایڈمن کلید مقرر نہیں",
    notConfiguredHint:
      "اکاؤنٹ کی اپنی رپورٹ پڑھنے کے لیے میزبان پر ANTHROPIC_ADMIN_KEY مقرر کریں۔ کلید اینتھراپک کنسول میں Settings، Admin API keys سے بنتی ہے۔ تب تک صرف نیچے والا اپنا حساب دستیاب ہے۔",
    refused: "اینتھراپک نے درخواست رد کر دی",
    unreachable: "اینتھراپک تک رسائی نہیں ہو سکی",
    problemHint:
      "نیچے کے اعداد صرف اسی ایپ کے اپنے حساب سے ہیں، اسی اکاؤنٹ پر ہونے والا باقی خرچ ان میں شامل نہیں۔",
    appTitle: "اس ایپ نے کیا پوچھا",
    appSubtitle: "یہاں ہر سوال کے حساب سے گنا گیا — اوپر والے اکاؤنٹ سے کم دائرہ",
    appSpend: "خرچ",
    appCalls: "جوابات",
    budgetTitle: "اس مہینے کی حد",
    budgetHint:
      "مہینے کا خرچ یہاں پہنچتے ہی ہر سوال کا بٹن جواب دینا بند کر دیتا ہے۔ پہلی تاریخ کو دوبارہ شروع۔",
    budgetLeft: "{amount} باقی",
    budgetSpent: "اس مہینے کچھ باقی نہیں",
    budgetReached:
      "حد پوری ہو چکی ہے۔ پہلی تاریخ تک، یا نیچے سے حد بڑھانے تک، کوئی سوال نہیں پوچھا جا سکتا۔",
    limit: "ماہانہ حد (روپے)",
    settingsTitle: "ریٹ اور ٹیکس",
    settingsHint:
      "ایک ڈالر کتنے روپے کا، اور بینک کتنا ٹیکس لگاتا ہے۔ جہاں بھی ڈالر روپوں میں دکھایا جاتا ہے، یہی دونوں لگتے ہیں۔",
    settingsReadOnly: "آپ یہ دیکھ سکتے ہیں، بدل نہیں سکتے۔",
    rate: "ایک ڈالر کے روپے",
    tax: "ٹیکس (%)",
  },
  theme: {
    label: "ظاہری شکل",
    light: "روشن",
    dark: "گہرا",
    system: "میرے آلے کے مطابق",
  },
  chart: {
    viewAsTable: "جدول کی شکل میں دیکھیں",
    colDate: "تاریخ",
    colName: "نام",
    colValue: "مقدار",
    colDuty: "ڈیوٹی",
    colOvertime: "اوور ٹائم",
    colTotal: "کل",
    colIn: "آمد",
    colOut: "روانگی",
    colUnmatched: "بے جوڑ",
    dutyHours: "ڈیوٹی کے گھنٹے",
    overtime: "اوور ٹائم",
    checkedIn: "حاضری لگی",
    checkedOut: "چھٹی لگی",
    noAttendance: "اس عرصے میں کوئی حاضری نہیں۔",
    noPunches: "اس عرصے میں کوئی پنچ نہیں۔",
    nothingRecorded: "اس عرصے میں کچھ درج نہیں ہوا۔",
    nothingToPlot: "اس عرصے میں دکھانے کو کچھ نہیں۔",
    other: "دیگر",
  },
  status: {
    payroll: {
      draft: "کچا حساب",
      calculating: "حساب ہو رہا ہے",
      review: "جانچ میں",
      approved: "منظور",
      paid: "ادا ہو گئی",
      cancelled: "منسوخ",
    },
    device: {
      online: "چل رہی ہے",
      offline: "رابطہ نہیں",
      unknown: "معلوم نہیں",
      disabled: "بند",
    },
    // ADMS اور TCP پروٹوکول کے نام ہیں — ہر زبان میں انگریزی حروف میں رہیں گے۔
    deviceMode: {
      push: "پش (ADMS)",
      pull: "پُل (TCP)",
    },
    deviceDirection: {
      auto: "خود اندازہ لگاتا ہے",
      in: "آمد کا گیٹ",
      out: "روانگی کا گیٹ",
    },
    devicePurpose: {
      attendance: "حاضری",
      canteen: "کینٹین",
    },
    payClass: {
      monthly: "ماہانہ",
      hourly: "گھنٹے کے حساب سے",
    },
    sundayPolicy: {
      off: "چھٹی",
      optional: "مرضی سے",
      compulsory: "لازمی",
      adjust_in_leave: "چھٹی میں ایڈجسٹ — اجرت نہیں",
    },
    workerType: {
      employee: "ملازم",
      contractor: "ٹھیکیدار",
    },
    employment: {
      active: "ملازمت جاری",
      suspended: "معطل",
      terminated: "ملازمت ختم",
    },
    attendance: {
      present: "حاضر",
      absent: "غیر حاضر",
      leave: "چھٹی پر",
      holiday: "تعطیل",
      off: "آرام کا دن",
      partial: "ادھورا دن",
      pending: "پینڈنگ",
    },
  },
  dashboard: {
    title: "آپ کا دن ایک نظر میں",
    greeting: "السلام علیکم {name}",
    introFloor: "آج فلور پر جو کچھ ہو رہا ہے — حاضری، شفٹ اور تنخواہ — سب ایک جگہ۔",
    introSelf: "آپ کی حاضری، چھٹیاں اور تنخواہ کی پرچی، سب ایک جگہ۔",
    youToday: "آج آپ",
    fromTerminal: "بایومیٹرک مشین سے",
    noClockInNeeded: "آپ کے کام میں حاضری لگانا ضروری نہیں",
    checkedIn: "آمد",
    checkedOut: "روانگی",
    hoursToday: "آج کے گھنٹے",
    punctuality: "وقت کی پابندی",
    notYet: "ابھی نہیں",
    onTime: "وقت پر",
    monthlySalaryNote: "آپ ماہانہ تنخواہ پر ہیں، مشین آپ کی حاضری نہیں لگاتی۔",
    workingNow: "ابھی کام پر",
    clockedInNotOut: "اِن ہیں، ابھی آؤٹ نہیں ہوئے",
    notCheckedIn: "حاضری نہیں لگی",
    shiftStartedWithout: "شفٹ شروع ہو گئی، یہ نہیں آئے",
    lateToday: "آج دیر سے آئے",
    afterGrace: "رعایتی وقت کے بعد",
    trackedStaff: "حاضری والے ملازم",
    requiringAttendance: "جن کی حاضری لگنی ہے",
    finishedToday: "آج کام ختم",
    hoursThisMonthAll: "اس مہینے کام کے گھنٹے",
    hoursThisMonthMine: "اس مہینے آپ کے گھنٹے",
    hoursChartHintAll: "اس مہینے فیکٹری میں ہر دن۔ سبز ڈیوٹی، نارنجی اوور ٹائم۔",
    hoursChartHintMine: "اس مہینے آپ کے روزانہ گھنٹے۔ سبز ڈیوٹی، نارنجی اوور ٹائم۔",
    byDepartment: "شعبے کے حساب سے حاضری",
    byDepartmentHint: "ابھی کتنے حاضر ہیں، کتنے ہونے چاہئیں",
    floorBoard: "فلور بورڈ",
    nobodyTracked: "ابھی کسی کی حاضری لازمی نہیں رکھی گئی۔",
    notCheckedInCount: "{count} کی حاضری نہیں لگی",
    andMore: "اور {count} مزید",
    latestPayRun: "پچھلی تنخواہ کا حساب",
    mostRecentPeriod: "سب سے حالیہ مدت",
    gross: "کل تنخواہ",
    netPayable: "قابلِ ادائیگی رقم",
    payRunSummary: "{count} ملازمین · {date} تک",
    payRunSummaryOne: "{count} ملازم · {date} تک",
    openPayroll: "تنخواہ کھولیں",
    noPayPeriod: "ابھی تنخواہ کی کوئی مدت نہیں بنائی گئی۔",
    terminals: "مشینیں",
    terminalsOnline: "{total} میں سے {online} چل رہی ہیں",
    noTerminals: "کوئی مشین درج نہیں۔",
    yourRecords: "آپ کا ریکارڈ",
    everythingAvailable: "جو کچھ آپ کے لیے موجود ہے",
    openMyProfile: "میری پروفائل کھولیں",
  },
  attendance: {
    title: "حاضری",
    subtitle: "آج کون آیا ہے، اور کس وقت",
    workingNow: "ابھی کام پر",
    checkedInNotOut: "اِن ہیں، ابھی آؤٹ نہیں ہوئے",
    notCheckedIn: "حاضری نہیں لگی",
    shiftStartedWithout: "شفٹ شروع ہو گئی، یہ نہیں آئے",
    lateToday: "آج دیر سے آئے",
    arrivedAfterGrace: "رعایتی وقت کے بعد آئے",
    shiftFinished: "شفٹ ختم",
    clockedOut: "آؤٹ ہو گئے",
    shiftNotStarted: "شفٹ شروع نہیں ہوئی",
    noShiftAssigned: "کوئی شفٹ مقرر نہیں",
    chaseFirst: "ان کی شفٹ شروع ہو چکی ہے اور حاضری نہیں لگی — پہلے ان کا پتہ کریں",
    everyoneCheckedIn: "شفٹ والے سب لوگ حاضری لگا چکے ہیں۔",
    onFloorNow: "ابھی فلور پر",
    checkedInStillWorking: "اِن ہیں اور کام کر رہے ہیں",
    nobodyClockedIn: "ابھی کوئی اِن نہیں ہے۔",
    shiftNotStartedYet: "شفٹ ابھی شروع نہیں ہوئی",
    notDueYet: "اس وقت ان کی فلور پر آنے کی باری نہیں",
    finishedToday: "آج کام ختم",
    nobodyHere: "ابھی یہاں کوئی نہیں۔",
    noShift: "کوئی شفٹ نہیں",
    shiftFrom: "{time} سے",
    flexibleHours: "لچکدار اوقات",
  },
  register: {
    title: "آمد / روانگی",
    subtitleToday: "آج — ہر {seconds} سیکنڈ بعد خود تازہ ہوتا رہے گا",
    subtitleSettled: "گزرا ہوا دن — اب اعداد نہیں بدلیں گے",
    stillIn: "ابھی اِن ہیں",
    notRequired: "حاضری لازمی نہیں",
    checkIn: "آمد",
    checkOut: "روانگی",
    showing: "{count} لوگ دکھائے جا رہے ہیں · {expected} کی حاضری لگنی ہے",
    showingOne: "{count} ملازم دکھایا جا رہا ہے · {expected} کی حاضری لگنی ہے",
  },
  logs: {
    title: "حاضری کا ریکارڈ",
    subtitleAll: "ہر حاضری اور اُس سے بننے والی رقم — ایک ملازم، چنے ہوئے شعبے، یا سب۔",
    subtitleMine: "آپ کی ہر حاضری، اور اُس سے بننے والی رقم۔",
    liveBoard: "براہِ راست بورڈ",
    everyone: "سب",
    everyoneInDepartments: "نیچے چنے ہوئے شعبوں کے سب لوگ",
    from: "سے",
    to: "تک",
    departmentsHint: "شعبے — کوئی نہ چنیں تو سب شعبے",
    people: "لوگ",
    departmentCount: "{count} شعبے",
    departmentCountOne: "{count} شعبہ",
    workingDays: "کام کے دن",
    attendedNotSunday: "حاضری لگی، اتوار کے علاوہ",
    overtimeHours: "اوور ٹائم گھنٹے",
    overtimeCap: "کام کے دن میں زیادہ سے زیادہ چار گھنٹے",
    lateArrivals: "دیر سے آنے",
    pastGrace: "رعایتی وقت کے بعد",
    hoursClocked: "لگے ہوئے گھنٹے",
    acrossEveryDay: "دکھائے گئے ہر دن کے",
    overtimeBeyond: "{hours} سے اوپر، دن میں زیادہ سے زیادہ چار",
    notTrackedFlexible: "حساب نہیں — لچکدار اوقات",
    overtime: "اوور ٹائم",
    earned: "بنی رقم",
    contract: "ٹھیکہ",
    peopleCount: "{count} لوگ",
    peopleCountOne: "{count} ملازم",
    earnedNote:
      "بنی رقم میں بنیادی اجرت اور اوور ٹائم شامل ہے، کٹوتی سے پہلے — ٹھیکے والے کی طے شدہ رقم ہوتی ہے۔ تنخواہ کا حساب اِنہی اعداد سے دوبارہ لگایا جاتا ہے۔",
    contractorNote:
      "تنخواہ ٹھیکے پر ملتی ہے۔ یہ گھنٹے صرف اِس لیے درج ہیں کہ بل جانچا جا سکے، اِن سے رقم نہیں بنتی — طے شدہ رقم پوری ادا ہوتی ہے۔",
    notPaidFromAttendance:
      "تنخواہ حاضری سے نہیں بنتی۔ طے شدہ تنخواہ پوری ملتی ہے، اِس لیے یہ حاضریاں صرف موجودگی کا ریکارڈ ہیں، تنخواہ کی بنیاد نہیں۔",
    rateSentence:
      "{perDay} روزانہ اور {perHour} فی اوور ٹائم گھنٹہ کے حساب سے، نیچے کے دنوں کی رقم کٹوتی سے پہلے {total} بنتی ہے۔",
    flexibleNote:
      "اِس ملازم کے لیے آنے یا جانے کا وقت مقرر نہیں، اِس لیے یہ کبھی دیر سے شمار نہیں ہوتے۔",
    payslip: "تنخواہ کی پرچی",
    backToEveryone: "سب کی طرف واپس",
    clocked: "لگے گھنٹے",
    duty: "ڈیوٹی",
    counts: "شمار",
    sunday: "اتوار",
    edited: "تبدیل شدہ",
    approved: "منظور",
    unpaidHint: "روزانہ اوور ٹائم کی حد سے اوپر — درج ہے، ادا نہیں ہوگا",
    unpaidHours: "{hours} بلا معاوضہ",
    countsDay: "{count} دن",
    overtimeOnly: "صرف اوور ٹائم",
    noAttendanceBetween: "{from} سے {to} تک کوئی حاضری درج نہیں۔",
    approving: "منظور ہو رہا ہے…",
    approveRest: "باقی منظور کریں ({count})",
    approveRange: "{range} منظور کریں",
    pickPersonAndRange: "ملازم اور تاریخیں چنیں۔",
    endBeforeStart: "آخری تاریخ پہلی تاریخ سے پہلے نہیں ہو سکتی۔",
    nothingToApprove: "منظور کرنے کو کچھ نہیں — اِن تاریخوں میں آپ کے ماتحت کسی کی حاضری نہیں۔",
    approvedOne: "{count} دن منظور۔ اِس کا حساب دوبارہ نہیں ہوگا۔",
    approvedMany: "{count} دن منظور۔ اِن کا حساب دوبارہ نہیں ہوگا۔",
  },
  calendar: {
    weeklyPattern: "ہر ہفتے",
    weeklyPatternHint: "مستقل اصول۔ یہاں کوئی دن کھولیں تو آگے سے ہر ایسا دن کھل جائے گا۔",
    working: "کام",
    off: "چھٹی",
    weekday: {
      sunday: "اتوار",
      monday: "پیر",
      tuesday: "منگل",
      wednesday: "بدھ",
      thursday: "جمعرات",
      friday: "جمعہ",
      saturday: "ہفتہ",
    },
    readOnly: "آپ کیلنڈر دیکھ سکتے ہیں، بدل نہیں سکتے۔",
    exceptions: "ایک دن کی تبدیلی",
    exceptionsHint:
      "صرف اس اتوار، یا کسی منگل کو بندش۔ تاریخ والی تبدیلی ہفتہ وار اصول پر بھاری ہے۔",
    addException: "دن شامل کریں",
    noExceptions: "کیلنڈر میں کوئی تبدیلی نہیں",
    noExceptionsHint: "ہر دن اوپر والے ہفتہ وار اصول پر چل رہا ہے۔",
    edit: "تبدیل کریں",
    remove: "ہٹا دیں",
    removed: "ہٹا دیا گیا۔",
    saved: "محفوظ ہو گیا۔",
    saveFailed: "محفوظ نہیں ہو سکا۔",
    nowWorking: "اب یہ دن کام کا دن ہے۔",
    nowOff: "اب یہ دن چھٹی ہے۔",
    editException: "{date} کو تبدیل کریں",
    addExceptionTitle: "دن شامل کریں",
    date: "تاریخ",
    kind: "دن کس قسم کا ہے",
    reason: "وجہ",
    reasonPlaceholder: "اضافی آرڈر",
    reasonHint: "دن کے ساتھ محفوظ رہتی ہے، تاکہ بعد میں کیلنڈر دیکھنے والے کو وجہ معلوم ہو۔",
    dayType: {
      workday: "کام کا دن",
      off: "چھٹی",
      holiday: "تعطیل",
      weekend_working: "چھٹی والے دن کام",
      special_working: "اضافی کام کا دن",
    },
    dayTypeHint: {
      workday: "عام دن، چاہے ہفتہ وار اصول کچھ بھی کہے۔",
      off: "کوئی کام نہیں۔ تعطیل نہیں — بندش یا خرابی۔",
      holiday: "اعلان شدہ تعطیل۔",
      weekend_working: "چھٹی والا دن کھولا گیا، ہفتہ وار ریٹ پر اجرت۔",
      special_working: "بند اعلان کیا گیا دن دوبارہ کھول دیا گیا۔",
    },
  },
  canteenLog: {
    title: "آج کے اسکین",
    subtitle: "آج کینٹین ٹرمینل پر ہر انگلی، اور اس کا نتیجہ۔",
    everyScan: "سب",
    served: "کھانا دیا",
    refused: "دوسری کوشش",
    notRecognised: "پہچانا نہیں گیا",
    counterClosed: "کاؤنٹر بند",
    nothingToday: "آج ابھی کوئی اسکین نہیں",
    nothingTodayHint: "کاؤنٹر شروع ہوتے ہی نام یہاں آنے لگیں گے۔",
    unknownWorker: "نامعلوم انگلی",
  },
  canteen: {
    giveFood: "کھانا دے دیں",
    alreadyTaken: "پہلے لے چکا ہے",
    notRecognised: "پہچان نہیں ہوئی",
    counterClosed: "کھانے کا وقت نہیں",
    scanFinger: "انگلی لگائیں",
    servedToday: "آج کھانا دیا",
    secondAttempts: "دوسری بار کوشش",
  },
  canteenSettings: {
    counterInactive: "کینٹین کا کاؤنٹر ابھی کچھ نہیں کرے گا",
    noCanteenTerminal:
      "کوئی مشین کینٹین کے لیے مقرر نہیں، اِس لیے اُس کے اسکین حاضری میں درج ہو رہے ہیں۔",
    setOneOnDevices: "مشینوں والی اسکرین پر ایک مقرر کریں",
    // یہ جملہ کاؤنٹر کے اپنے الفاظ دہراتا ہے، اِس لیے واوین کے اندر
    // بالکل وہی الفاظ رہنے چاہئیں جو `canteen.counterClosed` میں ہیں۔
    noServingSwitchedOn:
      "کوئی کھانے کا وقت چالو نہیں، اِس لیے ہر اسکین پر ”کھانے کا وقت نہیں“ آئے گا۔",
    servingTimes: "کھانے کے اوقات",
    servingTimesHint: "کاؤنٹر کب کھلا رہتا ہے۔ ہر وقت میں فی آدمی ایک کھانا۔",
    addServing: "نیا وقت شامل کریں",
    noServingsYet: "ابھی کوئی وقت مقرر نہیں",
    noServingsHint: "ایک شامل کریں — دوپہر کا کھانا، یا رات کی شفٹ کے لیے رات کا کھانا۔",
    terminals: "کینٹین کی مشینیں",
    terminalsHint:
      "مشینوں والی اسکرین پر مقرر ہوتی ہیں — یہاں اِس لیے دکھائی ہیں کہ کمی صاف نظر آئے",
    noTerminalScanning: "کوئی مشین کھانے کے لیے اسکین نہیں کر رہی۔",
    inactive: "غیر فعال",
    off: "بند",
    runsPastMidnight: "رات بارہ بجے کے بعد تک — جس دن کھلے، اُسی دن میں شمار",
    edit: "تبدیل کریں",
    editServing: "{name} میں تبدیلی",
    addServingTitle: "نیا کھانے کا وقت",
    overnightHint:
      "رات بارہ بجے کے بعد تک چلنے والا وقت ٹھیک ہے — اِسے {time} پر ختم کریں، رات کی شفٹ کا کھانا پھر بھی ایک ہی شمار ہوگا۔",
    servingName: "نام",
    namePlaceholder: "دوپہر کا کھانا",
    opens: "کھلنے کا وقت",
    closes: "بند ہونے کا وقت",
    orderOnScreen: "اسکرین پر ترتیب",
    openLabel: "کھلا — اِس وقت میں کاؤنٹر اسکین قبول کرے گا",
    saveServingTime: "کھانے کا وقت محفوظ کریں",
    removeConfirm:
      "{name} ہٹا دیں؟ پہلے سے درج کھانے اِسی وقت سے جڑے رہتے ہیں، اِس لیے یہ صرف تب ہٹے گا جب اِس میں کسی نے کھانا نہ لیا ہو۔",
    remove: "ہٹا دیں",
    removeServing: "یہ کھانے کا وقت ہٹا دیں",
    chooseFactoryAndName: "فیکٹری چنیں اور نام لکھیں۔",
    enterTimes: "دونوں اوقات HH:MM کی صورت میں لکھیں۔",
    sameStartEnd: "کھلنے اور بند ہونے کا وقت ایک نہیں ہو سکتا — ایسا وقت کبھی کھلے گا ہی نہیں۔",
    duplicateName: "اِس فیکٹری میں ”{name}“ نام کا کھانے کا وقت پہلے سے موجود ہے۔",
    servingUpdated: "کھانے کا وقت تبدیل ہو گیا۔",
    servingAdded: "کھانے کا وقت شامل ہو گیا۔",
    windowInUse: "اِس وقت میں پہلے ہی کھانا دیا جا چکا ہے — اِسے حذف کرنے کے بجائے بند کر دیں۔",
    servingRemoved: "کھانے کا وقت ہٹا دیا گیا۔",
  },
  devices: {
    title: "بایومیٹرک مشینیں",
    subtitle: "فیکٹری فلور پر لگی {model} مشینیں",
    addTerminal: "نئی مشین شامل کریں",
    noneYet: "ابھی کوئی مشین درج نہیں",
    noneYetHint:
      "اپنی {model} شامل کریں اور اُسے اِس سرور کی طرف لگائیں — حاضریاں آنا شروع ہو جائیں گی۔",
    serial: "سیریل",
    mode: "موڈ",
    address: "ایڈریس",
    lastSeen: "آخری رابطہ",
    neverSeen: "کبھی نہیں",
    lastPunchReceived: "آخری حاضری {time} کو ملی",
    timezone: "ٹائم زون",
    notSet: "کوئی ایڈریس نہیں",
    allTerminals: "ساری مشینیں",
    detailSubtitle: "{model} · سیریل {serial} · آخری رابطہ {seen}",
    editSettings: "ترتیبات تبدیل کریں",
    setupTitle: "مشین کی سیٹنگ",
    setupCloudServer:
      "مشین پر: {menu}۔ {serverMode} کو {adms} پر رکھیں، پھر جہاں یہ مشین بھیجتی ہے اُس کا ایڈریس اور پورٹ لکھیں — ہوسٹڈ سیٹ اپ میں ریلے کا مستقل آئی پی، یا اگر سرور اِسی فیکٹری کے نیٹ ورک پر ہے تو سیدھا سرور کا۔ {path} مشین خود لگا لیتی ہے۔",
    setupDigitsOnly:
      "زیادہ تر {adms} فرم ویئر اُس خانے میں صرف ہندسے قبول کرتے ہیں، اِس لیے ڈومین نہیں لکھی جا سکتی — اور اوپر والا ایڈریس خود مشین کا {ip} نہیں ہے، یہ غلطی عام ہے اور پکڑ میں نہیں آتی۔ {ethernet} کے نیچے {gateway} بھی مقرر کریں، ورنہ مشین مقامی نیٹ ورک سے باہر نہیں جا سکتی۔",
    recentPunches: "حالیہ حاضریاں",
    recentPunchesHint: "نئی پہلے، پاکستان کے وقت کے مطابق",
    noPunches: "ابھی کوئی حاضری نہیں آئی",
    noPunchesHint: "مشین جیسے ہی بھیجے گی، حاضریاں چند سیکنڈ میں یہاں نظر آ جائیں گی۔",
    unlinkedTerminalId: "مشین کا آئی ڈی {id} کسی ملازم سے نہیں جڑا",
    testConnection: "رابطہ جانچیں",
    contactingTerminal: "مشین سے رابطہ ہو رہا ہے…",
    syncNow: "ابھی حاضری اتاریں",
    readingLog: "حاضری کا ریکارڈ پڑھا جا رہا ہے…",
    addIpFirst: "پہلے مشین کا آئی پی ایڈریس درج کریں",
    pushControlsNote:
      "یہ مشین پش موڈ میں ہے، اِس لیے خود بھیجتی ہے۔ یہ بٹن اُس کا محفوظ ریکارڈ مانگ کر اتارنے کے لیے ہیں، اور اِن کے لیے سرور کا مشین تک نیٹ ورک پر پہنچنا ضروری ہے۔",
    addTerminalTitle: "نئی {brand} مشین شامل کریں",
    editTerminal: "مشین میں تبدیلی",
    dialogHint:
      "پش موڈ بہتر ہے: مشین خود اِس سرور کو بھیجتی ہے، اِس لیے فیکٹری کے نیٹ ورک کے اندر پہنچنے کی ضرورت نہیں رہتی۔",
    terminalName: "مشین کا نام",
    terminalNameHint: "مثلاً ڈائینگ — مین گیٹ",
    terminalNamePlaceholder: "ڈائینگ — مین گیٹ",
    chooseFactory: "فیکٹری چنیں",
    serialNumber: "سیریل نمبر",
    model: "ماڈل",
    connectionMode: "رابطے کا موڈ",
    modePushOption: "پش — مشین خود ہمیں بھیجتی ہے (بہتر)",
    modePullOption: "پُل — ہم TCP پر مشین سے رابطہ کرتے ہیں",
    gate: "کون سا گیٹ",
    gateHint: "اندر والے دروازے کا ٹرمینل آمد لکھتا ہے؛ باہر والے کا روانگی",
    gateAutoOption: "خود اندازہ لگائے — پہلا پنچ آمد، آخری روانگی",
    gateInOption: "آمد — یہاں کا ہر پنچ آنے کا ہے",
    gateOutOption: "روانگی — یہاں کا ہر پنچ جانے کا ہے",
    records: "یہ مشین کیا درج کرتی ہے",
    recordsHint: "کینٹین کا اسکین کھانا ہے، حاضری نہیں — کھانے کے پیسے کسی کو نہیں ملتے۔",
    purposeAttendanceOption: "حاضری — آمد اور روانگی",
    purposeCanteenOption: "کینٹین — ہر وقت میں فی آدمی ایک کھانا",
    ipAddress: "آئی پی ایڈریس",
    // یہ جملہ بٹن کے اپنے الفاظ دہراتا ہے، اِس لیے واوین کے اندر بالکل وہی
    // الفاظ رہنے چاہئیں جو `devices.testConnection` میں ہیں۔
    ipAddressHint: "پُل موڈ اور ”رابطہ جانچیں“ کے لیے ضروری ہے",
    port: "پورٹ",
    commKeyHint: "{menu}۔ اگر مقرر نہیں تو خالی چھوڑ دیں۔",
    activeLabel: "چالو — اِس مشین سے حاضریاں قبول کریں",
    saveTerminal: "مشین محفوظ کریں",
    nameFactorySerialRequired: "نام، فیکٹری اور سیریل نمبر ضروری ہیں۔",
    portRange: "پورٹ 1 سے 65535 کے درمیان پورا عدد ہونا چاہیے۔",
    duplicateSerial: "سیریل {serial} والی مشین پہلے سے موجود ہے۔",
    terminalAdded: "مشین شامل ہو گئی۔",
    terminalUpdated: "مشین کی تفصیل تبدیل ہو گئی۔",
    notFound: "مشین نہیں ملی۔",
    setIpBeforeTesting: "جانچنے سے پہلے مشین کا آئی پی ایڈریس درج کریں۔",
    connected: "رابطہ ہو گیا۔ فرم ویئر {firmware}، مشین کی گھڑی {clock}۔",
    firmwareUnknown: "معلوم نہیں",
    clockUnreadable: "پڑھی نہیں جا سکی",
    pushCannotBeReached:
      "یہ مشین پش موڈ میں ہے، اِس لیے یہاں سے اُس تک نہیں پہنچا جا سکتا — یہ متوقع ہے اور اِس کا مطلب یہ نہیں کہ مشین بند ہے۔ اِس کی حالت اُن حاضریوں سے بنتی ہے جو یہ خود بھیجتی ہے۔",
    noIpAddress: "اِس مشین کا کوئی آئی پی ایڈریس نہیں۔ پش موڈ والی مشینیں خود بھیجتی ہیں۔",
    noSerialRecorded: "اِس مشین کا سیریل نمبر درج نہیں۔",
    syncRead: "{read} ریکارڈ پڑھے گئے: {accepted} نئے، {duplicates} پہلے سے محفوظ۔",
    syncUnmapped: "{count} انرولمنٹ آئی ڈی ابھی کسی ملازم سے نہیں جڑیں۔",
    pushCannotBePolled:
      "یہ مشین پش موڈ میں ہے اور یہاں سے اِس کا ریکارڈ نہیں مانگا جا سکتا۔ یہ خود بھیجتی ہے — کچھ اتارنے کی ضرورت نہیں۔",
  },
  liveFloor: {
    title: "فلور، براہِ راست",
    subtitle: "آخری {count} آمد و روانگی، ہر {seconds} سیکنڈ بعد تازہ",
    nothingYet: "فلور پر ابھی کچھ نہیں",
    nothingYetHint: "مشین سے آتے ہی اسکین یہاں چند سیکنڈ میں دکھائی دیں گے۔",
    unlinkedTerminalId: "غیر منسلک مشین نمبر {id}",
    terminalFallback: "مشین",
  },
  ask: {
    subtitle: "حاضری، چھٹی اور تنخواہ — سادہ زبان میں جواب",
    askClaude: "کلاڈ سے پوچھیں",
    askAboutThis: "اس ریکارڈ کے بارے میں کلاڈ سے پوچھیں",
    askAboutGreeting:
      "اس کے بارے میں جو پوچھنا ہو پوچھیں — جو آپ کی سکرین پر ہے وہ مجھے نظر آ رہا ہے۔",
    widgetSubtitle: "حاضری، چھٹی اور تنخواہ",
    panelLabel: "اسسٹنٹ سے پوچھیں",
    openLabel: "سوال پوچھیں",
    answerLanguage: "جواب کس زبان میں",
    commonQuestions: "عام سوالات",
    thinking: "سوچ رہا ہوں…",
    placeholder: "یہاں سوال لکھیں…",
    askByVoice: "بول کر پوچھیں",
    stopListening: "سننا بند کریں",
    heard: "کیا آپ نے یہ پوچھا؟",
    nothingHeard: "(کچھ نہیں سنا)",
    retry: "دوبارہ",
    send: "بھیجیں",
    sessionCost: "اس نشست کا خرچ: {amount}",
    noAnswer: "ابھی جواب نہیں مل سکا۔",
    unreachable: "اسسٹنٹ تک رابطہ نہیں ہو سکا۔ اپنا انٹرنیٹ دیکھیں۔",
    notCaught: "بات سمجھ نہیں آئی — دوبارہ بولیں، یا سوال لکھ دیں۔",
    notSignedIn: "آپ سائن اِن نہیں ہیں۔",
    overBudget:
      "اس مہینے کے لیے مقررہ خرچ کی حد پوری ہو چکی ہے۔ اینٹروسس سے حد بڑھوائیں، یا اگلے مہینے کا انتظار کریں۔",
    notAllowed: "آپ کو اسسٹنٹ استعمال کرنے کی اجازت نہیں۔",
    badRequest: "درخواست درست نہیں تھی۔",
    emptyQuestion: "پہلے سوال لکھیں۔",
    questionTooLong: "یہ سوال بہت لمبا ہے۔",
    notConfigured: "اسسٹنٹ ابھی ترتیب نہیں دیا گیا۔",
    couldNotAnswer: "اسسٹنٹ اس کا جواب نہیں دے سکا۔",
    noAnswerText: "میں اس کا جواب نہیں نکال سکا۔",
    effort: {
      low: { label: "تیز", short: "تیز", hint: "جلدی جواب" },
      medium: { label: "متوازن", short: "وسط", hint: "دونوں کے بیچ" },
      high: { label: "مکمل", short: "پورا", hint: "طے شدہ" },
      xhigh: { label: "گہرا", short: "گہرا", hint: "مشکل سوالوں کے لیے" },
      max: { label: "سب سے زیادہ", short: "زیادہ", hint: "سب سے سست اور مہنگا" },
    },
  },
  reports: {
    title: "رپورٹیں · {scope}",
    wholeFactory: "پوری فیکٹری",
    periodHint: "{from} سے {to} تک — ہر عدد انہی حسابات سے آتا ہے جو پے رول چلاتے وقت لگتے ہیں۔",
    from: "سے",
    to: "تک",
    people: "افراد",
    peopleHint: "{count} کی حاضری موجود ہے",
    workingDays: "کام کے دن",
    workingDaysHint: "حاضری والے دن، اتوار کے علاوہ",
    hoursWorked: "کام کے گھنٹے",
    hoursWorkedHint: "ڈیوٹی اور اوور ٹائم",
    overtime: "اوور ٹائم",
    overtimeHint: "کام کے دن زیادہ سے زیادہ 4 گھنٹے",
    earned: "کمائی",
    earnedHint: "کٹوتیوں سے پہلے",
    dailyHours: "ہر دن کے کام کے گھنٹے",
    dailyHoursHint: "شامل تمام افراد کے ڈیوٹی گھنٹے اور اوور ٹائم۔ اتوار صرف اوور ٹائم میں آتا ہے۔",
    punches: "آمد اور روانگی",
    punchesHint:
      "جس دن دونوں برابر نہ ہوں، وہاں کوئی پنچ رہ گیا — اور رہ گیا پنچ غلط پرچی بناتا ہے۔",
    hoursByDept: "شعبے کے حساب سے گھنٹے",
    hoursByDeptHint: "ڈیوٹی اور اوور ٹائم ملا کر۔",
    earnedByDept: "شعبے کے حساب سے کمائی",
    earnedByDeptHint: "بنیادی اجرت اور اوور ٹائم، کٹوتیوں سے پہلے۔",
    mostOvertime: "سب سے زیادہ اوور ٹائم",
    mostOvertimeHint: "وہ لوگ جو اپنے ڈیوٹی گھنٹوں سے آگے کام کر رہے ہیں۔",
    topEarners: "اس عرصے کی سب سے زیادہ کمائی",
    topEarnersHint: "ٹھیکیدار کے لیے طے شدہ رقم دکھائی جاتی ہے۔",
    headcount: "شعبے کے حساب سے افراد",
    headcountHint: "کسی حصے کو دبائیں تو وہ نکل جائے گا اور باقی دوبارہ تقسیم ہو جائیں گے۔",
    arrangements: "اجرت کس طرح دی جاتی ہے",
    arrangementsHint: "فیکٹری کا ہر طریقہ، کل عملے کے تناسب سے۔",
    wageBill: "شعبے کے حساب سے اجرت کا بوجھ",
    wageBillHint: "اس عرصے کی کمائی، کٹوتیوں سے پہلے۔",
    overtimeByDept: "شعبے کے حساب سے اوور ٹائم",
    overtimeByDeptHint: "ڈیوٹی سے آگے سب سے زیادہ گھنٹے کرنے والے چھ شعبے۔",
    earningsAgainstHours: "گھنٹوں کے مقابلے میں کمائی",
    earningsAgainstHoursHint:
      "ہر فرد کے لیے ایک نقطہ۔ اوپر کا نقطہ جس کے گھنٹے کم ہوں، یا تو اسے کوئی ٹرمینل نہیں پکڑ رہا یا وہ آ ہی نہیں رہا۔",
    unitHours: "گھنٹے",
    unitRupees: "روپے",
    unitPeople: "افراد",
    unitRupeesLower: "روپے",
    axisHours: "گھنٹے",
    axisEarned: "کمائی",
    arrangement: {
      standard: "8 گھنٹے ڈیوٹی، اوور ٹائم کے ساتھ",
      twelveHour: "12 گھنٹے ڈیوٹی",
      noOvertime: "اوور ٹائم نہیں",
      contractors: "ٹھیکیدار",
      notFromAttendance: "اجرت حاضری سے نہیں",
    },
  },
  payroll: {
    periods: "تنخواہ کے ادوار",
    periodsHint: "ٹرمینلز کی درج کی ہوئی حاضری سے نکالا گیا",
    newPeriod: "نیا دورانیہ",
    noPeriods: "ابھی کوئی دورانیہ نہیں",
    noPeriodsHint: "جن تاریخوں کی اجرت دینی ہے، ان کے لیے ایک دورانیہ بنائیں۔",
    paidSummary: "{count} افراد · خالص {amount}",
    notCalculated: "ابھی حساب نہیں ہوا",
    grossPay: "کل اجرت",
    deductions: "کٹوتیاں",
    tax: "ٹیکس",
    netPayable: "قابلِ ادائیگی خالص",
    runPayroll: "پے رول چلائیں",
    recalculate: "دوبارہ حساب کریں",
    calculating: "حاضری سے حساب کیا جا رہا ہے…",
    approve: "منظور کریں",
    approving: "منظور کیا جا رہا ہے…",
    markPaidAndLock: "ادا شدہ لگا کر بند کریں",
    closingPeriod: "دورانیہ بند کیا جا رہا ہے…",
    locked: "بند ہے — ادا شدہ دورانیے کا دوبارہ حساب نہیں ہو سکتا۔",
    lines: "پے رول کی سطریں · {count}",
    linesHint: "گھنٹے بائیو میٹرک ٹرمینلز سے آتے ہیں۔ پوری پرچی کے لیے سطر پر دبائیں۔",
    reviewBanner:
      "منظوری سے پہلے {count} پر نظر ڈالنے کے قابل ہیں — کم کیے گئے گھنٹے، حاضری میں کوئی جھول، یا پچھلے مہینوں کے مقابلے میں اجرت کا بڑا فرق۔ حساب غلط نہیں؛ ہر پرچی پر لکھا نوٹ پڑھ لیں۔",
    nothingCalculated: "ابھی کوئی حساب نہیں ہوا",
    nothingCalculatedHint: "حاضری سے سطریں بنانے کے لیے پے رول چلائیں۔",
    colRegularHours: "ڈیوٹی گھنٹے",
    colOvertimeHours: "اوور ٹائم گھنٹے",
    colGross: "کل",
    colNet: "خالص",
    colPaid: "ادا",
    payslip: "پرچی",
    droppedTooltip: "{dates} کو اوور ٹائم کی حد نے {hours} کم کر دیے — منظوری سے پہلے دیکھ لیں",
    cashTally: "{total} میں سے {paid} کو نقد ادا · {totalAmount} میں سے {paidAmount} دیے جا چکے",
    cashLeft: "{count} کی ادائیگی باقی ہے",
    undo: "واپس کریں",
    undoing: "واپس کیا جا رہا ہے…",
    notYet: "ابھی نہیں",
    amountPaid: "ادا کی گئی رقم",
    amountPaidHint: "پوری رقم دی ہے تو اسے ویسے ہی رہنے دیں",
    paidReason: "فرق کی وجہ",
    paidReasonPlaceholder: "کھلے پیسے نہیں تھے",
    confirmPay: "ادائیگی درج کریں",
    shortBy: "{amount} کم",
    overBy: "{amount} زیادہ",
    paidExactly: "پوری ادائیگی",
    differencesTotal: "{count} سطریں حساب سے مختلف ہیں · خالص {amount}",
    markPaid: "ادا شدہ لگائیں",
    markingPaid: "{name} کو ادا شدہ لگایا جا رہا ہے…",
    newPeriodTitle: "نیا تنخواہ دورانیہ",
    periodLabel: "نام",
    periodLabelPlaceholder: "اگست 2026",
    from: "سے",
    to: "تک",
    creating: "بنایا جا رہا ہے…",
    createPeriod: "دورانیہ بنائیں",
    regular: "ڈیوٹی",
    overtime: "اوور ٹائم",
    weekend: "ہفتہ وار",
    worthLook: "منظوری سے پہلے دیکھنے کے قابل",
    droppedTitle: "اوور ٹائم کی حد نے {hours} کم کر دیے",
    droppedBody:
      "غالباً دوہری ڈیوٹی کا دن ہے، غلط عدد نہیں — منظوری سے پہلے {dates} کے پنچ دیکھ لیں۔",
    earnings: "آمدنی",
    netPay: "خالص اجرت",
    printPayslip: "پرچی چھاپیں",
    closePayslip: "پرچی بند کریں",
    unknownPerson: "نامعلوم",
  },
  rates: {
    payByPerson: "فرد کے حساب سے اجرت · {count}",
    payByPersonHint:
      "ہر فرد کیا کماتا ہے، اس کی تنخواہ کتنے گھنٹے کا احاطہ کرتی ہے، اور اس کے ساتھ کون سی سطریں لگی ہیں۔ شعبے کے حساب سے۔",
    searchPlaceholder: "نام، ملازم کوڈ یا شناختی کارڈ",
    paidAs: "کس حیثیت سے اجرت",
    everyone: "ملازم اور ٹھیکیدار",
    employees: "ملازم",
    contractors: "ٹھیکیدار",
    readOnly:
      "آپ اجرت کے اصول دیکھ سکتے ہیں، بدل نہیں سکتے۔ بدلنے کے لیے ”اجرت کے اصول سنبھالیں“ کی اجازت درکار ہے۔",
    ratesFor: "اجرت کے ریٹ — {site}",
    ratesForHint: "ہر قسم کے کام کے وقت کے لیے فی گھنٹہ روپے",
    noRates: "اس فیکٹری کے لیے کوئی ریٹ مقرر نہیں۔",
    latePenalties: "دیر سے آنے پر کٹوتی",
    latePenaltiesHint: "شفٹ شروع ہونے کے بعد حاضری لگانے پر خود بخود کٹ جاتی ہے",
    noLatePenalty: "دیر پر کوئی کٹوتی مقرر نہیں۔",
    overtime: "اوور ٹائم",
    weekend: "ہفتہ وار یا چھٹی کا دن",
    holiday: "تعطیل",
    night: "رات کی شفٹ",
    perHour: "{amount} فی گھنٹہ",
    lateRange: "{from} سے {to}",
    beyond: "اور اس سے آگے",
    minutes: "{minutes} منٹ",
    penaltyOfDaily: "ایک دن کی اجرت کا {percent}%",
    penaltyOfMonthly: "ماہانہ اجرت کا {percent}%",
    perHourNote:
      "ریٹ فی گھنٹہ روپوں میں ہیں، بنیادی اجرت کے ضرب میں نہیں۔ کسی کی بنیادی اجرت بدلنے سے یہ نہیں بدلتے۔",
    otRate: "اوور ٹائم کا ریٹ",
    otRateHint: "مقررہ دن سے آگے فی گھنٹہ",
    weekendRate: "ہفتہ وار یا چھٹی کے دن کا ریٹ",
    weekendRateHint: "کھولے گئے آرام کے دن فی گھنٹہ",
    holidayRate: "تعطیل کا ریٹ",
    holidayRateHint: "اعلان شدہ تعطیل پر فی گھنٹہ",
    nightRate: "رات کی شفٹ کا ریٹ",
    nightRateHint: "رات کی باری میں فی گھنٹہ",
    standardHours: "دن کے مقررہ گھنٹے",
    workingDaysMonth: "مہینے کے کام کے دن",
    otAfter: "اوور ٹائم کتنے منٹ بعد شروع",
    roundTo: "گھنٹے کتنے منٹ پر گول کریں",
    effectiveFrom: "کس تاریخ سے نافذ",
    effectiveFromHint:
      "نئی تاریخ ایک نیا ریٹ سیٹ بناتی ہے؛ جو پے رول پہلے نکل چکا ہے وہ پرانے ریٹ پر رہتا ہے۔",
    whatThisPays: "اس سے کتنا بنتا ہے",
    weekendShiftExample: "8 گھنٹے کی ہفتہ وار شفٹ: {amount}",
    overtimeExample: "4 گھنٹے اوور ٹائم: {amount}",
    holidayShiftExample: "8 گھنٹے کی تعطیل والی شفٹ: {amount}",
    saveRates: "ریٹ محفوظ کریں",
    ladderNote:
      "بینڈ ایک سیڑھی ہیں، جمع نہیں ہوتے — 90 منٹ دیر پر صرف 1 تا 2 گھنٹے والی کٹوتی لگتی ہے۔ دیر شفٹ کے آغاز سے، رعایتی وقت کے بعد ناپی جاتی ہے۔",
    colBand: "بینڈ",
    colLateFrom: "دیر شروع",
    colLateUntil: "دیر تک",
    colDeduction: "کٹوتی",
    noBands: "دیر سے آنے پر کوئی کٹوتی مقرر نہیں — فی الحال دیر کا کوئی نقصان نہیں۔",
    bandName: "بینڈ کا نام",
    bandNamePlaceholder: "15 تا 30 منٹ دیر",
    lateFromField: "دیر شروع (منٹ)",
    lateUntilField: "دیر تک (منٹ)",
    lateUntilPlaceholder: "خالی = اس سے آگے",
    deductPercent: "کٹوتی (%)",
    basis: "کس کا",
    basisDay: "ایک دن کی اجرت",
    basisMonth: "ماہانہ اجرت",
    addBand: "بینڈ شامل کریں",
    removeBand: "{name} ہٹا دیں",
    contractFirms: "ٹھیکے دار فرمیں",
    contractFirmsHint: "ہر فرم کے لیے ایک طے شدہ رقم، اس کے افراد کا الگ حساب کرنے کے بجائے",
    noFirms: "اس فیکٹری میں ٹھیکے کا کوئی شعبہ نہیں۔",
    firmsFooter:
      "جس فرم کی رقم صفر ہو اس کا کوئی بل نہیں بنتا اور اس کے افراد کسی پے رول سطر میں نہیں آتے۔ پے رول چلاتے وقت اس پر خبردار کیا جاتا ہے، خاموشی سے چھوڑا نہیں جاتا۔",
    onTheFloor: "{count} افراد کام پر",
    monthlyAmount: "ماہانہ رقم (روپے)",
    perMonth: "ماہانہ",
    contractSuffix: "{amount} ٹھیکہ",
    agreedFlat: "طے شدہ، مقررہ",
    perDayShort: "{amount} روزانہ",
    tagContract: "ٹھیکہ",
    tagDuty: "{hours} گھنٹے ڈیوٹی",
    tagSunday: "اتوار: {policy}",
    tagNotFromAttendance: "حاضری سے نہیں",
    tagFlexible: "لچکدار",
    tagNoOvertime: "اوور ٹائم نہیں",
    agreedAmount: "طے شدہ رقم",
    monthlySalary: "ماہانہ تنخواہ",
    salaryCovers: "تنخواہ کتنے گھنٹے کی",
    noAttendanceNeeded: "حاضری کی ضرورت نہیں — پوری تنخواہ",
    noAttendanceHint:
      "اس فرد کی حاضری نہیں رکھی جاتی اور گھنٹوں کا حساب نہیں ہوتا۔ تنخواہ پوری ملتی ہے۔",
    hourlyBreakdown: "{perHour} فی گھنٹہ · {perMinute} فی منٹ",
    hours8: "8 گھنٹے",
    hours12: "12 گھنٹے",
    sunday: "اتوار",
    payClass: "اجرت کی قسم",
    hourlyRate: "فی گھنٹہ ریٹ",
    tracking: "حاضری اور اجرت",
    trackingTracked: "درج ہوتی ہے — حاضری اور تنخواہ",
    trackingSalaryOnly: "صرف تنخواہ — حاضری نہیں رکھی جاتی",
    trackingExempt: "کوئی نہیں — مالک",
    trackingHint: "مالک اس نظام سے کچھ نہیں لیتا اور کسی پے رول میں نہیں آتا۔",
    earnsOvertime: "اوور ٹائم ملتا ہے",
    contractorNote:
      "کوئی حساب نہیں ہوتا۔ طے شدہ رقم پوری ادا ہوتی ہے — چھٹیوں کی کٹوتی نہیں، اوور ٹائم نہیں، دیر پر کٹوتی نہیں۔",
    dailyBreakdown:
      "{perDay} روزانہ ({salary} ÷ {days}) · {perHour} فی اوور ٹائم گھنٹہ (÷ 8) · اوور ٹائم {duty} گھنٹوں کے بعد، کام کے دن زیادہ سے زیادہ 4 گھنٹے، اتوار کو کوئی حد نہیں۔",
    swipeSave: "{name} کی اجرت محفوظ کرنے کے لیے سوائپ کریں",
    componentsTitle: "الاؤنس اور کٹوتیاں",
    nothingAttached: "ابھی کچھ نہیں لگا۔",
    componentNamePlaceholder: "ایڈوانس کی واپسی",
    amount: "رقم",
    lineName: "نام",
    kind: "قسم",
    deduction: "کٹوتی",
    allowance: "الاؤنس",
    swipeAttach: "یہ سطر لگانے کے لیے سوائپ کریں",
    attaching: "لگائی جا رہی ہے…",
    removeLine: "{name} ہٹا دیں",
  },
  users: {
    title: "صارف اکاؤنٹس · {count}",
    hint: "ہر وہ شخص جو سائن اِن کر سکتا ہے۔ ملازم کوڈ ہی اس کا K50 فنگر پرنٹ نمبر ہے۔",
    addUser: "صارف شامل کریں",
    searchPeople: "افراد تلاش کریں",
    everyRole: "ہر کردار",
    anyStatus: "کوئی بھی حالت",
    cannotSignIn: "سائن اِن نہیں کر سکتے — شناختی کارڈ نہیں",
    noCnic: "شناختی کارڈ نہیں — سائن اِن نہیں کر سکتے",
    customAccessCount: "{count} خصوصی رسائی کی تبدیلیاں",
    selectPerson: "{name} کو منتخب کریں",
    selectAllShown: "سب منتخب کریں",
    selectedCount: "{count} منتخب",
    bulkAction: "کیا تبدیل کرنا ہے",
    bulkValue: "کس میں تبدیل کریں",
    applyToSelected: "لاگو کریں",
    clearSelection: "انتخاب ہٹا دیں",
    confirmWithPassword: "آپ کا پاس ورڈ",
    passwordWhyReset:
      "اپنا پاس ورڈ، کیونکہ نیا پاس ورڈ رکھنے والا اسی فرد کے طور پر سائن اِن کر سکے گا۔",
    passwordWhySuspend:
      "اپنا پاس ورڈ۔ معطل اکاؤنٹ سائن اِن نہیں کر سکتا اور پے رول سے نکل جاتا ہے۔",
    passwordWhyBulk: "اپنا پاس ورڈ، کیونکہ یہ اوپر منتخب ہر فرد کو بدل دے گا۔",
    editProfile: "پروفائل تبدیل کریں",
    noRole: "کوئی کردار نہیں",
    customAccess: "خصوصی رسائی",
    payAndDuty: "اجرت اور ڈیوٹی",
    reactivate: "دوبارہ بحال کریں",
    suspend: "معطل کریں",
    swipeSetRole: "{name} کا کردار مقرر کرنے کے لیے سوائپ کریں",
    updatingRole: "کردار بدلا جا رہا ہے…",
    signOutWarning:
      "انہیں سائن آؤٹ کر دیا جائے گا، اور نافذ ہونے کے لیے دوبارہ سائن اِن کرنا ہو گا۔",
    swipeReactivate: "بحال کرنے کے لیے سوائپ کریں",
    swipeSuspend: "معطل کرنے کے لیے سوائپ کریں",
    reactivating: "بحال کیا جا رہا ہے…",
    suspending: "معطل کیا جا رہا ہے…",
    setPassword: "پاس ورڈ مقرر کریں",
    newPasswordFor: "{name} کے لیے نیا پاس ورڈ",
    swipeSetPassword: "{name} کا پاس ورڈ مقرر کرنے کے لیے سوائپ کریں",
    settingPassword: "پاس ورڈ مقرر کیا جا رہا ہے…",
    atLeast8: "کم از کم 8 حروف۔",
    addTitle: "نیا صارف",
    addHint:
      "ملازم کوڈ ہی ان کا ZKTeco K50 فنگر پرنٹ نمبر ہے — ٹرمینل پر اسی نمبر سے اندراج کریں اور پنچ خود جڑ جائیں گے۔",
    fullName: "پورا نام",
    fullNamePlaceholder: "عمران شیخ",
    employeeCode: "ملازم کوڈ / K50 نمبر",
    cnic: "شناختی کارڈ (سائن اِن)",
    tempPassword: "عارضی پاس ورڈ",
    passwordPlaceholder: "کم از کم 8 حروف",
    email: "ای میل (اختیاری)",
    phone: "فون",
    designation: "عہدہ",
    designationPlaceholder: "لوم آپریٹر",
    role: "کردار",
    roleAssignedElsewhere: "رسائی سنبھالنے والا کوئی فرد مقرر کرتا ہے۔",
    shift: "شفٹ",
    noShift: "کوئی شفٹ نہیں — ڈیوٹی کے گھنٹے پورے کرنے ہوں گے",
    contractorDepartment: "{name} (ٹھیکہ)",
    noShiftHint:
      "جس کی کوئی شفٹ نہ ہو، اسے کبھی دیر والا نہیں لکھا جاتا اور اس کی چھٹی کا وقت گول نہیں کیا جاتا۔ اس کے گھنٹے اور اوور ٹائم پھر بھی پنچ سے گنے جاتے ہیں۔",
    paidAs: "کس حیثیت سے اجرت",
    employeeFromAttendance: "ملازم — حاضری سے حساب",
    contractorFlat: "ٹھیکیدار — طے شدہ مقررہ رقم",
    salaryCovers: "تنخواہ کتنے گھنٹے کی",
    noAttendanceNeeded: "حاضری کی ضرورت نہیں — پوری تنخواہ",
    noAttendanceHint:
      "اس فرد کی حاضری نہیں رکھی جاتی اور گھنٹوں کا حساب نہیں ہوتا۔ تنخواہ پوری ملتی ہے۔",
    perHourLine: "{perHour} فی گھنٹہ · {perMinute} فی منٹ",
    hours8Overtime: "8 گھنٹے — اس سے آگے سب اوور ٹائم",
    hours12NoOvertime: "12 گھنٹے — بارہ کے بارہ ڈیوٹی، اوور ٹائم نہیں",
    sunday: "اتوار",
    sundayOff: "چھٹی — آنا لازم نہیں",
    sundayOptional: "مرضی سے — آ سکتے ہیں",
    sundayCompulsory: "لازمی — آنا ضروری ہے",
    sundayAdjust: "چھٹی میں ایڈجسٹ — اجرت نہیں",
    sundayHint:
      "اتوار کبھی کام کا دن نہیں۔ اس دن کیا گیا ہر گھنٹہ اوور ٹائم ہے، یہاں کچھ بھی لکھا ہو۔",
    payType: "اجرت کی قسم",
    hourlyWage: "فی گھنٹہ اجرت",
    monthlySalaryOption: "ماہانہ تنخواہ",
    monthlySalaryField: "ماہانہ تنخواہ (₨)",
    hourlyRateField: "فی گھنٹہ ریٹ (₨)",
    createUser: "صارف بنائیں",
    editTitle: "پروفائل تبدیل کریں · {name}",
    editHint:
      "نام، ملازم کوڈ، رابطے کی تفصیل اور تعیناتی۔ اجرت، ڈیوٹی کی شرائط اور رسائی کارڈ پر اپنے اپنے بٹن سے بدلی جاتی ہیں۔",
    saveChanges: "تبدیلیاں محفوظ کریں",
    accessTitle: "خصوصی رسائی · {name}",
    accessHint:
      "{role} کردار کے علاوہ۔ اس سے ایک فرد کو کچھ زیادہ دیا جا سکتا ہے، یا کچھ واپس لیا جا سکتا ہے، بغیر نیا کردار بنائے۔",
    useRole: "کردار کے مطابق",
    grant: "اجازت",
    deny: "منع",
    payTitle: "اجرت اور ڈیوٹی · {name}",
    agreedAmountPkr: "طے شدہ رقم (روپے)",
    monthlySalaryPkr: "ماہانہ تنخواہ (روپے)",
    hourlyRatePkr: "فی گھنٹہ ریٹ (روپے)",
    hourlyOnlyHint: "صرف گھنٹے کے حساب سے اجرت پانے والوں کے لیے۔",
    payClass: "اجرت کی قسم",
    tracking: "حاضری اور اجرت",
    trackingTracked: "درج ہوتی ہے — حاضری اور تنخواہ",
    trackingSalaryOnly: "صرف تنخواہ — حاضری نہیں رکھی جاتی",
    trackingExempt: "کوئی نہیں — مالک",
    trackingHint: "مالک اس نظام سے کچھ نہیں لیتا اور کسی پے رول میں نہیں آتا۔",
    earnsOvertime: "اوور ٹائم ملتا ہے",
    earnsOvertimeHint: "نشان نہ ہو تو ڈیوٹی سے آگے کے گھنٹے درج تو ہوتے ہیں، اجرت نہیں ملتی۔",
    contractorNote:
      "ٹھیکیدار کا کوئی حساب نہیں ہوتا۔ اسے طے شدہ رقم پوری ملتی ہے — چھٹیوں کی کٹوتی نہیں، اوور ٹائم نہیں، دیر پر کٹوتی نہیں۔",
    perDayLine: "{amount} روزانہ ({salary} ÷ اس مہینے کے {days} دن)",
    perOvertimeHourLine: "{amount} فی اوور ٹائم گھنٹہ (روزانہ ریٹ ÷ 8)",
    overtimeBoundary: "ہفتے کے دن {hours} گھنٹوں کے بعد، اور اتوار کو ہر گھنٹہ۔",
    swipeSavePay: "اجرت کی ترتیبات محفوظ کرنے کے لیے سوائپ کریں",
    componentsTitle: "الاؤنس اور کٹوتیاں",
    componentsHint: "صرف اسی فرد پر، ہر دورانیے میں، جب تک ہٹا نہ دی جائیں۔",
    componentFrom: "{from} سے",
    componentFromTo: "{from} سے {to} تک",
    componentOngoing: "{from} سے — جاری",
    nothingAttached: "اس فرد پر ابھی کچھ نہیں لگا۔",
    needNameAndAmount: "لگانے کے لیے نام اور رقم لکھیں۔",
  },
  roles: {
    title: "کردار",
    hint: "کوئی کردار چنیں تاکہ اس کے اختیارات بدلے جا سکیں، یا نیا کردار بنائیں",
    unrestricted: "غیر محدود",
    capabilities: "{count} اختیارات",
    heldBy: "{count} افراد",
    newRoleName: "نئے کردار کا نام",
    newRolePlaceholder: "پے رول آفیسر",
    whatFor: "یہ کس کام کے لیے ہے",
    whatForPlaceholder: "پے رول چلاتا ہے مگر رسائی نہیں بدل سکتا",
    createRole: "کردار بنائیں",
    creating: "بنایا جا رہا ہے…",
    whatCanDo: "{role} کیا کر سکتا ہے",
    superuserHint: "یہ کردار ہر اختیار رکھتا ہے اور اسے محدود نہیں کیا جا سکتا",
    toggleHint: "کسی اختیار پر دبائیں تاکہ وہ دیا یا واپس لیا جا سکے — تبدیلی فوراً لاگو ہوتی ہے",
    deleteRole: "کردار حذف کریں",
    superuserNote:
      "{role} ایک غیر محدود کردار ہے۔ ہر اختیار خود بخود شامل ہے، اس لیے کسی غلط تبدیلی سے یہ کبھی اس سکرین سے باہر نہیں ہو سکتا۔",
  },
  profile: {
    title: "میری پروفائل",
    subtitle: "دفتر کے پاس آپ کا ریکارڈ",
    fullName: "نام",
    employeeCode: "ملازم نمبر",
    cnic: "شناختی کارڈ نمبر",
    phone: "فون",
    email: "ای میل",
    designation: "عہدہ",
    noDesignation: "کوئی عہدہ نہیں",
    shift: "شفٹ",
    joinedOn: "ملازمت شروع کی",
    payType: "تنخواہ کی قسم",
    monthlySalary: "ماہانہ تنخواہ",
    hourlyWage: "گھنٹے کے حساب سے اجرت",
    hourlyRate: "فی گھنٹہ ریٹ",
    clockInRequired: "حاضری لگانا ضروری",
    notRecorded: "درج نہیں",
    managedByAdmin: "یہ تفصیلات آپ کا ایڈمن سنبھالتا ہے۔ تبدیلی کے لیے ان سے رابطہ کریں۔",
    contactTitle: "یہاں کچھ تبدیل کروانا ہے؟",
    contactBody:
      "اس سکرین پر زبان کے علاوہ سب کچھ دفتر کے پاس ہے۔ کسی چیز کی درستی کے لیے فون یا ای میل کریں — پرچی پر آنے کا انتظار نہ کریں۔",
    contactCall: "{number} پر کال کریں",
    contactEmail: "{address} پر ای میل کریں",
    language: "زبان",
    languageHint: "ہر اسکرین بدل جائے گی۔ نام اور نمبر ویسے ہی رہیں گے۔",
    languageSaved: "زبان بدل گئی۔",
    languageFailed: "زبان تبدیل نہیں ہو سکی۔",
  },
};

export default ur;
