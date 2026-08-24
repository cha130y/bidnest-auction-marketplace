'use client';

import {
  createColumnHelper,
  tableFeatures,
  useTable,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// No feature is registered (no sort/filter in this table) — must stay a single
// const shared by every caller of createDataTableColumnHelper so the TFeatures
// type lines up with useTable below.
export const dataTableFeatures = tableFeatures({});

// `Record<string, any>` (not `unknown`) matches @tanstack/table-core's own
// `RowData` type — `unknown` fails the generic constraint for plain
// interfaces with no index signature (e.g. AdminUserRow, AuditLogItem).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDataTableColumnHelper<T extends Record<string, any>>() {
  return createColumnHelper<typeof dataTableFeatures, T>();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DataTableProps<T extends Record<string, any>> {
  // TValue stays `any` here on purpose: each column has its own concrete
  // value type from createDataTableColumnHelper, and a heterogeneous array of
  // those doesn't collapse into a single ColumnDef<..., unknown> — same
  // reason table-core's own examples leave this slot loose on the wrapper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<typeof dataTableFeatures, T, any>[];
  data: T[];
  onRowClick?: (row: T) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
}: DataTableProps<T>) {
  const table = useTable({ features: dataTableFeatures, columns, data });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            onClick={() => onRowClick?.(row.original)}
            className={onRowClick ? 'cursor-pointer' : undefined}
          >
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
