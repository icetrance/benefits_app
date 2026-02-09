import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestStatus, Role, ApprovalActionType } from '@prisma/client';
import { CreateRequestDto, UpdateRequestDto } from './request.dto';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService
  ) {}

  private ensureEmployee(role: Role) {
    if (role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Only employees can create requests');
    }
  }

  private async getRequestOrThrow(id: string) {
    const request = await this.prisma.expenseRequest.findUnique({
      where: { id },
      include: { lineItems: true, receipts: true, category: true, employee: true }
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  async createRequest(userId: string, role: Role, dto: CreateRequestDto) {
    this.ensureEmployee(role);
    const count = await this.prisma.expenseRequest.count();
    const requestNumber = `REQ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const request = await this.prisma.expenseRequest.create({
      data: {
        requestNumber,
        employeeId: userId,
        categoryId: dto.categoryId,
        reason: dto.reason,
        currency: dto.currency,
        totalAmount: dto.totalAmount,
        status: RequestStatus.DRAFT
      }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseRequest',
      entityId: request.id,
      eventType: 'CREATE',
      eventData: { requestNumber }
    });
    return request;
  }

  async listRequests(userId: string, role: Role) {
    if (role === Role.EMPLOYEE) {
      return this.prisma.expenseRequest.findMany({
        where: { employeeId: userId },
        include: { category: true }
      });
    }
    return this.prisma.expenseRequest.findMany({ include: { category: true } });
  }

  async getRequest(userId: string, role: Role, id: string) {
    const request = await this.getRequestOrThrow(id);
    if (role === Role.EMPLOYEE && request.employeeId !== userId) {
      throw new ForbiddenException('Not allowed');
    }
    return this.prisma.expenseRequest.findUnique({
      where: { id },
      include: { lineItems: true, receipts: true, actions: true, category: true, employee: true }
    });
  }

  async updateRequest(userId: string, role: Role, id: string, dto: UpdateRequestDto) {
    const request = await this.getRequestOrThrow(id);
    if (role !== Role.EMPLOYEE || request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can edit');
    }
    if (![RequestStatus.DRAFT, RequestStatus.RETURNED].includes(request.status)) {
      throw new BadRequestException('Request cannot be edited in current status');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { ...dto }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'UPDATE',
      eventData: dto
    });
    return updated;
  }

  private async validateSubmission(id: string) {
    const request = await this.getRequestOrThrow(id);
    if (!request.categoryId || !request.reason || request.lineItems.length === 0 || request.totalAmount <= 0) {
      throw new BadRequestException('Request is missing required details');
    }
    if (request.category.requiresReceipt && request.receipts.length === 0) {
      throw new BadRequestException('Receipt required for this category');
    }
    return request;
  }

  async submitRequest(userId: string, role: Role, id: string) {
    const request = await this.getRequestOrThrow(id);
    if (role !== Role.EMPLOYEE || request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can submit');
    }
    if (![RequestStatus.DRAFT, RequestStatus.RETURNED].includes(request.status)) {
      throw new BadRequestException('Request cannot be submitted');
    }
    await this.validateSubmission(id);
    const submitted = await this.prisma.expenseRequest.update({
      where: { id },
      data: {
        status: RequestStatus.SUBMITTED,
        submittedAt: new Date()
      }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId: userId,
        actionType: ApprovalActionType.SUBMIT,
        fromStatus: request.status,
        toStatus: RequestStatus.SUBMITTED
      }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'SUBMIT',
      eventData: { fromStatus: request.status, toStatus: RequestStatus.SUBMITTED }
    });
    const underReview = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.UNDER_REVIEW }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'AUTO_REVIEW',
      eventData: { fromStatus: RequestStatus.SUBMITTED, toStatus: RequestStatus.UNDER_REVIEW }
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Request submitted',
      `Your request ${request.requestNumber} is now under review.`
    );
    return { ...submitted, status: underReview.status };
  }

  async approveRequest(actorId: string, role: Role, id: string, comment?: string) {
    if (role !== Role.APPROVER) {
      throw new ForbiddenException('Only approvers can approve');
    }
    const request = await this.getRequestOrThrow(id);
    if (![RequestStatus.UNDER_REVIEW, RequestStatus.SUBMITTED].includes(request.status)) {
      throw new BadRequestException('Request is not in review');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.APPROVED }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.APPROVE,
        fromStatus: request.status,
        toStatus: RequestStatus.APPROVED,
        comment
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'APPROVE',
      eventData: { comment }
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Request approved',
      `Your request ${request.requestNumber} was approved.`
    );
    return updated;
  }

  async rejectRequest(actorId: string, role: Role, id: string, comment?: string) {
    if (role !== Role.APPROVER) {
      throw new ForbiddenException('Only approvers can reject');
    }
    if (!comment) {
      throw new BadRequestException('Comment required');
    }
    const request = await this.getRequestOrThrow(id);
    if (![RequestStatus.UNDER_REVIEW, RequestStatus.SUBMITTED].includes(request.status)) {
      throw new BadRequestException('Request is not in review');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.REJECTED }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.REJECT,
        fromStatus: request.status,
        toStatus: RequestStatus.REJECTED,
        comment
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'REJECT',
      eventData: { comment }
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Request rejected',
      `Your request ${request.requestNumber} was rejected. Comment: ${comment}`
    );
    return updated;
  }

  async returnRequest(actorId: string, role: Role, id: string, comment?: string) {
    if (role !== Role.APPROVER) {
      throw new ForbiddenException('Only approvers can return');
    }
    if (!comment) {
      throw new BadRequestException('Comment required');
    }
    const request = await this.getRequestOrThrow(id);
    if (![RequestStatus.UNDER_REVIEW, RequestStatus.SUBMITTED].includes(request.status)) {
      throw new BadRequestException('Request is not in review');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.RETURNED }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.RETURN,
        fromStatus: request.status,
        toStatus: RequestStatus.RETURNED,
        comment
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'RETURN',
      eventData: { comment }
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Request returned',
      `Your request ${request.requestNumber} was returned. Comment: ${comment}`
    );
    return updated;
  }

  async financeProcess(actorId: string, role: Role, id: string) {
    if (role !== Role.FINANCE_ADMIN) {
      throw new ForbiddenException('Only finance can process');
    }
    const request = await this.getRequestOrThrow(id);
    if (request.status !== RequestStatus.APPROVED) {
      throw new BadRequestException('Request must be approved');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.PAYMENT_PROCESSING }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.FINANCE_PROCESS,
        fromStatus: request.status,
        toStatus: RequestStatus.PAYMENT_PROCESSING
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'FINANCE_PROCESS',
      eventData: {}
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Payment processing',
      `Your request ${request.requestNumber} is in payment processing.`
    );
    return updated;
  }

  async financePaid(actorId: string, role: Role, id: string) {
    if (role !== Role.FINANCE_ADMIN) {
      throw new ForbiddenException('Only finance can mark paid');
    }
    const request = await this.getRequestOrThrow(id);
    if (request.status !== RequestStatus.PAYMENT_PROCESSING) {
      throw new BadRequestException('Request must be in processing');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.PAID }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.PAID,
        fromStatus: request.status,
        toStatus: RequestStatus.PAID
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'PAID',
      eventData: {}
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Payment completed',
      `Your request ${request.requestNumber} has been paid.`
    );
    return updated;
  }
}
