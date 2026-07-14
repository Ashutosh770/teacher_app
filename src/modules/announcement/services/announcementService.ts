/**
 * Announcement service — minimal data-layer wiring to the real
 * `/announcements` endpoint. `AnnouncementScreen.tsx` is still an unstyled
 * stub (out of scope for the earlier UI restyle pass); this just makes real
 * data available to it once it's built out.
 */
import { store } from '../../../store';
import { apiService } from '../../../shared/services/api';
import type { Announcement } from '../../../shared/types';
import { setAnnouncements, setError, setLoading } from '../state/announcementSlice';

interface BackendAnnouncement {
  id: string;
  title: string;
  content: string;
  targetRole: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
}

function capitalize<T extends string>(value: string): T {
  return (value.charAt(0).toUpperCase() + value.slice(1)) as T;
}

function toAnnouncement(a: BackendAnnouncement): Announcement {
  return {
    id: a.id,
    title: a.title,
    body: a.content,
    targetAudience: a.targetRole ?? 'all',
    priority: capitalize(a.priority),
    createdAt: a.createdAt,
    isRead: false,
  };
}

/** Fetches announcements visible to the signed-in user's role. */
export async function loadAnnouncements(): Promise<void> {
  store.dispatch(setLoading(true));
  const response = await apiService.get<BackendAnnouncement[]>('/announcements');
  if (!response.success || !response.data) {
    store.dispatch(setError(response.error ?? 'Failed to load announcements'));
    store.dispatch(setLoading(false));
    return;
  }
  store.dispatch(setAnnouncements(response.data.map(toAnnouncement)));
  store.dispatch(setError(null));
  store.dispatch(setLoading(false));
}
