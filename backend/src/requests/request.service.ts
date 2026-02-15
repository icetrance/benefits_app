import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { RequestStatus, Role, ApprovalActionType } from '@prisma/client';
import { CreateRequestDto, UpdateRequestDto } from './request.dto';
import { NotificationService } from '../notifications/notification.service';

const EDITABLE_STATUSES: RequestStatus[] = [RequestStatus.DRAFT, RequestStatus.RETURNED];
const REVIEW_STATUSES: RequestStatus[] = [RequestStatus.UNDER_REVIEW, RequestStatus.SUBMITTED];
const WITHDRAWABLE_STATUSES: RequestStatus[] = [RequestStatus.SUBMITTED, RequestStatus.UNDER_REVIEW];
const FINANCE_PAYABLE_STATUSES: RequestStatus[] = [
  RequestStatus.FINANCE_APPROVED,
  RequestStatus.PAYMENT_PROCESSING
];

@Injectable()
export class RequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService
  ) { }

  // Removed ensureEmployee as any authenticated user can create a request

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

  /** Verify that the request's employee is a direct report of the actor (approver).
   * Approvers may also own requests themselves (submitted by a peer/admin), so we allow
   * acting on their own requests as well if they are the employee.
   */
  private async ensureTeamMember(actorId: string, role: Role, employeeId: string) {
    if (role === Role.SYSTEM_ADMIN) return; // admins bypass
    if (employeeId === actorId) return; // approvers can act on their own requests
    const employee = await this.prisma.user.findUnique({ where: { id: employeeId } });
    if (!employee || employee.managerId !== actorId) {
      throw new ForbiddenException('You can only act on requests from your team members');
    }
  }

  async createRequest(userId: string, role: Role, dto: CreateRequestDto) {
    // Removed ensureEmployee(role) check
    const count = await this.prisma.expenseRequest.count();
    const requestNumber = `REQ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Determine expense type from category
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new BadRequestException('Invalid category');
    }

    // 1. Future Date Check
    if (dto.invoiceDate && new Date(dto.invoiceDate) > new Date()) {
      throw new BadRequestException('Invoice date cannot be in the future');
    }

    // 2. Max Amount Check
    if (category.maxAmountPerRequest && dto.totalAmount > category.maxAmountPerRequest) {
      throw new BadRequestException(`Amount exceeds the limit of ${category.maxAmountPerRequest} for this category`);
    }

    // 3. Budget Check (for Benefits)
    if (category.expenseType === 'BENEFIT') {
      const year = new Date().getFullYear();

      // Get allocation
      const allocation = await this.prisma.budgetAllocation.findUnique({
        where: { userId_categoryId_year: { userId, categoryId: dto.categoryId, year } }
      });

      if (!allocation) {
        // If no allocation exists, we might default to 0 or create one based on defaultBudget. 
        // For stricter control, we assume if no allocation, no budget.
        // However, the system auto-creates allocations. If missing, implies 0.
        throw new BadRequestException('No budget allocation found for this category');
      }

      // Calculate pending amount (SUBMITTED, UNDER_REVIEW, APPROVED, PAYMENT_PROCESSING)
      // DRAFT, REJECTED, RETURNED, PAID do not count towards "pending" (PAID counts towards "spent" in allocation)
      const sensitiveStatuses = [
        RequestStatus.SUBMITTED,
        RequestStatus.UNDER_REVIEW,
        RequestStatus.APPROVED,
        RequestStatus.PAYMENT_PROCESSING
      ];

      const pendingRequests = await this.prisma.expenseRequest.aggregate({
        where: {
          employeeId: userId,
          categoryId: dto.categoryId,
          status: { in: sensitiveStatuses },
          // filter by year? Usually budgets are annual. 
          // If a request is made in Dec 2025 for 2025 budget, it counts.
          // We assume requests follow current year or submittedAt year.
          // For simplicity, we filter by createdAt year matching current year for pending.
          createdAt: {
            gte: new Date(year, 0, 1),
            lt: new Date(year + 1, 0, 1)
          }
        },
        _sum: { totalAmount: true }
      });

      const pendingAmount = pendingRequests._sum.totalAmount || 0;
      const available = allocation.allocated - allocation.spent - pendingAmount;

      if (dto.totalAmount > available) {
        throw new BadRequestException(`Amount exceeds remaining budget. Available: ${available.toFixed(2)}`);
      }
    }

    const request = await this.prisma.expenseRequest.create({
      data: {
        requestNumber,
        employeeId: userId,
        categoryId: dto.categoryId,
        reason: dto.reason,
        currency: dto.currency,
        totalAmount: dto.totalAmount,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : undefined,
        supplier: dto.supplier,
        expenseType: category.expenseType,
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

  async listRequestsForAudit() {
    return this.prisma.expenseRequest.findMany({
      include: {
        category: true,
        employee: { select: { id: true, fullName: true, email: true, role: true } },
        actions: {
          include: { actor: { select: { id: true, fullName: true, email: true, role: true } } },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async listRequests(userId: string, role: Role) {
    const includeRelations = {
      category: true,
      employee: true,
      actions: { include: { actor: true } }
    };

    if (role === Role.EMPLOYEE) {
      // Employees see only their own requests
      return this.prisma.expenseRequest.findMany({
        where: { employeeId: userId },
        include: includeRelations
      });
    }

    if (role === Role.APPROVER) {
      // Approvers see their own requests AND their direct reports' requests
      return this.prisma.expenseRequest.findMany({
        where: { OR: [{ employeeId: userId }, { employee: { managerId: userId } }] },
        include: includeRelations
      });
    }

    // FINANCE_ADMIN and SYSTEM_ADMIN see all requests
    return this.prisma.expenseRequest.findMany({ include: includeRelations });
  }

  async getRequest(userId: string, role: Role, id: string) {
    const request = await this.getRequestOrThrow(id);
    if (role === Role.EMPLOYEE && request.employeeId !== userId) {
      throw new ForbiddenException('Not allowed');
    }
    if (role === Role.APPROVER) {
      // Approvers can view their own requests or their direct reports' requests
      if (request.employeeId !== userId) {
        const employee = await this.prisma.user.findUnique({ where: { id: request.employeeId } });
        if (!employee || employee.managerId !== userId) {
          throw new ForbiddenException('Not allowed');
        }
      }
    }
    return this.prisma.expenseRequest.findUnique({
      where: { id },
      include: { lineItems: true, receipts: true, actions: { include: { actor: true } }, category: true, employee: true }
    });
  }

  async updateRequest(userId: string, role: Role, id: string, dto: UpdateRequestDto) {
    const request = await this.getRequestOrThrow(id);
    if (request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can edit');
    }
    if (!EDITABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request cannot be edited in current status');
    }
    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : undefined;
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { ...dto, invoiceDate }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'UPDATE',
      eventData: { ...dto } as Record<string, unknown>
    });
    return updated;
  }

  private async validateSubmission(id: string) {
    const request = await this.getRequestOrThrow(id);
    if (
      !request.categoryId ||
      !request.reason ||
      !request.currency ||
      request.totalAmount <= 0 ||
      !request.invoiceNumber ||
      !request.invoiceDate ||
      !request.supplier
    ) {
      throw new BadRequestException('Request is missing required details');
    }
    return request;
  }

  async submitRequest(userId: string, role: Role, id: string) {
    const request = await this.getRequestOrThrow(id);
    if (request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can submit');
    }
    if (!EDITABLE_STATUSES.includes(request.status)) {
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

  async withdrawRequest(userId: string, role: Role, id: string) {
    const request = await this.getRequestOrThrow(id);
    if (request.employeeId !== userId) {
      throw new ForbiddenException('Only owner can withdraw');
    }
    if (!WITHDRAWABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request cannot be withdrawn in current status');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.DRAFT, submittedAt: null }
    });
    await this.auditService.recordEvent({
      actorId: userId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'WITHDRAW',
      eventData: { fromStatus: request.status, toStatus: RequestStatus.DRAFT }
    });
    return updated;
  }

  async approveRequest(actorId: string, role: Role, id: string, comment?: string) {
    if (role !== Role.APPROVER && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only approvers can approve');
    }
    if (!comment) {
      throw new BadRequestException('Comment required');
    }
    const request = await this.getRequestOrThrow(id);
    if (!REVIEW_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request is not in review');
    }
    await this.ensureTeamMember(actorId, role, request.employeeId);
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
    if (role !== Role.APPROVER && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only approvers can reject');
    }
    if (!comment) {
      throw new BadRequestException('Comment required');
    }
    const request = await this.getRequestOrThrow(id);
    if (!REVIEW_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request is not in review');
    }
    await this.ensureTeamMember(actorId, role, request.employeeId);
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
    if (role !== Role.APPROVER && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only approvers can return');
    }
    if (!comment) {
      throw new BadRequestException('Comment required');
    }
    const request = await this.getRequestOrThrow(id);
    if (!REVIEW_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request is not in review');
    }
    await this.ensureTeamMember(actorId, role, request.employeeId);
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

  async financeApprove(actorId: string, role: Role, id: string, comment?: string) {
    if (role !== Role.FINANCE_ADMIN && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only finance can approve documents');
    }
    const request = await this.getRequestOrThrow(id);
    if (request.status !== RequestStatus.APPROVED) {
      throw new BadRequestException('Request must be in APPROVED status to be finance-approved');
    }
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.FINANCE_APPROVED }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.FINANCE_APPROVE,
        fromStatus: request.status,
        toStatus: RequestStatus.FINANCE_APPROVED,
        comment
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'FINANCE_APPROVE',
      eventData: { comment: comment || '' }
    });
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Documents approved by finance',
      `Your request ${request.requestNumber} has been finance-approved and is queued for reimbursement.`
    );
    return updated;
  }

  async financeReturn(actorId: string, role: Role, id: string, comment?: string) {
    if (role !== Role.FINANCE_ADMIN && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only finance can return requests');
    }
    if (!comment) {
      throw new BadRequestException('A comment is required when returning a request');
    }
    const request = await this.getRequestOrThrow(id);
    if (request.status !== RequestStatus.APPROVED && request.status !== RequestStatus.FINANCE_APPROVED) {
      throw new BadRequestException('Request must be in APPROVED or FINANCE_APPROVED status to be returned');
    }
    // Find the original approver to notify
    const approveAction = await this.prisma.approvalAction.findFirst({
      where: { requestId: id, actionType: ApprovalActionType.APPROVE },
      include: { actor: true },
      orderBy: { createdAt: 'desc' }
    });
    const updated = await this.prisma.expenseRequest.update({
      where: { id },
      data: { status: RequestStatus.UNDER_REVIEW }
    });
    await this.prisma.approvalAction.create({
      data: {
        requestId: id,
        actorId,
        actionType: ApprovalActionType.FINANCE_RETURN,
        fromStatus: request.status,
        toStatus: RequestStatus.UNDER_REVIEW,
        comment
      }
    });
    await this.auditService.recordEvent({
      actorId,
      entityType: 'ExpenseRequest',
      entityId: id,
      eventType: 'FINANCE_RETURN',
      eventData: { comment }
    });
    // Notify the approver
    if (approveAction?.actor?.email) {
      await this.notificationService.send(
        approveAction.actor.email,
        'ExpenseFlow: Request returned by Finance',
        `Request ${request.requestNumber} was returned by Finance with comment: ${comment}`
      );
    }
    // Also notify the employee
    await this.notificationService.send(
      request.employee.email,
      'ExpenseFlow: Request returned by Finance',
      `Your request ${request.requestNumber} was returned by Finance. Comment: ${comment}`
    );
    return updated;
  }

  async financeProcess(actorId: string, role: Role, id: string) {
    if (role !== Role.FINANCE_ADMIN && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only finance can process');
    }
    const request = await this.getRequestOrThrow(id);
    if (request.status !== RequestStatus.FINANCE_APPROVED) {
      throw new BadRequestException('Request must be finance-approved before processing payment');
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
    if (role !== Role.FINANCE_ADMIN && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only finance can mark paid');
    }
    const request = await this.getRequestOrThrow(id);
    if (!FINANCE_PAYABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request must be finance-approved before it can be marked as paid');
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

    // Update budget allocation if this is a benefit category
    if (request.category && request.category.expenseType === 'BENEFIT') {
      const year = request.submittedAt ? request.submittedAt.getFullYear() : new Date().getFullYear();
      const budget = await this.prisma.budgetAllocation.findUnique({
        where: { userId_categoryId_year: { userId: request.employeeId, categoryId: request.categoryId, year } }
      });
      if (budget) {
        await this.prisma.budgetAllocation.update({
          where: { id: budget.id },
          data: { spent: budget.spent + request.totalAmount }
        });
      }
    }

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
