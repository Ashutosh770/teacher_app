import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Announcement } from '../../../shared/types';

interface AnnouncementState {
  announcements: Announcement[];
  filter: {
    priority: string | null;
    readStatus: 'all' | 'read' | 'unread';
    category: string | null;
  };
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
}

const initialState: AnnouncementState = {
  announcements: [],
  filter: {
    priority: null,
    readStatus: 'all',
    category: null,
  },
  isLoading: false,
  error: null,
  isSubmitting: false,
};

const announcementSlice = createSlice({
  name: 'announcement',
  initialState,
  reducers: {
    setAnnouncements(state, action: PayloadAction<Announcement[]>) {
      state.announcements = action.payload;
    },
    addAnnouncement(state, action: PayloadAction<Announcement>) {
      state.announcements.unshift(action.payload);
    },
    markAsRead(state, action: PayloadAction<string>) {
      const announcement = state.announcements.find(a => a.id === action.payload);
      if (announcement) {
        announcement.isRead = true;
      }
    },
    setFilter(state, action: PayloadAction<Partial<AnnouncementState['filter']>>) {
      state.filter = { ...state.filter, ...action.payload };
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setSubmitting(state, action: PayloadAction<boolean>) {
      state.isSubmitting = action.payload;
    },
  },
});

export const {
  setAnnouncements,
  addAnnouncement,
  markAsRead,
  setFilter,
  setLoading,
  setError,
  setSubmitting,
} = announcementSlice.actions;

export default announcementSlice.reducer;
