import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import type { OAuthProfile } from './oauth-profile';
import { clampName, nameFromEmail, OAuthService } from './oauth.service';

const googleProfile = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({
  provider: 'GOOGLE',
  providerAccountId: 'google-sub-1',
  email: 'somchai@example.com',
  emailVerified: true,
  displayName: 'Somchai',
  ...over
});

const lineProfile = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({
  provider: 'LINE',
  providerAccountId: 'line-sub-1',
  emailVerified: false,
  displayName: 'Somchai',
  ...over
});

const activeUser = {
  id: 'u1',
  email: 'somchai@example.com',
  role: 'USER' as const,
  status: 'ACTIVE' as const
};

describe('OAuthService (AUTH-003 / AUTH-006)', () => {
  let service: OAuthService;
  let prisma: {
    authAccount: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      authAccount: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() }
    };

    const moduleRef = await Test.createTestingModule({
      providers: [OAuthService, { provide: PrismaService, useValue: prisma }]
    }).compile();

    service = moduleRef.get(OAuthService);
  });

  describe('an account that is already linked', () => {
    it('is found by provider and account id, not by email', async () => {
      prisma.authAccount.findUnique.mockResolvedValue({ user: activeUser });

      const result = await service.resolveAccount(
        googleProfile({ email: 'a-different@example.com' })
      );

      expect(result).toEqual({ outcome: 'RESOLVED', user: activeUser });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('is refused while suspended (ADM-002)', async () => {
      prisma.authAccount.findUnique.mockResolvedValue({
        user: { ...activeUser, status: 'SUSPENDED' }
      });

      await expect(
        service.resolveAccount(googleProfile())
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  /**
   * AUTH-003 / AUTH-006 — one address, one way in.
   *
   * A provider is never joined to an account that already exists, whatever
   * the account signs in with today. Every case below is a refusal; what
   * changes between them is only which door the answer points at.
   */
  describe('an address that already has an account', () => {
    beforeEach(() => prisma.authAccount.findUnique.mockResolvedValue(null));

    /** Nothing is ever linked, so this must hold for every case here. */
    const expectRefused = async (call: Promise<unknown>) => {
      await expect(call).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.authAccount.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    };

    it('refuses a password account, even on an address Google verified', async () => {
      // The case this rule was written for. Verified or not, a password
      // account does not gain a second, password-less way in.
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: 'argon2-hash',
        authAccounts: []
      });

      await expectRefused(service.resolveAccount(googleProfile()));
    });

    it('points a password account back at its password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: 'argon2-hash',
        authAccounts: []
      });

      await expect(service.resolveAccount(googleProfile())).rejects.toThrow(
        /registered with a password/i
      );
    });

    it('refuses Line on an address that signs in with Google', async () => {
      // Provider to provider, which used to link silently the same way.
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: null,
        authAccounts: [{ provider: 'GOOGLE' }]
      });

      await expectRefused(
        service.resolveAccount(
          lineProfile({ emailVerified: true, email: 'somchai@example.com' })
        )
      );
    });

    it('names the provider that does work', async () => {
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: null,
        authAccounts: [{ provider: 'GOOGLE' }]
      });

      await expect(
        service.resolveAccount(
          lineProfile({ emailVerified: true, email: 'somchai@example.com' })
        )
      ).rejects.toThrow(
        'That address is already registered with Google. Sign in with Google instead.'
      );
    });

    it('refuses an address the provider did not verify', async () => {
      // AUTH-006: an address the caller merely typed proves nothing, and
      // someone else's is as easy to type as your own.
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: null,
        authAccounts: [{ provider: 'GOOGLE' }]
      });

      await expectRefused(
        service.resolveAccount(
          lineProfile({ emailVerified: false }),
          'somchai@example.com'
        )
      );
    });

    it('refuses a second Google account on one platform account', async () => {
      // AUTH-003 / AUTH-006 — one Google or Line account each, no more.
      prisma.user.findUnique.mockResolvedValue({
        passwordHash: null,
        authAccounts: [{ provider: 'GOOGLE' }]
      });

      await expect(
        service.resolveAccount(
          googleProfile({ providerAccountId: 'some-other-sub' })
        )
      ).rejects.toThrow(/already linked to a different Google account/);
    });
  });

  describe('a brand new account', () => {
    beforeEach(() => {
      prisma.authAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(activeUser);
    });

    it('opens one with the provider address and no password', async () => {
      await service.resolveAccount(googleProfile());

      const { data } = (
        prisma.user.create.mock.calls as [
          {
            data: {
              email: string;
              passwordHash?: string;
              emailVerifiedAt: Date | null;
            };
          }
        ][]
      )[0][0];
      expect(data.email).toBe('somchai@example.com');
      expect(data.passwordHash).toBeUndefined();
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('asks for an address when Line released none', async () => {
      const result = await service.resolveAccount(lineProfile());

      expect(result).toEqual({ outcome: 'EMAIL_REQUIRED' });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('opens one once the caller supplies that address', async () => {
      const result = await service.resolveAccount(
        lineProfile(),
        'Somchai@Example.com'
      );

      const { data } = (
        prisma.user.create.mock.calls as [
          { data: { email: string; emailVerifiedAt: Date | null } }
        ][]
      )[0][0];
      // Lowercased so it matches the address a later local login would use.
      expect(data.email).toBe('somchai@example.com');
      // The caller typed it, so nobody has proved they own it.
      expect(data.emailVerifiedAt).toBeNull();
      expect(result.outcome).toBe('RESOLVED');
    });

    it('prefers the address the provider verified over the typed one', async () => {
      await service.resolveAccount(googleProfile(), 'typed@example.com');

      const { data } = (
        prisma.user.create.mock.calls as [{ data: { email: string } }][]
      )[0][0];
      expect(data.email).toBe('somchai@example.com');
    });
  });

  describe('the name a new account starts with', () => {
    beforeEach(() => {
      prisma.authAccount.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(activeUser);
    });

    const createdProfile = () =>
      (
        prisma.user.create.mock.calls as [
          {
            data: {
              profile: {
                create: { firstName: string; displayName: string };
              };
            };
          }
        ][]
      )[0][0].data.profile.create;

    it('uses the name the provider sent', async () => {
      await service.resolveAccount(googleProfile({ displayName: 'Somchai G' }));

      expect(createdProfile()).toEqual({
        firstName: 'Somchai G',
        displayName: 'Somchai G'
      });
    });

    it('falls back to the email when the provider sent none', async () => {
      // USR-001 puts displayName on every public auction and listing, so this
      // is a name strangers read — it has to mean something.
      await service.resolveAccount(googleProfile({ displayName: undefined }));

      expect(createdProfile()).toEqual({
        firstName: 'somchai',
        displayName: 'somchai'
      });
    });

    it('treats a whitespace-only name as none at all', async () => {
      await service.resolveAccount(googleProfile({ displayName: '   ' }));

      expect(createdProfile().displayName).toBe('somchai');
    });

    it('cuts a name too long for the column', async () => {
      // user_profiles.display_name is VarChar(100); a longer one would fail
      // the insert rather than sign the user in.
      await service.resolveAccount(
        googleProfile({ displayName: 'x'.repeat(150) })
      );

      expect(createdProfile().displayName).toHaveLength(100);
    });
  });

  describe('nameFromEmail', () => {
    it('takes the part before the @', () => {
      expect(nameFromEmail('somchai@example.com')).toBe('somchai');
      expect(nameFromEmail('nuttapun.code@gmail.com')).toBe('nuttapun.code');
    });

    it('cuts one longer than the column', () => {
      expect(nameFromEmail(`${'x'.repeat(150)}@example.com`)).toHaveLength(100);
    });

    it('has something to fall back on for an odd address', () => {
      expect(nameFromEmail('@example.com')).toBe('BidNest user');
    });
  });

  describe('clampName', () => {
    it('returns undefined for nothing usable', () => {
      expect(clampName(undefined)).toBeUndefined();
      expect(clampName('   ')).toBeUndefined();
    });

    it('trims and cuts', () => {
      expect(clampName('  Somchai  ')).toBe('Somchai');
      expect(clampName('y'.repeat(150))).toHaveLength(100);
    });
  });
});
