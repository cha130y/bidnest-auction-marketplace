import { IsEnum, IsOptional } from 'class-validator';
import { SupportSessionStatus } from '../../../generated/prisma/enums';

/**
 * Defaults to the open queue (ESCALATED) when omitted — that's the view an
 * admin opening this page actually wants, not "everything ever escalated."
 */
export class ListAdminSupportSessionsDto {
  @IsEnum(SupportSessionStatus)
  @IsOptional()
  status?: SupportSessionStatus;
}
