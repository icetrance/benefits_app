import { RequestService } from './request.service';
import { RequestStatus, Role, ApprovalActionType } from '@prisma/client';

const prismaMock = {
  expenseRequest: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
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
});
