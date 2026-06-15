import {
  bulletinRealtimeChannel,
  canViewBulletin,
  normalizeUserRole,
  parseBulletinRealtimeEvent,
  type BulletinRealtimeEvent,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';

let publisher: Redis | null = null;

function getPublisher(redisUrl: string): Redis {
  if (!publisher) {
    publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }
  return publisher;
}

export async function notifyBulletinUpdated(
  redisUrl: string,
  bulletinId: string,
  updatedAt: Date | string,
): Promise<void> {
  const event: BulletinRealtimeEvent = {
    type: 'updated',
    bulletinId,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : updatedAt.toISOString(),
  };
  await getPublisher(redisUrl).publish(
    bulletinRealtimeChannel(bulletinId),
    JSON.stringify(event),
  );
}

export function registerBulletinRealtimeRoutes(
  app: FastifyInstance,
  { redisUrl }: { redisUrl: string },
): void {
  app.get<{ Params: { id: string } }>(
    '/v1/bulletins/:id/events',
    async (request, reply) => {
      const user = request.authUser;
      if (!user || !canViewBulletin(normalizeUserRole(user.role))) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }

      const bulletinId = request.params.id;
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');

      const subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });
      const channel = bulletinRealtimeChannel(bulletinId);

      const onMessage = (_ch: string, message: string) => {
        const event = parseBulletinRealtimeEvent(message);
        if (!event || event.bulletinId !== bulletinId) return;
        res.write(`event: bulletin\ndata: ${JSON.stringify(event)}\n\n`);
      };

      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 25_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        subscriber.off('message', onMessage);
        void subscriber.unsubscribe(channel).finally(() => {
          void subscriber.quit();
        });
      };

      subscriber.on('message', onMessage);
      request.raw.on('close', cleanup);

      try {
        await subscriber.subscribe(channel);
      } catch (err) {
        cleanup();
        app.log.error(err, 'bulletin SSE subscribe failed');
        if (!res.writableEnded) res.end();
      }
    },
  );
}
