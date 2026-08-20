import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUserResponse } from './dto/auth-user.response';
import { RegisterDto } from './dto/register.dto';
import { HashingService } from './hashing.service';

/** Prisma raises P2002 when a write violates a unique index. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingService
  ) {}

  /**
   * AUTH-001 — local registration. The user row and its profile are written
   * through a single nested create so we can never end up with an account
   * that has no profile attached.
   */
  async register(dto: RegisterDto): Promise<AuthUserResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true }
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashing.hash(dto.password);

    // The findUnique above only catches the common case; two requests racing
    // on the same address both pass it, so the unique index is the real guard.
    const user = await this.prisma.user
      .create({
        data: {
          email: dto.email,
          passwordHash,
          profile: {
            create: {
              firstName: dto.firstName,
              lastName: dto.lastName ?? null,
              displayName: dto.displayName
            }
          }
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          profile: {
            select: { firstName: true, lastName: true, displayName: true }
          }
        }
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException('Email is already registered');
        }
        throw error;
      });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      firstName: user.profile!.firstName,
      lastName: user.profile!.lastName,
      displayName: user.profile!.displayName,
      createdAt: user.createdAt
    };
  }
}
