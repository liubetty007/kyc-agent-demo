export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-kyc_session' : 'kyc_session';
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
