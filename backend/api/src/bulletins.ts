import { asc, desc, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blobs,
  bulletinAnnouncements,
  canManageBulletin,
  canViewBulletin,
  normalizeUserRole,
  weeklyBulletins,
  type Db,
} from '@file-service/shared';
import type { FastifyInstance } from 'fastify';

const BULLETIN_TEMPLATE_DIR = join(
  fileURLToPath(import.meta.url),
  '../../../shared/templates/bulletin',
);

export type BulletinAnnouncementDto = {
  id: string;
  sortOrder: number;
  category: string;
  title: string;
  body: string;
};

export type WeeklyBulletinDto = {
  id: string;
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  birthdayMonth: string;
  birthdayNames: string;
  staffMeetingDate: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  baptismText: string;
  weeklyMeetingVariant: number | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  outputBlobId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string | null;
  announcements: BulletinAnnouncementDto[];
};

function requireUser(request: import('fastify').FastifyRequest) {
  const user = request.authUser;
  if (!user) return null;
  return { ...user, role: normalizeUserRole(user.role) };
}

function mapAnnouncement(row: typeof bulletinAnnouncements.$inferSelect): BulletinAnnouncementDto {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    category: row.category,
    title: row.title,
    body: row.body,
  };
}

async function loadAnnouncements(db: Db, bulletinId: string): Promise<BulletinAnnouncementDto[]> {
  const rows = await db
    .select()
    .from(bulletinAnnouncements)
    .where(eq(bulletinAnnouncements.bulletinId, bulletinId))
    .orderBy(asc(bulletinAnnouncements.sortOrder));
  return rows.map(mapAnnouncement);
}

async function mapBulletin(
  db: Db,
  row: typeof weeklyBulletins.$inferSelect,
): Promise<WeeklyBulletinDto> {
  const announcements = await loadAnnouncements(db, row.id);
  return {
    id: row.id,
    serviceDate: row.serviceDate,
    serviceTime: row.serviceTime,
    status: row.status,
    lastWeekOfferingDate: row.lastWeekOfferingDate,
    offeringQuarterLabel: row.offeringQuarterLabel,
    birthdayMonth: row.birthdayMonth,
    birthdayNames: row.birthdayNames,
    staffMeetingDate: row.staffMeetingDate,
    testimonyShareDate: row.testimonyShareDate,
    serviceRosterText: row.serviceRosterText,
    baptismText: row.baptismText,
    weeklyMeetingVariant: row.weeklyMeetingVariant,
    skipTestimonyWeek: row.skipTestimonyWeek,
    skipDepartmentReports: row.skipDepartmentReports,
    outputBlobId: row.outputBlobId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? null,
    announcements,
  };
}

type BulletinPatchBody = Partial<{
  serviceDate: string;
  serviceTime: string;
  status: string;
  lastWeekOfferingDate: string;
  offeringQuarterLabel: string;
  birthdayMonth: string;
  birthdayNames: string;
  staffMeetingDate: string;
  testimonyShareDate: string;
  serviceRosterText: string;
  baptismText: string;
  weeklyMeetingVariant: number | null;
  skipTestimonyWeek: boolean;
  skipDepartmentReports: boolean;
  outputBlobId: string | null;
}>;

type AnnouncementInput = {
  category?: string;
  title?: string;
  body: string;
};

export function registerBulletinRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/v1/bulletins/template/slides', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const raw = await readFile(join(BULLETIN_TEMPLATE_DIR, 'template-slide-map.json'), 'utf8');
    return reply.send(JSON.parse(raw));
  });

  app.get('/v1/bulletins/template/file', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const buf = await readFile(join(BULLETIN_TEMPLATE_DIR, 'weekly-bulletin-template.pptx'));
    return reply
      .header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      )
      .header('Content-Disposition', 'attachment; filename="weekly-bulletin-template.pptx"')
      .send(buf);
  });

  app.get('/v1/bulletins', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const rows = await db
      .select()
      .from(weeklyBulletins)
      .orderBy(desc(weeklyBulletins.serviceDate))
      .limit(24);
    const bulletins = await Promise.all(rows.map((row) => mapBulletin(db, row)));
    return reply.send({ bulletins });
  });

  app.get<{ Params: { id: string } }>('/v1/bulletins/:id', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canViewBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const [row] = await db
      .select()
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.id, request.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ bulletin: await mapBulletin(db, row) });
  });

  app.post<{ Body: { serviceDate?: string } }>('/v1/bulletins', async (request, reply) => {
    const user = requireUser(request);
    if (!user || !canManageBulletin(user.role)) {
      return reply.code(403).send({ error: 'bulletin_forbidden' });
    }
    const serviceDate = request.body?.serviceDate?.trim();
    if (!serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
      return reply.code(400).send({ error: 'invalid_service_date' });
    }
    const [existing] = await db
      .select({ id: weeklyBulletins.id })
      .from(weeklyBulletins)
      .where(eq(weeklyBulletins.serviceDate, serviceDate));
    if (existing) {
      return reply.code(409).send({ error: 'bulletin_exists', id: existing.id });
    }
    const [row] = await db
      .insert(weeklyBulletins)
      .values({
        serviceDate,
        createdByUserId: user.id,
      })
      .returning();
    return reply.code(201).send({ bulletin: await mapBulletin(db, row!) });
  });

  app.patch<{ Params: { id: string }; Body: BulletinPatchBody }>(
    '/v1/bulletins/:id',
    async (request, reply) => {
      const user = requireUser(request);
      if (!user || !canManageBulletin(user.role)) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }
      const [existing] = await db
        .select()
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const body = request.body ?? {};
      const patch: Partial<typeof weeklyBulletins.$inferInsert> = {
        updatedAt: new Date(),
      };
      const assignText = (
        key: keyof BulletinPatchBody,
        column: keyof typeof weeklyBulletins.$inferInsert,
      ) => {
        if (body[key] !== undefined) {
          (patch as Record<string, unknown>)[column] = body[key];
        }
      };
      if (body.serviceDate !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate)) {
          return reply.code(400).send({ error: 'invalid_service_date' });
        }
        patch.serviceDate = body.serviceDate;
      }
      assignText('serviceTime', 'serviceTime');
      assignText('status', 'status');
      assignText('lastWeekOfferingDate', 'lastWeekOfferingDate');
      assignText('offeringQuarterLabel', 'offeringQuarterLabel');
      assignText('birthdayMonth', 'birthdayMonth');
      assignText('birthdayNames', 'birthdayNames');
      assignText('staffMeetingDate', 'staffMeetingDate');
      assignText('testimonyShareDate', 'testimonyShareDate');
      assignText('serviceRosterText', 'serviceRosterText');
      assignText('baptismText', 'baptismText');
      if (body.weeklyMeetingVariant !== undefined) {
        const v = body.weeklyMeetingVariant;
        if (v !== null && v !== 28 && v !== 29 && v !== 30) {
          return reply.code(400).send({ error: 'invalid_meeting_variant' });
        }
        patch.weeklyMeetingVariant = v;
      }
      if (body.skipTestimonyWeek !== undefined) patch.skipTestimonyWeek = body.skipTestimonyWeek;
      if (body.skipDepartmentReports !== undefined) {
        patch.skipDepartmentReports = body.skipDepartmentReports;
      }
      if (body.outputBlobId !== undefined) {
        if (body.outputBlobId === null) {
          patch.outputBlobId = null;
        } else {
          const [blob] = await db
            .select({ id: blobs.id })
            .from(blobs)
            .where(eq(blobs.id, body.outputBlobId));
          if (!blob) {
            return reply.code(400).send({ error: 'invalid_blob_id' });
          }
          patch.outputBlobId = body.outputBlobId;
        }
      }

      const [row] = await db
        .update(weeklyBulletins)
        .set(patch)
        .where(eq(weeklyBulletins.id, request.params.id))
        .returning();
      return reply.send({ bulletin: await mapBulletin(db, row!) });
    },
  );

  app.put<{ Params: { id: string }; Body: { announcements?: AnnouncementInput[] } }>(
    '/v1/bulletins/:id/announcements',
    async (request, reply) => {
      const user = requireUser(request);
      if (!user || !canManageBulletin(user.role)) {
        return reply.code(403).send({ error: 'bulletin_forbidden' });
      }
      const [existing] = await db
        .select({ id: weeklyBulletins.id })
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      if (!existing) return reply.code(404).send({ error: 'not_found' });

      const items = request.body?.announcements ?? [];
      if (!Array.isArray(items)) {
        return reply.code(400).send({ error: 'invalid_announcements' });
      }

      await db
        .delete(bulletinAnnouncements)
        .where(eq(bulletinAnnouncements.bulletinId, request.params.id));

      if (items.length) {
        await db.insert(bulletinAnnouncements).values(
          items.map((item, index) => ({
            bulletinId: request.params.id,
            sortOrder: index,
            category: (item.category ?? 'general').trim() || 'general',
            title: (item.title ?? '').trim(),
            body: item.body.trim(),
          })),
        );
      }

      const [row] = await db
        .select()
        .from(weeklyBulletins)
        .where(eq(weeklyBulletins.id, request.params.id));
      return reply.send({ bulletin: await mapBulletin(db, row!) });
    },
  );
}
