import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User, Session } from '../../../shared/types';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  failedAttempts: number;
  lockoutUntil: number | null;
}

const initialState: AuthState = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  failedAttempts: 0,
  lockoutUntil: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart(state) {
      state.isLoading = true;
      state.error = null;
    },
    loginSuccess(state, action: PayloadAction<Session>) {
      state.isLoading = false;
      state.session = action.payload;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.failedAttempts = 0;
      state.lockoutUntil = null;
      state.error = null;
    },
    loginFailure(state, action: PayloadAction<string>) {
      state.isLoading = false;
      state.error = action.payload;
      state.failedAttempts += 1;
      if (state.failedAttempts >= 5) {
        state.lockoutUntil = Date.now() + 60000;
      }
    },
    logout(state) {
      state.user = null;
      state.session = null;
      state.isAuthenticated = false;
      state.error = null;
    },
    sessionExpired(state) {
      state.isAuthenticated = false;
      state.session = null;
      state.error = 'Session expired. Please log in again.';
    },
    clearError(state) {
      state.error = null;
    },
    resetLockout(state) {
      state.failedAttempts = 0;
      state.lockoutUntil = null;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  sessionExpired,
  clearError,
  resetLockout,
} = authSlice.actions;

export default authSlice.reducer;
