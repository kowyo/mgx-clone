import { getJWTToken, type SessionData } from "@/lib/auth-client";

export const toAbsolutePreviewUrl = async (
  raw: string,
  backendOrigin: string,
  session: SessionData,
  basePreviewUrlRef: React.RefObject<string>,
  previewUrlWithTokenRef: React.RefObject<string>,
): Promise<string> => {
  if (!raw) {
    return "";
  }
  try {
    let url: URL;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      url = new URL(raw);
    } else {
      if (!backendOrigin) {
        return raw;
      }
      url = new URL(raw, backendOrigin);
    }

    // Remove any existing token parameter first
    url.searchParams.delete("token");

    // Get base URL without token for comparison
    const baseUrl = url.toString();

    // Only regenerate URL with token if the base URL changed
    if (baseUrl !== basePreviewUrlRef.current) {
      basePreviewUrlRef.current = baseUrl;

      // Add token for authentication (iframes need explicit auth)
      const token = await getJWTToken(session);
      if (token) {
        url.searchParams.set("token", token);
        const urlWithToken = url.toString();
        previewUrlWithTokenRef.current = urlWithToken;
        return urlWithToken;
      }

      // If no token, use base URL
      previewUrlWithTokenRef.current = baseUrl;
      return baseUrl;
    }

    // Base URL hasn't changed, return cached URL with token
    return previewUrlWithTokenRef.current || baseUrl;
  } catch {
    return raw;
  }
};

export const refreshPreviewUrl = (previewUrl: string): string => {
  if (!previewUrl) {
    return previewUrl;
  }
  try {
    const url = new URL(previewUrl);
    url.searchParams.set("t", Date.now().toString());
    return url.toString();
  } catch {
    return `${previewUrl}?t=${Date.now()}`;
  }
};
