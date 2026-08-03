/**
 * Face-registration status — what a signed-in user must do before they can use
 * face attendance.
 *
 * Answered by a single backend call because registration has two prerequisites,
 * consent and enrollment, and they must be checked in that order. Checking only
 * for an enrollment record (as the older staff enrollment guard does) would send
 * an unconsented user to the camera, where the backend's enroll gate rejects
 * them after they have already posed for photos.
 *
 * Branch on `nextStep`; the rest of the payload is for rendering.
 */
import { apiService } from './api';
import type { ApiResponse } from '../types';

export type RegistrationStep = 'consent' | 'capture' | 'none';

export interface ConsentPurposeDescription {
  key: 'BIOMETRIC_PROCESSING' | 'PHOTO_RETENTION';
  label: string;
  description: string;
  /** Enrollment is impossible without this; the other is genuinely optional. */
  required: boolean;
}

export interface ConsentNotice {
  version: string;
  /** Placeholder wording. The UI must not present a draft as a real consent form. */
  isDraft: boolean;
  title: string;
  body: string;
  purposes: ConsentPurposeDescription[];
}

export interface RegistrationStatus {
  personId: string;
  personType: 'staff';
  isRegistered: boolean;
  imageCount: number | null;
  registeredAt: string | null;
  consent: {
    granted: boolean;
    purposes: string[];
    noticeVersion: string | null;
    /** Consent was given against superseded wording; re-present the notice. */
    noticeOutOfDate: boolean;
  };
  nextStep: RegistrationStep;
  /** Present when the notice needs showing, so the consent screen needs no second call. */
  notice: ConsentNotice | null;
}

export async function fetchRegistrationStatus(): Promise<ApiResponse<RegistrationStatus>> {
  return apiService.get<RegistrationStatus>('/faces/me/registration');
}

export async function grantConsent(
  purposes: string[],
  noticeVersion: string
): Promise<ApiResponse<{ id: string }>> {
  return apiService.post<{ id: string }>('/biometric-consent', { purposes, noticeVersion });
}
