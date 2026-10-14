/**
 * English — the launch catalogue. Keys are `area.thing`. A translation copies
 * this object and keeps every key; `{name}` placeholders stay as they are.
 */

export const EN = {
  // Navigation
  "nav.path": "Path",
  "nav.challenges": "Challenges",
  "nav.arena": "Arena",
  "nav.bench": "Bench",
  "nav.review": "Review",
  "nav.progress": "Progress",
  "nav.glossary": "Glossary",
  "nav.docs": "Docs",
  "nav.tracks": "Tracks",
  "nav.playground": "Playground",
  "nav.teach": "Teach",
  "nav.settings": "Settings",
  "nav.main": "Main",
  "nav.more": "More",
  "nav.otherPages": "Other pages",

  // Top bar
  "topbar.offline": "offline · still works",
  "topbar.offlineTitle": "The simulator, the grader and the tutor's rule engine all run on this device.",
  "topbar.streakTitle": "{days} days in a row",
  "topbar.streakDone": "{days}-day streak — safe for today",
  "topbar.streakRisk": "{days}-day streak — do one thing today to keep it",
  "topbar.streakStart": "Start a streak today",
  "topbar.puzzleWaiting": "Today's puzzle is waiting",
  "nav.daily": "Daily",
  "topbar.xp": "{xp} xp",
  "topbar.xpTitle": "Experience from nodes passed",
  "topbar.themeLabel": "Theme: {theme}. Switch to {other}.",
  "topbar.themeTitle": "Switch to {other}",
  "topbar.modeTitle": "Change how the app behaves",
  "topbar.signedInAs": "Signed in as {email}",
  "topbar.signIn": "Sign in",

  // Tutor dock
  "tutor.from.claude": "Claude",
  "tutor.from.gemini": "Gemini",
  "tutor.from.guide": "Built-in guide",
  "tutor.checked.physics": "corrected by the physics firewall",
  "tutor.checked.claim": "corrected by the claim check",
  "tutor.verified.claim": "✓ 1 claim checked against the simulator",
  "tutor.verified.claims": "✓ {n} claims checked against the simulator",
  "tutor.verified.physics": "✓ passed the physics firewall",
  "tutor.thinking": "The tutor is thinking",
  "tutor.related": "Related",
  "tutor.helpful": "Helpful?",
  "tutor.yes": "Yes",
  "tutor.no": "No",
  "tutor.thanks": "Thanks — noted.",
  "tutor.notHelpful": "Noted. Try asking it another way, or open the glossary.",
  "tutor.disclaimer": "The tutor can be wrong. The simulator is not.",

  // Command palette
  "palette.title": "Go to",
  "palette.placeholder": "A page, lesson, term or gate",
  "palette.search": "Search",
  "palette.results": "Results",
  "palette.empty": "Nothing by that name. Try a gate letter, a term, or a lesson title.",
  "palette.help": "↑ ↓ to choose · ↵ to go · esc to close",
  "palette.kind.page": "Page",
  "palette.kind.lesson": "Lesson",
  "palette.kind.challenge": "Challenge",
  "palette.kind.term": "Term",
  "palette.kind.gate": "Gate",
} as const;

export type MessageKey = keyof typeof EN;
