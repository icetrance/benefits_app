import { AuditService } from './audit.service';
import { createHash } from 'crypto';

const prismaMock = {
  auditLog: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn()
  }
};

describe('AuditService', () => {
  it('verifies valid chain', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const eventDataJson = JSON.stringify({ action: 'test' });
    const hashSource = `GENESIS${eventDataJson}actor1EntityTypeentity1${now.toISOString()}`;
    const hash = createHash('sha256').update(hashSource).digest('hex');
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: '1',
        actorId: 'actor1',
        entityType: 'EntityType',
        entityId: 'entity1',
        eventDataJson,
        hash,
        createdAt: now
      }
    ]);
    const service = new AuditService(prismaMock as any);
    const result = await service.verifyChain();
    expect(result.valid).toBe(true);
  });

  it('detects tampering', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    prismaMock.auditLog.findMany.mockResolvedValue([
      {
        id: '1',
        actorId: 'actor1',
        entityType: 'EntityType',
        entityId: 'entity1',
        eventDataJson: JSON.stringify({ action: 'test' }),
        hash: 'bad',
        createdAt: now
      }
    ]);
    const service = new AuditService(prismaMock as any);
    const result = await service.verifyChain();
    expect(result.valid).toBe(false);
  });
});
