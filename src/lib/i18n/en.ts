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
    devices: "Biometric Devices",
    liveFloor: "Live Floor",
    rates: "Pay Rates",
    canteen: "Canteen",
    canteenSettings: "Canteen Settings",
    reports: "Reports",
    payroll: "Payroll",
    users: "User Accounts",
    roles: "Roles & Access",
    myProfile: "My Profile",
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
  },
  /**
   * Database enum values that reach the screen as badge or field text, keyed by
   * enum then by value so a row's column can be looked up directly. The members
   * are exactly those declared in the migrations — `payroll_status`,
   * `device_status`, `employment_status` and `attendance_status`. Adding a
   * member to an enum without adding it here is a typecheck error in the two
   * translations, not a blank badge.
   */
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
    site: "Factory",
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
    language: "Language",
    languageHint: "Changes every screen. Names and numbers stay as they are.",
    languageSaved: "Language changed.",
    languageFailed: "Could not change the language.",
  },
};

export default en;
