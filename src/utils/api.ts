import { Capacitor } from "@capacitor/core";

/**
 * Returns a fully qualified absolute URL for API calls in native environments,
 * or the relative path when running on the web preview.
 * This prevents relative path resolution failures inside the native app container.
 */
export function getApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (Capacitor.getPlatform() === "web") {
    return cleanEndpoint;
  }

  // Hardcoded production Vercel deployment URL fallback
  const defaultFallback = "https://burmese-recap-tool.vercel.app";
  return `${defaultFallback}${cleanEndpoint}`;
}
