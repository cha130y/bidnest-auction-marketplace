'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, CategoryTree } from '@/lib/api/types';
import {
  activateCategory,
  createCategory,
  deactivateCategory,
  fetchAdminCategoryTree,
  updateCategory,
} from '@/lib/api/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function CategoryRow({
  category,
  depth,
  onToggle,
  onRename,
}: {
  category: Category;
  depth: number;
  onToggle: (category: Category) => void;
  onRename: (category: Category, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);

  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-n-200 py-2 last:border-0"
      style={{ paddingLeft: depth * 24 }}
    >
      {editing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            wrapperClassName="h-10"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onRename(category, name);
              setEditing(false);
            }}
          >
            บันทึก
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            ยกเลิก
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-1 items-center gap-2">
            <span className={category.isActive ? 'text-ink' : 'text-n-400 line-through'}>
              {category.name}
            </span>
            <span className="text-xs text-n-400">/{category.slug}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              แก้ไข
            </Button>
            <Button
              size="sm"
              variant={category.isActive ? 'danger' : 'secondary'}
              onClick={() => onToggle(category)}
            >
              {category.isActive ? 'ปิด' : 'เปิด'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminCategoriesPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState<string | undefined>();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: fetchAdminCategoryTree,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-categories'] });

  const createMutation = useMutation({
    mutationFn: () => createCategory({ name: newName, parentId: newParentId }),
    onSuccess: () => {
      setNewName('');
      setNewParentId(undefined);
      invalidate();
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ category, name }: { category: Category; name: string }) =>
      updateCategory(category.id, { name }),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: (category: Category) =>
      category.isActive ? deactivateCategory(category.id) : activateCategory(category.id),
    onSuccess: invalidate,
  });

  const roots: CategoryTree[] = data ?? [];

  // Select's Value doesn't copy the selected SelectItem's JSX (that's
  // Radix) — Base UI looks the label up from `items` on the root instead.
  // Without it, picking a parent shows the raw category id (a UUID) in the
  // trigger instead of its name. `''` is a real selectable value here (the
  // explicit "เป็นหมวดหลัก" item below), so it needs an entry too.
  const parentOptions: Record<string, string> = {
    '': 'เป็นหมวดหลัก',
    ...Object.fromEntries(roots.filter((r) => r.isActive).map((r) => [r.id, r.name])),
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Categories</h1>

      <Card>
        <CardHeader>
          <CardTitle>เพิ่มหมวดหมู่ใหม่</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="ชื่อหมวดหมู่"
            wrapperClassName="w-64"
          />
          <Select
            items={parentOptions}
            value={newParentId ?? ''}
            onValueChange={(value) => setNewParentId(value ? String(value) : undefined)}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="เป็นหมวดหลัก (ไม่มี parent)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">เป็นหมวดหลัก</SelectItem>
              {roots
                .filter((r) => r.isActive)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="primary"
            disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            เพิ่ม
          </Button>
        </CardContent>
      </Card>

      <Card>
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <CardContent className="flex flex-col">
            {roots.map((root) => (
              <div key={root.id}>
                <CategoryRow
                  category={root}
                  depth={0}
                  onToggle={(c) => toggleMutation.mutate(c)}
                  onRename={(c, name) => renameMutation.mutate({ category: c, name })}
                />
                {root.children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    category={child}
                    depth={1}
                    onToggle={(c) => toggleMutation.mutate(c)}
                    onRename={(c, name) => renameMutation.mutate({ category: c, name })}
                  />
                ))}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
