import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

@Module({
    imports: [JwtModule.register({})],
    controllers: [AdminController],
    providers: [AdminService, PrismaService, AuditService]
})
export class AdminModule { }
