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
 * Names, employee codes, CNICs and money are NOT translated anywhere.
 */
const ur: Dictionary = {
  nav: {
    workspace: "کام",
    administration: "انتظامیہ",
    myRecords: "میرا ریکارڈ",
    dashboard: "ڈیش بورڈ",
    ask: "پوچھیں",
    attendance: "حاضری",
    checkInOut: "آمد / روانگی",
    attendanceLog: "حاضری کا ریکارڈ",
    devices: "بایومیٹرک مشینیں",
    liveFloor: "فلور، براہِ راست",
    rates: "اجرت کے ریٹ",
    canteen: "کینٹین",
    canteenSettings: "کینٹین کی ترتیبات",
    reports: "رپورٹیں",
    payroll: "تنخواہ",
    users: "یوزر اکاؤنٹس",
    roles: "کردار اور رسائی",
    myProfile: "میری پروفائل",
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
    unassigned: "کوئی شعبہ نہیں",
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
    site: "فیکٹری",
    shift: "شفٹ",
    joinedOn: "ملازمت شروع کی",
    payType: "تنخواہ کی قسم",
    monthlySalary: "ماہانہ تنخواہ",
    hourlyWage: "گھنٹے کے حساب سے اجرت",
    hourlyRate: "فی گھنٹہ ریٹ",
    clockInRequired: "حاضری لگانا ضروری",
    notRecorded: "درج نہیں",
    managedByAdmin: "یہ تفصیلات آپ کا ایڈمن سنبھالتا ہے۔ تبدیلی کے لیے ان سے رابطہ کریں۔",
    language: "زبان",
    languageHint: "ہر اسکرین بدل جائے گی۔ نام اور نمبر ویسے ہی رہیں گے۔",
    languageSaved: "زبان بدل گئی۔",
    languageFailed: "زبان تبدیل نہیں ہو سکی۔",
  },
};

export default ur;
