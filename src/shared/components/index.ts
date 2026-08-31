/**
 * Shared UI primitives.
 *
 * Screens should compose from here rather than hand-rolling `TouchableOpacity`
 * + a local StyleSheet — that pattern is what produced eleven different card
 * shadows and three different button heights before the redesign.
 */

/* Foundations */
export { default as Pressable, type PressableScaleProps } from './Pressable';

/* Layout & containers */
export { default as Card, type CardProps, type CardPadding } from './Card';
export { default as GlassCard, type GlassCardProps } from './GlassCard';
export { default as ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';
export { default as SectionHeader, type SectionHeaderProps } from './SectionHeader';

/* Controls */
export { default as Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { default as Input, type InputProps } from './Input';

/* Display */
export { default as StatusPill, type StatusPillProps, type StatusPillTone, type StatusPillSize } from './StatusPill';
export { default as ProgressBar, type ProgressBarProps } from './ProgressBar';
export { default as IconChip, type IconChipProps } from './IconChip';
export { default as StatTile, type StatTileProps } from './StatTile';
export { default as SyncStatusBadge, type SyncStatusBadgeProps } from './SyncStatusBadge';

/* States */
export { default as EmptyState, type EmptyStateProps, type EmptyStateTone } from './EmptyState';
export { default as Skeleton, SkeletonCard, SkeletonList, type SkeletonProps } from './Skeleton';
export { default as BrandSplash, type BrandSplashProps } from './BrandSplash';

/* Guards */
export { default as PermissionGate, type PermissionGateProps } from './PermissionGate';
export { ErrorBoundary } from './ErrorBoundary';
