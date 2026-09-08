/**
 * Every user-facing string in Wave 1, in English.
 *
 * The source of truth: the other two languages are annotated against
 * `typeof` this object, so a key missing from either is a build error rather
 * than a blank label somebody finds on the floor.
 *
 * Deliberately not `as const` — literal types would force the translations to
 * repeat the English text to typecheck.
 *
 * Placeholders are written `{name}` and left for the caller to substitute.
 * Whole sentences carry them rather than being assembled from fragments,
 * because Urdu puts its words in a different order and "{a} of {b} online"
 * cannot be rebuilt from an "of" and an "online".
 *
 * Names, employee codes, CNICs, dates and money never appear here — they are
 * rendered from the row, untranslated, in every language.
 */
const en = {
  nav: {
    // The three sidebar section headings, then one entry per module.
    workspace: "Workspace",
    administration: "Administration",
    myRecords: "My Records",
    dashboard: "Dashboard",
    ask: "Ask",
    attendance: "Attendance",
    checkInOut: "Check In / Out",
    attendanceLog: "Attendance Log",
    workingCalendar: "Working Calendar",
    devices: "Biometric Devices",
    liveFloor: "Live Floor",
    rates: "Pay Rates",
    canteen: "Canteen",
    claudeSpend: "Claude Spend",
    canteenSettings: "Canteen Settings",
    reports: "Reports",
    payroll: "Payroll",
    users: "User Accounts",
    roles: "Roles & Access",
    settings: "Settings",
    signOut: "Sign out",
  },
  common: {
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    loading: "Loading…",
    nothingYet: "Nothing to show yet",
    today: "Today",
    hours: "Hours",
    // `Late` is a word this app owns, not an `attendance_status` member: it
    // labels the `is_late` flag and the count of late arrivals. The seven enum
    // values — `present`, `absent`, `leave` and the rest — live in
    // `status.attendance` below, with every other database enum.
    late: "Late",
    checkedIn: "IN",
    checkedOut: "OUT",
    yes: "Yes",
    no: "No",
    noRole: "No role assigned",
    // Stands in for whatever a row failed to point at — a department on the
    // dashboard, a factory on the canteen settings screen. English says
    // nothing about which, and the translations must not either: they said
    // "no department" until the terminals list became the third screen to
    // show one, where it would have labelled a missing *factory*.
    unassigned: "Unassigned",
    minutesLate: "{minutes} min late",
    // The header badge on every screen. The terminal's model number meant
    // nothing to anyone on the floor; the four ways in do.
    identifyMethods: "Fingerprint, card, face or passcode",
    identifyMethodsHint: "Terminals accept fingerprint, card, face or passcode",
    // The byline under the logo. The company name is a placeholder so it stays
    // Latin in every language, like every other name in this app.
    engineeredBy: "Engineered by {company}",
    // Stands in for a first name when the profile has no usable one, so the
    // greeting still reads as a greeting.
    nameFallback: "there",
    // The filter-and-table vocabulary Wave 2's floor screens share. A word only
    // one screen uses belongs in that screen's group, not here.
    person: "Person",
    date: "Date",
    search: "Search",
    searchPlaceholder: "Name, code or CNIC",
    // Moved here from `profile` by the attendance log, which is the second
    // screen to need it. One home per word; the profile screen reads it here.
    department: "Department",
    everyDepartment: "Every department",
    // Moved here from `profile` by the canteen settings form, the second
    // screen to need it — a serving time belongs to a factory the same way a
    // person does. One home per word; the profile screen reads it here.
    site: "Factory",
    show: "Show",
    close: "Close",
    nobodyMatches: "Nobody matches these filters.",
    // Moved here from `profile` by the check in/out register, the second
    // screen to need it. This is the *word* — a field label and a column
    // heading. The `status` group below holds the enum *values* a row's
    // column is looked up in, and the two are not the same thing.
    status: "Status",
    // The export buttons (`src/components/export-buttons.tsx`). They sit on
    // three screens — the attendance log, pay rates and reports — so the words
    // belong here rather than in any one screen's group.
    //
    // `download` is the default caption noun; a screen with a better word for
    // what the file is passes its own (the attendance log passes `Payslip`).
    // `downloadFormat` is the whole caption, because "Download" + " " + "PDF"
    // is a sentence assembled in code and Urdu puts the two the other way
    // round. `{format}` is a file-format name — Excel, PDF — and stays Latin in
    // every language, like every other name in this app.
    download: "Download",
    downloadFormat: "{label} {format}",
    // The filename comes from the server's content-disposition, so it is a
    // Latin run inside a right-to-left sentence and reaches the toast through
    // `isolate()`.
    downloaded: "{name} downloaded.",
    // The two failures the reader can act on. A Postgres or fetch error is
    // passed through in English instead: it is developer-facing, and an
    // invented Urdu sentence around one would hide what actually failed.
    downloadFailed: "Download failed.",
    downloadNotBuilt: "Could not build the file ({status}).",
    // The filter bar (`src/components/filter-bar.tsx`), which sits above every
    // list of people in the app.
    clear: "Clear",
    showingOfTotal: "Showing {showing} of {total}",
  },
  /**
   * Database enum values that reach the screen as badge or field text, keyed by
   * enum then by value so a row's column can be looked up directly. The members
   * are exactly those declared in the migrations — `payroll_status`,
   * `device_status`, `employment_status` and `attendance_status`. Adding a
   * member to an enum without adding it here is a typecheck error in the two
   * translations, not a blank badge.
   */
  /**
   * The three dead ends: a page that does not exist, a page that failed, and a
   * module this role may not open.
   *
   * The refusal is deliberately not an apology. Nothing is broken when a role
   * lacks a module — somebody has to grant it — and saying so is what stops
   * the office reporting it as a fault.
   */
  errors: {
    notFoundTitle: "Page not found",
    notFoundBody: "This page does not exist, or it has been moved.",
    goHome: "Go to the start",
    loadFailedTitle: "This page did not load",
    loadFailedBody: "Something went wrong at our end. Try again, or go back to the start.",
    tryAgain: "Try again",
    deniedTitle: "Not available for your role",
    // `{role}` is the role name as the office typed it, so it stays a slot
    // rather than a translated word — a role called "Operations" is called
    // that in every language.
    deniedBody:
      "The {role} role does not include this module. Ask an administrator to grant it — nothing needs reinstalling or updating.",
    backToDashboard: "Back to my dashboard",
  },
  /**
   * What Claude costs the factory.
   *
   * Two sources side by side: Anthropic's own account statement, and this
   * app's record of what it asked for. The per-second figure is the one most
   * likely to be misread, so it says what it is averaged over — the cost
   * endpoint reports by the day, and there is no per-second measurement to be
   * had.
   */
  spend: {
    title: "What Claude costs",
    subtitle: "Taken from the Anthropic account itself, converted to rupees with the tax added",
    perSecond: "A second",
    averagedOver: "Averaged over {days} days",
    today: "Today",
    thisPeriod: "This period",
    acrossDays: "Across {days} days",
    sinceMidnight: "Estimated since midnight",
    notConfigured: "No Anthropic admin key is set",
    notConfiguredHint:
      "Set ANTHROPIC_ADMIN_KEY on the host to read the account's own cost report. Create the key in the Anthropic Console under Settings, Admin API keys. Until then only this app's own tally below is available.",
    refused: "Anthropic refused the request",
    unreachable: "Could not reach Anthropic",
    problemHint:
      "The figures below are this app's own tally only, and cover nothing else billed to the same account.",
    appTitle: "What this app asked for",
    appSubtitle: "Counted here, per question — narrower than the account statement above",
    appSpend: "Spent",
    appCalls: "Questions answered",
    settingsTitle: "Rate and tax",
    settingsHint:
      "What one dollar costs in rupees, and the tax the bank adds. Both are used everywhere a dollar figure is shown in rupees.",
    settingsReadOnly: "You can see these but not change them.",
    rate: "Rupees to the dollar",
    tax: "Tax (%)",
  },
  status: {
    payroll: {
      draft: "Draft",
      calculating: "Calculating",
      review: "In review",
      approved: "Approved",
      paid: "Paid",
      cancelled: "Cancelled",
    },
    device: {
      online: "Online",
      offline: "Offline",
      unknown: "Unknown",
      disabled: "Disabled",
    },
    /*
     * `device_mode` and `device_purpose`, the other two enums on a terminal's
     * row. They are here rather than in `devices` for the same reason
     * `device_status` is: they are the enum members' own labels, shown as a
     * field value and a badge. The *sentences* the add/edit dialog offers when
     * one is being chosen — "Push — terminal uploads to us" — are instructions
     * rather than labels, and those live in `devices` with the rest of that
     * form.
     *
     * ADMS and TCP are protocol names and stay Latin in every language, the
     * same way the model name does. They are part of the label rather than a
     * slot because there is nothing to reorder around: the whole value is one
     * short run.
     */
    deviceMode: {
      push: "Push (ADMS)",
      pull: "Pull (TCP)",
    },
    /*
     * `device_direction`. What a punch from this terminal means — a fact about
     * where the terminal is installed, not about the punch. `auto` is the
     * original behaviour and stays the default.
     */
    deviceDirection: {
      auto: "Works it out",
      in: "Check-in gate",
      out: "Check-out gate",
    },
    devicePurpose: {
      attendance: "Attendance",
      canteen: "Canteen",
    },
    /*
     * `pay_class`. It reaches the screen on every payroll line and on every
     * payslip, and until now it arrived as the enum member itself — so a
     * translated payslip still said "monthly".
     */
    payClass: {
      monthly: "Monthly",
      hourly: "Hourly",
    },
    /*
     * `sunday_policy` and `worker_type`, the two enums the pay screen sets on
     * a person. Both reached the screen raw — a badge reading
     * "Sun adjust_in_leave" is the column name, not a sentence.
     */
    sundayPolicy: {
      off: "Off",
      optional: "Optional",
      compulsory: "Compulsory",
      adjust_in_leave: "Adjusted against leave — not paid",
    },
    workerType: {
      employee: "Employee",
      contractor: "Contractor",
    },
    employment: {
      active: "Active",
      suspended: "Suspended",
      terminated: "Terminated",
    },
    /*
     * All seven `attendance_status` members, in one place.
     *
     * Wave 1 left three of them in `common` (`present`, `absent`, `onLeave`)
     * and Wave 2's attendance log added the other four to `logs`, which left
     * one database enum wearing labels in two shapes and neither of them the
     * shape the other three enums use. The words were identical in all three
     * languages, so they are one set here and every call site reads them from
     * here: the attendance log's day column, and the check in/out register,
     * whose four-state badge borrows `present` and `absent`.
     *
     * `Late` is deliberately not among them — it is not a member of this enum.
     * It stays in `common`, where it labels the `is_late` flag.
     */
    attendance: {
      present: "Present",
      absent: "Absent",
      leave: "On leave",
      holiday: "Holiday",
      off: "Off",
      partial: "Partial",
      pending: "Pending",
    },
  },
  dashboard: {
    title: "Your day at a glance",
    greeting: "Good day, {name}",
    introFloor:
      "Everything happening on the floor today — attendance, shifts and payroll — in one glance.",
    introSelf: "Your attendance, leave and payslips, all in one place.",
    youToday: "You today",
    fromTerminal: "From the biometric terminal",
    noClockInNeeded: "Your role does not require clocking in",
    checkedIn: "Checked in",
    checkedOut: "Checked out",
    hoursToday: "Hours today",
    punctuality: "Punctuality",
    notYet: "Not yet",
    onTime: "On time",
    monthlySalaryNote: "You are on a monthly salary and are not tracked by the terminals.",
    workingNow: "Working now",
    clockedInNotOut: "Clocked in, not yet out",
    notCheckedIn: "Not checked in",
    shiftStartedWithout: "Shift started without them",
    lateToday: "Late today",
    afterGrace: "After the grace period",
    trackedStaff: "Tracked staff",
    requiringAttendance: "Requiring attendance",
    finishedToday: "Finished today",
    hoursThisMonthAll: "Hours worked this month",
    hoursThisMonthMine: "Your hours this month",
    hoursChartHintAll:
      "Every day this month across the factory. Green is duty, orange is overtime.",
    hoursChartHintMine: "Your hours each day this month. Green is duty, orange is overtime.",
    byDepartment: "Attendance by department",
    byDepartmentHint: "Present against expected headcount, right now",
    floorBoard: "Floor board",
    nobodyTracked: "Nobody is set to require attendance yet.",
    notCheckedInCount: "{count} not checked in",
    andMore: "and {count} more",
    latestPayRun: "Latest pay run",
    mostRecentPeriod: "Most recent period",
    gross: "Gross",
    netPayable: "Net payable",
    // Two keys because a one-person pay period would otherwise read
    // "1 employees". The caller picks on the count; both carry the same tokens.
    payRunSummary: "{count} employees · to {date}",
    payRunSummaryOne: "{count} employee · to {date}",
    openPayroll: "Open payroll",
    noPayPeriod: "No pay period has been created yet.",
    terminals: "Terminals",
    terminalsOnline: "{online} of {total} online",
    noTerminals: "No terminals registered.",
    yourRecords: "Your records",
    everythingAvailable: "Everything available to you",
    openMyProfile: "Open my profile",
  },
  attendance: {
    title: "Attendance",
    subtitle: "Who is in today, and when they arrived",
    workingNow: "Working now",
    checkedInNotOut: "Checked in, not yet out",
    notCheckedIn: "Not checked in",
    shiftStartedWithout: "Shift started without them",
    lateToday: "Late today",
    arrivedAfterGrace: "Arrived after grace period",
    shiftFinished: "Shift finished",
    clockedOut: "Clocked out",
    shiftNotStarted: "Shift not started",
    noShiftAssigned: "No shift assigned",
    chaseFirst: "Their shift has started and no punch has arrived — chase these first",
    everyoneCheckedIn: "Everyone on shift has checked in.",
    onFloorNow: "On the floor now",
    checkedInStillWorking: "Checked in and still working",
    nobodyClockedIn: "Nobody is currently clocked in.",
    shiftNotStartedYet: "Shift not started yet",
    notDueYet: "Not due on the floor at this time",
    finishedToday: "Finished today",
    nobodyHere: "Nobody here right now.",
    noShift: "No shift",
    shiftFrom: "from {time}",
    flexibleHours: "Flexible hours",
  },
  /**
   * The check in/out register — the whole roster for one day, present or not.
   *
   * Nearly every cell on this screen is a name, an employee code, a time or an
   * hour figure, so nearly none of it is here: those are rendered from the row
   * through `<Latin>` in every language. What is here is the six words around
   * them, and only the four that no other screen already owns — `Person`,
   * `Department`, `Hours` and `Status` are read from `common`, and the
   * `Present` and `Absent` badges from `status.attendance`.
   */
  register: {
    title: "Check in / check out",
    // The refresh interval is a slot rather than a number set in the sentence:
    // it comes from ATTENDANCE_REFRESH_SECONDS, and a hard-coded one goes
    // stale the moment the timer is retuned. It did.
    subtitleToday: "Today, refreshing on its own every {seconds} seconds",
    subtitleSettled: "A settled day — figures will not change",
    // Checked in with no check-out yet: on today's register someone still on
    // the floor, on a past date a missed check-out worth correcting.
    stillIn: "Still in",
    // Someone attendance is not required of — a monthly employee the terminals
    // do not track. Not absent; nothing is owed.
    notRequired: "Not required",
    // The two time columns. `common.checkedIn`/`checkedOut` are the IN and OUT
    // badges and `dashboard.checkedIn` is a stat with a time under it; these
    // are the column headings, and all three differ in English.
    checkIn: "Check in",
    checkOut: "Check out",
    // Two templates because "1 people" is wrong; both carry the same slots.
    showing: "Showing {count} people · {expected} expected to attend",
    showingOne: "Showing {count} person · {expected} expected to attend",
  },
  /**
   * The attendance log — the audit trail behind a payslip, and the toasts its
   * approval action returns.
   *
   * Every figure the screen shows is a time, a duration, a rupee amount or a
   * code, so none of them are here: they are rendered from the row through
   * `<Latin>` in every language. What is here is only the words around them.
   *
   * The one exception is `approvedOne`/`approvedMany` below, whose `{count}`
   * is filled in by plain `String.replace` in the server action, not `<Latin>`
   * — a toast has no JSX to render through. That is safe only because a count
   * is a bare integer with no script of its own to be reordered. A future
   * template here that interpolates a name, code, serial or time the same way
   * needs the value passed through `isolate()` (`src/lib/i18n/index.ts`)
   * first — the plain-string equivalent of `<Latin>` for exactly that case.
   */
  logs: {
    title: "Attendance log",
    subtitleAll:
      "Every punch and the pay it produces — one person, chosen departments, or everyone.",
    subtitleMine: "Every punch of yours, and the pay it produces.",
    liveBoard: "Live board",
    // The two "everyone" options in the person filter: with departments ticked
    // it means everyone in those, without them it means the whole factory.
    everyone: "Everyone",
    everyoneInDepartments: "Everyone in the departments below",
    from: "From",
    to: "To",
    departmentsHint: "Departments — none ticked means every department",
    // The four tiles above the cohort table, then the four above one person's.
    people: "People",
    // Two templates because "1 departments" is wrong; both carry the same slot.
    departmentCount: "{count} departments",
    departmentCountOne: "{count} department",
    workingDays: "Working days",
    attendedNotSunday: "Attended, not Sunday",
    overtimeHours: "Overtime hours",
    overtimeCap: "Capped at four hours a working day",
    lateArrivals: "Late arrivals",
    pastGrace: "Past the grace period",
    hoursClocked: "Hours clocked",
    acrossEveryDay: "Across every day shown",
    // The duty hours are a slot because they are read off the person's row.
    overtimeBeyond: "Beyond {hours}, max four a day",
    notTrackedFlexible: "Not tracked — flexible hours",
    // Cohort table.
    overtime: "Overtime",
    earned: "Earned",
    contract: "Contract",
    peopleCount: "{count} people",
    peopleCountOne: "{count} person",
    earnedNote:
      "Earned is base pay plus overtime, before deductions — a contractor's is their agreed amount. The payroll run recalculates all of it from the same figures.",
    // The paragraph above one person's days.
    contractorNote:
      "Paid as a contractor. These hours are recorded so the invoice can be checked, but they do not price anything — the agreed amount is paid flat.",
    notPaidFromAttendance:
      "Not paid from attendance. The contracted salary is paid in full, so these punches are a record of presence rather than the basis of the payslip.",
    rateSentence:
      "At {perDay} a day and {perHour} an overtime hour, the days below come to {total} before deductions.",
    flexibleNote: "No in or out time is enforced for this person, so they are never recorded late.",
    payslip: "Payslip",
    backToEveryone: "Back to everyone",
    // The day table.
    clocked: "Clocked",
    duty: "Duty",
    counts: "Counts",
    sunday: "Sunday",
    edited: "Edited",
    approved: "Approved",
    unpaidHint: "Past the daily overtime ceiling — recorded, not paid",
    unpaidHours: "{hours} unpaid",
    // A day that counts always counts exactly one, but the numeral is a slot so
    // it goes through `<Latin>` like every other figure on the screen.
    countsDay: "{count} day",
    overtimeOnly: "overtime only",
    noAttendanceBetween: "No attendance recorded between {from} and {to}.",
    // The `attendance_status` labels this screen's day column shows are not
    // here: they are the database enum, so they live in `status.attendance`
    // with every other enum's values.
    // The approve button. The range is one slot rather than two, so the two
    // dates and the dash between them stay a single unbreakable Latin run.
    approving: "Approving…",
    approveRest: "Approve the rest ({count})",
    approveRange: "Approve {range}",
    /*
     * What `approveAttendanceRange` puts in the toast.
     *
     * A server action already holds the session, so it already knows the
     * reader's language — it looks the sentence up itself and returns it
     * translated, rather than handing the client an English string to sit
     * beside Urdu labels.
     *
     * The count is a slot rather than something concatenated on, because Urdu
     * puts the words in a different order. Two templates rather than one,
     * because "1 days" is wrong in English and the one-day and many-day
     * sentences differ in the other two languages as well.
     *
     * Postgres errors are deliberately absent: they are passed through
     * untouched. They are developer-facing, and an invented Urdu sentence
     * wrapping one would hide what actually failed.
     */
    pickPersonAndRange: "Pick a person and a date range.",
    endBeforeStart: "The end date cannot be before the start date.",
    nothingToApprove:
      "Nothing to approve — no attendance in that range for someone who reports to you.",
    approvedOne: "Approved {count} day. It will not be recalculated.",
    approvedMany: "Approved {count} days. They will not be recalculated.",
  },
  /**
   * The canteen counter — the most floor-facing screen in the product.
   *
   * Read at a serving hatch by workers queuing for a meal, several of whom do
   * not read confidently in any language, so every one of these is a short
   * spoken phrase rather than a sentence. Three of them are refusals: a worker
   * reads them while being turned away from food.
   *
   * These are deliberately *not* in `status.mealScan` beside the other
   * database enums, even though the counter picks one per `meal_scan_outcome`
   * value. What the panel shows is the counter staff's instruction for that
   * outcome — "Give food", not "Served" — and an instruction is not the
   * enum member's label. A future screen listing scan outcomes as badges
   * would want the noun, and would be wrong to reuse the imperative.
   */
  /**
   * Which days the factory works.
   *
   * Two decisions, and the screen keeps them apart because the database does
   * and because confusing them is expensive: the weekly rule changes every
   * future Sunday, a dated exception changes one.
   */
  calendar: {
    weeklyPattern: "Every week",
    weeklyPatternHint:
      "The standing rule. Switching a day on here opens every one of them, from now on.",
    working: "Working",
    off: "Off",
    // Sunday first, the order `work_week` stores and the order this screen
    // reads it in — Sunday is the day the screen exists to change.
    weekday: {
      sunday: "Sunday",
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
    },
    readOnly: "You can see the calendar but not change it.",
    exceptions: "One-off changes",
    exceptionsHint:
      "This Sunday only, or a shutdown on a Tuesday. A dated change beats the weekly rule.",
    addException: "Add a day",
    noExceptions: "No changes to the calendar",
    noExceptionsHint: "Every day is following the weekly rule above.",
    edit: "Edit",
    remove: "Remove",
    removed: "Removed.",
    saved: "Saved.",
    saveFailed: "Could not save that.",
    nowWorking: "That day is now a working day.",
    nowOff: "That day is now off.",
    // `{date}` is the date itself, so it is a slot rather than digits set into
    // the sentence — the rule every other date on every other screen follows.
    editException: "Edit {date}",
    addExceptionTitle: "Add a day",
    date: "Date",
    kind: "What kind of day",
    reason: "Reason",
    reasonPlaceholder: "Extra order",
    reasonHint: "Kept with the day, so anyone reading the calendar later knows why.",
    payMultiplier: "Pay multiplier",
    payMultiplierHint:
      "Leave it empty to use the usual rule for this factory. 2 means double pay for the day.",
    // One entry per `day_type` member: the noun the enum stores, and under it
    // what the choice actually does to the day.
    dayType: {
      workday: "Working day",
      off: "Off",
      holiday: "Holiday",
      weekend_working: "Working weekend",
      special_working: "Extra working day",
    },
    dayTypeHint: {
      workday: "An ordinary day, whatever the weekly rule says.",
      off: "Nobody works. Not a holiday — a shutdown, an outage.",
      holiday: "A declared holiday.",
      weekend_working: "A normally-off day switched on, paid at the weekend rate.",
      special_working: "A day declared off, switched back on.",
    },
  },
  /**
   * The day register: who scanned, and what came of it.
   *
   * The counter panel answers one question for one man and then forgets him.
   * These are the nouns — what happened — rather than the counter screen’s
   * instruction to the server, which is why they are not the `canteen` group:
   * a counter says “Give food”, a register says “Served”.
   */
  canteenLog: {
    title: "Scans today",
    subtitle: "Every finger on the canteen terminal today, and what came of it.",
    everyScan: "All",
    served: "Served",
    refused: "Second attempt",
    notRecognised: "Not recognised",
    counterClosed: "Counter closed",
    nothingToday: "No scans yet today",
    nothingTodayHint: "Names appear here the moment the counter starts serving.",
    // The finger matched nobody enrolled, so there is no name to show.
    unknownWorker: "Unknown finger",
  },
  canteen: {
    // served
    giveFood: "Give food",
    // duplicate — already fed inside the rolling 24 hours
    alreadyTaken: "Already taken",
    // unknown_person — the finger matched nobody
    notRecognised: "Not recognised",
    // outside_window — no serving is open right now
    counterClosed: "Counter closed",
    // Between scans.
    scanFinger: "Scan a finger",
    // The two tallies, which only someone with `canteen.view` sees.
    servedToday: "Served today",
    secondAttempts: "Second attempts",
  },
  /**
   * Serving times, and which terminals scan for meals.
   *
   * An office screen rather than a floor one, but it is the screen that
   * decides what the counter does — so its two warnings matter as much as
   * anything on the counter itself.
   *
   * A meal window's name, the factory's name and the terminal's name are
   * names: they are rendered from the row through `<Latin>`, not from here.
   */
  canteenSettings: {
    // The two configuration gaps that make the counter silently do nothing.
    counterInactive: "The canteen counter will not do anything yet",
    noCanteenTerminal: "No terminal is set to Canteen, so its scans are recorded as attendance.",
    // The link that follows it. A whole clause rather than the word "Devices"
    // dropped into the sentence above: a link cannot be a `<Fill>` slot, and
    // a translated sentence built around embedded markup cannot be reordered.
    setOneOnDevices: "Set one on the Devices screen",
    // Quotes the counter's own refusal, so this phrase and `canteen.counterClosed`
    // must stay word-for-word the same in every language.
    noServingSwitchedOn: "No serving time is switched on, so every scan reads “counter closed”.",
    servingTimes: "Serving times",
    servingTimesHint: "When the counter is open. One meal per person per serving.",
    addServing: "Add serving",
    noServingsYet: "No serving times yet",
    noServingsHint: "Add one — lunch, or dinner for the night shift.",
    terminals: "Canteen terminals",
    terminalsHint: "Set on the Devices screen — shown here so a missing one is obvious",
    noTerminalScanning: "No terminal is scanning for meals.",
    // Two switched-off badges on one screen, for two different columns:
    // `devices.is_active` on a terminal, `meal_windows.is_active` on a serving
    // time. Neither is `device_status.disabled`, which is a third thing again.
    inactive: "Inactive",
    off: "Off",
    runsPastMidnight: "Runs past midnight — counted against the day it opens",
    edit: "Edit",
    // The dialog, adding or editing. `{name}` is the serving's own name.
    editServing: "Edit {name}",
    addServingTitle: "Add a serving",
    // `{time}` is an example end time, so it is a slot like every other time
    // on every other screen rather than digits set in the sentence.
    overnightHint:
      "A serving that runs past midnight is fine — end it at {time} and the night shift's meal still counts as one.",
    servingName: "Name",
    namePlaceholder: "Lunch",
    opens: "Opens",
    closes: "Closes",
    orderOnScreen: "Order on screen",
    openLabel: "Open — the counter accepts scans in this window",
    saveServingTime: "Save serving time",
    removeConfirm:
      "Remove {name}? Servings already recorded against it keep this window, so it can only be removed if nobody has eaten in it.",
    remove: "Remove",
    removeServing: "Remove this serving",
    /*
     * What `saveMealWindow` and `deleteMealWindow` put in the toast.
     *
     * The action holds the session, so it knows the reader's language and
     * looks the sentence up itself rather than handing the client English to
     * sit beside Urdu labels. Postgres errors are deliberately absent — they
     * are passed through untouched, being developer-facing.
     *
     * `duplicateName` carries a name the administrator typed, quoted, between
     * two runs of Urdu — so the action passes it through `isolate()` before
     * substituting it. `HH:MM` in `enterTimes` is not a slot: it is part of
     * the sentence, and strong left-to-right letters are not reordered by the
     * surrounding paragraph the way a code or a number would be.
     */
    chooseFactoryAndName: "Choose a factory and give it a name.",
    enterTimes: "Enter both times as HH:MM.",
    sameStartEnd: "Start and end cannot be the same — that window would never open.",
    duplicateName: "A serving named “{name}” already exists at this factory.",
    servingUpdated: "Serving time updated.",
    servingAdded: "Serving time added.",
    windowInUse:
      "Meals have already been served in this window — switch it off instead of deleting it.",
    servingRemoved: "Serving time removed.",
  },
  /**
   * The biometric terminals — the list, one terminal's page, the controls on
   * it and the add/edit dialog behind them.
   *
   * Almost everything a terminal *is* stays Latin in every language: the model
   * name, the serial number, the IP address and port, the timezone, the
   * firmware string, the paths and menu entries on the device's own screen,
   * and the protocol names ADMS and TCP. Those are wrapped, never keyed — a
   * serial that reads `K50-DYE-0001` here and `0001-DYE-K50` on a
   * right-to-left page is a screen lying about the row. What is here is the
   * words around them.
   *
   * `status.device`, `status.deviceMode` and `status.devicePurpose` hold the
   * three enums a terminal's row carries; this group holds no enum labels.
   */
  devices: {
    // The list.
    title: "Biometric terminals",
    // `{model}` is a hardware model name, so it is a slot rather than words in
    // the sentence: it stays Latin, and Urdu puts it in a different place.
    subtitle: "{model} devices on the factory floor",
    addTerminal: "Add terminal",
    noneYet: "No terminals registered yet",
    noneYetHint: "Add your {model} and point it at this server to start receiving punches.",
    // A terminal whose `site_id` matches no factory reads `common.unassigned`,
    // which is where that word already lives. Its two translations said "no
    // department" until this screen, and have been made referent-neutral
    // rather than duplicated here.
    // The four figures on a card, and the two extra on a terminal's own page.
    // `common.status` is the word "Status"; the value it shows is the enum, in
    // `status.device`.
    serial: "Serial",
    mode: "Mode",
    address: "Address",
    lastSeen: "Last seen",
    // Shown instead of a relative time when a terminal has never reported.
    neverSeen: "Never",
    lastPunchReceived: "Last punch received {time}",
    timezone: "Timezone",
    notSet: "Not set",
    // One terminal's page.
    allTerminals: "All terminals",
    detailSubtitle: "{model} · serial {serial} · last seen {seen}",
    editSettings: "Edit settings",
    /*
     * The push-mode setup notes. Every slot is a label printed on the
     * terminal's own screen or a protocol name — `Menu → Comm. → Cloud Server
     * Setting`, `Server Mode`, `ADMS`, `/iclock/cdata`, `192.168.x.x`,
     * `Gateway`, `Ethernet`. They are slots rather than words in the sentence
     * because they must stay Latin and must stay exactly what the installer
     * will read off the device, in whatever order the translation wants the
     * sentence.
     */
    setupTitle: "Terminal setup",
    setupCloudServer:
      "On the terminal: {menu}. Set {serverMode} to {adms}, then enter the address and port of whatever this terminal pushes to — the relay's static IP in a hosted setup, or this server directly if it shares the factory network. The firmware appends {path} itself.",
    setupDigitsOnly:
      "Most {adms} builds accept digits only in that field, so a domain cannot be entered — and the address above is not the terminal's own {ip}, which is a common and silent mistake. Set {gateway} under {ethernet} too; without it the terminal never leaves the local network.",
    recentPunches: "Recent punches",
    recentPunchesHint: "Newest first, shown in Pakistan Standard Time",
    noPunches: "No punches received yet",
    noPunchesHint: "Once the terminal uploads, check-ins appear here within seconds.",
    // A punch whose enrolment id matches nobody — the id is the terminal's
    // own number for a finger, so it is a slot.
    unlinkedTerminalId: "Unlinked terminal ID {id}",
    // The two buttons, their loading toasts, and the reason they are disabled.
    testConnection: "Test connection",
    contactingTerminal: "Contacting terminal…",
    syncNow: "Sync attendance now",
    readingLog: "Reading attendance log…",
    addIpFirst: "Add the terminal's IP address first",
    pushControlsNote:
      "This terminal is in push mode, so it uploads on its own. These controls are for pulling the stored log on demand and need the server to reach the device over the network.",
    // The add/edit dialog. `{brand}` is a manufacturer's name.
    addTerminalTitle: "Add {brand} terminal",
    editTerminal: "Edit terminal",
    dialogHint:
      "Push mode is recommended: the terminal uploads to this server, so nothing has to reach into the factory network.",
    terminalName: "Terminal name",
    terminalNameHint: "e.g. Dyeing — main gate",
    terminalNamePlaceholder: "Dyeing — main gate",
    chooseFactory: "Choose a factory",
    serialNumber: "Serial number",
    model: "Model",
    connectionMode: "Connection mode",
    // The two mode choices as instructions, which is why they are not the
    // `status.deviceMode` labels: this text tells the office which to pick.
    modePushOption: "Push — terminal uploads to us (recommended)",
    modePullOption: "Pull — we connect to the terminal over TCP",
    // Which door this terminal is on. The instructions the form offers when
    // one is being chosen, rather than the enum's own labels in
    // `status.deviceDirection` — which is what the card and the terminal's
    // page show once it is set.
    gate: "Which gate",
    gateHint: "A terminal by the door in records arrivals; one on the way out records departures",
    gateAutoOption: "Works it out — first punch in, last punch out",
    gateInOption: "Check-in — every punch here is an arrival",
    gateOutOption: "Check-out — every punch here is a departure",
    records: "What this terminal records",
    recordsHint: "A canteen scan is a meal, never a clock-in — nobody is paid for eating.",
    purposeAttendanceOption: "Attendance — clock in and out",
    purposeCanteenOption: "Canteen — one meal per person per serving",
    ipAddress: "IP address",
    // Quotes the button's own caption, so this and `testConnection` must stay
    // word-for-word the same in every language.
    ipAddressHint: "Needed for pull mode and Test connection",
    port: "Port",
    // `COMM KEY` itself is the label printed on the terminal, so it is not
    // keyed at all — it is rendered Latin. This is only the hint under it,
    // whose `{menu}` is the path on the device's own screen.
    commKeyHint: "{menu}. Leave blank if unset.",
    activeLabel: "Active — accept punches from this terminal",
    saveTerminal: "Save terminal",
    /*
     * What `saveDevice`, `testConnection` and `syncDevice` put in the toast —
     * the most messages of any action in the wave.
     *
     * The action holds the session, so it knows the reader's language and
     * looks each sentence up itself rather than handing the client English to
     * sit beside Urdu labels. Postgres errors and the errors the terminal
     * itself reports are deliberately absent: they are passed through
     * untouched, being developer-facing, and an invented Urdu wrapper around
     * one would hide what actually failed.
     *
     * Three of these carry a value that is not a bare number — a serial, a
     * firmware string and a device clock — and a toast is a plain string with
     * no JSX to render `<Latin>` through. Those go through `isolate()` before
     * they are substituted, or the bidi algorithm is free to reorder them on
     * display and the toast names a serial that is not the one stored. The
     * counts in `syncRead` and `syncUnmapped` are bare integers and do not.
     */
    nameFactorySerialRequired: "Name, factory and serial number are required.",
    portRange: "Port must be a whole number between 1 and 65535.",
    duplicateSerial: "A terminal with serial {serial} already exists.",
    terminalAdded: "Terminal added.",
    terminalUpdated: "Terminal updated.",
    notFound: "Terminal not found.",
    setIpBeforeTesting: "Set the terminal's IP address before testing.",
    connected: "Connected. Firmware {firmware}, device clock {clock}.",
    // The two fallbacks inside that sentence, for a terminal that answers
    // without naming its firmware or with a clock that will not parse. They
    // are words in the reader's language, so they are *not* isolated — only
    // the values that came off the device are.
    firmwareUnknown: "unknown",
    clockUnreadable: "unreadable",
    pushCannotBeReached:
      "This terminal is in push mode, so it cannot be reached from here — that is expected and does not mean it is down. Its status comes from the punches it uploads.",
    noIpAddress: "This terminal has no IP address. Devices in push mode upload on their own.",
    noSerialRecorded: "This terminal has no serial number recorded.",
    syncRead: "Read {read} record(s): {accepted} new, {duplicates} already stored.",
    syncUnmapped: "{count} enrolment id(s) are not linked to an employee yet.",
    pushCannotBePolled:
      "This terminal is in push mode and cannot be polled from here. It uploads on its own — nothing needs to be pulled.",
  },
  /**
   * The live floor — the punch feed, as the terminals upload them.
   *
   * Almost everything on this screen is a value rather than a word: a name, an
   * employee code, a terminal name, a date and a time. Those are wrapped, not
   * keyed. What is here is the thin label around them. The IN and OUT badges
   * are `common.checkedIn` and `common.checkedOut`, where the register and the
   * attendance log already read them, and the link back to the terminals list
   * is `nav.devices`, which is the name that screen already has.
   */
  liveFloor: {
    title: "Live floor",
    // `{count}` is a row count and `{seconds}` a number of seconds. Both stay
    // Latin, and Urdu puts them elsewhere in the sentence.
    subtitle: "The last {count} check-ins and check-outs, refreshing every {seconds} seconds",
    nothingYet: "Nothing on the floor yet",
    nothingYetHint: "Scans appear here within seconds of a terminal uploading them.",
    // A punch whose enrolment id is not linked to anybody yet. `{id}` is the
    // number the terminal sent, so it stays Latin.
    unlinkedTerminalId: "Unlinked terminal ID {id}",
    // Stands in for a terminal's name when a punch points at a device row this
    // screen did not load.
    terminalFallback: "Terminal",
  },
  /**
   * Ask — the assistant's own screen, and the floating widget that carries the
   * same conversation on to every other screen.
   *
   * **Two languages meet here and they are not the same language.** This group
   * is the *interface* language: the headings, the input's placeholder, the
   * effort dial, the cost readout, the voice confirmation. It follows the
   * reader's profile setting, like every other screen.
   *
   * The three buttons at the top of the conversation choose the language the
   * assistant *answers* in, one question at a time. They are named in their own
   * scripts by `LANGUAGE_LABELS`, and the utterances that belong to that
   * language — the preset questions and the greeting that invites one — live in
   * `assistant-conversation.tsx` beside them, not here. Nothing in this group
   * drives that selector, and it drives nothing here: a person asking for one
   * answer in Urdu must not have their whole app flip.
   */
  ask: {
    // The screen's heading is `nav.ask` — the name the sidebar already gives
    // it. Only the line under it is this screen's own.
    subtitle: "Attendance, leave and payroll — answered in plain language",
    // The same line in the floating widget, where there is room for less.
    // The assistant attached to one record, rather than the floating widget.
    // "Ask Claude" names the thing doing the answering, which is what people
    // on the floor already call it.
    askClaude: "Ask Claude",
    askAboutThis: "Ask Claude about this record",
    askAboutGreeting: "Ask me anything about this — I can see what is on your screen.",
    widgetSubtitle: "Attendance, leave and payroll",
    // Labels for assistive technology on the widget's panel and its button.
    panelLabel: "Ask the assistant",
    openLabel: "Ask a question",
    // Above the answer-language buttons. Added when this screen was
    // translated: without it the row reads as an app-language switch, which is
    // the one thing it is not.
    answerLanguage: "Answer in",
    commonQuestions: "Common questions",
    thinking: "Thinking…",
    listen: "Listen",
    readAloud: "Read aloud",
    placeholder: "Type your question…",
    askByVoice: "Ask by voice",
    stopListening: "Stop listening",
    // The voice confirmation. Nothing spoken is sent until it is read back,
    // because a misheard word cannot be proof-read afterwards.
    heard: "Did you ask this?",
    nothingHeard: "(nothing heard)",
    retry: "Try again",
    send: "Send",
    // `{amount}` arrives already carrying "Rs" and its digits, the way the
    // attendance log and the pay rates screen write money — the currency and
    // the figure are one Latin run and are not split by a translation.
    sessionCost: "This session: {amount}",
    // The three failures a reader can act on. All three are toasts.
    noAnswer: "Could not get an answer just now.",
    unreachable: "Could not reach the assistant. Check your connection.",
    notCaught: "Didn't catch that — try again, or type your question.",
    /*
     * The effort dial, keyed by the ladder's own values so the component can
     * look each one up directly. `src/lib/assistant/models.ts` holds the order
     * and the allowlist; the words are here, once, in each language.
     *
     * `short` is what the compact widget renders in place of `label`: five
     * buttons at ~56px on a 360px phone, where three of the five full English
     * labels overflow. `src/lib/i18n/index.test.ts` pins how long a `short`
     * may be.
     */
    // The API route's own refusals, which reach the reader as a toast. The
    // `error.message` a misconfigured key or a failed model call carries is
    // passed through in English instead: it is developer-facing, and an
    // invented sentence around one would hide what actually failed.
    notSignedIn: "Not signed in.",
    notAllowed: "Not allowed to use the assistant.",
    badRequest: "Invalid request body.",
    emptyQuestion: "Ask a question first.",
    questionTooLong: "That question is too long.",
    notConfigured: "Assistant is not configured.",
    couldNotAnswer: "The assistant could not answer that.",
    // Stands in when the model returns nothing at all. This one is an *answer*
    // — it is shown in the thread where an answer would be — so the route
    // reads it in the answer language, not the interface language.
    noAnswerText: "I couldn't work out an answer to that.",
    effort: {
      low: { label: "Fast", short: "Fast", hint: "A quick answer" },
      medium: { label: "Balanced", short: "Mid", hint: "Between the two" },
      high: { label: "Thorough", short: "Full", hint: "Default" },
      xhigh: { label: "Deeper", short: "Deep", hint: "For hard questions" },
      max: { label: "Maximum", short: "Max", hint: "Slowest and dearest" },
    },
  },
  /**
   * What the factory did, at three zoom levels.
   *
   * Chart titles and their one-line subtitles, which is nearly all of this
   * screen: the figures themselves come from the payroll functions and carry
   * no words. Department names, dates and rupee figures are rows, not
   * dictionary entries, so they are wrapped rather than translated.
   */
  reports: {
    // `{scope}` is a department name, or the whole-factory wording below.
    title: "Reports · {scope}",
    wholeFactory: "Whole factory",
    periodHint: "{from} to {to} — every figure comes from the calculations the payroll run uses.",
    from: "From",
    to: "To",
    // The five headline tiles: a label, and the line under it saying what the
    // number counts. Without those lines "Working days" reads as calendar days.
    people: "People",
    peopleHint: "{count} with attendance",
    workingDays: "Working days",
    workingDaysHint: "Attended, and not a Sunday",
    hoursWorked: "Hours worked",
    hoursWorkedHint: "Duty and overtime",
    overtime: "Overtime",
    overtimeHint: "Up to 4 hours a working day",
    earned: "Earned",
    earnedHint: "Before deductions",
    dailyHours: "Hours worked each day",
    dailyHoursHint:
      "Duty hours and overtime across everyone in scope. A Sunday shows as overtime only.",
    punches: "Check-ins and check-outs",
    punchesHint:
      "A day where the two disagree has a missed punch — and a missed punch is a wrong payslip.",
    hoursByDept: "Hours by department",
    hoursByDeptHint: "Duty and overtime together.",
    earnedByDept: "Earned by department",
    earnedByDeptHint: "Base pay plus overtime, before deductions.",
    mostOvertime: "Most overtime",
    mostOvertimeHint: "The people working past their duty hours.",
    topEarners: "Highest earners this period",
    topEarnersHint: "A contractor shows the agreed amount.",
    headcount: "Headcount by department",
    headcountHint: "Tap a slice to drop it and watch the rest re-proportion.",
    arrangements: "How people are paid",
    arrangementsHint: "Every arrangement on the floor, as a share of the workforce.",
    wageBill: "Wage bill by department",
    wageBillHint: "Earned this period, before deductions.",
    overtimeByDept: "Overtime by department",
    overtimeByDeptHint: "The six departments working the most hours past duty.",
    earningsAgainstHours: "Earnings against hours worked",
    earningsAgainstHoursHint:
      "One dot per person. A high dot with few hours is somebody no terminal is tracking — or somebody not turning up.",
    // Axis and bar units. The capitalised pair label bars, the lower-case pair
    // sit inside a sentence, and Urdu does not distinguish the two — which is
    // fine: what matters is that each reads correctly where it is used.
    unitHours: "Hours",
    unitRupees: "Rupees",
    unitPeople: "people",
    unitRupeesLower: "rupees",
    axisHours: "hours",
    axisEarned: "earned",
    // The five ways somebody on this floor can be paid, as the report groups
    // them. Not a database enum — it is derived from four columns at once —
    // so it lives here rather than in `status`.
    arrangement: {
      standard: "8h duty, with overtime",
      twelveHour: "12h duty",
      noOvertime: "No overtime",
      contractors: "Contractors",
      notFromAttendance: "Not paid from attendance",
    },
  },
  /**
   * Pay runs, and the payslip behind each line.
   *
   * The money words are the ones an argument gets had over, so they are stated
   * plainly: "Net payable" is what leaves the office, "Gross" is before
   * anything is taken off. Every figure, date and name on this screen is a
   * row, so all of them are wrapped rather than translated.
   */
  payroll: {
    periods: "Pay periods",
    periodsHint: "Worked out from the attendance the terminals recorded",
    newPeriod: "New period",
    noPeriods: "No pay periods yet",
    noPeriodsHint: "Create one covering the dates you want to pay for.",
    // `{count}` people, `{amount}` rupees — both slots, and Urdu puts them the
    // other way round.
    paidSummary: "{count} paid · net {amount}",
    notCalculated: "Not calculated yet",
    grossPay: "Gross pay",
    deductions: "Deductions",
    tax: "Tax",
    netPayable: "Net payable",
    runPayroll: "Run payroll",
    recalculate: "Work it out again",
    calculating: "Working it out from attendance…",
    approve: "Approve",
    approving: "Approving…",
    markPaidAndLock: "Mark paid and lock",
    closingPeriod: "Closing the period…",
    locked: "Locked — a period already paid cannot be worked out again.",
    lines: "Payroll lines · {count}",
    linesHint: "Hours come from the biometric terminals. Tap a row for the full payslip.",
    // One banner for the whole run. `{count}` is a number of people, so the
    // sentence is written to read correctly whether it is one or forty —
    // English cannot inflect around a slot either.
    reviewBanner:
      "{count} worth a look before you approve — dropped hours, an attendance anomaly, or a pay swing against recent history. Nothing is calculated wrong; read the note on each payslip.",
    nothingCalculated: "Nothing worked out yet",
    nothingCalculatedHint: "Run the payroll to build the lines from attendance.",
    // Table headings. Short because the table is already 900px wide before
    // anyone opens it on a phone.
    colRegularHours: "Duty h",
    colOvertimeHours: "OT h",
    colGross: "Gross",
    colNet: "Net",
    colPaid: "Paid",
    payslip: "Payslip",
    // `{hours}` is a figure, `{dates}` a run of dates — both slots.
    droppedTooltip: "{hours} dropped by the overtime ceiling on {dates} — check before approving",
    // The cash tally: two counts and two rupee figures in one sentence.
    cashTally: "{paid} of {total} paid in cash · {paidAmount} of {totalAmount} handed out",
    cashLeft: "{count} still to pay",
    undo: "Undo",
    undoing: "Undoing…",
    notYet: "Not yet",
    // What actually left the cash box, against what was worked out. A cash
    // payroll does not always hand over the calculated figure to the rupee,
    // and the difference used to live in somebody's head.
    amountPaid: "Amount paid",
    amountPaidHint: "Leave it as it is if you handed over the full amount",
    paidReason: "Why the difference",
    paidReasonPlaceholder: "No change available",
    confirmPay: "Record payment",
    shortBy: "{amount} short",
    overBy: "{amount} over",
    paidExactly: "Paid in full",
    differencesTotal: "{count} lines differ from the calculated amount · {amount} net",
    markPaid: "Mark paid",
    markingPaid: "Marking {name} paid…",
    newPeriodTitle: "New pay period",
    periodLabel: "Name",
    periodLabelPlaceholder: "August 2026",
    from: "From",
    to: "To",
    creating: "Creating…",
    createPeriod: "Create period",
    // The three hour tiles on a payslip.
    regular: "Duty",
    overtime: "Overtime",
    weekend: "Weekend",
    worthLook: "Worth a look before approving",
    droppedTitle: "{hours} dropped by the overtime ceiling",
    droppedBody:
      "Likely a double-duty day rather than a wrong number — check the punches for {dates} before approving.",
    earnings: "Earnings",
    netPay: "Net pay",
    printPayslip: "Print payslip",
    closePayslip: "Close payslip",
    // A payroll line whose person is no longer in the directory. The line is
    // still owed to somebody, so it is shown rather than hidden.
    unknownPerson: "Unknown",
  },
  /**
   * What an hour is worth, and what each person earns.
   *
   * Two different decisions on one screen, which is deliberate: the site rules
   * say what overtime pays in general, and the per-person half says who that
   * actually applies to. Reviewing one without the other is how a rate gets
   * raised for a floor where nobody is marked as earning overtime.
   *
   * Every rupee figure, name and code here is a row, so all of them are
   * wrapped rather than translated.
   */
  rates: {
    payByPerson: "Pay by person · {count}",
    payByPersonHint:
      "What each person earns, how many hours their salary covers, and the lines attached to them. Grouped by department.",
    searchPlaceholder: "Name, employee code or CNIC",
    paidAs: "Paid as",
    everyone: "Employees and contractors",
    employees: "Employees",
    contractors: "Contractors",
    readOnly:
      "You can see the pay rules but not change them. Changing them needs the “Manage pay rules” capability.",
    // `{site}` is a factory name, so a slot rather than a translated word.
    ratesFor: "Pay rates — {site}",
    ratesForHint: "Rupees an hour for each kind of worked time",
    noRates: "No rates set for this factory.",
    latePenalties: "Late arrival penalties",
    latePenaltiesHint: "Taken off automatically when somebody checks in after their shift starts",
    noLatePenalty: "No late penalty is set.",
    overtime: "Overtime",
    weekend: "Weekend or off day",
    holiday: "Holiday",
    night: "Night shift",
    perHour: "{amount} an hour",
    // A late band, read-only: from and to are minutes, or "and beyond".
    lateRange: "{from} to {to}",
    beyond: "and beyond",
    minutes: "{minutes} min",
    penaltyOfDaily: "{percent}% of one day’s pay",
    penaltyOfMonthly: "{percent}% of monthly pay",
    // The rate form.
    perHourNote:
      "Rates are rupees per hour, not a multiple of the basic wage. Changing somebody’s basic pay leaves these untouched.",
    otRate: "Overtime rate",
    otRateHint: "An hour beyond the standard day",
    weekendRate: "Weekend or off-day rate",
    weekendRateHint: "An hour on a rest day that was switched on",
    holidayRate: "Holiday rate",
    holidayRateHint: "An hour on a declared holiday",
    nightRate: "Night shift rate",
    nightRateHint: "An hour on the night rotation",
    standardHours: "Standard hours a day",
    workingDaysMonth: "Working days a month",
    otAfter: "Overtime starts after (min)",
    roundTo: "Round hours to (min)",
    effectiveFrom: "Effective from",
    effectiveFromHint:
      "A new date creates a new rate set; payroll already worked out keeps the old rates.",
    whatThisPays: "What this pays",
    weekendShiftExample: "An 8-hour weekend shift: {amount}",
    overtimeExample: "4 hours of overtime: {amount}",
    holidayShiftExample: "An 8-hour holiday shift: {amount}",
    saveRates: "Save rates",
    // The late-penalty ladder.
    ladderNote:
      "Bands are a ladder, not cumulative — arriving 90 minutes late costs the 1–2 hour penalty only. Lateness is measured from the shift start, after the grace period.",
    colBand: "Band",
    colLateFrom: "Late from",
    colLateUntil: "Late until",
    colDeduction: "Deduction",
    noBands: "No late-arrival penalty is set — lateness currently costs nothing.",
    bandName: "Band name",
    bandNamePlaceholder: "Late 15–30 minutes",
    lateFromField: "Late from (min)",
    lateUntilField: "Late until (min)",
    lateUntilPlaceholder: "blank = beyond",
    deductPercent: "Deduct (%)",
    basis: "Of",
    basisDay: "One day’s pay",
    basisMonth: "Monthly pay",
    addBand: "Add band",
    removeBand: "Remove {name}",
    // Contract firms.
    contractFirms: "Contract firms",
    contractFirmsHint: "One agreed amount per firm, billed instead of pricing its people",
    noFirms: "No contractor departments at this factory.",
    firmsFooter:
      "A firm left at zero is charged nothing and its people appear on no payroll line. The payroll run warns rather than passing over it in silence.",
    onTheFloor: "{count} on the floor",
    monthlyAmount: "Monthly amount (PKR)",
    // Per person.
    perMonth: "a month",
    contractSuffix: "{amount} contract",
    agreedFlat: "agreed, flat",
    perDayShort: "{amount} a day",
    tagContract: "Contract",
    tagDuty: "{hours}h duty",
    // `{policy}` is a `sunday_policy` member, already translated.
    tagSunday: "Sunday: {policy}",
    tagNotFromAttendance: "Not from attendance",
    tagFlexible: "Flexible",
    tagNoOvertime: "No overtime",
    agreedAmount: "Agreed amount",
    monthlySalary: "Monthly salary",
    salaryCovers: "Salary covers",
    // The third answer to "what does the salary cover": not a number of hours
    // at all. It is the same arrangement the tracking select calls
    // `salary_only`, offered on the question the office is actually asking.
    noAttendanceNeeded: "No attendance needed — salary paid in full",
    noAttendanceHint:
      "No attendance is kept for this person and no hours are priced. The salary is paid in full.",
    hourlyBreakdown: "{perHour} an hour · {perMinute} a minute",
    hours8: "8 hours",
    hours12: "12 hours",
    sunday: "Sunday",
    payClass: "Pay class",
    hourlyRate: "Hourly rate",
    tracking: "Attendance and pay",
    trackingTracked: "Tracked — attendance and salary",
    trackingSalaryOnly: "Salary only — no attendance kept",
    trackingExempt: "Neither — owner",
    trackingHint: "An owner draws nothing through this system and appears on no payroll run.",
    earnsOvertime: "Earns overtime",
    contractorNote:
      "Nothing is worked out. The agreed amount is paid in full — no proration for days missed, no overtime, no late penalty.",
    // Four figures in one line, and Urdu puts the division the other way
    // round, so it is one template rather than a sentence built in JSX.
    dailyBreakdown:
      "{perDay} a day ({salary} ÷ {days}) · {perHour} an overtime hour (÷ 8) · overtime past {duty}h, capped at 4h a working day, uncapped on a Sunday.",
    swipeSave: "Swipe to save {name}’s pay",
    componentsTitle: "Allowances and deductions",
    nothingAttached: "Nothing attached yet.",
    componentNamePlaceholder: "Advance recovery",
    amount: "Amount",
    lineName: "Name",
    kind: "Kind",
    deduction: "Deduction",
    allowance: "Allowance",
    swipeAttach: "Swipe to attach this line",
    attaching: "Attaching…",
    removeLine: "Remove {name}",
  },
  /**
   * User accounts: who exists, what they are paid, and what they may open.
   *
   * Three separate dialogs behind one card, and the wording keeps them apart
   * on purpose — a correction to a spelling must never sit in the same swipe
   * as a change to somebody’s salary.
   *
   * A person’s name, employee code, CNIC, department, factory and shift are
   * all rows. They are wrapped rather than translated, and a CNIC especially:
   * one reordered by the bidirectional algorithm is a different CNIC.
   */
  users: {
    title: "User accounts · {count}",
    hint: "Everyone who can sign in. The employee code is also their K50 fingerprint ID.",
    addUser: "Add user",
    searchPeople: "Search people",
    everyRole: "Every role",
    anyStatus: "Any status",
    cannotSignIn: "Cannot sign in — no CNIC",
    noCnic: "No CNIC — cannot sign in",
    customAccessCount: "{count} custom access changes",
    // Selecting people, and changing them together.
    selectPerson: "Select {name}",
    selectAllShown: "Select all shown",
    selectedCount: "{count} selected",
    bulkAction: "What to change",
    bulkValue: "Change it to",
    applyToSelected: "Apply",
    clearSelection: "Clear the selection",
    // Confirming with your own password. Said differently for each action,
    // because the reason differs — one hands an account over, one takes a
    // person off the payroll.
    confirmWithPassword: "Your password",
    passwordWhyReset:
      "Your own password, because whoever holds the new one can sign in as this person.",
    passwordWhySuspend:
      "Your own password. A suspended account cannot sign in and drops off the payroll run.",
    passwordWhyBulk: "Your own password, because this changes every person selected above.",
    editProfile: "Edit profile",
    noRole: "No role",
    customAccess: "Custom access",
    payAndDuty: "Pay and duty",
    reactivate: "Reactivate",
    suspend: "Suspend",
    swipeSetRole: "Swipe to set {name}’s role",
    updatingRole: "Changing the role…",
    signOutWarning: "They will be signed out, and must sign in again for this to take effect.",
    swipeReactivate: "Swipe to reactivate",
    swipeSuspend: "Swipe to suspend",
    reactivating: "Reactivating…",
    suspending: "Suspending…",
    setPassword: "Set password",
    newPasswordFor: "New password for {name}",
    swipeSetPassword: "Swipe to set {name}’s password",
    settingPassword: "Setting the password…",
    atLeast8: "At least 8 characters.",
    // Adding somebody.
    addTitle: "Add a user",
    addHint:
      "The employee code is used as their ZKTeco K50 fingerprint ID — enrol them on the terminal with the same number and the punches link themselves.",
    fullName: "Full name",
    fullNamePlaceholder: "Imran Sheikh",
    employeeCode: "Employee code / K50 ID",
    cnic: "CNIC (sign-in)",
    tempPassword: "Temporary password",
    passwordPlaceholder: "At least 8 characters",
    email: "Email (optional)",
    phone: "Phone",
    designation: "Designation",
    designationPlaceholder: "Loom Operator",
    role: "Role",
    roleAssignedElsewhere: "Assigned by somebody who manages access.",
    shift: "Shift",
    noShift: "No shift — must complete duty hours",
    // `{name}` is the department’s own name; the suffix marks a contracted one.
    contractorDepartment: "{name} (contractors)",
    noShiftHint:
      "Somebody with no shift is never marked late and their check-out is never rounded. Their hours and overtime are still counted from the punches.",
    paidAs: "Paid as",
    employeeFromAttendance: "Employee — worked out from attendance",
    contractorFlat: "Contractor — flat agreed amount",
    salaryCovers: "Salary covers",
    noAttendanceNeeded: "No attendance needed — salary paid in full",
    noAttendanceHint:
      "No attendance is kept for this person and no hours are priced. The salary is paid in full.",
    perHourLine: "{perHour} an hour · {perMinute} a minute",
    hours8Overtime: "8 hours — anything past that is overtime",
    hours12NoOvertime: "12 hours — all twelve are duty, no overtime",
    sunday: "Sunday",
    sundayOff: "Off — not expected in",
    sundayOptional: "Optional — may come in",
    sundayCompulsory: "Compulsory — expected in",
    sundayAdjust: "Adjusted against leave — not paid",
    sundayHint:
      "Sunday is never a working day. Every hour worked on one is overtime, whatever this says.",
    payType: "Pay type",
    hourlyWage: "Hourly wage",
    monthlySalaryOption: "Monthly salary",
    monthlySalaryField: "Monthly salary (₨)",
    hourlyRateField: "Hourly rate (₨)",
    createUser: "Create user",
    // Editing somebody.
    editTitle: "Edit profile · {name}",
    editHint:
      "Name, employee code, contact details and placement. Pay, duty terms and access are changed from their own buttons on the card.",
    saveChanges: "Save changes",
    // Custom access.
    accessTitle: "Custom access · {name}",
    accessHint:
      "On top of the {role} role. Use this to give one person something extra, or take something away, without creating a new role.",
    useRole: "Use role",
    grant: "Grant",
    deny: "Deny",
    // Pay and duty.
    payTitle: "Pay and duty · {name}",
    agreedAmountPkr: "Agreed amount (PKR)",
    monthlySalaryPkr: "Monthly salary (PKR)",
    hourlyRatePkr: "Hourly rate (PKR)",
    hourlyOnlyHint: "Only used for staff paid by the hour.",
    payClass: "Pay class",
    tracking: "Attendance and pay",
    trackingTracked: "Tracked — attendance and salary",
    trackingSalaryOnly: "Salary only — no attendance kept",
    trackingExempt: "Neither — owner",
    trackingHint: "An owner draws nothing through this system and appears on no payroll run.",
    earnsOvertime: "Earns overtime",
    earnsOvertimeHint: "Unticked, hours past the duty boundary are recorded but never paid.",
    contractorNote:
      "Nothing is worked out for a contractor. They receive the agreed amount in full — no proration for days missed, no overtime, no late penalty.",
    perDayLine: "{amount} a day ({salary} ÷ {days} days this month)",
    perOvertimeHourLine: "{amount} an overtime hour (the daily rate ÷ 8)",
    overtimeBoundary: "Past {hours} hours on a weekday, and every hour on a Sunday.",
    swipeSavePay: "Swipe to save the pay settings",
    componentsTitle: "Allowances and deductions",
    componentsHint: "Applied to this person only, every period, until removed.",
    componentFrom: "From {from}",
    componentFromTo: "From {from} to {to}",
    componentOngoing: "From {from} — ongoing",
    nothingAttached: "Nothing attached to this person yet.",
    needNameAndAmount: "Enter a name and an amount to attach it.",
  },
  /**
   * Roles, and what each may do.
   *
   * A role’s own name and description are rows — the office writes them — and
   * so are the capability labels, which come out of the permission catalogue.
   * What is translated here is the screen around them.
   */
  roles: {
    title: "Roles",
    hint: "Pick a role to change what it can do, or create a new one",
    unrestricted: "Unrestricted",
    capabilities: "{count} capabilities",
    heldBy: "{count} people",
    newRoleName: "New role name",
    newRolePlaceholder: "Payroll Officer",
    whatFor: "What it is for",
    whatForPlaceholder: "Runs payroll but cannot change access",
    createRole: "Create role",
    creating: "Creating…",
    whatCanDo: "What {role} can do",
    superuserHint: "This role holds every capability and cannot be restricted",
    toggleHint: "Tap a capability to grant it or take it away — the change takes effect at once",
    deleteRole: "Delete role",
    superuserNote:
      "{role} is an unrestricted role. Every capability is granted implicitly, so it can never be locked out of this screen by an accidental edit.",
  },
  profile: {
    title: "My profile",
    subtitle: "Your record as the office holds it",
    fullName: "Name",
    employeeCode: "Employee code",
    cnic: "CNIC",
    phone: "Phone",
    email: "Email",
    designation: "Designation",
    noDesignation: "No designation",
    // `Factory` moved to `common.site` when the canteen settings form became
    // the second screen to label one. This screen reads it from there.
    shift: "Shift",
    joinedOn: "Joined on",
    payType: "Pay type",
    monthlySalary: "Monthly salary",
    hourlyWage: "Hourly wage",
    hourlyRate: "Hourly rate",
    clockInRequired: "Clock-in required",
    notRecorded: "Not recorded",
    managedByAdmin:
      "These details are managed by your administrator. Contact them to make a change.",
    // Nothing on this screen is editable by the person reading it — the
    // office owns the record — so it says plainly who to reach instead of
    // leaving somebody hunting for a button that does not exist.
    contactTitle: "Need something changed here?",
    contactBody:
      "Everything on this screen except the language is kept by the office. To have any of it corrected, call or email — do not wait for it to appear on a payslip.",
    contactCall: "Call {number}",
    contactEmail: "Email {address}",
    language: "Language",
    languageHint: "Changes every screen. Names and numbers stay as they are.",
    languageSaved: "Language changed.",
    languageFailed: "Could not change the language.",
  },
};

export default en;
