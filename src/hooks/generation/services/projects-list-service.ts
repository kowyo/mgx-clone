import { getApiBaseUrl, getAuthHeaders } from "../utils/api";
import type { SessionData } from "@/lib/auth-client";

export interface ProjectListItem {
  id: string;
  prompt: string;
  status: string;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectListResponse {
  projects: ProjectListItem[];
}

export const fetchUserProjects = async (
  session: SessionData | null,
): Promise<ProjectListItem[]> => {
  const apiBaseUrl = getApiBaseUrl();
  const headers = await getAuthHeaders(session || null);

  const response = await fetch(`${apiBaseUrl}/projects`, {
    cache: "no-store",
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status}`);
  }

  const data: ProjectListResponse = await response.json();
  return data.projects;
};
