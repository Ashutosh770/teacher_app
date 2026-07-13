/**
 * Class diary service — owns mock entry seeding, posting, and the 24h
 * edit/delete lock window, keeping that logic out of the screen component
 * (mirrors `leaveManagementService`). There is no backend yet, so this is a
 * self-contained mock data source, the same approach `mockAuthService` uses.
 */
import { store } from '../../../store';
import type { DiaryEntry } from '../../../shared/types';
import { addEntry, deleteEntry, setEntries } from '../state/classDiarySlice';

/** Entries can be edited/deleted for this long after posting, then lock. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

let seeded = false;

/** Seeds a few mock diary entries so the screen isn't empty on first load. */
export function loadDiaryEntries(): void {
  if (seeded) return;
  seeded = true;

  const now = Date.now();
  const entries: DiaryEntry[] = [
    {
      id: 'diary-seed-1',
      date: '2026-04-12',
      classId: 'X-A',
      className: 'Class X-A',
      subject: 'Mathematics',
      topicsCovered: 'Complete exercises 3.1 to 3.5 from Chapter 3: Quadratic Equations.',
      homework: 'Practice word problems especially.',
      isFinalized: false,
      postedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      attachmentName: 'worksheet_ch3.pdf',
    },
    {
      id: 'diary-seed-2',
      date: '2026-04-11',
      classId: 'IX-A',
      className: 'Class IX-A',
      subject: 'Algebra',
      topicsCovered: 'Solve all problems from Exercise 2.3.',
      homework: 'Prepare for unit test next week on Linear Equations.',
      isFinalized: true,
      postedAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'diary-seed-3',
      date: '2026-04-10',
      classId: 'X-B',
      className: 'Class X-B',
      subject: 'Geometry',
      topicsCovered: 'Study theorems from Chapter 6: Triangles.',
      homework: 'Draw diagrams for all theorems in your notebook.',
      isFinalized: true,
      postedAt: new Date(now - 50 * 60 * 60 * 1000).toISOString(),
      attachmentName: 'triangle_theorems.pdf',
    },
  ];
  store.dispatch(setEntries(entries));
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

function generateEntryId(): string {
  return `diary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function postDiaryEntry(input: NewDiaryEntryInput): PostEntryResult {
  if (!input.topicsCovered.trim() && !input.homework.trim()) {
    return { ok: false, error: 'Enter homework or class notes.' };
  }
  const entry: DiaryEntry = {
    id: generateEntryId(),
    date: input.date,
    classId: input.classId,
    className: input.className,
    subject: input.subject,
    topicsCovered: input.topicsCovered.trim(),
    homework: input.homework.trim() || undefined,
    isFinalized: false,
    postedAt: new Date().toISOString(),
    attachmentName: input.attachmentName,
  };
  store.dispatch(addEntry(entry));
  return { ok: true };
}

export function removeDiaryEntry(id: string): void {
  store.dispatch(deleteEntry(id));
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
