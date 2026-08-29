import { AdminSupportThread } from '@/components/admin/admin-support-thread';

/** Admin side of one AI-001 escalation — `sessionId` is trusted no further than the API trusts it. */
export default async function AdminSupportThreadPage({
  params,
}: PageProps<'/admin/support/[sessionId]'>) {
  const { sessionId } = await params;

  return <AdminSupportThread sessionId={sessionId} />;
}
