import { Easing, Platform, TextStyle, ViewStyle } from 'react-native';

/**
 * Design tokens.
 *
 * The palette is built from ramps rather than one-off hex values, so tints
 * ("this but at 10%") and text-safe variants ("this but readable on white")
 * are lookups instead of guesses. Every ramp step below is a fixed value; the
 * `*Text` aliases in `colors` are the steps measured at >= 4.5:1 on
 * `colors.surface`, which is what makes them safe for label/link text.
 *
 * Naming stays backward compatible with the pre-redesign theme (`colors.primary`,
 * `colors.secondary`, ...) so screens pick up the new values without churn.
 */

/* ------------------------------------------------------------------ ramps */

/** Brand indigo. Headers, primary actions, focus rings. */
export const indigo = {
  50: '#EEF2FF',
  100: '#E0E7FF',
  200: '#C7D2FE',
  300: '#A5B4FC',
  400: '#818CF8',
  500: '#6366F1',
  600: '#4F46E5',
  700: '#4338CA',
  800: '#3730A3',
  900: '#312E81',
  950: '#1E1B4B',
} as const;

/** Emerald. Success, attendance-marked, progress fills. */
export const emerald = {
  50: '#ECFDF5',
  100: '#D1FAE5',
  200: '#A7F3D0',
  300: '#6EE7B7',
  400: '#34D399',
  500: '#10B981',
  600: '#059669',
  700: '#047857',
  800: '#065F46',
  900: '#064E3B',
} as const;

/** Amber. Warnings, pending states, breaks. */
export const amber = {
  50: '#FFFBEB',
  100: '#FEF3C7',
  200: '#FDE68A',
  300: '#FCD34D',
  400: '#FBBF24',
  500: '#F59E0B',
  600: '#D97706',
  700: '#B45309',
  800: '#92400E',
  900: '#78350F',
} as const;

/** Red. Errors, destructive actions, sync failures. */
export const red = {
  50: '#FEF2F2',
  100: '#FEE2E2',
  200: '#FECACA',
  300: '#FCA5A5',
  400: '#F87171',
  500: '#EF4444',
  600: '#DC2626',
  700: '#B91C1C',
  800: '#991B1B',
  900: '#7F1D1D',
} as const;

/** Blue. Informational states, student-facing accents. */
export const blue = {
  50: '#EFF6FF',
  100: '#DBEAFE',
  200: '#BFDBFE',
  300: '#93C5FD',
  400: '#60A5FA',
  500: '#3B82F6',
  600: '#2563EB',
  700: '#1D4ED8',
  800: '#1E40AF',
  900: '#1E3A8A',
} as const;

/** Violet. Marks / assessment accent. */
export const violet = {
  50: '#F5F3FF',
  100: '#EDE9FE',
  200: '#DDD6FE',
  300: '#C4B5FD',
  400: '#A78BFA',
  500: '#8B5CF6',
  600: '#7C3AED',
  700: '#6D28D9',
  800: '#5B21B6',
  900: '#4C1D95',
} as const;

/** Teal. Diary / secondary content accent. */
export const teal = {
  50: '#F0FDFA',
  100: '#CCFBF1',
  200: '#99F6E4',
  300: '#5EEAD4',
  400: '#2DD4BF',
  500: '#14B8A6',
  600: '#0D9488',
  700: '#0F766E',
  800: '#115E59',
  900: '#134E4A',
} as const;

/** Slate. Text, borders, backgrounds, camera chrome. */
export const slate = {
  0: '#FFFFFF',
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
  950: '#020617',
} as const;

/* ----------------------------------------------------------------- colors */

export const colors = {
  /* Brand */
  primary: indigo[600],
  primaryLight: indigo[500],
  primaryDark: indigo[800],
  /** Deepest brand step — the anchor stop on header gradients. */
  primaryDeep: indigo[950],
  /** Brand at a readable weight on white. 6.30:1. */
  primaryText: indigo[600],
  primarySoft: indigo[50],

  /* Accent (green) — historically `secondary`. */
  secondary: emerald[500],
  secondaryDark: emerald[600],
  secondarySoft: emerald[50],

  /* Semantic fills. Use these for backgrounds, bars, and >=24px icons. */
  success: emerald[500],
  warning: amber[500],
  error: red[500],
  info: blue[500],

  /**
   * Semantic text. Use these — never the fill above — for any text or icon
   * under 24px on a light surface. Each is measured >= 4.5:1 on `surface`:
   * success 5.55:1, warning 5.05:1, error 6.54:1, info 6.71:1.
   */
  successText: emerald[700],
  warningText: amber[700],
  errorText: red[700],
  infoText: blue[700],

  /** Semantic tints for pill/banner backgrounds. */
  successSoft: emerald[50],
  warningSoft: amber[50],
  errorSoft: red[50],
  infoSoft: blue[50],

  /* Module accents — see `moduleAccent` for the per-screen mapping. */
  blue: blue[500],
  purple: violet[500],
  teal: teal[500],
  orange: amber[500],
  indigo: indigo[600],
  indigoDark: indigo[700],
  accent: amber[500],

  /* Surfaces */
  background: slate[100],
  surface: slate[0],
  /** Recessed surface — inputs, track fills, inset rows on a white card. */
  surfaceSunken: slate[50],
  /** Raised surface used on dark/camera backgrounds. */
  surfaceInverse: slate[800],

  /* Text */
  text: slate[900],
  textSecondary: slate[500],
  textTertiary: slate[400],
  textInverse: slate[0],

  /* Lines & disabled */
  border: slate[200],
  borderStrong: slate[300],
  disabled: slate[300],
  disabledText: slate[400],

  /* Glass (on-dark chrome) */
  glassLight: 'rgba(255, 255, 255, 0.12)',
  glassBorder: 'rgba(255, 255, 255, 0.22)',
  glassSurface: 'rgba(255, 255, 255, 0.82)',

  /* Camera / scanner chrome */
  cameraBackdrop: slate[900],
  scrim: 'rgba(2, 6, 23, 0.55)',
  /**
   * Bases for `withAlpha` overlays drawn over imagery or a camera preview.
   * `overlayLight` for chrome that must read against a dark scene,
   * `overlayDark` for scrims that darken a bright one.
   */
  overlayLight: slate[0],
  overlayDark: slate[950],
} as const;

/* -------------------------------------------------------------- gradients */

/**
 * Named header/CTA gradients. Screens reference these instead of inlining
 * stop pairs, which is what previously produced five unrelated accent
 * families across the app.
 */
export const gradients = {
  brand: [indigo[900], indigo[600], indigo[700]] as [string, string, string],
  brandFlat: [indigo[800], indigo[600]] as [string, string],
  success: [emerald[700], emerald[500]] as [string, string],
  info: [blue[700], blue[500]] as [string, string],
  warning: [amber[600], amber[500]] as [string, string],
  violet: [violet[700], violet[500]] as [string, string],
  teal: [teal[700], teal[500]] as [string, string],
  danger: [red[700], red[500]] as [string, string],
  /** Full-bleed camera backdrop. */
  camera: [slate[800], slate[950]] as [string, string],
  /** Soft tinted panel behind the GPS map/status blocks. */
  calm: [blue[50], emerald[50]] as [string, string],
};

/**
 * Per-module accent assignment. One place to answer "what colour is this
 * screen?", so adding a module is a decision recorded here rather than a hex
 * value invented in a screen file.
 */
export const moduleAccent = {
  /**
   * The five bottom-tab destinations each take a DISTINCT hue, so the tab bar
   * can colour itself per tab and the colour a user taps is the colour of the
   * screen they land on. Non-tab modules may reuse a hue — they are never on
   * screen next to each other.
   */
  home: { solid: indigo[600], text: indigo[600], gradient: gradients.brand },
  attendance: { solid: emerald[500], text: emerald[700], gradient: gradients.success },
  leave: { solid: amber[500], text: amber[700], gradient: gradients.warning },
  timetable: { solid: blue[500], text: blue[700], gradient: gradients.info },
  profile: { solid: violet[500], text: violet[700], gradient: gradients.violet },

  /* Pushed screens, reached from Home's quick actions or Profile. */
  marks: { solid: violet[500], text: violet[700], gradient: gradients.violet },
  diary: { solid: teal[500], text: teal[700], gradient: gradients.teal },
  students: { solid: blue[500], text: blue[700], gradient: gradients.info },
  announcements: { solid: amber[500], text: amber[700], gradient: gradients.warning },
  admin: { solid: indigo[600], text: indigo[600], gradient: gradients.brand },
} as const;

export type ModuleAccentKey = keyof typeof moduleAccent;

/* ---------------------------------------------------------------- spacing */

/** 4pt grid. `smd` fills the 12px step the old scale was missing. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  smd: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

/* ------------------------------------------------------------- typography */

/**
 * Every style carries an explicit `lineHeight`. React Native's per-platform
 * default line height is what made the dense screens feel cramped, and it
 * differs between iOS and Android for the same `fontSize`.
 */
export const typography = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '800' as const, letterSpacing: -0.6 },
  h1: { fontSize: 26, lineHeight: 33, fontWeight: '700' as const, letterSpacing: -0.4 },
  h2: { fontSize: 22, lineHeight: 29, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.2 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.1 },
  bodyLg: { fontSize: 17, lineHeight: 25, fontWeight: '400' as const, letterSpacing: 0 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, letterSpacing: 0 },
  bodyBold: { fontSize: 15, lineHeight: 22, fontWeight: '600' as const, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, letterSpacing: 0 },
  captionBold: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0 },
  /** Section eyebrows and field labels. Pair with `textTransform: 'uppercase'`. */
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.6 },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0 },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '500' as const, letterSpacing: 0.2 },
  /** Tabular-ish numerals for stat tiles and countdowns. */
  stat: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const, letterSpacing: -0.8 },
} satisfies Record<string, TextStyle>;

/* ----------------------------------------------------------------- radius */

export const borderRadius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
} as const;

/* ---------------------------------------------------------------- shadows */

/**
 * Elevation tokens. Shadows are tinted with slate-900 rather than pure black —
 * a neutral-black shadow over a cool grey background reads muddy.
 *
 * Android only honours `elevation`, iOS only the `shadow*` fields, so each
 * level sets both and they are tuned to match visually rather than numerically.
 */
function shadow(
  opacity: number,
  radius: number,
  offsetY: number,
  elevation: number,
): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: slate[900],
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation, shadowColor: slate[900] },
    default: {
      shadowColor: slate[900],
      shadowOffset: { width: 0, height: offsetY },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
  }) as ViewStyle;
}

export const shadows = {
  none: {} as ViewStyle,
  /** Hairline lift — list rows, inline chips. */
  xs: shadow(0.04, 3, 1, 1),
  /** Resting cards. */
  sm: shadow(0.06, 8, 2, 2),
  /** Primary content cards, the header's overlapping status card. */
  md: shadow(0.1, 16, 6, 6),
  /** Sheets, floating action bars, modals. */
  lg: shadow(0.16, 28, 12, 12),
  /** Pressed-state cards lift toward this. */
  xl: shadow(0.22, 40, 18, 20),
} as const;

export type ShadowLevel = keyof typeof shadows;

/* ----------------------------------------------------------------- motion */

export const motion = {
  duration: {
    instant: 100,
    fast: 160,
    normal: 240,
    slow: 360,
    slower: 520,
  },
  easing: {
    /** Default for most UI transitions. */
    standard: Easing.bezier(0.2, 0, 0, 1),
    /** Entering the screen. */
    decelerate: Easing.out(Easing.cubic),
    /** Leaving the screen. */
    accelerate: Easing.in(Easing.cubic),
    /** Attention-seeking (scan pulse, success check). */
    emphasized: Easing.bezier(0.34, 1.56, 0.64, 1),
  },
  /** Scale a card/button settles to while held. */
  pressScale: 0.97,
} as const;

/* ------------------------------------------------------------------ misc */

/** Minimum interactive size. Below this, targets fail WCAG 2.1 AA (2.5.5). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH_TARGET = 44;

/* -------------------------------------------------------------- utilities */

/**
 * Tints a hex color to an `rgba()` string, e.g. for `bg-{color}/10` chips and
 * panels. Accepts 3- or 6-digit hex, with or without a leading `#`.
 */
export function withAlpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map(c => c + c)
          .join('')
      : clean;
  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
