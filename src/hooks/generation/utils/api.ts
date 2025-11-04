import { getJWTToken, type SessionData } from "@/lib/auth-client";

export const getApiBaseUrl = () => {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000/api"
  ).replace(/\/$/, "");
};

export const getBackendOrigin = (apiBaseUrl: string) => {
  try {
    const normalized = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
    const url = new URL(normalized);
    return url.origin;
  } catch {
    return "";
  }
};

export const getWsBaseUrl = () => {
  const raw = process.env.NEXT_PUBLIC_BACKEND_WS_URL;
  return raw ? raw.replace(/\/$/, "") : null;
};

export const getAuthHeaders = async (
  session: SessionData,
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Fetch JWT token using the centralized helper function
  const token = await getJWTToken(session);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (!session?.session) {
    console.warn(
      "No session found, requests will fail if authentication is required",
    );
    // Continue without token - backend can try to use cookies as fallback
  }
  // If session exists but token fetch failed, continue without token
  // The backend can try to use cookies as fallback

  return headers;
};

export const buildWsUrl = (
  projectId: string,
  wsBaseEnv: string | null,
  backendOrigin: string,
): string => {
  if (wsBaseEnv) {
    return `${wsBaseEnv}/${projectId}`;
  }
  if (backendOrigin) {
    const originUrl = new URL(backendOrigin);
    const protocol = originUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${originUrl.host}/ws/${projectId}`;
  }
  return `ws://127.0.0.1:8000/ws/${projectId}`;
};
