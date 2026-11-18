/**
 * Google's "G" mark, for the "Continue with Google" button. Its four colours
 * are Google's brand colours, which its sign-in branding rules require as they
 * are: the one sanctioned use of foreign hex in the app's components
 * (tests/hexScan.test.ts lists this file, and only this file, for it).
 */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
      <path fill="#34A853" d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.4 6.3 14.7z"/>
      <path fill="#FBBC05" d="M24 46c5.9 0 10.9-2 14.5-5.4l-6.7-5.5C29.8 36.8 27 38 24 38c-6.1 0-10.7-3.1-11.8-7.5l-7 5.4C8.6 42.3 15.7 46 24 46z"/>
      <path fill="#EA4335" d="M44.5 20H24v8.5h11.8c-.6 2.9-2.3 5.3-4.7 6.9l6.7 5.5C41.8 37.4 45 31.2 45 24c0-1.3-.2-2.7-.5-4z"/>
    </svg>
  );
}
