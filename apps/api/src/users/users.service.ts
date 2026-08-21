import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dtos/update-profile.dto';

const profileSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  profile: {
    select: {
      firstName: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      bio: true,
      phone: true,
      location: true,
      defaultShippingAddress: true,
      updatedAt: true
    }
  }
} as const;

/**
 * USR-001 — the signed-in user's own profile.
 *
 * Everything here is private to its owner. Public pages show `displayName`
 * only, which is why auction and product responses select that one field
 * rather than reaching for the profile as a whole.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  /**
   * Partial update. Only the keys actually present in the request are written,
   * so an omitted field keeps its value while an explicit `null` clears it —
   * the DTO turns an empty string into null for exactly that reason.
   */
  async updateMe(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { userId: true }
    });

    if (!existing) throw new NotFoundException('User not found');

    const data = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(data).length > 0) {
      await this.prisma.userProfile.update({ where: { userId }, data });
    }

    return this.findMe(userId);
  }
}
