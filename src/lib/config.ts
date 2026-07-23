const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const rawSupabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const rawPrivacyPolicyUrl =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() ?? '';
const rawSupportUrl = process.env.EXPO_PUBLIC_SUPPORT_URL?.trim() ?? '';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isRealKey(value: string): boolean {
  return value.length >= 20 && !value.includes('YOUR-');
}

export const isAppConfigured =
  isHttpUrl(rawSupabaseUrl) && isRealKey(rawSupabaseKey);

// createClient itself rejects empty values before the app can render. These
// non-secret fallbacks are never used for requests: RootLayout shows the setup
// screen while isAppConfigured is false.
export const supabaseUrl = isAppConfigured
  ? rawSupabaseUrl
  : 'https://configuration-required.supabase.co';
export const supabaseAnonKey = isAppConfigured
  ? rawSupabaseKey
  : 'configuration-required-anon-key';

// Only open real public HTTPS pages. Missing or invalid values are handled
// as a friendly setup notice in Settings instead of opening a guessed URL.
export const privacyPolicyUrl = isHttpsUrl(rawPrivacyPolicyUrl)
  ? rawPrivacyPolicyUrl
  : null;
export const supportUrl = isHttpsUrl(rawSupportUrl) ? rawSupportUrl : null;
