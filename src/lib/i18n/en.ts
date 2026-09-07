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
    devicePurpose: {
      attendance: "Attendance",
      canteen: "Canteen",
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
    language: "Language",
    languageHint: "Changes every screen. Names and numbers stay as they are.",
    languageSaved: "Language changed.",
    languageFailed: "Could not change the language.",
  },
};

export default en;
