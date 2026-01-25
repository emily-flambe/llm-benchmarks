/**
 * BenchmarkSchedulerDO - Durable Object for schedule deduplication
 *
 * Ensures that scheduled benchmark runs don't execute multiple times
 * when cron triggers fire across multiple Worker instances.
 */

import { DurableObject } from 'cloudflare:workers';

interface ClaimRecord {
  claimedAt: string;
  workerId: string;
}

export class BenchmarkSchedulerDO extends DurableObject<Env> {
  /**
   * Attempt to claim a benchmark execution for a specific minute.
   * Returns true if this caller successfully claimed, false if already claimed.
   */
  async claimExecution(modelId: string, scheduledMinute: string): Promise<boolean> {
    const key = `${modelId}:${scheduledMinute}`;

    // Check if already claimed
    const existing = await this.ctx.storage.get<ClaimRecord>(key);
    if (existing) {
      return false;
    }

    // Claim it
    const claim: ClaimRecord = {
      claimedAt: new Date().toISOString(),
      workerId: crypto.randomUUID(),
    };
    await this.ctx.storage.put(key, claim);

    return true;
  }

  /**
   * Check if a benchmark execution is already claimed for a specific minute.
   */
  async isClaimExists(modelId: string, scheduledMinute: string): Promise<boolean> {
    const key = `${modelId}:${scheduledMinute}`;
    const existing = await this.ctx.storage.get<ClaimRecord>(key);
    return existing !== undefined;
  }

  /**
   * Clean up claims older than the specified cutoff.
   */
  async cleanupOldClaims(olderThanMinute: string): Promise<number> {
    const allKeys = await this.ctx.storage.list<ClaimRecord>();
    let deleted = 0;

    for (const [key] of allKeys) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        const minute = parts[parts.length - 1];
        if (minute < olderThanMinute) {
          await this.ctx.storage.delete(key);
          deleted++;
        }
      }
    }

    return deleted;
  }

  /**
   * Handle HTTP requests to the Durable Object.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/claim' && request.method === 'POST') {
        const body = (await request.json()) as { modelId: string; scheduledMinute: string };
        const claimed = await this.claimExecution(body.modelId, body.scheduledMinute);
        return Response.json({ claimed });
      }

      if (path === '/check' && request.method === 'POST') {
        const body = (await request.json()) as { modelId: string; scheduledMinute: string };
        const exists = await this.isClaimExists(body.modelId, body.scheduledMinute);
        return Response.json({ exists });
      }

      if (path === '/cleanup' && request.method === 'POST') {
        const body = (await request.json()) as { olderThanMinute: string };
        const deleted = await this.cleanupOldClaims(body.olderThanMinute);
        return Response.json({ deleted });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Response.json({ error: message }, { status: 500 });
    }
  }
}

/**
 * Truncate a Date to minute precision for claim keys.
 * Returns format: "YYYY-MM-DDTHH:MM"
 */
export function truncateToMinute(date: Date): string {
  return date.toISOString().slice(0, 16);
}

/**
 * Get the singleton scheduler DO instance.
 */
export function getSchedulerDO(
  namespace: DurableObjectNamespace<BenchmarkSchedulerDO>
): DurableObjectStub<BenchmarkSchedulerDO> {
  const id = namespace.idFromName('benchmark-scheduler');
  return namespace.get(id);
}

// Environment type for this module
interface Env {
  BENCHMARK_SCHEDULER: DurableObjectNamespace<BenchmarkSchedulerDO>;
}
