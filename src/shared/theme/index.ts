export const colors = {
  primary: '#1A2B4A',
  primaryLight: '#2C3E5A',
  primaryDark: '#14213A',
  secondary: '#2ECC71',
  secondaryDark: '#27AE60',
  accent: '#F5A623',
  blue: '#3498DB',
  purple: '#9B59B6',
  teal: '#16A085',
  orange: '#E67E22',
  indigo: '#4F46E5',
  indigoDark: '#4338CA',
  success: '#2ECC71',
  warning: '#F5A623',
  error: '#E74C3C',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  text: '#1A2B4A',
  textSecondary: '#717182',
  border: '#E9EBEF',
  disabled: '#CBD5E1',
  glassLight: 'rgba(255, 255, 255, 0.1)',
  glassBorder: 'rgba(255, 255, 255, 0.2)',
  glassSurface: 'rgba(255, 255, 255, 0.8)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 14, fontWeight: '400' as const },
  small: { fontSize: 12, fontWeight: '400' as const },
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
};

/** Tints a theme hex color to an rgba() string, e.g. for `bg-{color}/10` chips and panels. */
export function withAlpha(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
