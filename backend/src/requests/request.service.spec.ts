import { RequestService } from './request.service';
import { RequestStatus, Role, ApprovalActionType } from '@prisma/client';

const prismaMock = {
  expenseCategory: {
    findUnique: jest.fn()
  },
  budgetAllocation: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  expenseRequest: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn()
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn()
  },
  approvalAction: {
    create: jest.fn()
  }
};

const auditMock = {
  recordEvent: jest.fn()
};

const notificationMock = {
  send: jest.fn()
};

describe('RequestService workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.expenseCategory.findUnique.mockResolvedValue({ id: 'cat', expenseType: 'TRAVEL', name: 'Travel' });
  });

  it('prevents employee from approving', async () => {
    const service = new RequestService(prismaMock as any, auditMock as any, notificationMock as any);
    await expect(service.approveRequest('user', Role.EMPLOYEE, 'req', 'ok')).rejects.toThrow(
      'Only approvers can approve'
    );
  });

  it('allows approver to approve under review request', async () => {
    const service = new RequestService(prismaMock as any, auditMock as any, notificationMock as any);
    prismaMock.expenseRequest.findUnique.mockResolvedValue({
      id: 'req',
      status: RequestStatus.UNDER_REVIEW,
      employeeId: 'emp',
      employee: { email: 'emp@example.com' },
      category: { requiresReceipt: false },
      receipts: [],
      lineItems: [],
      reason: 'test'
    });
    prismaMock.expenseRequest.update.mockResolvedValue({ id: 'req', status: RequestStatus.APPROVED });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'emp', managerId: 'approver' });

    const result = await service.approveRequest('approver', Role.APPROVER, 'req', 'ok');
    expect(result.status).toEqual(RequestStatus.APPROVED);
    expect(prismaMock.approvalAction.create).toHaveBeenCalledWith({
      data: {
        requestId: 'req',
        actorId: 'approver',
        actionType: ApprovalActionType.APPROVE,
        fromStatus: RequestStatus.UNDER_REVIEW,
        toStatus: RequestStatus.APPROVED,
        comment: 'ok'
      }
    });
  });

  it('handles listRequests when legacy actions have null actorId', async () => {
    const service = new RequestService(prismaMock as any, auditMock as any, notificationMock as any);
    prismaMock.expenseRequest.findMany.mockResolvedValue([
      {
        id: 'req',
        actions: [
          { id: 'a1', actorId: null, actionType: ApprovalActionType.SUBMIT },
          { id: 'a2', actorId: '11111111-1111-4111-8111-111111111111', actionType: ApprovalActionType.APPROVE },
          { id: 'a3', actorId: 'legacy-user-id', actionType: ApprovalActionType.APPROVE }
        ],
        category: {},
        employee: {}
      }
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111', fullName: 'Approver One', email: 'approver@example.com' }
    ]);

    const [request] = await service.listRequests('employee', Role.EMPLOYEE);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['11111111-1111-4111-8111-111111111111'] } },
      select: { id: true, fullName: true, email: true }
    });
    expect(request.actions[0].actor).toBeNull();
    expect(request.actions[1].actor).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      fullName: 'Approver One',
      email: 'approver@example.com'
    });
    expect(request.actions[2].actor).toBeNull();
  });

  it('rejects finance processing if not approved', async () => {
    const service = new RequestService(prismaMock as any, auditMock as any, notificationMock as any);
    prismaMock.expenseRequest.findUnique.mockResolvedValue({
      id: 'req',
      status: RequestStatus.UNDER_REVIEW,
      employeeId: 'emp',
      employee: { email: 'emp@example.com' },
      category: { requiresReceipt: false },
      receipts: [],
      lineItems: [],
      reason: 'test'
    });
    await expect(service.financeProcess('finance', Role.FINANCE_ADMIN, 'req')).rejects.toThrow(
      'Request must be approved'
    );
  });

  it('rejects benefit draft creation when request amount exceeds remaining budget', async () => {
    const service = new RequestService(prismaMock as any, auditMock as any, notificationMock as any);
    prismaMock.expenseRequest.count.mockResolvedValue(0);
    prismaMock.expenseCategory.findUnique.mockResolvedValue({ id: 'benefit-cat', expenseType: 'BENEFIT', name: 'Eyeglass' });
    prismaMock.budgetAllocation.findUnique.mockResolvedValue({ allocated: 200, spent: 0 });

    await expect(service.createRequest('emp', Role.EMPLOYEE, {
      categoryId: 'benefit-cat',
      reason: 'new glasses',
      currency: 'EUR',
      totalAmount: 1000
    } as any)).rejects.toThrow('exceeds remaining budget');
  });

  it('converts non-EUR benefit amount when updating spent budget on paid', async () => {
    const service = new RequestService(prismaMock as any, auditMock as any, notificationMock as any);
    prismaMock.expenseRequest.findUnique.mockResolvedValue({
      id: 'req',
      status: RequestStatus.APPROVED,
      employeeId: 'emp',
      categoryId: 'benefit-cat',
      totalAmount: 100,
      currency: 'USD',
      submittedAt: new Date('2026-01-10T00:00:00.000Z'),
      requestNumber: 'REQ-2026-00001',
      employee: { email: 'emp@example.com' },
      category: { expenseType: 'BENEFIT' },
      receipts: [],
      lineItems: [],
      reason: 'test'
    });
    prismaMock.expenseRequest.update.mockResolvedValue({ id: 'req', status: RequestStatus.PAID });
    prismaMock.budgetAllocation.findUnique.mockResolvedValue({ id: 'bud', spent: 50, allocated: 200 });

    await service.financePaid('finance', Role.FINANCE_ADMIN, 'req');

    expect(prismaMock.budgetAllocation.update).toHaveBeenCalledWith({
      where: { id: 'bud' },
      data: { spent: 142 }
    });
  });
});
