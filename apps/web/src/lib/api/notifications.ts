import { apiFetch, buildQuery } from "@/lib/api/client"
import type {
  AppNotification,
  NotificationPage,
  NotificationType,
} from "@/lib/api/types"

/** Mirrors ListNotificationDto in apps/api/src/notification/dtos/. */
export type NotificationListParams = {
  /** Accepts several; sent comma-joined, which the DTO also takes. */
  types?: NotificationType[]
  unreadOnly?: boolean
  page?: number
  limit?: number
}

/** NOT-001..004 — everything addressed to the viewer, newest first. */
export function listNotifications(params: NotificationListParams = {}) {
  return apiFetch<NotificationPage>(
    `/notifications${buildQuery({ ...params })}`
  )
}

/**
 * Just the badge number, without the rows.
 *
 * Its own route because the bell asks for it on every page and has no use for
 * the list — and because the count is the account's total, so it does not
 * change with whatever filter a screen happens to be showing.
 */
export function unreadNotificationCount() {
  return apiFetch<{ unread: number }>("/notifications/unread-count")
}

/** Answers with the updated row. Marking one twice is not an error. */
export function markNotificationRead(id: string) {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, {
    method: "PATCH",
  })
}

export function markAllNotificationsRead() {
  return apiFetch<{ updated: number }>("/notifications/read-all", {
    method: "PATCH",
  })
}
