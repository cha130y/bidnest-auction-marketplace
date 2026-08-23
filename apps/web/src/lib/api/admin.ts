import { authHeader } from '@/lib/api/auth/token';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  } catch {
    return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
  }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new AdminApiError(response.status, await parseErrorMessage(response));
  }

  return response.json();
}

export interface CurrentUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return adminFetch<CurrentUser>('/users/me');
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  createdAt: string;
}

export function fetchUsers(
  params: {
    cursor?: string;
    limit?: number;
    status?: AdminUserRow['status'];
  } = {},
): Promise<AdminUserRow[]> {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.status) search.set('status', params.status);

  const query = search.toString();
  return adminFetch<AdminUserRow[]>(`/admin/users${query ? `?${query}` : ''}`);
}

export function suspendUser(
  userId: string,
  note?: string,
): Promise<AdminUserRow> {
  return adminFetch<AdminUserRow>(`/admin/users/${userId}/suspend`, {
    method: 'PATCH',
    body: JSON.stringify(note ? { note } : {}),
  });
}

export function reactivateUser(
  userId: string,
  note?: string,
): Promise<AdminUserRow> {
  return adminFetch<AdminUserRow>(`/admin/users/${userId}/reactive`, {
    method: 'PATCH',
    body: JSON.stringify(note ? { note } : {}),
  });
}

export interface AuditLogItem {
  id: string;
  adminUserId: string;
  targetUserId: string | null;
  auctionId: string | null;
  categoryId: string | null;
  productId: string | null;
  actionType: string;
  note: string | null;
  createdAt: string;
}

export function fetchAuditLogs(
  params: {
    cursor?: string;
    limit?: number;
    actionType?: string;
  } = {},
): Promise<AuditLogItem[]> {
  const search = new URLSearchParams();
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.actionType) search.set('actionType', params.actionType);

  const query = search.toString();
  return adminFetch<AuditLogItem[]>(
    `/admin/actions${query ? `?${query}` : ''}`,
  );
}
