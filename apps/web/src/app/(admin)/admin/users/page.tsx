'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminUserRow,
  fetchUsers,
  reactivateUser,
  suspendUser,
} from '@/lib/api/admin';
import { createDataTableColumnHelper, DataTable } from '@/components/admin/data-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const columnHelper = createDataTableColumnHelper<AdminUserRow>();

const STATUS_STYLE: Record<AdminUserRow['status'], string> = {
  ACTIVE: 'bg-green-50 text-green',
  SUSPENDED: 'bg-red-50 text-red',
  DEACTIVATED: 'bg-n-100 text-n-500',
};

function StatusPill({ status }: { status: AdminUserRow['status'] }) {
  return (
    <span
      className={`inline-flex h-[26px] items-center rounded-full px-3 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export default function AdminUsersPage() {
  const [role, setRole] = useState<AdminUserRow['role']>('USER');
  const [statusFilter, setStatusFilter] = useState<AdminUserRow['status'] | undefined>();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Users</h1>

      <Tabs value={role} onValueChange={(value) => setRole(value as AdminUserRow['role'])}>
        <TabsList>
          <TabsTrigger value="USER">สมาชิก</TabsTrigger>
          <TabsTrigger value="ADMIN">พนักงาน</TabsTrigger>
        </TabsList>

        <Select
          value={statusFilter ?? ''}
          onValueChange={(value) =>
            setStatusFilter((value || undefined) as AdminUserRow['status'] | undefined)
          }
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="ทุกสถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">ทุกสถานะ</SelectItem>
            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
            <SelectItem value="SUSPENDED">SUSPENDED</SelectItem>
            <SelectItem value="DEACTIVATED">DEACTIVATED</SelectItem>
          </SelectContent>
        </Select>

        <TabsContent value="USER">
          <UsersTable role="USER" status={statusFilter} />
        </TabsContent>
        <TabsContent value="ADMIN">
          <UsersTable role="ADMIN" status={statusFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTable({
  role,
  status,
}: {
  role: AdminUserRow['role'];
  status: AdminUserRow['status'] | undefined;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', role, status],
    queryFn: () => fetchUsers({ role, status }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => suspendUser(userId),
    onSuccess: invalidate,
  });

  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => reactivateUser(userId),
    onSuccess: invalidate,
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('email', { header: 'Email' }),
      columnHelper.accessor('role', { header: 'Role' }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: ({ getValue }) => <StatusPill status={getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const user = row.original;
          return user.status === 'SUSPENDED' ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => reactivateMutation.mutate(user.id)}
              disabled={reactivateMutation.isPending}
            >
              Reactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => suspendMutation.mutate(user.id)}
              disabled={suspendMutation.isPending}
            >
              Suspend
            </Button>
          );
        },
      }),
    ],
    [suspendMutation, reactivateMutation],
  );

  return (
    <Card>
      {isLoading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <DataTable columns={columns} data={data ?? []} />
      )}
    </Card>
  );
}
