import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestStatus, Role } from '@prisma/client';
import { CreateLineItemDto, UpdateLineItemDto } from './line-item.dto';

const EDITABLE_STATUSES: RequestStatus[] = [RequestStatus.DRAFT, RequestStatus.RETURNED];

@Injectable()
export class LineItemService {
  constructor(private readonly prisma: PrismaService, private readonly auditService: AuditService) {}

  private async getRequest(id: string) {
    const request = await this.prisma.expenseRequest.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  private ensureEditable(request: { status: RequestStatus; employeeId: string }, userId: string, role: Role) {
    if (role !== Role.EMPLOYEE || request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can edit');
    }
    if (!EDITABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request not editable');
    }
  }

  async addLineItem(userId: string, role: Role, requestId: string, dto: CreateLineItemDto) {
    const request = await this.getRequest(requestId);
    this.ensureEditable(request, userId, role);
    const item = await this.prisma.expenseLineItem.create({
      data: {
        requestId,
        date: new Date(dto.date),
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency
      }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseLineItem',
      entityId: item.id,
      eventType: 'CREATE',
      eventData: { requestId }
    });
    return item;
  }

  async updateLineItem(userId: string, role: Role, id: string, dto: UpdateLineItemDto) {
    const item = await this.prisma.expenseLineItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Line item not found');
    }
    const request = await this.getRequest(item.requestId);
    this.ensureEditable(request, userId, role);
    const updated = await this.prisma.expenseLineItem.update({
      where: { id },
      data: {
        date: new Date(dto.date),
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency
      }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseLineItem',
      entityId: id,
      eventType: 'UPDATE',
      eventData: { requestId: item.requestId }
    });
    return updated;
  }

  async deleteLineItem(userId: string, role: Role, id: string) {
    const item = await this.prisma.expenseLineItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Line item not found');
    }
    const request = await this.getRequest(item.requestId);
    this.ensureEditable(request, userId, role);
    await this.prisma.expenseLineItem.delete({ where: { id } });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseLineItem',
      entityId: id,
      eventType: 'DELETE',
      eventData: { requestId: item.requestId }
    });
    return { deleted: true };
  }
}
