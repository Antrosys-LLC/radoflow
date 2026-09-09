import type { Dictionary } from "./index";

/**
 * Roman Urdu — Urdu written in Latin letters.
 *
 * ⚠️ NEEDS REVIEW BY A NATIVE URDU SPEAKER BEFORE THIS IS OFFERED AS A DEFAULT.
 * English stays everyone's default until that review happens; nobody is
 * switched automatically.
 *
 * Spelled the way people actually type on a phone — `haazri`, `chutti`,
 * `tankhwah`, `mahina` — not academic romanisation with diacritics, and
 * matching the spellings the Ask assistant already puts in front of the same
 * people. English words that have simply become the local word (shift, floor,
 * overtime, machine) are kept in English rather than forced into Urdu.
 *
 * A factory has its own words for its own trades. Check these first, because a
 * dictionary-correct term nobody on the floor uses is worse than leaving it in
 * English:
 *   duty hours · overtime · grace period · flexible hours · shift ·
 *   contract firm · attendance · payroll · leave ·
 *   the pay-run stages "draft" (kacha hisab) and "in review" (janch mein) ·
 *   the machine states "offline" (rabta nahi) against "disabled" (band),
 *   which must stay tellable apart · the "Engineered by" byline
 *
 * Added for Wave 2's floor screens, and least sure of these:
 *   "Person" as a table column and a filter (Mulazim), which is not what a
 *   contract firm's man is · "Close" on a dialog (Band karein) against the
 *   machine state "disabled" (Band), which must stay tellable apart ·
 *   "Nobody matches these filters" (Is talash mein koi nahi mila) ·
 *   the attendance-log approval sentences, above all "will not be
 *   recalculated" (hisab dobara nahi hoga) and "reports to you" (matehat)
 *
 * Added by the attendance log, and least sure of these:
 *   "Earned" as a money column (Bani raqam) · "Clocked" (Lage ghante) against
 *   "Duty" (Duty) and "Hours clocked" (Lage hue ghante), which are three
 *   different figures on the same row and must stay tellable apart ·
 *   "unpaid" for overtime past the daily ceiling (bila muawza) ·
 *   "Counts" as the column that says whether a day was counted (Shumar) ·
 *   the four attendance states the log added, now in `status.attendance`
 *   with the other three:
 *   "holiday" (Tateel), "off" (Aaram ka din), "partial" (Adhoora din) and
 *   "pending" (Pending, kept in English because that is the word the floor
 *   uses), which must all stay tellable apart from "on leave" (Chutti par) ·
 *   "Contract" on a worker's badge (Theka)
 *
 * Added by the export buttons, and least sure of these:
 *   the download caption, assembled from a noun and a file-format name
 *   ("{label} {format}" — Download Excel, and with the attendance log's own
 *   noun, Tankhwah ki parchi PDF). Whether a Roman-Urdu reader wants
 *   "Excel download karein" instead of the bare "Download Excel" is the open
 *   question · "Download failed" (Download nahi ho saka) against "Could not
 *   build the file" (File nahi ban saki), which are two different failures —
 *   the second is the server refusing or breaking, the first is the browser —
 *   and must stay tellable apart · "{name} downloaded" (download ho gayi),
 *   whose feminine ending assumes the thing named is a file
 *
 * Added by the check in/out register, and least sure of these:
 *   "Still in" — checked in, not yet out (Abhi IN hain) — against "Present"
 *   (Hazir), which sit next to each other as two tiles and two badges and must
 *   stay tellable apart · "Not required" for someone the terminals do not
 *   track, which is not absence (Haazri lazmi nahi) · "A settled day" for a
 *   past date whose figures can no longer change (Guzra hua din)
 *
 * This file reads left to right — see `directionFor` in ./index.
 *
 * Added by the canteen. Read these out loud before reading them on paper —
 * they are shown at a serving hatch, in the largest type in the product, to
 * a man in a queue who may not read confidently in any language. Plain beats
 * elegant here, and short beats complete.
 *
 * The three refusals matter most, because a worker reads one while being
 * turned away from food:
 *   "Already taken" (Pehle le chuka hai) — he ate inside the last 24 hours ·
 *   "Not recognised" (Pehchan nahi hui) — the finger matched nobody, which is
 *   the machine's failure and not his, and the wording should not sound like
 *   an accusation · "Counter closed" (Khane ka waqt nahi) — no serving is open
 *   Alongside them, "Second attempts" (Doosri baar koshish), the tally that
 *   counts those refusals, and "Give food" (Khana de dein), the one
 *   instruction the counter staff act on. These four and "Scan a finger"
 *   (Ungli lagayein) are transliterations of wording that was already on the
 *   counter screen before it was translated — the words the floor has been
 *   reading, not new ones, so a change to them is a change to something in
 *   use.
 *
 * And in the settings screen behind it, least sure of these:
 *   `canteenSettings.noServingSwitchedOn` quotes the counter's own refusal, so
 *   the words inside its “…” must stay identical to `canteen.counterClosed` ·
 *   "serving time" for a meal window (Khane ka waqt), the noun the whole
 *   settings screen is built on, against "Opens"/"Closes" (Khulne ka waqt /
 *   Band hone ka waqt) which are the two ends of one · three near-neighbours
 *   that must stay tellable apart: a terminal that is "Inactive" (Ghair faal),
 *   a serving time that is "Off" (Band), and the machine state "disabled"
 *   (Band) in `status.device`
 *
 * Added by the biometric terminals, and least sure of these:
 *   the two connection modes, kept in English ("Push (ADMS)", "Pull (TCP)")
 *   because they are the words written on the terminal's own menu, and a
 *   Roman-Urdu reader looking at that menu wants the same word · "mode"
 *   itself, kept as "Mode" for the same reason ·
 *   `devices.ipAddressHint` quotes the button's own caption, so the words
 *   inside its “…” must stay identical to `devices.testConnection`
 *   (Rabta janchein) · "Last seen" for a terminal, rendered as last *contact*
 *   (Aakhri rabta) rather than last sight, against `status.device.offline`
 *   (Rabta nahi), which must stay tellable apart · a terminal that is
 *   "Active" (Chaalu) in the add/edit form, one whose address is "Not set"
 *   (Koi address nahi), and one that has never reported (Kabhi nahi)
 *
 *   `common.unassigned` was "Koi shoba nahi" — "no department" — and is now
 *   "Muqarrar nahi", because the terminals list is the third screen to use it
 *   and the thing missing there is a factory, not a department. That change is
 *   visible on the dashboard and the canteen settings screen too.
 *
 * Added by the live floor and Ask, and least sure of these:
 *   "Answer in" (Jawab kis zaban mein) — a new label, added because a row of
 *   language names in an app that also has a language setting reads as that
 *   setting, and it is not one ·
 *   the five effort levels, which are a dial nobody on the floor has a word
 *   for: "Fast" (Tez), "Balanced" (Mutawazin), "Thorough" (Mukammal),
 *   "Deeper" (Gehra) and "Maximum" (Sab se zyada), which must read as one
 *   ladder from quickest to most careful ·
 *   their short forms — Tez, Wast, Pura, Deep, Max — which are what the
 *   floating widget shows on a phone and are constrained to four characters,
 *   which is why the last two stay English ·
 *   "Thinking…" (Sochh raha hoon…), where a machine speaks in the first
 *   person · "(nothing heard)" (kuch nahi suna), shown after a failed voice
 *   attempt, and "Didn't catch that" (Baat samajh nahi aayi), which must
 *   sound like the machine's failure rather than the speaker's
 *
 * Names, employee codes, CNICs and money are NOT translated anywhere.
 * Neither is anything a terminal *is*: its model, serial number, IP address,
 * port, timezone, firmware string, the menu paths on its own screen, or the
 * protocol names ADMS and TCP.
 */
const roman: Dictionary = {
  nav: {
    workspace: "Kaam",
    administration: "Intezamia",
    myRecords: "Mera Record",
    dashboard: "Dashboard",
    ask: "Poochhein",
    attendance: "Haazri",
    checkInOut: "Aamad / Rawangi",
    attendanceLog: "Haazri ka Record",
    workingCalendar: "Kaam Ka Calendar",
    devices: "Biometric Machinein",
    liveFloor: "Floor, Live",
    rates: "Ujrat ke Rate",
    canteen: "Canteen",
    claudeSpend: "Claude ka kharch",
    canteenSettings: "Canteen ki Settings",
    reports: "Reports",
    payroll: "Tankhwah",
    users: "User Accounts",
    roles: "Kirdar aur Rasai",
    settings: "Tarteebat",
    signOut: "Sign out",
  },
  common: {
    save: "Mehfooz karein",
    saving: "Mehfooz ho raha hai…",
    cancel: "Mansookh karein",
    loading: "Khul raha hai…",
    nothingYet: "Abhi dikhane ko kuch nahi",
    today: "Aaj",
    hours: "Ghante",
    late: "Der se",
    checkedIn: "IN",
    checkedOut: "OUT",
    yes: "Haan",
    no: "Nahi",
    noRole: "Koi kirdar nahi diya gaya",
    // Pehle yeh "Koi shoba nahi" tha, lekin yehi lafz factory ke liye bhi
    // istemal hota hai — is liye ab dono par poora utarne wala lafz hai.
    unassigned: "Muqarrar nahi",
    minutesLate: "{minutes} minute der",
    identifyMethods: "Finger print, card, chehra ya passcode",
    identifyMethodsHint: "Machinein finger print, card, chehra ya passcode qubool karti hain",
    engineeredBy: "Banaya hai {company} ne",
    nameFallback: "ji",
    person: "Mulazim",
    date: "Tareekh",
    search: "Talash",
    searchPlaceholder: "Naam, code ya shanakhti card",
    department: "Shoba",
    everyDepartment: "Har shoba",
    site: "Factory",
    show: "Dikhayein",
    close: "Band karein",
    nobodyMatches: "Is talash mein koi nahi mila.",
    status: "Halat",
    download: "Download",
    // Roman Urdu reads left to right and both halves are English words the
    // floor already uses, so the English order is the natural one here.
    downloadFormat: "{label} {format}",
    downloaded: "{name} download ho gayi.",
    downloadFailed: "Download nahi ho saka.",
    downloadNotBuilt: "File nahi ban saki ({status}).",
    clear: "Saaf karein",
    showingOfTotal: "{total} mein se {showing} dikhaye ja rahe hain",
  },
  errors: {
    notFoundTitle: "Safha nahi mila",
    notFoundBody: "Yeh safha mojood nahi, ya ise muntaqil kar diya gaya hai.",
    goHome: "Shuru par jayein",
    loadFailedTitle: "Yeh safha nahi khul saka",
    loadFailedBody:
      "Hamari taraf se koi kharabi hui. Dobara koshish karein, ya shuru par wapas jayein.",
    tryAgain: "Dobara koshish karein",
    deniedTitle: "Aap ke kirdar ke liye dastyab nahi",
    deniedBody:
      "{role} kirdar mein yeh hissa shamil nahi. Kisi muntazim se ijazat dilwayein — kuch dobara nasb ya update karne ki zaroorat nahi.",
    backToDashboard: "Apne dashboard par wapas",
  },
  spend: {
    title: "Claude ka kharch",
    subtitle: "Barah-e-raast Anthropic account se, tax jor kar rupayon mein",
    perSecond: "Fi second",
    averagedOver: "{days} dinon ka ausat",
    today: "Aaj",
    thisPeriod: "Is arse mein",
    acrossDays: "{days} dinon mein",
    sinceMidnight: "Raat barah baje se takhmina",
    notConfigured: "Anthropic ki admin key muqarrar nahi",
    notConfiguredHint:
      "Account ki apni report parhne ke liye mezban par ANTHROPIC_ADMIN_KEY muqarrar karein. Key Anthropic Console mein Settings, Admin API keys se banti hai. Tab tak sirf neeche wala apna hisab dastyab hai.",
    refused: "Anthropic ne darkhwast radd kar di",
    unreachable: "Anthropic tak rasai nahi ho saki",
    problemHint:
      "Neeche ke adad sirf isi app ke apne hisab se hain, usi account par hone wala baqi kharch un mein shamil nahi.",
    appTitle: "Is app ne kya poocha",
    appSubtitle: "Yahan har sawal ke hisab se gina gaya — upar wale account se kam daira",
    appSpend: "Kharch",
    appCalls: "Jawabat",
    settingsTitle: "Rate aur tax",
    settingsHint:
      "Ek dollar kitne rupay ka, aur bank kitna tax lagata hai. Jahan bhi dollar rupayon mein dikhaya jata hai, yehi dono lagte hain.",
    settingsReadOnly: "Aap yeh dekh sakte hain, badal nahi sakte.",
    rate: "Ek dollar ke rupay",
    tax: "Tax (%)",
  },
  theme: {
    label: "Zahiri shakal",
    light: "Roshan",
    dark: "Gehra",
    system: "Mere aale ke mutabiq",
  },
  chart: {
    viewAsTable: "Jadwal ki shakal mein dekhein",
    colDate: "Tareekh",
    colName: "Naam",
    colValue: "Miqdar",
    colDuty: "Duty",
    colOvertime: "Overtime",
    colTotal: "Kul",
    colIn: "Aamad",
    colOut: "Rawangi",
    colUnmatched: "Be jor",
    dutyHours: "Duty ke ghante",
    overtime: "Overtime",
    checkedIn: "Hazri lagi",
    checkedOut: "Chutti lagi",
    noAttendance: "Is arse mein koi hazri nahi.",
    noPunches: "Is arse mein koi punch nahi.",
    nothingRecorded: "Is arse mein kuch darj nahi hua.",
    nothingToPlot: "Is arse mein dikhane ko kuch nahi.",
    other: "Deegar",
  },
  status: {
    payroll: {
      draft: "Kacha hisab",
      calculating: "Hisab ho raha hai",
      review: "Janch mein",
      approved: "Manzoor",
      paid: "Ada ho gayi",
      cancelled: "Mansookh",
    },
    device: {
      online: "Chal rahi hai",
      offline: "Rabta nahi",
      unknown: "Maloom nahi",
      disabled: "Band",
    },
    // ADMS aur TCP protocol ke naam hain — har zaban mein wese hi rehte hain.
    deviceMode: {
      push: "Push (ADMS)",
      pull: "Pull (TCP)",
    },
    deviceDirection: {
      auto: "Khud andaza lagata hai",
      in: "Aamad ka gate",
      out: "Rawangi ka gate",
    },
    devicePurpose: {
      attendance: "Haazri",
      canteen: "Canteen",
    },
    payClass: {
      monthly: "Mahana",
      hourly: "Ghante ke hisab se",
    },
    sundayPolicy: {
      off: "Chutti",
      optional: "Marzi se",
      compulsory: "Lazmi",
      adjust_in_leave: "Chutti mein adjust — ujrat nahi",
    },
    workerType: {
      employee: "Mulazim",
      contractor: "Thekedaar",
    },
    employment: {
      active: "Mulazmat jari",
      suspended: "Muattal",
      terminated: "Mulazmat khatam",
    },
    attendance: {
      present: "Hazir",
      absent: "Ghair hazir",
      leave: "Chutti par",
      holiday: "Tateel",
      off: "Aaram ka din",
      partial: "Adhoora din",
      pending: "Pending",
    },
  },
  dashboard: {
    title: "Aap ka din ek nazar mein",
    greeting: "Assalam-o-Alaikum {name}",
    introFloor: "Aaj floor par jo kuch ho raha hai — haazri, shift aur tankhwah — sab ek jagah.",
    introSelf: "Aap ki haazri, chuttiyan aur tankhwah ki parchi, sab ek jagah.",
    youToday: "Aaj aap",
    fromTerminal: "Biometric machine se",
    noClockInNeeded: "Aap ke kaam mein haazri lagana zaroori nahi",
    checkedIn: "Aamad",
    checkedOut: "Rawangi",
    hoursToday: "Aaj ke ghante",
    punctuality: "Waqt ki pabandi",
    notYet: "Abhi nahi",
    onTime: "Waqt par",
    monthlySalaryNote: "Aap mahana tankhwah par hain, machine aap ki haazri nahi lagati.",
    workingNow: "Abhi kaam par",
    clockedInNotOut: "IN hain, abhi OUT nahi hue",
    notCheckedIn: "Haazri nahi lagi",
    shiftStartedWithout: "Shift shuru ho gayi, yeh nahi aaye",
    lateToday: "Aaj der se aaye",
    afterGrace: "Riayati waqt ke baad",
    trackedStaff: "Haazri wale mulazim",
    requiringAttendance: "Jin ki haazri lagni hai",
    finishedToday: "Aaj kaam khatam",
    hoursThisMonthAll: "Is mahine kaam ke ghante",
    hoursThisMonthMine: "Is mahine aap ke ghante",
    hoursChartHintAll: "Is mahine factory mein har din. Sabz duty, narangi overtime.",
    hoursChartHintMine: "Is mahine aap ke rozana ghante. Sabz duty, narangi overtime.",
    byDepartment: "Shobe ke hisab se haazri",
    byDepartmentHint: "Abhi kitne hazir hain, kitne hone chahiye",
    floorBoard: "Floor board",
    nobodyTracked: "Abhi kisi ki haazri lazmi nahi rakhi gayi.",
    notCheckedInCount: "{count} ki haazri nahi lagi",
    andMore: "aur {count} mazeed",
    latestPayRun: "Pichhli tankhwah ka hisab",
    mostRecentPeriod: "Sab se haaliya muddat",
    gross: "Kul tankhwah",
    netPayable: "Qabil-e-adaigi raqam",
    payRunSummary: "{count} mulazimeen · {date} tak",
    payRunSummaryOne: "{count} mulazim · {date} tak",
    openPayroll: "Tankhwah kholein",
    noPayPeriod: "Abhi tankhwah ki koi muddat nahi banai gayi.",
    terminals: "Machinein",
    terminalsOnline: "{total} mein se {online} chal rahi hain",
    noTerminals: "Koi machine darj nahi.",
    yourRecords: "Aap ka record",
    everythingAvailable: "Jo kuch aap ke liye mojood hai",
    openMyProfile: "Meri profile kholein",
  },
  attendance: {
    title: "Haazri",
    subtitle: "Aaj kaun aaya hai, aur kis waqt",
    workingNow: "Abhi kaam par",
    checkedInNotOut: "IN hain, abhi OUT nahi hue",
    notCheckedIn: "Haazri nahi lagi",
    shiftStartedWithout: "Shift shuru ho gayi, yeh nahi aaye",
    lateToday: "Aaj der se aaye",
    arrivedAfterGrace: "Riayati waqt ke baad aaye",
    shiftFinished: "Shift khatam",
    clockedOut: "OUT ho gaye",
    shiftNotStarted: "Shift shuru nahi hui",
    noShiftAssigned: "Koi shift muqarrar nahi",
    chaseFirst: "In ki shift shuru ho chuki hai aur haazri nahi lagi — pehle in ka pata karein",
    everyoneCheckedIn: "Shift wale sab log haazri laga chuke hain.",
    onFloorNow: "Abhi floor par",
    checkedInStillWorking: "IN hain aur kaam kar rahe hain",
    nobodyClockedIn: "Abhi koi IN nahi hai.",
    shiftNotStartedYet: "Shift abhi shuru nahi hui",
    notDueYet: "Is waqt in ki floor par aane ki bari nahi",
    finishedToday: "Aaj kaam khatam",
    nobodyHere: "Abhi yahan koi nahi.",
    noShift: "Koi shift nahi",
    shiftFrom: "{time} se",
    flexibleHours: "Lachakdar auqat",
  },
  register: {
    title: "Aamad / Rawangi",
    subtitleToday: "Aaj — har {seconds} second baad khud taza hota rahega",
    subtitleSettled: "Guzra hua din — ab adad nahi badlenge",
    stillIn: "Abhi IN hain",
    notRequired: "Haazri lazmi nahi",
    checkIn: "Aamad",
    checkOut: "Rawangi",
    showing: "{count} log dikhaye ja rahe hain · {expected} ki haazri lagni hai",
    showingOne: "{count} mulazim dikhaya ja raha hai · {expected} ki haazri lagni hai",
  },
  logs: {
    title: "Haazri ka Record",
    subtitleAll: "Har haazri aur us se banne wali raqam — ek mulazim, chune hue shobe, ya sab.",
    subtitleMine: "Aap ki har haazri, aur us se banne wali raqam.",
    liveBoard: "Live board",
    everyone: "Sab",
    everyoneInDepartments: "Neeche chune hue shobon ke sab log",
    from: "Se",
    to: "Tak",
    departmentsHint: "Shobe — koi na chunein to sab shobe",
    people: "Log",
    departmentCount: "{count} shobe",
    departmentCountOne: "{count} shoba",
    workingDays: "Kaam ke din",
    attendedNotSunday: "Haazri lagi, itwar ke ilawa",
    overtimeHours: "Overtime ghante",
    overtimeCap: "Kaam ke din mein zyada se zyada chaar ghante",
    lateArrivals: "Der se aane",
    pastGrace: "Riayati waqt ke baad",
    hoursClocked: "Lage hue ghante",
    acrossEveryDay: "Dikhaye gaye har din ke",
    overtimeBeyond: "{hours} se ooper, din mein zyada se zyada chaar",
    notTrackedFlexible: "Hisab nahi — lachakdar auqat",
    overtime: "Overtime",
    earned: "Bani raqam",
    contract: "Theka",
    peopleCount: "{count} log",
    peopleCountOne: "{count} mulazim",
    earnedNote:
      "Bani raqam mein bunyadi ujrat aur overtime shamil hai, katauti se pehle — theke wale ki tay shuda raqam hoti hai. Tankhwah ka hisab inhi adad se dobara lagaya jata hai.",
    contractorNote:
      "Tankhwah theke par milti hai. Yeh ghante sirf is liye darj hain ke bill jancha ja sake, in se raqam nahi banti — tay shuda raqam poori ada hoti hai.",
    notPaidFromAttendance:
      "Tankhwah haazri se nahi banti. Tay shuda tankhwah poori milti hai, is liye yeh haazriyan sirf mojoodgi ka record hain, tankhwah ki bunyad nahi.",
    rateSentence:
      "{perDay} rozana aur {perHour} fi overtime ghanta ke hisab se, neeche ke dinon ki raqam katauti se pehle {total} banti hai.",
    flexibleNote:
      "Is mulazim ke liye aane ya jane ka waqt muqarrar nahi, is liye yeh kabhi der se shumar nahi hote.",
    payslip: "Tankhwah ki parchi",
    backToEveryone: "Sab ki taraf wapas",
    clocked: "Lage ghante",
    duty: "Duty",
    counts: "Shumar",
    sunday: "Itwar",
    edited: "Tabdeel shuda",
    approved: "Manzoor",
    unpaidHint: "Rozana overtime ki had se ooper — darj hai, ada nahi hoga",
    unpaidHours: "{hours} bila muawza",
    countsDay: "{count} din",
    overtimeOnly: "Sirf overtime",
    noAttendanceBetween: "{from} se {to} tak koi haazri darj nahi.",
    approving: "Manzoor ho raha hai…",
    approveRest: "Baqi manzoor karein ({count})",
    approveRange: "{range} manzoor karein",
    pickPersonAndRange: "Mulazim aur tareekhein chunein.",
    endBeforeStart: "Aakhri tareekh pehli tareekh se pehle nahi ho sakti.",
    nothingToApprove:
      "Manzoor karne ko kuch nahi — in tareekhon mein aap ke matehat kisi ki haazri nahi.",
    approvedOne: "{count} din manzoor. Is ka hisab dobara nahi hoga.",
    approvedMany: "{count} din manzoor. In ka hisab dobara nahi hoga.",
  },
  calendar: {
    weeklyPattern: "Har hafte",
    weeklyPatternHint:
      "Mustaqil usool. Yahan koi din kholein to aage se har aisa din khul jaye ga.",
    working: "Kaam",
    off: "Chutti",
    weekday: {
      sunday: "Itwaar",
      monday: "Peer",
      tuesday: "Mangal",
      wednesday: "Budh",
      thursday: "Jumeraat",
      friday: "Juma",
      saturday: "Hafta",
    },
    readOnly: "Aap calendar dekh sakte hain, badal nahi sakte.",
    exceptions: "Ek din ki tabdeeli",
    exceptionsHint:
      "Sirf is Itwaar, ya kisi Mangal ko bandish. Tareekh wali tabdeeli hafta waar usool par bhaari hai.",
    addException: "Din shamil karein",
    noExceptions: "Calendar mein koi tabdeeli nahi",
    noExceptionsHint: "Har din upar wale hafta waar usool par chal raha hai.",
    edit: "Tabdeel karein",
    remove: "Hata dein",
    removed: "Hata diya gaya.",
    saved: "Mehfooz ho gaya.",
    saveFailed: "Mehfooz nahi ho saka.",
    nowWorking: "Ab yeh din kaam ka din hai.",
    nowOff: "Ab yeh din chutti hai.",
    editException: "{date} ko tabdeel karein",
    addExceptionTitle: "Din shamil karein",
    date: "Tareekh",
    kind: "Din kis qism ka hai",
    reason: "Wajah",
    reasonPlaceholder: "Izafi order",
    reasonHint:
      "Din ke sath mehfooz rehti hai, taake baad mein calendar dekhne wale ko wajah maloom ho.",
    payMultiplier: "Ujrat ka zarb",
    payMultiplierHint:
      "Khali chhor dein to is factory ka aam usool lagu ho ga. 2 ka matlab us din dugni ujrat.",
    dayType: {
      workday: "Kaam ka din",
      off: "Chutti",
      holiday: "Tateel",
      weekend_working: "Chutti wale din kaam",
      special_working: "Izafi kaam ka din",
    },
    dayTypeHint: {
      workday: "Aam din, chahe hafta waar usool kuch bhi kahe.",
      off: "Koi kaam nahi. Tateel nahi — bandish ya kharabi.",
      holiday: "Elaan shuda tateel.",
      weekend_working: "Chutti wala din khola gaya, hafta waar rate par ujrat.",
      special_working: "Band elaan kiya gaya din dobara khol diya gaya.",
    },
  },
  canteenLog: {
    title: "Aaj ke scan",
    subtitle: "Aaj canteen terminal par har ungli, aur us ka nateeja.",
    everyScan: "Sab",
    served: "Khana diya",
    refused: "Doosri koshish",
    notRecognised: "Pehchana nahi gaya",
    counterClosed: "Counter band",
    nothingToday: "Aaj abhi koi scan nahi",
    nothingTodayHint: "Counter shuru hote hi naam yahan aane lagein ge.",
    unknownWorker: "Namaloom ungli",
  },
  canteen: {
    giveFood: "Khana de dein",
    alreadyTaken: "Pehle le chuka hai",
    notRecognised: "Pehchan nahi hui",
    counterClosed: "Khane ka waqt nahi",
    scanFinger: "Ungli lagayein",
    servedToday: "Aaj khana diya",
    secondAttempts: "Doosri baar koshish",
  },
  canteenSettings: {
    counterInactive: "Canteen ka counter abhi kuch nahi kare ga",
    noCanteenTerminal:
      "Koi machine canteen ke liye muqarrar nahi, is liye us ke scan haazri mein darj ho rahe hain.",
    setOneOnDevices: "Machines wali screen par ek muqarrar karein",
    // Yeh jumla counter ke apne alfaz dohrata hai, is liye waavain ke andar
    // bilkul wohi alfaz rehne chahiye jo `canteen.counterClosed` mein hain.
    noServingSwitchedOn:
      "Koi khane ka waqt chaalu nahi, is liye har scan par “Khane ka waqt nahi” aaye ga.",
    servingTimes: "Khane ke auqat",
    servingTimesHint: "Counter kab khula rehta hai. Har waqt mein fi aadmi ek khana.",
    addServing: "Naya waqt shamil karein",
    noServingsYet: "Abhi koi waqt muqarrar nahi",
    noServingsHint: "Ek shamil karein — dopahar ka khana, ya raat ki shift ke liye raat ka khana.",
    terminals: "Canteen ki machinein",
    terminalsHint:
      "Machines wali screen par muqarrar hoti hain — yahan is liye dikhai hain ke kami saaf nazar aaye",
    noTerminalScanning: "Koi machine khane ke liye scan nahi kar rahi.",
    inactive: "Ghair faal",
    off: "Band",
    runsPastMidnight: "Raat barah baje ke baad tak — jis din khule, usi din mein shumar",
    edit: "Tabdeel karein",
    editServing: "{name} mein tabdeeli",
    addServingTitle: "Naya khane ka waqt",
    overnightHint:
      "Raat barah baje ke baad tak chalne wala waqt theek hai — ise {time} par khatam karein, raat ki shift ka khana phir bhi ek hi shumar hoga.",
    servingName: "Naam",
    namePlaceholder: "Dopahar ka khana",
    opens: "Khulne ka waqt",
    closes: "Band hone ka waqt",
    orderOnScreen: "Screen par tarteeb",
    openLabel: "Khula — is waqt mein counter scan qabool kare ga",
    saveServingTime: "Khane ka waqt mehfooz karein",
    removeConfirm:
      "{name} hata dein? Pehle se darj khane isi waqt se jure rehte hain, is liye yeh sirf tab hate ga jab is mein kisi ne khana na liya ho.",
    remove: "Hata dein",
    removeServing: "Yeh khane ka waqt hata dein",
    chooseFactoryAndName: "Factory chunein aur naam likhein.",
    enterTimes: "Dono auqat HH:MM ki soorat mein likhein.",
    sameStartEnd:
      "Khulne aur band hone ka waqt ek nahi ho sakta — aisa waqt kabhi khule ga hi nahi.",
    duplicateName: "Is factory mein “{name}” naam ka khane ka waqt pehle se mojood hai.",
    servingUpdated: "Khane ka waqt tabdeel ho gaya.",
    servingAdded: "Khane ka waqt shamil ho gaya.",
    windowInUse:
      "Is waqt mein pehle hi khana diya ja chuka hai — ise hazf karne ke bajaye band kar dein.",
    servingRemoved: "Khane ka waqt hata diya gaya.",
  },
  devices: {
    title: "Biometric machinein",
    subtitle: "Factory floor par lagi {model} machinein",
    addTerminal: "Nayi machine shamil karein",
    noneYet: "Abhi koi machine darj nahi",
    noneYetHint:
      "Apni {model} shamil karein aur use is server ki taraf lagayein — haazriyan aana shuru ho jayen gi.",
    serial: "Serial",
    mode: "Mode",
    address: "Address",
    lastSeen: "Aakhri rabta",
    neverSeen: "Kabhi nahi",
    lastPunchReceived: "Aakhri haazri {time} ko mili",
    timezone: "Time zone",
    notSet: "Koi address nahi",
    allTerminals: "Sari machinein",
    detailSubtitle: "{model} · serial {serial} · aakhri rabta {seen}",
    editSettings: "Settings tabdeel karein",
    setupTitle: "Machine ki setting",
    setupCloudServer:
      "Machine par: {menu}. {serverMode} ko {adms} par rakhein, phir jahan yeh machine bhejti hai us ka address aur port likhein — hosted set up mein relay ka mustaqil IP, ya agar server isi factory ke network par hai to seedha server ka. {path} machine khud laga leti hai.",
    setupDigitsOnly:
      "Zyada tar {adms} firmware us khane mein sirf hindse qubool karte hain, is liye domain nahi likhi ja sakti — aur upar wala address khud machine ka {ip} nahi hai, yeh ghalti aam hai aur pakar mein nahi aati. {ethernet} ke neeche {gateway} bhi muqarrar karein, warna machine maqami network se bahar nahi ja sakti.",
    recentPunches: "Haaliya haazriyan",
    recentPunchesHint: "Nayi pehle, Pakistan ke waqt ke mutabiq",
    noPunches: "Abhi koi haazri nahi aayi",
    noPunchesHint:
      "Machine jaise hi bheje gi, haazriyan chand second mein yahan nazar aa jayen gi.",
    unlinkedTerminalId: "Machine ka ID {id} kisi mulazim se nahi jura",
    testConnection: "Rabta janchein",
    contactingTerminal: "Machine se rabta ho raha hai…",
    syncNow: "Abhi haazri utarein",
    readingLog: "Haazri ka record parha ja raha hai…",
    addIpFirst: "Pehle machine ka IP address darj karein",
    pushControlsNote:
      "Yeh machine push mode mein hai, is liye khud bhejti hai. Yeh button us ka mehfooz record mang kar utarne ke liye hain, aur in ke liye server ka machine tak network par pahunchna zaroori hai.",
    addTerminalTitle: "Nayi {brand} machine shamil karein",
    editTerminal: "Machine mein tabdeeli",
    dialogHint:
      "Push mode behtar hai: machine khud is server ko bhejti hai, is liye factory ke network ke andar pahunchne ki zaroorat nahi rehti.",
    terminalName: "Machine ka naam",
    terminalNameHint: "Misal ke tor par: Dyeing — main gate",
    terminalNamePlaceholder: "Dyeing — main gate",
    chooseFactory: "Factory chunein",
    serialNumber: "Serial number",
    model: "Model",
    connectionMode: "Rabte ka mode",
    modePushOption: "Push — machine khud hamein bhejti hai (behtar)",
    modePullOption: "Pull — hum TCP par machine se rabta karte hain",
    gate: "Kaun sa gate",
    gateHint: "Andar wale darwaze ka terminal aamad likhta hai; bahar wale ka rawangi",
    gateAutoOption: "Khud andaza lagaye — pehla punch aamad, aakhri rawangi",
    gateInOption: "Aamad — yahan ka har punch aane ka hai",
    gateOutOption: "Rawangi — yahan ka har punch jane ka hai",
    records: "Yeh machine kya darj karti hai",
    recordsHint: "Canteen ka scan khana hai, haazri nahi — khane ke paise kisi ko nahi milte.",
    purposeAttendanceOption: "Haazri — aamad aur rawangi",
    purposeCanteenOption: "Canteen — har waqt mein fi aadmi ek khana",
    ipAddress: "IP address",
    // Yeh jumla button ke apne alfaz dohrata hai, is liye waavain ke andar
    // bilkul wohi alfaz rehne chahiye jo `devices.testConnection` mein hain.
    ipAddressHint: "Pull mode aur “Rabta janchein” ke liye zaroori hai",
    port: "Port",
    commKeyHint: "{menu}. Agar muqarrar nahi to khali chor dein.",
    activeLabel: "Chaalu — is machine se haazriyan qubool karein",
    saveTerminal: "Machine mehfooz karein",
    nameFactorySerialRequired: "Naam, factory aur serial number zaroori hain.",
    portRange: "Port 1 se 65535 ke darmiyan poora adad hona chahiye.",
    duplicateSerial: "Serial {serial} wali machine pehle se mojood hai.",
    terminalAdded: "Machine shamil ho gayi.",
    terminalUpdated: "Machine ki tafseel tabdeel ho gayi.",
    notFound: "Machine nahi mili.",
    setIpBeforeTesting: "Janchne se pehle machine ka IP address darj karein.",
    connected: "Rabta ho gaya. Firmware {firmware}, machine ki ghari {clock}.",
    firmwareUnknown: "maloom nahi",
    clockUnreadable: "parhi nahi ja saki",
    pushCannotBeReached:
      "Yeh machine push mode mein hai, is liye yahan se us tak nahi pahuncha ja sakta — yeh mutawaqqa hai aur is ka matlab yeh nahi ke machine band hai. Is ki haalat un haazriyon se banti hai jo yeh khud bhejti hai.",
    noIpAddress: "Is machine ka koi IP address nahi. Push mode wali machinein khud bhejti hain.",
    noSerialRecorded: "Is machine ka serial number darj nahi.",
    syncRead: "{read} record parhe gaye: {accepted} naye, {duplicates} pehle se mehfooz.",
    syncUnmapped: "{count} enrolment ID abhi kisi mulazim se nahi juri.",
    pushCannotBePolled:
      "Yeh machine push mode mein hai aur yahan se is ka record nahi manga ja sakta. Yeh khud bhejti hai — kuch utarne ki zaroorat nahi.",
  },
  liveFloor: {
    title: "Floor, Live",
    subtitle: "Aakhri {count} aamad o rawangi, har {seconds} second baad taza",
    nothingYet: "Floor par abhi kuch nahi",
    nothingYetHint: "Machine se aate hi scan yahan chand second mein dikhein ge.",
    unlinkedTerminalId: "Ghair munsalik machine number {id}",
    terminalFallback: "Machine",
  },
  ask: {
    subtitle: "Haazri, chutti aur tankhwah — sadi zaban mein jawab",
    askClaude: "Claude se poochein",
    askAboutThis: "Is record ke bare mein Claude se poochein",
    askAboutGreeting:
      "Is ke bare mein jo poochna ho poochein — jo aap ki screen par hai woh mujhe nazar aa raha hai.",
    widgetSubtitle: "Haazri, chutti aur tankhwah",
    panelLabel: "Assistant se poochhein",
    openLabel: "Sawal poochhein",
    answerLanguage: "Jawab kis zaban mein",
    commonQuestions: "Aam sawalat",
    thinking: "Sochh raha hoon…",
    listen: "Suno",
    readAloud: "Parh kar sunayein",
    placeholder: "Sawal likhein…",
    askByVoice: "Bol kar poochhein",
    stopListening: "Sunna band karein",
    heard: "Kya aap ne yeh poocha?",
    nothingHeard: "(kuch nahi suna)",
    retry: "Dobara",
    send: "Bhejein",
    sessionCost: "Is nishist ka kharch: {amount}",
    noAnswer: "Abhi jawab nahi mil saka.",
    unreachable: "Assistant tak rabta nahi ho saka. Apna internet dekhein.",
    notCaught: "Baat samajh nahi aayi — dobara bolein, ya sawal likh dein.",
    notSignedIn: "Aap sign in nahi hain.",
    notAllowed: "Aap ko assistant istemal karne ki ijazat nahi.",
    badRequest: "Darkhwast durust nahi thi.",
    emptyQuestion: "Pehle sawal likhein.",
    questionTooLong: "Yeh sawal bohat lamba hai.",
    notConfigured: "Assistant abhi tarteeb nahi diya gaya.",
    couldNotAnswer: "Assistant is ka jawab nahi de saka.",
    noAnswerText: "Main is ka jawab nahi nikal saka.",
    effort: {
      low: { label: "Tez", short: "Tez", hint: "Jaldi jawab" },
      medium: { label: "Mutawazin", short: "Wast", hint: "Dono ke beech" },
      high: { label: "Mukammal", short: "Pura", hint: "Tay shuda" },
      xhigh: { label: "Gehra", short: "Deep", hint: "Mushkil sawalon ke liye" },
      max: { label: "Sab se zyada", short: "Max", hint: "Sab se sust aur mehnga" },
    },
  },
  reports: {
    title: "Reports · {scope}",
    wholeFactory: "Poori factory",
    periodHint:
      "{from} se {to} tak — har adad unhi hisabat se aata hai jo payroll chalate waqt lagte hain.",
    from: "Se",
    to: "Tak",
    people: "Afraad",
    peopleHint: "{count} ki hazri mojood hai",
    workingDays: "Kaam ke din",
    workingDaysHint: "Hazri wale din, Itwaar ke ilawa",
    hoursWorked: "Kaam ke ghante",
    hoursWorkedHint: "Duty aur overtime",
    overtime: "Overtime",
    overtimeHint: "Kaam ke din zyada se zyada 4 ghante",
    earned: "Kamai",
    earnedHint: "Katotiyon se pehle",
    dailyHours: "Har din ke kaam ke ghante",
    dailyHoursHint:
      "Shamil tamam afraad ke duty ghante aur overtime. Itwaar sirf overtime mein aata hai.",
    punches: "Aamad aur rawangi",
    punchesHint:
      "Jis din dono barabar na hon, wahan koi punch reh gaya — aur reh gaya punch ghalat parchi banata hai.",
    hoursByDept: "Shobe ke hisab se ghante",
    hoursByDeptHint: "Duty aur overtime mila kar.",
    earnedByDept: "Shobe ke hisab se kamai",
    earnedByDeptHint: "Bunyadi ujrat aur overtime, katotiyon se pehle.",
    mostOvertime: "Sab se zyada overtime",
    mostOvertimeHint: "Woh log jo apne duty ghanton se aage kaam kar rahe hain.",
    topEarners: "Is arse ki sab se zyada kamai",
    topEarnersHint: "Thekedaar ke liye tay shuda raqam dikhai jati hai.",
    headcount: "Shobe ke hisab se afraad",
    headcountHint:
      "Kisi hisse ko dabayein to woh nikal jaye ga aur baqi dobara taqseem ho jayein ge.",
    arrangements: "Ujrat kis tarah di jati hai",
    arrangementsHint: "Factory ka har tareeqa, kul amle ke tanasub se.",
    wageBill: "Shobe ke hisab se ujrat ka bojh",
    wageBillHint: "Is arse ki kamai, katotiyon se pehle.",
    overtimeByDept: "Shobe ke hisab se overtime",
    overtimeByDeptHint: "Duty se aage sab se zyada ghante karne wale chhe shobe.",
    earningsAgainstHours: "Ghanton ke muqable mein kamai",
    earningsAgainstHoursHint:
      "Har fard ke liye ek nuqta. Upar ka nuqta jis ke ghante kam hon, ya to use koi terminal nahi pakar raha ya woh aa hi nahi raha.",
    unitHours: "Ghante",
    unitRupees: "Rupay",
    unitPeople: "Afraad",
    unitRupeesLower: "rupay",
    axisHours: "ghante",
    axisEarned: "kamai",
    arrangement: {
      standard: "8 ghante duty, overtime ke sath",
      twelveHour: "12 ghante duty",
      noOvertime: "Overtime nahi",
      contractors: "Thekedaar",
      notFromAttendance: "Ujrat hazri se nahi",
    },
  },
  payroll: {
    periods: "Tankhwah ke arse",
    periodsHint: "Terminals ki darj ki hui hazri se nikala gaya",
    newPeriod: "Naya arsa",
    noPeriods: "Abhi koi arsa nahi",
    noPeriodsHint: "Jin tareekhon ki ujrat deni hai, un ke liye ek arsa banayein.",
    paidSummary: "{count} afraad · khalis {amount}",
    notCalculated: "Abhi hisab nahi hua",
    grossPay: "Kul ujrat",
    deductions: "Katotiyan",
    tax: "Tax",
    netPayable: "Qabil-e-adaigi khalis",
    runPayroll: "Payroll chalayein",
    recalculate: "Dobara hisab karein",
    calculating: "Hazri se hisab kiya ja raha hai…",
    approve: "Manzoor karein",
    approving: "Manzoor kiya ja raha hai…",
    markPaidAndLock: "Ada shuda laga kar band karein",
    closingPeriod: "Arsa band kiya ja raha hai…",
    locked: "Band hai — ada shuda arse ka dobara hisab nahi ho sakta.",
    lines: "Payroll ki satrein · {count}",
    linesHint: "Ghante biometric terminals se aate hain. Poori parchi ke liye satar par dabayein.",
    reviewBanner:
      "Manzoori se pehle {count} par nazar dalne ke qabil hain — kam kiye gaye ghante, hazri mein koi jhol, ya pichhle mahinon ke muqable mein ujrat ka bara farq. Hisab ghalat nahi; har parchi par likha note parh lein.",
    nothingCalculated: "Abhi koi hisab nahi hua",
    nothingCalculatedHint: "Hazri se satrein banane ke liye payroll chalayein.",
    colRegularHours: "Duty ghante",
    colOvertimeHours: "Overtime ghante",
    colGross: "Kul",
    colNet: "Khalis",
    colPaid: "Ada",
    payslip: "Parchi",
    droppedTooltip:
      "{dates} ko overtime ki had ne {hours} kam kar diye — manzoori se pehle dekh lein",
    cashTally:
      "{total} mein se {paid} ko naqad ada · {totalAmount} mein se {paidAmount} diye ja chuke",
    cashLeft: "{count} ki adaigi baqi hai",
    undo: "Wapas karein",
    undoing: "Wapas kiya ja raha hai…",
    notYet: "Abhi nahi",
    amountPaid: "Ada ki gayi raqam",
    amountPaidHint: "Poori raqam di hai to ise waise hi rehne dein",
    paidReason: "Farq ki wajah",
    paidReasonPlaceholder: "Khule paise nahi thay",
    confirmPay: "Adaigi darj karein",
    shortBy: "{amount} kam",
    overBy: "{amount} zyada",
    paidExactly: "Poori adaigi",
    differencesTotal: "{count} satrein hisab se mukhtalif hain · khalis {amount}",
    markPaid: "Ada shuda lagayein",
    markingPaid: "{name} ko ada shuda lagaya ja raha hai…",
    newPeriodTitle: "Naya tankhwah arsa",
    periodLabel: "Naam",
    periodLabelPlaceholder: "August 2026",
    from: "Se",
    to: "Tak",
    creating: "Banaya ja raha hai…",
    createPeriod: "Arsa banayein",
    regular: "Duty",
    overtime: "Overtime",
    weekend: "Hafta waar",
    worthLook: "Manzoori se pehle dekhne ke qabil",
    droppedTitle: "Overtime ki had ne {hours} kam kar diye",
    droppedBody:
      "Ghaliban dohri duty ka din hai, ghalat adad nahi — manzoori se pehle {dates} ke punch dekh lein.",
    earnings: "Aamdani",
    netPay: "Khalis ujrat",
    printPayslip: "Parchi chhapein",
    closePayslip: "Parchi band karein",
    unknownPerson: "Namaloom",
  },
  rates: {
    payByPerson: "Fard ke hisab se ujrat · {count}",
    payByPersonHint:
      "Har fard kya kamata hai, us ki tankhwah kitne ghanton ka ehata karti hai, aur us ke sath kaun si satrein lagi hain. Shobe ke hisab se.",
    searchPlaceholder: "Naam, mulazim code ya shanakhti card",
    paidAs: "Kis haisiyat se ujrat",
    everyone: "Mulazim aur thekedaar",
    employees: "Mulazim",
    contractors: "Thekedaar",
    readOnly:
      "Aap ujrat ke usool dekh sakte hain, badal nahi sakte. Badalne ke liye “ujrat ke usool sambhalein” ki ijazat darkar hai.",
    ratesFor: "Ujrat ke rate — {site}",
    ratesForHint: "Har qism ke kaam ke waqt ke liye fi ghanta rupay",
    noRates: "Is factory ke liye koi rate muqarrar nahi.",
    latePenalties: "Der se aane par katoti",
    latePenaltiesHint: "Shift shuru hone ke baad hazri lagane par khud ba khud kat jati hai",
    noLatePenalty: "Der par koi katoti muqarrar nahi.",
    overtime: "Overtime",
    weekend: "Hafta waar ya chutti ka din",
    holiday: "Tateel",
    night: "Raat ki shift",
    perHour: "{amount} fi ghanta",
    lateRange: "{from} se {to}",
    beyond: "aur is se aage",
    minutes: "{minutes} minute",
    penaltyOfDaily: "Ek din ki ujrat ka {percent}%",
    penaltyOfMonthly: "Mahana ujrat ka {percent}%",
    perHourNote:
      "Rate fi ghanta rupayon mein hain, bunyadi ujrat ke zarb mein nahi. Kisi ki bunyadi ujrat badalne se yeh nahi badalte.",
    otRate: "Overtime ka rate",
    otRateHint: "Muqarrara din se aage fi ghanta",
    weekendRate: "Hafta waar ya chutti ke din ka rate",
    weekendRateHint: "Khole gaye aaram ke din fi ghanta",
    holidayRate: "Tateel ka rate",
    holidayRateHint: "Elaan shuda tateel par fi ghanta",
    nightRate: "Raat ki shift ka rate",
    nightRateHint: "Raat ki baari mein fi ghanta",
    standardHours: "Din ke muqarrara ghante",
    workingDaysMonth: "Mahine ke kaam ke din",
    otAfter: "Overtime kitne minute baad shuru",
    roundTo: "Ghante kitne minute par gol karein",
    effectiveFrom: "Kis tareekh se nafiz",
    effectiveFromHint:
      "Nai tareekh ek naya rate set banati hai; jo payroll pehle nikal chuka hai woh purane rate par rehta hai.",
    whatThisPays: "Is se kitna banta hai",
    weekendShiftExample: "8 ghante ki hafta waar shift: {amount}",
    overtimeExample: "4 ghante overtime: {amount}",
    holidayShiftExample: "8 ghante ki tateel wali shift: {amount}",
    saveRates: "Rate mehfooz karein",
    ladderNote:
      "Band ek seerhi hain, jama nahi hote — 90 minute der par sirf 1 ta 2 ghante wali katoti lagti hai. Der shift ke aaghaz se, riayati waqt ke baad napi jati hai.",
    colBand: "Band",
    colLateFrom: "Der shuru",
    colLateUntil: "Der tak",
    colDeduction: "Katoti",
    noBands: "Der se aane par koi katoti muqarrar nahi — filhal der ka koi nuqsan nahi.",
    bandName: "Band ka naam",
    bandNamePlaceholder: "15 ta 30 minute der",
    lateFromField: "Der shuru (minute)",
    lateUntilField: "Der tak (minute)",
    lateUntilPlaceholder: "khali = is se aage",
    deductPercent: "Katoti (%)",
    basis: "Kis ka",
    basisDay: "Ek din ki ujrat",
    basisMonth: "Mahana ujrat",
    addBand: "Band shamil karein",
    removeBand: "{name} hata dein",
    contractFirms: "Theke daar firmein",
    contractFirmsHint:
      "Har firm ke liye ek tay shuda raqam, us ke afraad ka alag hisab karne ke bajaye",
    noFirms: "Is factory mein theke ka koi shoba nahi.",
    firmsFooter:
      "Jis firm ki raqam sifar ho us ka koi bill nahi banta aur us ke afraad kisi payroll satar mein nahi aate. Payroll chalate waqt us par khabardar kiya jata hai, khamoshi se chhora nahi jata.",
    onTheFloor: "{count} afraad kaam par",
    monthlyAmount: "Mahana raqam (rupay)",
    perMonth: "mahana",
    contractSuffix: "{amount} theka",
    agreedFlat: "tay shuda, muqarrara",
    perDayShort: "{amount} rozana",
    tagContract: "Theka",
    tagDuty: "{hours} ghante duty",
    tagSunday: "Itwaar: {policy}",
    tagNotFromAttendance: "Hazri se nahi",
    tagFlexible: "Lachakdaar",
    tagNoOvertime: "Overtime nahi",
    agreedAmount: "Tay shuda raqam",
    monthlySalary: "Mahana tankhwah",
    salaryCovers: "Tankhwah kitne ghanton ki",
    noAttendanceNeeded: "Hazri ki zaroorat nahi — poori tankhwah",
    noAttendanceHint:
      "Is fard ki hazri nahi rakhi jati aur ghanton ka hisab nahi hota. Tankhwah poori milti hai.",
    hourlyBreakdown: "{perHour} fi ghanta · {perMinute} fi minute",
    hours8: "8 ghante",
    hours12: "12 ghante",
    sunday: "Itwaar",
    payClass: "Ujrat ki qism",
    hourlyRate: "Fi ghanta rate",
    tracking: "Hazri aur ujrat",
    trackingTracked: "Darj hoti hai — hazri aur tankhwah",
    trackingSalaryOnly: "Sirf tankhwah — hazri nahi rakhi jati",
    trackingExempt: "Koi nahi — malik",
    trackingHint: "Malik is nizam se kuch nahi leta aur kisi payroll mein nahi aata.",
    earnsOvertime: "Overtime milta hai",
    contractorNote:
      "Koi hisab nahi hota. Tay shuda raqam poori ada hoti hai — chhuttiyon ki katoti nahi, overtime nahi, der par katoti nahi.",
    dailyBreakdown:
      "{perDay} rozana ({salary} ÷ {days}) · {perHour} fi overtime ghanta (÷ 8) · overtime {duty} ghanton ke baad, kaam ke din zyada se zyada 4 ghante, Itwaar ko koi had nahi.",
    swipeSave: "{name} ki ujrat mehfooz karne ke liye swipe karein",
    componentsTitle: "Allowance aur katotiyan",
    nothingAttached: "Abhi kuch nahi laga.",
    componentNamePlaceholder: "Advance ki wapsi",
    amount: "Raqam",
    lineName: "Naam",
    kind: "Qism",
    deduction: "Katoti",
    allowance: "Allowance",
    swipeAttach: "Yeh satar lagane ke liye swipe karein",
    attaching: "Lagai ja rahi hai…",
    removeLine: "{name} hata dein",
  },
  users: {
    title: "User account · {count}",
    hint: "Har woh shakhs jo sign in kar sakta hai. Mulazim code hi us ka K50 fingerprint number hai.",
    addUser: "User shamil karein",
    searchPeople: "Afraad talash karein",
    everyRole: "Har kirdar",
    anyStatus: "Koi bhi halat",
    cannotSignIn: "Sign in nahi kar sakte — shanakhti card nahi",
    noCnic: "Shanakhti card nahi — sign in nahi kar sakte",
    customAccessCount: "{count} khusoosi rasai ki tabdeeliyan",
    selectPerson: "{name} ko muntakhib karein",
    selectAllShown: "Sab muntakhib karein",
    selectedCount: "{count} muntakhib",
    bulkAction: "Kya tabdeel karna hai",
    bulkValue: "Kis mein tabdeel karein",
    applyToSelected: "Lagu karein",
    clearSelection: "Intikhab hata dein",
    confirmWithPassword: "Aap ka password",
    passwordWhyReset:
      "Apna password, kyunke naya password rakhne wala isi fard ke tor par sign in kar sake ga.",
    passwordWhySuspend:
      "Apna password. Muattal account sign in nahi kar sakta aur payroll se nikal jata hai.",
    passwordWhyBulk: "Apna password, kyunke yeh upar muntakhib har fard ko badal de ga.",
    editProfile: "Profile tabdeel karein",
    noRole: "Koi kirdar nahi",
    customAccess: "Khusoosi rasai",
    payAndDuty: "Ujrat aur duty",
    reactivate: "Dobara bahal karein",
    suspend: "Muattal karein",
    swipeSetRole: "{name} ka kirdar muqarrar karne ke liye swipe karein",
    updatingRole: "Kirdar badla ja raha hai…",
    signOutWarning:
      "Unhein sign out kar diya jaye ga, aur nafiz hone ke liye dobara sign in karna ho ga.",
    swipeReactivate: "Bahal karne ke liye swipe karein",
    swipeSuspend: "Muattal karne ke liye swipe karein",
    reactivating: "Bahal kiya ja raha hai…",
    suspending: "Muattal kiya ja raha hai…",
    setPassword: "Password muqarrar karein",
    newPasswordFor: "{name} ke liye naya password",
    swipeSetPassword: "{name} ka password muqarrar karne ke liye swipe karein",
    settingPassword: "Password muqarrar kiya ja raha hai…",
    atLeast8: "Kam az kam 8 huroof.",
    addTitle: "Naya user",
    addHint:
      "Mulazim code hi un ka ZKTeco K50 fingerprint number hai — terminal par usi number se indraaj karein aur punch khud jur jayein ge.",
    fullName: "Poora naam",
    fullNamePlaceholder: "Imran Sheikh",
    employeeCode: "Mulazim code / K50 number",
    cnic: "Shanakhti card (sign in)",
    tempPassword: "Aarzi password",
    passwordPlaceholder: "Kam az kam 8 huroof",
    email: "Email (ikhtiyari)",
    phone: "Phone",
    designation: "Ohda",
    designationPlaceholder: "Loom operator",
    role: "Kirdar",
    roleAssignedElsewhere: "Rasai sambhalne wala koi fard muqarrar karta hai.",
    shift: "Shift",
    noShift: "Koi shift nahi — duty ke ghante poore karne hon ge",
    contractorDepartment: "{name} (theka)",
    noShiftHint:
      "Jis ki koi shift na ho, use kabhi der wala nahi likha jata aur us ki chutti ka waqt gol nahi kiya jata. Us ke ghante aur overtime phir bhi punch se gine jate hain.",
    paidAs: "Kis haisiyat se ujrat",
    employeeFromAttendance: "Mulazim — hazri se hisab",
    contractorFlat: "Thekedaar — tay shuda muqarrara raqam",
    salaryCovers: "Tankhwah kitne ghanton ki",
    noAttendanceNeeded: "Hazri ki zaroorat nahi — poori tankhwah",
    noAttendanceHint:
      "Is fard ki hazri nahi rakhi jati aur ghanton ka hisab nahi hota. Tankhwah poori milti hai.",
    perHourLine: "{perHour} fi ghanta · {perMinute} fi minute",
    hours8Overtime: "8 ghante — is se aage sab overtime",
    hours12NoOvertime: "12 ghante — barah ke barah duty, overtime nahi",
    sunday: "Itwaar",
    sundayOff: "Chutti — aana lazim nahi",
    sundayOptional: "Marzi se — aa sakte hain",
    sundayCompulsory: "Lazmi — aana zaroori hai",
    sundayAdjust: "Chutti mein adjust — ujrat nahi",
    sundayHint:
      "Itwaar kabhi kaam ka din nahi. Us din kiya gaya har ghanta overtime hai, yahan kuch bhi likha ho.",
    payType: "Ujrat ki qism",
    hourlyWage: "Fi ghanta ujrat",
    monthlySalaryOption: "Mahana tankhwah",
    monthlySalaryField: "Mahana tankhwah (₨)",
    hourlyRateField: "Fi ghanta rate (₨)",
    createUser: "User banayein",
    editTitle: "Profile tabdeel karein · {name}",
    editHint:
      "Naam, mulazim code, rabte ki tafseel aur tainati. Ujrat, duty ki sharait aur rasai card par apne apne button se badli jati hain.",
    saveChanges: "Tabdeeliyan mehfooz karein",
    accessTitle: "Khusoosi rasai · {name}",
    accessHint:
      "{role} kirdar ke ilawa. Is se ek fard ko kuch zyada diya ja sakta hai, ya kuch wapas liya ja sakta hai, baghair naya kirdar banaye.",
    useRole: "Kirdar ke mutabiq",
    grant: "Ijazat",
    deny: "Mana",
    payTitle: "Ujrat aur duty · {name}",
    agreedAmountPkr: "Tay shuda raqam (rupay)",
    monthlySalaryPkr: "Mahana tankhwah (rupay)",
    hourlyRatePkr: "Fi ghanta rate (rupay)",
    hourlyOnlyHint: "Sirf ghante ke hisab se ujrat pane walon ke liye.",
    payClass: "Ujrat ki qism",
    tracking: "Hazri aur ujrat",
    trackingTracked: "Darj hoti hai — hazri aur tankhwah",
    trackingSalaryOnly: "Sirf tankhwah — hazri nahi rakhi jati",
    trackingExempt: "Koi nahi — malik",
    trackingHint: "Malik is nizam se kuch nahi leta aur kisi payroll mein nahi aata.",
    earnsOvertime: "Overtime milta hai",
    earnsOvertimeHint:
      "Nishan na ho to duty se aage ke ghante darj to hote hain, ujrat nahi milti.",
    contractorNote:
      "Thekedaar ka koi hisab nahi hota. Use tay shuda raqam poori milti hai — chhuttiyon ki katoti nahi, overtime nahi, der par katoti nahi.",
    perDayLine: "{amount} rozana ({salary} ÷ is mahine ke {days} din)",
    perOvertimeHourLine: "{amount} fi overtime ghanta (rozana rate ÷ 8)",
    overtimeBoundary: "Hafte ke din {hours} ghanton ke baad, aur Itwaar ko har ghanta.",
    swipeSavePay: "Ujrat ki tarteebat mehfooz karne ke liye swipe karein",
    componentsTitle: "Allowance aur katotiyan",
    componentsHint: "Sirf isi fard par, har arse mein, jab tak hata na di jayein.",
    componentFrom: "{from} se",
    componentFromTo: "{from} se {to} tak",
    componentOngoing: "{from} se — jari",
    nothingAttached: "Is fard par abhi kuch nahi laga.",
    needNameAndAmount: "Lagane ke liye naam aur raqam likhein.",
  },
  roles: {
    title: "Kirdar",
    hint: "Koi kirdar chunein taake us ke ikhtiyarat badle ja sakein, ya naya kirdar banayein",
    unrestricted: "Ghair mehdood",
    capabilities: "{count} ikhtiyarat",
    heldBy: "{count} afraad",
    newRoleName: "Naye kirdar ka naam",
    newRolePlaceholder: "Payroll officer",
    whatFor: "Yeh kis kaam ke liye hai",
    whatForPlaceholder: "Payroll chalata hai magar rasai nahi badal sakta",
    createRole: "Kirdar banayein",
    creating: "Banaya ja raha hai…",
    whatCanDo: "{role} kya kar sakta hai",
    superuserHint: "Yeh kirdar har ikhtiyar rakhta hai aur ise mehdood nahi kiya ja sakta",
    toggleHint:
      "Kisi ikhtiyar par dabayein taake woh diya ya wapas liya ja sake — tabdeeli foran lagu hoti hai",
    deleteRole: "Kirdar hazf karein",
    superuserNote:
      "{role} ek ghair mehdood kirdar hai. Har ikhtiyar khud ba khud shamil hai, is liye kisi ghalat tabdeeli se yeh kabhi is screen se bahar nahi ho sakta.",
  },
  profile: {
    title: "Meri profile",
    subtitle: "Daftar ke paas aap ka record",
    fullName: "Naam",
    employeeCode: "Mulazim number",
    cnic: "Shanakhti card number",
    phone: "Phone",
    email: "Email",
    designation: "Ohda",
    noDesignation: "Koi ohda nahi",
    shift: "Shift",
    joinedOn: "Mulazmat shuru ki",
    payType: "Tankhwah ki qism",
    monthlySalary: "Mahana tankhwah",
    hourlyWage: "Ghante ke hisab se ujrat",
    hourlyRate: "Fi ghanta rate",
    clockInRequired: "Haazri lagana zaroori",
    notRecorded: "Darj nahi",
    managedByAdmin:
      "Yeh tafseelat aap ka admin sambhalta hai. Tabdeeli ke liye un se rabta karein.",
    contactTitle: "Yahan kuch tabdeel karwana hai?",
    contactBody:
      "Is screen par zaban ke ilawa sab kuch daftar ke paas hai. Kisi cheez ki durusti ke liye phone ya email karein — parchi par aane ka intezar na karein.",
    contactCall: "{number} par call karein",
    contactEmail: "{address} par email karein",
    language: "Zaban",
    languageHint: "Har screen badal jaye gi. Naam aur number waise hi rahenge.",
    languageSaved: "Zaban badal gayi.",
    languageFailed: "Zaban tabdeel nahi ho saki.",
  },
};

export default roman;
