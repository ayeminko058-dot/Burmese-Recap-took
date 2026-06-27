import { Capacitor, CapacitorHttp } from "@capacitor/core";

// Dedicated configuration variable for the external Live Server URL (HTTPS)
export const LIVE_SERVER_URL = "https://ais-dev-gw5iw4avvqz4fmkrhq2mim-33484223713.asia-southeast1.run.app";
export const PRODUCTION_SERVER_URL = "https://ais-pre-gw5iw4avvqz4fmkrhq2mim-33484223713.asia-southeast1.run.app";

/**
 * Returns a fully qualified absolute URL for API calls in native environments,
 * or the relative path when running on the web preview.
 * This prevents relative path resolution failures inside the native app container.
 */
export function getApiUrl(endpoint: string): string {
  // Ensure endpoint starts with exactly one slash
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  if (typeof window !== "undefined") {
    // Check if there is a custom server URL configured in localStorage first (allows overriding)
    const savedServerUrl = localStorage.getItem("server_url");
    if (savedServerUrl && savedServerUrl.trim()) {
      let base = savedServerUrl.trim();
      while (base.endsWith("/")) {
        base = base.slice(0, -1);
      }
      return `${base}${cleanEndpoint}`;
    }

    const platform = Capacitor.getPlatform();
    const origin = window.location.origin;

    // Auto-save the origin if running on the web (this registers the Cloud Run URL automatically)
    if (platform === "web" || (platform !== "ios" && platform !== "android")) {
      if (origin && !origin.includes("localhost") && !origin.includes("127.0.0.1") && !origin.includes("capacitor://")) {
        localStorage.setItem("server_url", origin);
      }
      return cleanEndpoint;
    }
  }

  // Note: We do not check VITE_APP_URL here because VITE_APP_URL is specifically reserved
  // for the external Edge-TTS audio generation server. Our actual Express backend routes
  // (Voice-to-Text, Translation, etc.) run on the app container itself.
  
  // Fallback to our dedicated external Live Server URL
  return `${LIVE_SERVER_URL}${cleanEndpoint}`;
}

/**
 * Custom cross-platform fetch implementation.
 * Uses CapacitorHttp native calls under the hood on Android/iOS to bypass CORS, origin blocks, and cookie restrictions.
 * Transparently falls back to standard window.fetch on the web or for FormData payloads.
 */
export async function safeFetch(url: string, options: any = {}): Promise<Response> {
  const platform = Capacitor.getPlatform();
  const isNative = platform === "android" || platform === "ios";

  // FormData bodies MUST bypass CapacitorHttp because the native bridge cannot serialize standard multipart FormData.
  // Standard fetch is 100% supported and secure on native WebView with our open CORS server configuration.
  const isFormData = options.body && (options.body instanceof FormData || (typeof options.body === "object" && options.body.constructor?.name === "FormData"));

  if (!isNative || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("file:") || isFormData) {
    try {
      const rawRes = await fetch(url, options);
      const contentType = rawRes.headers.get("content-type");
      
      // If the request succeeded but returned HTML instead of expected JSON/binary, intercept and throw Server Network Error
      if (rawRes.ok && (!contentType || !contentType.includes("application/json")) && !url.includes("/api/tts") && !url.includes(".mp3")) {
        const clone = rawRes.clone();
        const text = await clone.text().catch(() => "");
        const trimmed = text.trim();
        if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
          throw new Error("Server Network Error: Invalid content-type received from server (Expected JSON, but received HTML page).");
        }
      }
      return rawRes;
    } catch (fetchErr: any) {
      console.warn("[SafeFetch] Web-fallback fetch failed:", fetchErr);
      throw fetchErr;
    }
  }

  try {
    console.log(`[SafeFetch] Initiating native HTTP request: [${options.method || "GET"}] to ${url}`);

    const method = (options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };

    // Standardize Content-Type for JSON payloads if not specified
    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    let data: any = options.body;
    
    // Parse JSON string to raw object for Capacitor's native bridge
    if (typeof options.body === "string" && headers["Content-Type"]?.includes("application/json")) {
      try {
        data = JSON.parse(options.body);
      } catch (e) {
        console.warn("[SafeFetch] Failed to parse JSON string body:", e);
      }
    }

    // Determine the response representation needed
    const isTtsRequest = url.includes("/api/tts") || options.responseType === "blob";
    const responseType = isTtsRequest ? "arraybuffer" : "json";

    const httpOptions: any = {
      url,
      method,
      headers,
      data,
      responseType,
      connectTimeout: 60000,
      readTimeout: 60000,
    };

    const nativeResponse = await CapacitorHttp.request(httpOptions);

    // Build the Headers mapping list
    const responseHeaders = new Headers();
    if (nativeResponse.headers) {
      Object.entries(nativeResponse.headers).forEach(([key, value]) => {
        responseHeaders.append(key, String(value));
      });
    }

    let responseBody: any;

    if (isTtsRequest) {
      // Decode arraybuffer/base64 binary payloads into actual browser blobs
      let binaryBuffer: ArrayBuffer;
      if (typeof nativeResponse.data === "string") {
        const decoded = window.atob(nativeResponse.data);
        const uintArray = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          uintArray[i] = decoded.charCodeAt(i);
        }
        binaryBuffer = uintArray.buffer;
      } else if (nativeResponse.data instanceof ArrayBuffer) {
        binaryBuffer = nativeResponse.data;
      } else {
        // Fallback for other formats
        binaryBuffer = new ArrayBuffer(0);
      }
      
      responseBody = new Blob([binaryBuffer], { 
        type: nativeResponse.headers["content-type"] || "audio/mpeg" 
      });
    } else {
      // Map standard responses as JSON string representation
      responseBody = typeof nativeResponse.data === "object" 
        ? JSON.stringify(nativeResponse.data) 
        : nativeResponse.data;

      // Intercept HTML pages and redirect them straight to the catch block as a 'Server Network Error'
      if (typeof responseBody === "string") {
        const trimmed = responseBody.trim();
        if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<HTML")) {
          throw new Error("Server Network Error: Expected JSON response, but received HTML response page from server.");
        }
      }
    }

    return new Response(responseBody, {
      status: nativeResponse.status,
      statusText: `Capacitor Native Success (${nativeResponse.status})`,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[SafeFetch] Native request failed. Bubbling up to catch block...", error);
    throw error;
  }
}
