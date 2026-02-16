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
  RequestStatus.APPROVED,
  RequestStatus.PAYMENT_PROCESSING
];
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  private async attachActionActors<T extends { actions: Array<{ actorId: string | null }> }>(requests: T[]): Promise<Array<T & {
    actions: Array<T['actions'][number] & { actor: { id: string; fullName: string; email: string } | null }>;
  }>> {
    const isValidUserId = (value: string | null): value is string =>
      typeof value === 'string' && UUID_V4_REGEX.test(value.trim());

    const actorIds = Array.from(
      new Set(
        requests.flatMap((request) =>
          request.actions
            .map((action) => action.actorId)
            .filter(isValidUserId)
        )
      )
    );

    if (actorIds.length === 0) {
      return requests.map((request) => ({
        ...request,
        actions: request.actions.map((action) => ({ ...action, actor: null }))
      }));
    }

    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, fullName: true, email: true }
    });
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return requests.map((request) => ({
      ...request,
      actions: request.actions.map((action) => ({
        ...action,
        actor: isValidUserId(action.actorId) ? actorById.get(action.actorId) || null : null
      }))
    }));
  }

  /** Verify that the request's employee is a direct report of the actor (approver). */
  private async ensureTeamMember(actorId: string, role: Role, employeeId: string) {
    if (role === Role.SYSTEM_ADMIN) return; // admins bypass
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

  async listRequests(userId: string, role: Role) {
    const includeRelations = {
      category: true,
      employee: true,
      actions: true
    };

    let requests;
    if (role === Role.EMPLOYEE) {
      // Employees see only their own requests
      requests = await this.prisma.expenseRequest.findMany({
        where: { employeeId: userId },
        include: includeRelations
      });
      return this.attachActionActors(requests);
    }

    if (role === Role.APPROVER) {
      // Approvers see only their direct reports' requests
      requests = await this.prisma.expenseRequest.findMany({
        where: { employee: { managerId: userId } },
        include: includeRelations
      });
      return this.attachActionActors(requests);
    }

    // FINANCE_ADMIN and SYSTEM_ADMIN see all requests
    requests = await this.prisma.expenseRequest.findMany({ include: includeRelations });
    return this.attachActionActors(requests);
  }

  async getRequest(userId: string, role: Role, id: string) {
    const request = await this.getRequestOrThrow(id);
    if (role === Role.EMPLOYEE && request.employeeId !== userId) {
      throw new ForbiddenException('Not allowed');
    }
    if (role === Role.APPROVER) {
      const employee = await this.prisma.user.findUnique({ where: { id: request.employeeId } });
      if (!employee || (employee.managerId !== userId && request.employeeId !== userId)) {
        throw new ForbiddenException('Not allowed');
      }
    }
    const requestWithActions = await this.prisma.expenseRequest.findUnique({
      where: { id },
      include: { lineItems: true, receipts: true, actions: true, category: true, employee: true }
    });

    if (!requestWithActions) {
      throw new NotFoundException('Request not found');
    }

    const [requestWithActors] = await this.attachActionActors([requestWithActions]);
    return requestWithActors;
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

  async financeProcess(actorId: string, role: Role, id: string) {
    if (role !== Role.FINANCE_ADMIN && role !== Role.SYSTEM_ADMIN) {
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
    if (role !== Role.FINANCE_ADMIN && role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenException('Only finance can mark paid');
    }
    const request = await this.getRequestOrThrow(id);
    if (!FINANCE_PAYABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException('Request must be approved');
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
