import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { RequestController } from './requests/request.controller';
import { RequestService } from './requests/request.service';
import { PrismaService } from './prisma.service';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { LineItemService } from './line-items/line-item.service';
import { LineItemController } from './line-items/line-item.controller';
import { ReceiptService } from './receipts/receipt.service';
import { ReceiptController } from './receipts/receipt.controller';
import { ReportsController } from './reports/reports.controller';
import { NotificationService } from './notifications/notification.service';
import { CategoryService } from './categories/category.service';
import { CategoryController } from './categories/category.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    RequestController,
    AuditController,
    LineItemController,
    ReceiptController,
    ReportsController,
    CategoryController
  ],
  providers: [
    PrismaService,
    AuditService,
    NotificationService,
    RequestService,
    LineItemService,
    ReceiptService,
    CategoryService
  ]
})
export class AppModule {}
