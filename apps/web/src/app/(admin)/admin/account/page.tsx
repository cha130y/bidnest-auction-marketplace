'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyProfile, updateMyProfile, type MyProfile } from '@/lib/api/users';
import { changeOwnPassword } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const adminProfileQueryKey = ['admin', 'account', 'profile'] as const;

const TEXTAREA_CLASS =
  'w-full rounded-r3 border-[1.5px] border-n-300 bg-n-100 px-4 py-3 font-body text-sm text-ink transition-colors outline-none placeholder:text-n-500 focus:border-amber-500 focus:bg-white';

type ProfileFields = {
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
};

function toFields(profile: MyProfile): ProfileFields {
  return {
    firstName: profile.profile.firstName,
    lastName: profile.profile.lastName ?? '',
    displayName: profile.profile.displayName,
    avatarUrl: profile.profile.avatarUrl ?? '',
    bio: profile.profile.bio ?? '',
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/**
 * The admin's own account — a dedicated screen, not a link out to /profile.
 * /profile is shop-facing (shipping address, phone, checkout prefill — none of
 * which apply here); this only edits what an admin identity actually needs:
 * name, avatar, bio, and password. Same `/users/me` API as USR-001 underneath
 * (it's the same account row), but its own form and its own query key.
 */
export default function AdminAccountPage() {
  const queryClient = useQueryClient();
  const { update: updateSession } = useSession();

  const { data, isLoading, error } = useQuery({
    queryKey: adminProfileQueryKey,
    queryFn: getMyProfile,
  });

  const [fields, setFields] = useState<ProfileFields | null>(null);
  // Adjusting state during render, not an effect — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [loadedFor, setLoadedFor] = useState<MyProfile | undefined>(undefined);
  if (data && data !== loadedFor) {
    setLoadedFor(data);
    setFields(toFields(data));
  }

  const profileMutation = useMutation({
    mutationFn: (values: ProfileFields) =>
      updateMyProfile({
        firstName: values.firstName,
        displayName: values.displayName,
        lastName: orNull(values.lastName),
        avatarUrl: orNull(values.avatarUrl),
        bio: orNull(values.bio),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(adminProfileQueryKey, updated);
      setFields(toFields(updated));
      // Header อ่านชื่อ/รูปจาก session ไม่ใช่จาก query นี้ — ต้อง sync ไว้ ไม่งั้น
      // ชื่อใน header จะไม่เปลี่ยนจนกว่าจะ login ใหม่ (เหมือน profile-form.tsx)
      await updateSession({
        name: updated.profile.displayName,
        image: updated.profile.avatarUrl,
      });
    },
  });

  const dirty = data && fields && JSON.stringify(fields) !== JSON.stringify(toFields(data));

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const passwordMutation = useMutation({
    mutationFn: () => changeOwnPassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">บัญชีของฉัน</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">โปรไฟล์</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading || !fields ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="firstName">ชื่อจริง</Label>
                <Input
                  id="firstName"
                  value={fields.firstName}
                  onChange={(event) =>
                    setFields({ ...fields, firstName: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lastName">นามสกุล</Label>
                <Input
                  id="lastName"
                  value={fields.lastName}
                  onChange={(event) =>
                    setFields({ ...fields, lastName: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName">ชื่อที่แสดง</Label>
                <Input
                  id="displayName"
                  value={fields.displayName}
                  onChange={(event) =>
                    setFields({ ...fields, displayName: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="avatarUrl">ลิงก์รูปโปรไฟล์</Label>
                <Input
                  id="avatarUrl"
                  inputMode="url"
                  placeholder="https://…"
                  value={fields.avatarUrl}
                  onChange={(event) =>
                    setFields({ ...fields, avatarUrl: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bio">แนะนำตัว</Label>
                <textarea
                  id="bio"
                  rows={3}
                  className={TEXTAREA_CLASS}
                  value={fields.bio}
                  onChange={(event) => setFields({ ...fields, bio: event.target.value })}
                />
              </div>

              {profileMutation.isError && (
                <p className="text-sm text-red">
                  {profileMutation.error instanceof ApiError
                    ? profileMutation.error.message
                    : 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
                </p>
              )}
              {profileMutation.isSuccess && !dirty && (
                <p className="text-sm text-green">บันทึกแล้ว</p>
              )}

              <Button
                variant="primary"
                disabled={!dirty || !fields.firstName.trim() || !fields.displayName.trim() || profileMutation.isPending}
                onClick={() => profileMutation.mutate(fields)}
              >
                {profileMutation.isPending ? 'กำลังบันทึก…' : 'บันทึกโปรไฟล์'}
              </Button>
            </>
          )}

          {error && (
            <p className="text-sm text-red">
              {error instanceof ApiError ? error.message : 'โหลดโปรไฟล์ไม่สำเร็จ'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">เปลี่ยนรหัสผ่าน</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">รหัสผ่านปัจจุบัน</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">รหัสผ่านใหม่</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="text-xs text-n-500">อย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-password">ยืนยันรหัสผ่านใหม่</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            {mismatch && <p className="text-xs text-red">รหัสผ่านไม่ตรงกัน</p>}
          </div>

          {passwordMutation.isError && (
            <p className="text-sm text-red">
              {passwordMutation.error instanceof ApiError
                ? passwordMutation.error.message
                : 'เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
            </p>
          )}
          {passwordMutation.isSuccess && (
            <p className="text-sm text-green">
              เปลี่ยนรหัสผ่านแล้ว — เซสชันอื่นทั้งหมดถูกออกจากระบบ
            </p>
          )}

          <Button
            variant="primary"
            disabled={
              !currentPassword ||
              !newPassword ||
              mismatch ||
              newPassword !== confirmPassword ||
              passwordMutation.isPending
            }
            onClick={() => passwordMutation.mutate()}
          >
            {passwordMutation.isPending ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
