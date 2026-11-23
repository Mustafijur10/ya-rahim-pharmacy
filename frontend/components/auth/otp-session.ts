/**
 * Hand-off between Log in / Create account and the Verify page.
 * Kept in sessionStorage (this tab only); never contains the code itself.
 */
export type PendingOtp = {
  phone: string;
  mode: "login" | "register";
  next?: string | null;
  remember: boolean;
  name?: string;
  email?: string;
  delivery_area_id?: number | null;
  sms_reminders?: boolean;
  sentAt: number;
  expiresIn: number;
  resendIn: number;
};

const KEY = "yr-otp";

export function savePendingOtp(p: PendingOtp) {
  sessionStorage.setItem(KEY, JSON.stringify(p));
}

export function readPendingOtp(): PendingOtp | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function clearPendingOtp() {
  sessionStorage.removeItem(KEY);
}
