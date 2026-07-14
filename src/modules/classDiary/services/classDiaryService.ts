/**
 * Class diary service — owns loading entries, posting, and the 24h
 * edit/delete lock window, keeping that logic out of the screen component
 * (mirrors `leaveManagementService`). Backed by the real `/class-diary`
 * endpoints; the 24h window is enforced both here (for the UI) and
 * server-side (`ClassDiaryService.deleteDiary`).
 */
import { store } from '../../../store';
import { apiService } from '../../../shared/services/api';
import type { DiaryEntry } from '../../../shared/types';
import { addEntry, deleteEntry, setEntries } from '../state/classDiarySlice';

/** Entries can be edited/deleted for this long after posting, then lock. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

interface BackendDiaryEntry {
  id: string;
  teacherId: string;
  classId: string;
  subject: string;
  topic: string;
  description: string | null;
  homework: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  date: string;
  createdAt: string;
}

function classNameFor(classId: string): string {
  return `Class ${classId}`;
}

function toDiaryEntry(entry: BackendDiaryEntry): DiaryEntry {
  return {
    id: entry.id,
    date: entry.date,
    classId: entry.classId,
    className: classNameFor(entry.classId),
    subject: entry.subject,
    topicsCovered: entry.topic,
    homework: entry.homework ?? undefined,
    isFinalized: false,
    postedAt: entry.createdAt,
    attachmentName: entry.attachmentName ?? undefined,
  };
}

/** Fetches diary entries for the signed-in teacher. */
export async function loadDiaryEntries(): Promise<void> {
  const response = await apiService.get<BackendDiaryEntry[]>('/class-diary');
  if (!response.success || !response.data) {
    return;
  }
  store.dispatch(setEntries(response.data.map(toDiaryEntry)));
}

export interface NewDiaryEntryInput {
  classId: string;
  className: string;
  subject: string;
  date: string;
  topicsCovered: string;
  homework: string;
  attachmentName?: string;
}

export type PostEntryResult = { ok: true } | { ok: false; error: string };

/** Posts a new diary entry (Req: create-entry form). */
export async function postDiaryEntry(input: NewDiaryEntryInput): Promise<PostEntryResult> {
  if (!input.topicsCovered.trim() && !input.homework.trim()) {
    return { ok: false, error: 'Enter homework or class notes.' };
  }

  const response = await apiService.post<BackendDiaryEntry>('/class-diary', {
    classId: input.classId,
    subject: input.subject,
    topic: input.topicsCovered.trim(),
    homework: input.homework.trim() || undefined,
    attachmentName: input.attachmentName,
    date: input.date,
  });

  if (!response.success || !response.data) {
    return { ok: false, error: response.error ?? 'Failed to post diary entry' };
  }

  store.dispatch(addEntry(toDiaryEntry(response.data)));
  return { ok: true };
}

export async function removeDiaryEntry(id: string): Promise<void> {
  const response = await apiService.delete(`/class-diary/${id}`);
  if (response.success) {
    store.dispatch(deleteEntry(id));
  }
}

/** Whether an entry is still within its 24h edit/delete window. */
export function isWithinEditWindow(entry: DiaryEntry): boolean {
  const posted = new Date(entry.postedAt).getTime();
  if (Number.isNaN(posted)) return false;
  return Date.now() - posted < EDIT_WINDOW_MS;
}

export function relativeTimeFromNow(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
