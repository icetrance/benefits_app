import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestStatus, Role } from '@prisma/client';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const EDITABLE_STATUSES: RequestStatus[] = [RequestStatus.DRAFT, RequestStatus.RETURNED];

@Injectable()
export class ReceiptService {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  private ensureEditable(request: { status: RequestStatus; employeeId: string }, userId: string, role: Role) {
    if (role !== Role.EMPLOYEE || request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can upload');
    }
    if (!EDITABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request not editable');
    }
  }

  async uploadReceipt(userId: string, role: Role, requestId: string, file: Express.Multer.File) {
    const request = await this.prisma.expenseRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    this.ensureEditable(request, userId, role);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const storagePath = path.join(uploadDir, `${sha256}-${file.originalname}`);
    await fs.promises.writeFile(storagePath, file.buffer);
    const receipt = await this.prisma.receiptAttachment.create({
      data: {
        requestId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        sha256,
        storagePath
      }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ReceiptAttachment',
      entityId: receipt.id,
      eventType: 'UPLOAD',
      eventData: { requestId, filename: file.originalname }
    });
    return receipt;
  }

  async downloadReceipt(userId: string, role: Role, id: string) {
    const receipt = await this.prisma.receiptAttachment.findUnique({ where: { id } });
    if (!receipt) {
      throw new NotFoundException('Receipt not found');
    }
    const request = await this.prisma.expenseRequest.findUnique({ where: { id: receipt.requestId } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (role === Role.EMPLOYEE && request.employeeId !== userId) {
      throw new ForbiddenException('Not allowed');
    }
    return receipt;
  }
}
