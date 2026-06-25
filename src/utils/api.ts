import { Capacitor } from "@capacitor/core";

/**
 * Returns a fully qualified absolute URL for API calls in native environments,
 * or the relative path when running on the web preview.
 * This prevents relative path resolution failures inside the native app container.
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (typeof window !== "undefined") {
    const platform = Capacitor.getPlatform();
    // If it's running in a web browser context (including iframes, localhost, or any web host)
    // and is not a native iOS/Android wrapper, we must use relative paths.
    if (platform === "web" || (platform !== "ios" && platform !== "android")) {
      return cleanEndpoint;
    }
  }

  // Hardcoded production Vercel deployment URL fallback only for native mobile apps (iOS/Android)
  const defaultFallback = "https://burmese-recap-tool.vercel.app";
  return `${defaultFallback}${cleanEndpoint}`;
}
