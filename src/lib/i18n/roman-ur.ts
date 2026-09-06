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
 * Names, employee codes, CNICs and money are NOT translated anywhere.
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
    devices: "Biometric Machinein",
    liveFloor: "Floor, Live",
    rates: "Ujrat ke Rate",
    canteen: "Canteen",
    canteenSettings: "Canteen ki Settings",
    reports: "Reports",
    payroll: "Tankhwah",
    users: "User Accounts",
    roles: "Kirdar aur Rasai",
    myProfile: "Meri Profile",
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
    unassigned: "Koi shoba nahi",
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
    language: "Zaban",
    languageHint: "Har screen badal jaye gi. Naam aur number waise hi rahenge.",
    languageSaved: "Zaban badal gayi.",
    languageFailed: "Zaban tabdeel nahi ho saki.",
  },
};

export default roman;
