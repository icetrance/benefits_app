import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHash } from 'crypto';

export interface AuditEventInput {
  actorId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  eventData: Record<string, unknown>;
}

function sortObject(input: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sorted[key] = sortObject(value as Record<string, unknown>);
    } else {
      sorted[key] = value;
    }
  }
  return sorted;
}

function canonicalStringify(input: Record<string, unknown>): string {
  return JSON.stringify(sortObject(input));
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: AuditEventInput) {
    const latest = await this.prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    const prevHash = latest?.hash || 'GENESIS';
    const timestamp = new Date().toISOString();
    const eventDataJson = canonicalStringify(input.eventData);
    const hashSource = `${prevHash}${eventDataJson}${input.actorId}${input.entityType}${input.entityId}${timestamp}`;
    const hash = createHash('sha256').update(hashSource).digest('hex');
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        eventDataJson,
        prevHash,
        hash,
        createdAt: new Date(timestamp)
      }
    });
  }

  async verifyChain() {
    const logs = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    let prevHash = 'GENESIS';
    for (const log of logs) {
      const hashSource = `${prevHash}${log.eventDataJson}${log.actorId}${log.entityType}${log.entityId}${log.createdAt.toISOString()}`;
      const computed = createHash('sha256').update(hashSource).digest('hex');
      if (computed !== log.hash) {
        return { valid: false, failedAt: log.id };
      }
      prevHash = log.hash;
    }
    return { valid: true, count: logs.length };
  }
}
