'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditLogItem, fetchAuditLogs } from '@/lib/api/admin';
import { createDataTableColumnHelper, DataTable } from '@/components/admin/data-table';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const columnHelper = createDataTableColumnHelper<AuditLogItem>();

const columns = [
  columnHelper.accessor('actionType', { header: 'Action' }),
  columnHelper.accessor('adminUserId', { header: 'Admin' }),
  columnHelper.accessor('note', { header: 'Note' }),
  columnHelper.accessor('createdAt', { header: 'Time' }),
];

export default function AuditLogPage() {
  const [actionTypeInput, setActionTypeInput] = useState('');
  const [selected, setSelected] = useState<AuditLogItem | null>(null);
  const actionType = useDebouncedValue(actionTypeInput, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', actionType],
    queryFn: () => fetchAuditLogs({ limit: 20, actionType: actionType || undefined }),
  });

  const items = useMemo(() => data ?? [], [data]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Audit Log</h1>

      <Input
        value={actionTypeInput}
        onChange={(event) => setActionTypeInput(event.target.value)}
        placeholder="กรอง action type เช่น SUSPEND_USER"
        wrapperClassName="w-72"
      />

      <Card>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <DataTable columns={columns} data={items} onRowClick={setSelected} />
        )}
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>รายละเอียด Action</SheetTitle>
          </SheetHeader>
          <pre className="whitespace-pre-wrap px-4 text-xs text-n-700">
            {selected ? JSON.stringify(selected, null, 2) : null}
          </pre>
        </SheetContent>
      </Sheet>
    </div>
  );
}
