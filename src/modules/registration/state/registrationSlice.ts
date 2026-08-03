/**
 * Registration gate state.
 *
 * Resolved once after login and refreshed whenever a step completes, so the
 * navigator can hold a signed-in user on the registration flow until they are
 * actually able to mark attendance.
 *
 * `status` starts as 'unknown' rather than defaulting to "registered". The
 * navigator waits on it instead of guessing — assuming registration and being
 * wrong drops the user into the app with no way to reach the consent screen,
 * whereas assuming the opposite would flash a consent prompt at every already-
 * registered user on every launch.
 */
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  fetchRegistrationStatus,
  type RegistrationStatus,
  type RegistrationStep,
} from '../../../shared/services/registration';

interface RegistrationState {
  status: 'unknown' | 'loading' | 'ready' | 'error';
  data: RegistrationStatus | null;
  error: string | null;
}

const initialState: RegistrationState = {
  status: 'unknown',
  data: null,
  error: null,
};

export const loadRegistrationStatus = createAsyncThunk(
  'registration/load',
  async (_: void, { rejectWithValue }) => {
    const response = await fetchRegistrationStatus();
    if (!response.success || !response.data) {
      return rejectWithValue(response.error ?? 'Could not check registration status');
    }
    return response.data;
  }
);

const registrationSlice = createSlice({
  name: 'registration',
  initialState,
  reducers: {
    /** Clear on logout so the next user is never gated on the previous one's state. */
    resetRegistration() {
      return initialState;
    },
    /**
     * Optimistic local advance, used after a step succeeds so the navigator moves
     * on immediately. The authoritative value still arrives from the next
     * `loadRegistrationStatus`; this only avoids a visible stall between
     * finishing consent and the consent screen disappearing.
     */
    setNextStep(state, action: PayloadAction<RegistrationStep>) {
      if (state.data) {
        state.data.nextStep = action.payload;
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadRegistrationStatus.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadRegistrationStatus.fulfilled, (state, action) => {
        state.status = 'ready';
        state.data = action.payload;
      })
      .addCase(loadRegistrationStatus.rejected, (state, action) => {
        state.status = 'error';
        state.error = (action.payload as string) ?? 'Could not check registration status';
      })
      // Matched by action type rather than by importing authSlice, which would
      // create a cycle (auth → store → registration → auth). Without this, the
      // next user to sign in on a shared tablet would be gated on the previous
      // user's registration state — and on a device shared between teachers,
      // that means either a spurious consent prompt or none at all.
      .addMatcher(
        action => action.type === 'auth/logout',
        () => initialState
      );
  },
});

export const { resetRegistration, setNextStep } = registrationSlice.actions;
export default registrationSlice.reducer;
