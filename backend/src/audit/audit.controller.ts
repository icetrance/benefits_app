import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { Role } from '@prisma/client';
import { RolesGuard } from '../common/roles.guard';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('verify')
  @Roles(Role.SYSTEM_ADMIN)
  async verify() {
    return this.auditService.verifyChain();
  }
}
