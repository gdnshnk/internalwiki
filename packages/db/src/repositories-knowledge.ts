import { randomUUID } from "node:crypto";
import type {
  FreshnessStatus,
  KnowledgeAccessLevel,
  KnowledgeDependency,
  KnowledgeDependencyRelation,
  KnowledgeDependencyType,
  KnowledgeFreshnessDashboard,
  KnowledgeObject,
  KnowledgeObjectVersion,
  KnowledgePermissionEffect,
  KnowledgePermissionPrincipalType,
  KnowledgePermissionRule,
  KnowledgePermissionsMode,
  KnowledgeReviewTask,
  KnowledgeReviewTaskPriority,
  KnowledgeReviewTaskStatus,
  KnowledgeReviewTaskType,
  KnowledgeReviewer,
  KnowledgeSourceType,
  KnowledgeTag
} from "@internalwiki/core";
import { queryOrg, withOrgTransaction } from "./client";

type DbKnowledgeObjectRow = {
  id: string;
  organization_id: string;
  title: string;
  slug: string;
  owner_user_id: string;
  source_type: KnowledgeSourceType;
  review_interval_days: number;
  review_due_at: string;
  freshness_status: FreshnessStatus;
  confidence_score: number;
  last_validated_at: string | null;
  provenance: Record<string, unknown> | null;
  permissions_mode: KnowledgePermissionsMode;
  latest_version_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbKnowledgeObjectVersionRow = {
  id: string;
  organization_id: string;
  knowledge_object_id: string;
  version_number: number;
  content_markdown: string;
  content_blocks: Array<Record<string, unknown>> | null;
  change_summary: string | null;
  validated_by_user_id: string | null;
  validated_at: string | null;
  created_at: string;
};

type DbKnowledgeReviewerRow = {
  id: string;
  organization_id: string;
  knowledge_object_id: string;
  reviewer_user_id: string;
  required: boolean;
  created_at: string;
};

type DbKnowledgeTagRow = {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
};

type DbKnowledgeDependencyRow = {
  id: string;
  organization_id: string;
  knowledge_object_id: string;
  dependency_type: KnowledgeDependencyType;
  dependency_object_id: string | null;
  dependency_ref: string | null;
  dependency_label: string | null;
  relation_type: KnowledgeDependencyRelation;
  last_observed_version: string | null;
  created_at: string;
  updated_at: string;
};

type DbKnowledgePermissionRuleRow = {
  id: string;
  organization_id: string;
  knowledge_object_id: string;
  principal_type: KnowledgePermissionPrincipalType;
  principal_key: string;
  access_level: KnowledgeAccessLevel;
  effect: KnowledgePermissionEffect;
  created_at: string;
};

type DbKnowledgeReviewTaskRow = {
  id: string;
  organization_id: string;
  knowledge_object_id: string | null;
  task_type: KnowledgeReviewTaskType;
  status: KnowledgeReviewTaskStatus;
  priority: KnowledgeReviewTaskPriority;
  reason: string;
  metadata: Record<string, unknown> | null;
  due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeChunkSearchRecord = {
  chunkId: string;
  knowledgeObjectId: string;
  knowledgeObjectVersionId: string;
  knowledgeObjectTitle: string;
  text: string;
  sourceUrl: string;
  sourceScore: number;
  updatedAt: string;
  ownerUserId: string;
  vectorRank?: number;
  lexicalRank?: number;
  vectorDistance?: number;
  lexicalScore?: number;
  combinedScore: number;
};

function mapKnowledgeObject(row: DbKnowledgeObjectRow): KnowledgeObject {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    slug: row.slug,
    ownerUserId: row.owner_user_id,
    sourceType: row.source_type,
    reviewIntervalDays: Number(row.review_interval_days),
    reviewDueAt: row.review_due_at,
    freshnessStatus: row.freshness_status,
    confidenceScore: Number(row.confidence_score),
    lastValidatedAt: row.last_validated_at ?? undefined,
    provenance: row.provenance ?? {},
    permissionsMode: row.permissions_mode,
    latestVersionId: row.latest_version_id ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapKnowledgeVersion(row: DbKnowledgeObjectVersionRow): KnowledgeObjectVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    knowledgeObjectId: row.knowledge_object_id,
    versionNumber: Number(row.version_number),
    contentMarkdown: row.content_markdown,
    contentBlocks: Array.isArray(row.content_blocks) ? row.content_blocks : [],
    changeSummary: row.change_summary ?? undefined,
    validatedByUserId: row.validated_by_user_id ?? undefined,
    validatedAt: row.validated_at ?? undefined,
    createdAt: row.created_at
  };
}

function mapKnowledgeReviewer(row: DbKnowledgeReviewerRow): KnowledgeReviewer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    knowledgeObjectId: row.knowledge_object_id,
    reviewerUserId: row.reviewer_user_id,
    required: row.required,
    createdAt: row.created_at
  };
}

function mapKnowledgeTag(row: DbKnowledgeTagRow): KnowledgeTag {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    createdAt: row.created_at
  };
}

function mapKnowledgeDependency(row: DbKnowledgeDependencyRow): KnowledgeDependency {
  return {
    id: row.id,
    organizationId: row.organization_id,
    knowledgeObjectId: row.knowledge_object_id,
    dependencyType: row.dependency_type,
    dependencyObjectId: row.dependency_object_id ?? undefined,
    dependencyRef: row.dependency_ref ?? undefined,
    dependencyLabel: row.dependency_label ?? undefined,
    relationType: row.relation_type,
    lastObservedVersion: row.last_observed_version ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapKnowledgePermissionRule(row: DbKnowledgePermissionRuleRow): KnowledgePermissionRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    knowledgeObjectId: row.knowledge_object_id,
    principalType: row.principal_type,
    principalKey: row.principal_key,
    accessLevel: row.access_level,
    effect: row.effect,
    createdAt: row.created_at
  };
}

function mapKnowledgeReviewTask(row: DbKnowledgeReviewTaskRow): KnowledgeReviewTask {
  return {
    id: row.id,
    organizationId: row.organization_id,
    knowledgeObjectId: row.knowledge_object_id ?? undefined,
    taskType: row.task_type,
    status: row.status,
    priority: row.priority,
    reason: row.reason,
    metadata: row.metadata ?? {},
    dueAt: row.due_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listKnowledgeObjects(input: {
  organizationId: string;
  includeArchived?: boolean;
  freshnessStatus?: FreshnessStatus;
  ownerUserId?: string;
  tags?: string[];
  limit?: number;
}): Promise<KnowledgeObject[]> {
  const includeArchived = input.includeArchived ?? false;
  const limit = Math.max(1, Math.min(200, input.limit ?? 100));

  const rows = await queryOrg<DbKnowledgeObjectRow>(
    input.organizationId,
    `
      SELECT ko.*
      FROM knowledge_objects ko
      WHERE ko.organization_id = $1
        AND ($2::boolean = TRUE OR ko.archived_at IS NULL)
        AND ($3::text IS NULL OR ko.freshness_status = $3)
        AND ($4::text IS NULL OR ko.owner_user_id = $4)
        AND (
          COALESCE(array_length($5::text[], 1), 0) = 0
          OR EXISTS (
            SELECT 1
            FROM knowledge_object_tag_map tm
            JOIN knowledge_tags kt
              ON kt.id = tm.tag_id
              AND kt.organization_id = tm.organization_id
            WHERE tm.organization_id = ko.organization_id
              AND tm.knowledge_object_id = ko.id
              AND lower(kt.name) = ANY($5::text[])
          )
        )
      ORDER BY ko.updated_at DESC
      LIMIT $6
    `,
    [
      input.organizationId,
      includeArchived,
      input.freshnessStatus ?? null,
      input.ownerUserId ?? null,
      (input.tags ?? []).map((tag) => tag.toLowerCase()),
      limit
    ]
  );

  return rows.map(mapKnowledgeObject);
}

export async function getKnowledgeObjectById(
  organizationId: string,
  knowledgeObjectId: string
): Promise<KnowledgeObject | null> {
  const rows = await queryOrg<DbKnowledgeObjectRow>(
    organizationId,
    `
      SELECT *
      FROM knowledge_objects
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [organizationId, knowledgeObjectId]
  );

  return rows[0] ? mapKnowledgeObject(rows[0]) : null;
}

export async function createKnowledgeObject(input: {
  id?: string;
  organizationId: string;
  title: string;
  slug: string;
  ownerUserId: string;
  sourceType: KnowledgeSourceType;
  reviewIntervalDays: number;
  reviewDueAt?: string;
  freshnessStatus?: FreshnessStatus;
  confidenceScore?: number;
  lastValidatedAt?: string;
  provenance?: Record<string, unknown>;
  permissionsMode?: KnowledgePermissionsMode;
  createdBy?: string;
}): Promise<KnowledgeObject> {
  const id = input.id ?? randomUUID();
  const rows = await queryOrg<DbKnowledgeObjectRow>(
    input.organizationId,
    `
      INSERT INTO knowledge_objects (
        id,
        organization_id,
        title,
        slug,
        owner_user_id,
        source_type,
        review_interval_days,
        review_due_at,
        freshness_status,
        confidence_score,
        last_validated_at,
        provenance,
        permissions_mode,
        created_by
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        COALESCE($8::timestamptz, NOW() + (($7::int)::text || ' days')::interval),
        $9,
        $10,
        $11,
        $12::jsonb,
        $13,
        $14
      )
      RETURNING *
    `,
    [
      id,
      input.organizationId,
      input.title,
      input.slug,
      input.ownerUserId,
      input.sourceType,
      Math.max(1, Math.min(365, input.reviewIntervalDays)),
      input.reviewDueAt ?? null,
      input.freshnessStatus ?? "fresh",
      input.confidenceScore ?? 0.5,
      input.lastValidatedAt ?? null,
      JSON.stringify(input.provenance ?? {}),
      input.permissionsMode ?? "custom",
      input.createdBy ?? null
    ]
  );

  return mapKnowledgeObject(rows[0] as DbKnowledgeObjectRow);
}

export async function updateKnowledgeObject(input: {
  organizationId: string;
  knowledgeObjectId: string;
  title?: string;
  slug?: string;
  ownerUserId?: string;
  reviewIntervalDays?: number;
  reviewDueAt?: string;
  freshnessStatus?: FreshnessStatus;
  confidenceScore?: number;
  lastValidatedAt?: string;
  provenance?: Record<string, unknown>;
  permissionsMode?: KnowledgePermissionsMode;
}): Promise<KnowledgeObject | null> {
  const rows = await queryOrg<DbKnowledgeObjectRow>(
    input.organizationId,
    `
      UPDATE knowledge_objects
      SET
        title = COALESCE($3, title),
        slug = COALESCE($4, slug),
        owner_user_id = COALESCE($5, owner_user_id),
        review_interval_days = COALESCE($6, review_interval_days),
        review_due_at = COALESCE($7::timestamptz, review_due_at),
        freshness_status = COALESCE($8, freshness_status),
        confidence_score = COALESCE($9, confidence_score),
        last_validated_at = COALESCE($10::timestamptz, last_validated_at),
        provenance = COALESCE($11::jsonb, provenance),
        permissions_mode = COALESCE($12, permissions_mode),
        updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      RETURNING *
    `,
    [
      input.organizationId,
      input.knowledgeObjectId,
      input.title ?? null,
      input.slug ?? null,
      input.ownerUserId ?? null,
      input.reviewIntervalDays ? Math.max(1, Math.min(365, input.reviewIntervalDays)) : null,
      input.reviewDueAt ?? null,
      input.freshnessStatus ?? null,
      input.confidenceScore ?? null,
      input.lastValidatedAt ?? null,
      input.provenance ? JSON.stringify(input.provenance) : null,
      input.permissionsMode ?? null
    ]
  );

  return rows[0] ? mapKnowledgeObject(rows[0]) : null;
}

export async function archiveKnowledgeObject(input: {
  organizationId: string;
  knowledgeObjectId: string;
}): Promise<boolean> {
  const rows = await queryOrg<{ id: string }>(
    input.organizationId,
    `
      UPDATE knowledge_objects
      SET archived_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
        AND archived_at IS NULL
      RETURNING id
    `,
    [input.organizationId, input.knowledgeObjectId]
  );

  return rows.length > 0;
}

export async function listKnowledgeObjectVersions(input: {
  organizationId: string;
  knowledgeObjectId: string;
  limit?: number;
}): Promise<KnowledgeObjectVersion[]> {
  const rows = await queryOrg<DbKnowledgeObjectVersionRow>(
    input.organizationId,
    `
      SELECT *
      FROM knowledge_object_versions
      WHERE organization_id = $1
        AND knowledge_object_id = $2
      ORDER BY version_number DESC
      LIMIT $3
    `,
    [input.organizationId, input.knowledgeObjectId, Math.max(1, Math.min(100, input.limit ?? 25))]
  );

  return rows.map(mapKnowledgeVersion);
}

export async function createKnowledgeObjectVersion(input: {
  organizationId: string;
  knowledgeObjectId: string;
  contentMarkdown: string;
  contentBlocks?: Array<Record<string, unknown>>;
  changeSummary?: string;
  validatedByUserId?: string;
  validatedAt?: string;
  createdBy?: string;
}): Promise<KnowledgeObjectVersion | null> {
  return withOrgTransaction(input.organizationId, async (client) => {
    const exists = await client.query<{ id: string; review_interval_days: number }>(
      `
        SELECT id, review_interval_days
        FROM knowledge_objects
        WHERE organization_id = $1
          AND id = $2
        LIMIT 1
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    if (!exists.rows[0]) {
      return null;
    }

    const nextVersionRows = await client.query<{ next_version: number }>(
      `
        SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
        FROM knowledge_object_versions
        WHERE organization_id = $1
          AND knowledge_object_id = $2
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    const versionId = randomUUID();
    const versionNumber = Number(nextVersionRows.rows[0]?.next_version ?? 1);

    const versionRows = await client.query<DbKnowledgeObjectVersionRow>(
      `
        INSERT INTO knowledge_object_versions (
          id,
          organization_id,
          knowledge_object_id,
          version_number,
          content_markdown,
          content_blocks,
          change_summary,
          validated_by_user_id,
          validated_at,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::timestamptz, $10)
        RETURNING *
      `,
      [
        versionId,
        input.organizationId,
        input.knowledgeObjectId,
        versionNumber,
        input.contentMarkdown,
        JSON.stringify(input.contentBlocks ?? []),
        input.changeSummary ?? null,
        input.validatedByUserId ?? null,
        input.validatedAt ?? null,
        input.createdBy ?? null
      ]
    );

    const reviewInterval = Number(exists.rows[0].review_interval_days);
    await client.query(
      `
        UPDATE knowledge_objects
        SET
          latest_version_id = $3,
          freshness_status = 'fresh',
          review_due_at = NOW() + (($4::int)::text || ' days')::interval,
          updated_at = NOW(),
          last_validated_at = COALESCE($5::timestamptz, last_validated_at)
        WHERE organization_id = $1
          AND id = $2
      `,
      [
        input.organizationId,
        input.knowledgeObjectId,
        versionId,
        reviewInterval,
        input.validatedAt ?? null
      ]
    );

    return mapKnowledgeVersion(versionRows.rows[0] as DbKnowledgeObjectVersionRow);
  });
}

export async function replaceKnowledgeObjectReviewers(input: {
  organizationId: string;
  knowledgeObjectId: string;
  reviewers: Array<{ reviewerUserId: string; required?: boolean }>;
  createdBy?: string;
}): Promise<KnowledgeReviewer[]> {
  return withOrgTransaction(input.organizationId, async (client) => {
    await client.query(
      `
        DELETE FROM knowledge_object_reviewers
        WHERE organization_id = $1
          AND knowledge_object_id = $2
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    const created: DbKnowledgeReviewerRow[] = [];
    for (const reviewer of input.reviewers) {
      const rows = await client.query<DbKnowledgeReviewerRow>(
        `
          INSERT INTO knowledge_object_reviewers (
            id,
            organization_id,
            knowledge_object_id,
            reviewer_user_id,
            required,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          randomUUID(),
          input.organizationId,
          input.knowledgeObjectId,
          reviewer.reviewerUserId,
          reviewer.required ?? true,
          input.createdBy ?? null
        ]
      );
      created.push(rows.rows[0] as DbKnowledgeReviewerRow);
    }

    return created.map(mapKnowledgeReviewer);
  });
}

export async function listKnowledgeObjectReviewers(input: {
  organizationId: string;
  knowledgeObjectId: string;
}): Promise<KnowledgeReviewer[]> {
  const rows = await queryOrg<DbKnowledgeReviewerRow>(
    input.organizationId,
    `
      SELECT *
      FROM knowledge_object_reviewers
      WHERE organization_id = $1
        AND knowledge_object_id = $2
      ORDER BY created_at ASC
    `,
    [input.organizationId, input.knowledgeObjectId]
  );

  return rows.map(mapKnowledgeReviewer);
}

export async function replaceKnowledgeObjectTags(input: {
  organizationId: string;
  knowledgeObjectId: string;
  tags: string[];
  createdBy?: string;
}): Promise<KnowledgeTag[]> {
  return withOrgTransaction(input.organizationId, async (client) => {
    await client.query(
      `
        DELETE FROM knowledge_object_tag_map
        WHERE organization_id = $1
          AND knowledge_object_id = $2
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    for (const rawName of input.tags) {
      const name = rawName.trim();
      if (!name) {
        continue;
      }
      const tagRows = await client.query<DbKnowledgeTagRow>(
        `
          INSERT INTO knowledge_tags (id, organization_id, name, created_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (organization_id, lower(name))
          DO UPDATE SET name = EXCLUDED.name
          RETURNING id, organization_id, name, created_at
        `,
        [randomUUID(), input.organizationId, name, input.createdBy ?? null]
      );

      const tag = tagRows.rows[0] as DbKnowledgeTagRow;
      await client.query(
        `
          INSERT INTO knowledge_object_tag_map (id, organization_id, knowledge_object_id, tag_id, created_by)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (organization_id, knowledge_object_id, tag_id) DO NOTHING
        `,
        [randomUUID(), input.organizationId, input.knowledgeObjectId, tag.id, input.createdBy ?? null]
      );
    }

    const rows = await client.query<DbKnowledgeTagRow>(
      `
        SELECT kt.id, kt.organization_id, kt.name, kt.created_at
        FROM knowledge_object_tag_map tm
        JOIN knowledge_tags kt
          ON kt.id = tm.tag_id
          AND kt.organization_id = tm.organization_id
        WHERE tm.organization_id = $1
          AND tm.knowledge_object_id = $2
        ORDER BY kt.name ASC
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    return rows.rows.map(mapKnowledgeTag);
  });
}

export async function listKnowledgeObjectTags(input: {
  organizationId: string;
  knowledgeObjectId: string;
}): Promise<KnowledgeTag[]> {
  const rows = await queryOrg<DbKnowledgeTagRow>(
    input.organizationId,
    `
      SELECT kt.id, kt.organization_id, kt.name, kt.created_at
      FROM knowledge_object_tag_map tm
      JOIN knowledge_tags kt
        ON kt.id = tm.tag_id
        AND kt.organization_id = tm.organization_id
      WHERE tm.organization_id = $1
        AND tm.knowledge_object_id = $2
      ORDER BY kt.name ASC
    `,
    [input.organizationId, input.knowledgeObjectId]
  );

  return rows.map(mapKnowledgeTag);
}

export async function replaceKnowledgeObjectDependencies(input: {
  organizationId: string;
  knowledgeObjectId: string;
  dependencies: Array<{
    dependencyType: KnowledgeDependencyType;
    dependencyObjectId?: string;
    dependencyRef?: string;
    dependencyLabel?: string;
    relationType?: KnowledgeDependencyRelation;
    lastObservedVersion?: string;
  }>;
  createdBy?: string;
}): Promise<KnowledgeDependency[]> {
  return withOrgTransaction(input.organizationId, async (client) => {
    await client.query(
      `
        DELETE FROM knowledge_object_dependencies
        WHERE organization_id = $1
          AND knowledge_object_id = $2
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    const created: DbKnowledgeDependencyRow[] = [];
    for (const dependency of input.dependencies) {
      const rows = await client.query<DbKnowledgeDependencyRow>(
        `
          INSERT INTO knowledge_object_dependencies (
            id,
            organization_id,
            knowledge_object_id,
            dependency_type,
            dependency_object_id,
            dependency_ref,
            dependency_label,
            relation_type,
            last_observed_version,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `,
        [
          randomUUID(),
          input.organizationId,
          input.knowledgeObjectId,
          dependency.dependencyType,
          dependency.dependencyObjectId ?? null,
          dependency.dependencyRef ?? null,
          dependency.dependencyLabel ?? null,
          dependency.relationType ?? "depends_on",
          dependency.lastObservedVersion ?? null,
          input.createdBy ?? null
        ]
      );
      created.push(rows.rows[0] as DbKnowledgeDependencyRow);
    }

    return created.map(mapKnowledgeDependency);
  });
}

export async function listKnowledgeObjectDependencies(input: {
  organizationId: string;
  knowledgeObjectId: string;
}): Promise<KnowledgeDependency[]> {
  const rows = await queryOrg<DbKnowledgeDependencyRow>(
    input.organizationId,
    `
      SELECT *
      FROM knowledge_object_dependencies
      WHERE organization_id = $1
        AND knowledge_object_id = $2
      ORDER BY created_at ASC
    `,
    [input.organizationId, input.knowledgeObjectId]
  );

  return rows.map(mapKnowledgeDependency);
}

export async function replaceKnowledgeObjectPermissionRules(input: {
  organizationId: string;
  knowledgeObjectId: string;
  rules: Array<{
    principalType: KnowledgePermissionPrincipalType;
    principalKey: string;
    accessLevel: KnowledgeAccessLevel;
    effect?: KnowledgePermissionEffect;
  }>;
  createdBy?: string;
}): Promise<KnowledgePermissionRule[]> {
  return withOrgTransaction(input.organizationId, async (client) => {
    await client.query(
      `
        DELETE FROM knowledge_object_permission_rules
        WHERE organization_id = $1
          AND knowledge_object_id = $2
      `,
      [input.organizationId, input.knowledgeObjectId]
    );

    const created: DbKnowledgePermissionRuleRow[] = [];
    for (const rule of input.rules) {
      const rows = await client.query<DbKnowledgePermissionRuleRow>(
        `
          INSERT INTO knowledge_object_permission_rules (
            id,
            organization_id,
            knowledge_object_id,
            principal_type,
            principal_key,
            access_level,
            effect,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          randomUUID(),
          input.organizationId,
          input.knowledgeObjectId,
          rule.principalType,
          rule.principalKey,
          rule.accessLevel,
          rule.effect ?? "allow",
          input.createdBy ?? null
        ]
      );
      created.push(rows.rows[0] as DbKnowledgePermissionRuleRow);
    }

    return created.map(mapKnowledgePermissionRule);
  });
}

export async function listKnowledgeObjectPermissionRules(input: {
  organizationId: string;
  knowledgeObjectId: string;
}): Promise<KnowledgePermissionRule[]> {
  const rows = await queryOrg<DbKnowledgePermissionRuleRow>(
    input.organizationId,
    `
      SELECT *
      FROM knowledge_object_permission_rules
      WHERE organization_id = $1
        AND knowledge_object_id = $2
      ORDER BY created_at ASC
    `,
    [input.organizationId, input.knowledgeObjectId]
  );

  return rows.map(mapKnowledgePermissionRule);
}

export async function listKnowledgeReviewTasks(input: {
  organizationId: string;
  status?: KnowledgeReviewTaskStatus;
  taskType?: KnowledgeReviewTaskType;
  limit?: number;
}): Promise<KnowledgeReviewTask[]> {
  const rows = await queryOrg<DbKnowledgeReviewTaskRow>(
    input.organizationId,
    `
      SELECT *
      FROM knowledge_review_tasks
      WHERE organization_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND ($3::text IS NULL OR task_type = $3)
      ORDER BY
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        created_at DESC
      LIMIT $4
    `,
    [input.organizationId, input.status ?? null, input.taskType ?? null, Math.max(1, Math.min(500, input.limit ?? 100))]
  );

  return rows.map(mapKnowledgeReviewTask);
}

export async function updateKnowledgeReviewTask(input: {
  organizationId: string;
  taskId: string;
  status?: KnowledgeReviewTaskStatus;
  priority?: KnowledgeReviewTaskPriority;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<KnowledgeReviewTask | null> {
  const rows = await queryOrg<DbKnowledgeReviewTaskRow>(
    input.organizationId,
    `
      UPDATE knowledge_review_tasks
      SET
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        reason = COALESCE($5, reason),
        metadata = COALESCE($6::jsonb, metadata),
        resolved_at = CASE
          WHEN COALESCE($3, status) IN ('resolved', 'dismissed') THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      RETURNING *
    `,
    [
      input.organizationId,
      input.taskId,
      input.status ?? null,
      input.priority ?? null,
      input.reason ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );

  return rows[0] ? mapKnowledgeReviewTask(rows[0]) : null;
}

export async function upsertKnowledgeReviewTask(input: {
  organizationId: string;
  knowledgeObjectId?: string;
  taskType: KnowledgeReviewTaskType;
  priority: KnowledgeReviewTaskPriority;
  reason: string;
  metadata?: Record<string, unknown>;
  dueAt?: string;
  createdBy?: string;
}): Promise<KnowledgeReviewTask> {
  return withOrgTransaction(input.organizationId, async (client) => {
    const existing = await client.query<DbKnowledgeReviewTaskRow>(
      `
        SELECT *
        FROM knowledge_review_tasks
        WHERE organization_id = $1
          AND task_type = $2
          AND status IN ('open', 'in_progress')
          AND (
            ($3::text IS NULL AND knowledge_object_id IS NULL)
            OR knowledge_object_id = $3
          )
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [input.organizationId, input.taskType, input.knowledgeObjectId ?? null]
    );

    if (existing.rows[0]) {
      const updated = await client.query<DbKnowledgeReviewTaskRow>(
        `
          UPDATE knowledge_review_tasks
          SET
            priority = $3,
            reason = $4,
            metadata = COALESCE($5::jsonb, metadata),
            due_at = COALESCE($6::timestamptz, due_at),
            updated_at = NOW()
          WHERE organization_id = $1
            AND id = $2
          RETURNING *
        `,
        [
          input.organizationId,
          existing.rows[0].id,
          input.priority,
          input.reason,
          input.metadata ? JSON.stringify(input.metadata) : null,
          input.dueAt ?? null
        ]
      );
      return mapKnowledgeReviewTask(updated.rows[0] as DbKnowledgeReviewTaskRow);
    }

    const inserted = await client.query<DbKnowledgeReviewTaskRow>(
      `
        INSERT INTO knowledge_review_tasks (
          id,
          organization_id,
          knowledge_object_id,
          task_type,
          status,
          priority,
          reason,
          metadata,
          due_at,
          created_by
        ) VALUES ($1, $2, $3, $4, 'open', $5, $6, $7::jsonb, $8::timestamptz, $9)
        RETURNING *
      `,
      [
        randomUUID(),
        input.organizationId,
        input.knowledgeObjectId ?? null,
        input.taskType,
        input.priority,
        input.reason,
        JSON.stringify(input.metadata ?? {}),
        input.dueAt ?? null,
        input.createdBy ?? null
      ]
    );

    return mapKnowledgeReviewTask(inserted.rows[0] as DbKnowledgeReviewTaskRow);
  });
}

export async function getKnowledgeFreshnessDashboard(organizationId: string): Promise<KnowledgeFreshnessDashboard> {
  const [freshnessRows, taskRows, candidateRows] = await Promise.all([
    queryOrg<{ freshness_status: FreshnessStatus; count: number }>(
      organizationId,
      `
        SELECT freshness_status, COUNT(*)::int AS count
        FROM knowledge_objects
        WHERE organization_id = $1
          AND archived_at IS NULL
        GROUP BY freshness_status
      `,
      [organizationId]
    ),
    queryOrg<{
      overdue_reviews: number;
      dependency_at_risk: number;
      low_confidence_open: number;
    }>(
      organizationId,
      `
        SELECT
          COUNT(*) FILTER (
            WHERE status IN ('open', 'in_progress')
              AND task_type = 'scheduled_review'
          )::int AS overdue_reviews,
          COUNT(*) FILTER (
            WHERE status IN ('open', 'in_progress')
              AND task_type = 'dependency_change'
          )::int AS dependency_at_risk,
          COUNT(*) FILTER (
            WHERE status IN ('open', 'in_progress')
              AND task_type = 'low_confidence'
          )::int AS low_confidence_open
        FROM knowledge_review_tasks
        WHERE organization_id = $1
      `,
      [organizationId]
    ),
    queryOrg<{ repeated_question_candidates: number }>(
      organizationId,
      `
        SELECT COUNT(*)::int AS repeated_question_candidates
        FROM knowledge_review_tasks
        WHERE organization_id = $1
          AND task_type = 'canonical_candidate'
          AND status IN ('open', 'in_progress')
      `,
      [organizationId]
    )
  ]);

  const counts = {
    fresh: 0,
    stale: 0,
    atRisk: 0
  };
  for (const row of freshnessRows) {
    if (row.freshness_status === "fresh") {
      counts.fresh = Number(row.count);
    }
    if (row.freshness_status === "stale") {
      counts.stale = Number(row.count);
    }
    if (row.freshness_status === "at_risk") {
      counts.atRisk = Number(row.count);
    }
  }

  const taskStats = taskRows[0] ?? {
    overdue_reviews: 0,
    dependency_at_risk: 0,
    low_confidence_open: 0
  };

  return {
    counts,
    overdueReviews: Number(taskStats.overdue_reviews ?? 0),
    dependencyAtRisk: Number(taskStats.dependency_at_risk ?? 0),
    repeatedQuestionCandidates: Number(candidateRows[0]?.repeated_question_candidates ?? 0),
    lowConfidenceOpen: Number(taskStats.low_confidence_open ?? 0)
  };
}

export async function appendKnowledgeEvent(input: {
  organizationId: string;
  knowledgeObjectId?: string;
  eventType: "knowledge.updated" | "knowledge.validated" | "dependency.updated" | "question.repeated" | "answer.low_confidence";
  payload?: Record<string, unknown>;
  occurredAt?: string;
  createdBy?: string;
}): Promise<void> {
  await queryOrg(
    input.organizationId,
    `
      INSERT INTO knowledge_events (
        id,
        organization_id,
        knowledge_object_id,
        event_type,
        payload,
        occurred_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5::jsonb, COALESCE($6::timestamptz, NOW()), $7)
    `,
    [
      randomUUID(),
      input.organizationId,
      input.knowledgeObjectId ?? null,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
      input.occurredAt ?? null,
      input.createdBy ?? null
    ]
  );
}

export async function runKnowledgeFreshnessReviewScan(input: {
  organizationId: string;
  createdBy?: string;
  limit?: number;
}): Promise<{ staleMarked: number; tasksUpserted: number }> {
  const limit = Math.max(1, Math.min(2000, input.limit ?? 500));

  const rows = await queryOrg<{ id: string }>(
    input.organizationId,
    `
      WITH due AS (
        SELECT id
        FROM knowledge_objects
        WHERE organization_id = $1
          AND archived_at IS NULL
          AND review_due_at < NOW()
          AND freshness_status <> 'stale'
        ORDER BY review_due_at ASC
        LIMIT $2
      ), updated AS (
        UPDATE knowledge_objects ko
        SET freshness_status = 'stale', updated_at = NOW()
        FROM due
        WHERE ko.organization_id = $1
          AND ko.id = due.id
        RETURNING ko.id
      )
      SELECT id
      FROM updated
    `,
    [input.organizationId, limit]
  );

  let tasks = 0;
  for (const row of rows) {
    await upsertKnowledgeReviewTask({
      organizationId: input.organizationId,
      knowledgeObjectId: row.id,
      taskType: "scheduled_review",
      priority: "high",
      reason: "Review due date passed. Validate and refresh this knowledge object.",
      metadata: {
        source: "freshness_review_scan"
      },
      createdBy: input.createdBy
    });
    tasks += 1;
  }

  return {
    staleMarked: rows.length,
    tasksUpserted: tasks
  };
}

export async function listRecentDependencyUpdateEvents(input: {
  organizationId: string;
  sinceMinutes?: number;
  limit?: number;
}): Promise<Array<{ knowledgeObjectId?: string; dependencyObjectId?: string; dependencyRef?: string }>> {
  const rows = await queryOrg<{
    knowledge_object_id: string | null;
    payload: Record<string, unknown> | null;
  }>(
    input.organizationId,
    `
      SELECT knowledge_object_id, payload
      FROM knowledge_events
      WHERE organization_id = $1
        AND event_type = 'dependency.updated'
        AND occurred_at >= NOW() - ($2::int * INTERVAL '1 minute')
      ORDER BY occurred_at DESC
      LIMIT $3
    `,
    [input.organizationId, Math.max(1, input.sinceMinutes ?? 30), Math.max(1, Math.min(1000, input.limit ?? 200))]
  );

  return rows.map((row) => ({
    knowledgeObjectId: row.knowledge_object_id ?? undefined,
    dependencyObjectId:
      typeof row.payload?.dependencyObjectId === "string" ? (row.payload.dependencyObjectId as string) : undefined,
    dependencyRef: typeof row.payload?.dependencyRef === "string" ? (row.payload.dependencyRef as string) : undefined
  }));
}

export async function applyDependencyImpact(input: {
  organizationId: string;
  dependencyObjectId?: string;
  dependencyRef?: string;
  createdBy?: string;
}): Promise<{ impacted: number; tasksUpserted: number }> {
  if (!input.dependencyObjectId && !input.dependencyRef) {
    return { impacted: 0, tasksUpserted: 0 };
  }

  const impactedRows = await queryOrg<{ id: string }>(
    input.organizationId,
    `
      WITH impacted AS (
        SELECT DISTINCT kod.knowledge_object_id AS id
        FROM knowledge_object_dependencies kod
        WHERE kod.organization_id = $1
          AND (
            ($2::text IS NOT NULL AND kod.dependency_object_id = $2)
            OR ($3::text IS NOT NULL AND kod.dependency_ref = $3)
          )
      ), updated AS (
        UPDATE knowledge_objects ko
        SET freshness_status = 'at_risk', updated_at = NOW()
        FROM impacted
        WHERE ko.organization_id = $1
          AND ko.id = impacted.id
          AND ko.archived_at IS NULL
        RETURNING ko.id
      )
      SELECT id FROM updated
    `,
    [input.organizationId, input.dependencyObjectId ?? null, input.dependencyRef ?? null]
  );

  let tasks = 0;
  for (const row of impactedRows) {
    await upsertKnowledgeReviewTask({
      organizationId: input.organizationId,
      knowledgeObjectId: row.id,
      taskType: "dependency_change",
      priority: "high",
      reason: "A linked dependency changed. Re-validate this knowledge object.",
      metadata: {
        source: "dependency_impact_scan",
        dependencyObjectId: input.dependencyObjectId ?? null,
        dependencyRef: input.dependencyRef ?? null
      },
      createdBy: input.createdBy
    });
    tasks += 1;
  }

  return {
    impacted: impactedRows.length,
    tasksUpserted: tasks
  };
}

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function rollupKnowledgeQuestionSignals(input: {
  organizationId: string;
  minCount?: number;
  createdBy?: string;
}): Promise<{ candidates: number; tasksUpserted: number }> {
  const minCount = Math.max(2, Math.min(20, input.minCount ?? 3));

  const rows = await queryOrg<{
    sample_question: string;
    ask_count_7d: number;
    first_seen_at: string;
    last_seen_at: string;
  }>(
    input.organizationId,
    `
      SELECT
        MIN(cm.message_text) AS sample_question,
        COUNT(*)::int AS ask_count_7d,
        MIN(cm.created_at) AS first_seen_at,
        MAX(cm.created_at) AS last_seen_at
      FROM chat_messages cm
      WHERE cm.organization_id = $1
        AND cm.role = 'user'
        AND cm.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY lower(trim(cm.message_text))
      HAVING COUNT(*) >= $2
      ORDER BY ask_count_7d DESC, last_seen_at DESC
      LIMIT 100
    `,
    [input.organizationId, minCount]
  );

  let tasksUpserted = 0;
  let candidates = 0;

  for (const row of rows) {
    const normalizedQuestion = normalizeQuestion(row.sample_question);
    if (!normalizedQuestion) {
      continue;
    }

    await queryOrg(
      input.organizationId,
      `
        INSERT INTO knowledge_question_signals (
          id,
          organization_id,
          normalized_question,
          sample_question,
          first_seen_at,
          last_seen_at,
          ask_count_7d
        ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7)
        ON CONFLICT (organization_id, normalized_question)
        DO UPDATE SET
          sample_question = EXCLUDED.sample_question,
          first_seen_at = LEAST(knowledge_question_signals.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(knowledge_question_signals.last_seen_at, EXCLUDED.last_seen_at),
          ask_count_7d = EXCLUDED.ask_count_7d,
          updated_at = NOW()
      `,
      [
        randomUUID(),
        input.organizationId,
        normalizedQuestion,
        row.sample_question,
        row.first_seen_at,
        row.last_seen_at,
        Number(row.ask_count_7d)
      ]
    );

    candidates += 1;

    await upsertKnowledgeReviewTask({
      organizationId: input.organizationId,
      taskType: "canonical_candidate",
      priority: "medium",
      reason: `Question repeated ${Number(row.ask_count_7d)} times in 7 days: ${row.sample_question.slice(0, 180)}`,
      metadata: {
        source: "canonical_question_rollup",
        normalizedQuestion,
        askCount7d: Number(row.ask_count_7d)
      },
      createdBy: input.createdBy
    });

    tasksUpserted += 1;
  }

  return { candidates, tasksUpserted };
}

export async function queueLowConfidenceKnowledgeReviewTasks(input: {
  organizationId: string;
  confidenceThreshold?: number;
  windowMinutes?: number;
  createdBy?: string;
}): Promise<{ queued: number }> {
  const threshold = Math.max(0, Math.min(1, input.confidenceThreshold ?? 0.65));
  const windowMinutes = Math.max(1, Math.min(24 * 60, input.windowMinutes ?? 120));

  const rows = await queryOrg<{
    id: string;
    confidence: number | null;
    message_text: string;
    created_at: string;
  }>(
    input.organizationId,
    `
      SELECT cm.id, cm.confidence, cm.message_text, cm.created_at
      FROM chat_messages cm
      LEFT JOIN answer_verification_runs avr
        ON avr.organization_id = cm.organization_id
        AND avr.chat_message_id = cm.id
      WHERE cm.organization_id = $1
        AND cm.role = 'assistant'
        AND cm.created_at >= NOW() - ($2::int * INTERVAL '1 minute')
        AND (
          COALESCE(cm.confidence, 0) < $3
          OR COALESCE(avr.status, 'passed') = 'blocked'
        )
      ORDER BY cm.created_at DESC
      LIMIT 200
    `,
    [input.organizationId, windowMinutes, threshold]
  );

  let queued = 0;
  for (const row of rows) {
    await upsertKnowledgeReviewTask({
      organizationId: input.organizationId,
      taskType: "low_confidence",
      priority: "medium",
      reason: `Low-confidence answer detected (${Number(row.confidence ?? 0).toFixed(2)}).`,
      metadata: {
        source: "low_confidence_review_queue",
        chatMessageId: row.id,
        answerPreview: row.message_text.slice(0, 240),
        createdAt: row.created_at
      },
      createdBy: input.createdBy
    });
    queued += 1;
  }

  return { queued };
}

export async function searchKnowledgeObjectChunksHybrid(params: {
  organizationId: string;
  queryText: string;
  queryVector: string;
  viewerPrincipalKeys?: string[];
  knowledgeObjectIds?: string[];
  ownerUserId?: string;
  tags?: string[];
  limit?: number;
}): Promise<KnowledgeChunkSearchRecord[]> {
  const limit = Math.max(1, Math.min(50, params.limit ?? 8));
  const retrievalPool = Math.max(20, limit * 6);
  const k = 60;

  const principalKeys = Array.from(new Set(params.viewerPrincipalKeys ?? []));

  const baseParams: unknown[] = [
    params.organizationId,
    principalKeys,
    params.ownerUserId ?? null,
    params.knowledgeObjectIds ?? null,
    (params.tags ?? []).map((tag) => tag.toLowerCase())
  ];

  const whereFilters = `
    ko.organization_id = $1
    AND ko.archived_at IS NULL
    AND ($3::text IS NULL OR ko.owner_user_id = $3)
    AND (COALESCE(array_length($4::text[], 1), 0) = 0 OR ko.id = ANY($4::text[]))
    AND (
      COALESCE(array_length($5::text[], 1), 0) = 0
      OR EXISTS (
        SELECT 1
        FROM knowledge_object_tag_map tm
        JOIN knowledge_tags kt
          ON kt.id = tm.tag_id
          AND kt.organization_id = tm.organization_id
        WHERE tm.organization_id = ko.organization_id
          AND tm.knowledge_object_id = ko.id
          AND lower(kt.name) = ANY($5::text[])
      )
    )
  `;

  const matchPredicate = `
    (
      (pr.principal_type = 'org' AND (pr.principal_key = $1 OR pr.principal_key = ('org:' || $1)))
      OR pr.principal_key = ANY($2::text[])
    )
  `;

  const vectorRows = await queryOrg<{
    chunk_id: string;
    knowledge_object_id: string;
    knowledge_object_version_id: string;
    title: string;
    text_content: string;
    source_url: string;
    source_score: number;
    updated_at: string;
    owner_user_id: string;
    vector_distance: number;
  }>(
    params.organizationId,
    `
      WITH base_objects AS (
        SELECT ko.*
        FROM knowledge_objects ko
        WHERE ${whereFilters}
      ), permission_eval AS (
        SELECT
          bo.id,
          COUNT(*) FILTER (WHERE pr.effect = 'allow')::int AS allow_count,
          BOOL_OR(pr.effect = 'allow' AND ${matchPredicate}) AS allow_match,
          BOOL_OR(pr.effect = 'deny' AND ${matchPredicate}) AS deny_match
        FROM base_objects bo
        LEFT JOIN knowledge_object_permission_rules pr
          ON pr.organization_id = bo.organization_id
          AND pr.knowledge_object_id = bo.id
        GROUP BY bo.id
      ), permitted_objects AS (
        SELECT bo.id
        FROM base_objects bo
        JOIN permission_eval pe
          ON pe.id = bo.id
        WHERE CASE
          WHEN bo.permissions_mode = 'org_wide' THEN TRUE
          WHEN bo.permissions_mode = 'inherited_source_acl' THEN FALSE
          ELSE COALESCE(pe.deny_match, FALSE) = FALSE AND (COALESCE(pe.allow_count, 0) = 0 OR COALESCE(pe.allow_match, FALSE))
        END
      )
      SELECT
        koc.id AS chunk_id,
        kov.knowledge_object_id,
        kov.id AS knowledge_object_version_id,
        ko.title,
        koc.text_content,
        ('/app/knowledge/' || ko.id || '?v=' || kov.version_number::text) AS source_url,
        (COALESCE(ko.confidence_score, 0.5) * 100)::double precision AS source_score,
        ko.updated_at,
        ko.owner_user_id,
        koce.embedding <=> $6::vector AS vector_distance
      FROM knowledge_object_chunks koc
      JOIN knowledge_object_versions kov
        ON kov.id = koc.knowledge_object_version_id
        AND kov.organization_id = koc.organization_id
      JOIN knowledge_objects ko
        ON ko.id = kov.knowledge_object_id
        AND ko.organization_id = kov.organization_id
      JOIN knowledge_object_chunk_embeddings koce
        ON koce.chunk_id = koc.id
        AND koce.organization_id = koc.organization_id
      JOIN permitted_objects po
        ON po.id = ko.id
      ORDER BY koce.embedding <=> $6::vector ASC
      LIMIT $7
    `,
    [...baseParams, params.queryVector, retrievalPool]
  );

  const lexicalRows = await queryOrg<{
    chunk_id: string;
    knowledge_object_id: string;
    knowledge_object_version_id: string;
    title: string;
    text_content: string;
    source_url: string;
    source_score: number;
    updated_at: string;
    owner_user_id: string;
    lexical_score: number;
  }>(
    params.organizationId,
    `
      WITH base_objects AS (
        SELECT ko.*
        FROM knowledge_objects ko
        WHERE ${whereFilters}
      ), permission_eval AS (
        SELECT
          bo.id,
          COUNT(*) FILTER (WHERE pr.effect = 'allow')::int AS allow_count,
          BOOL_OR(pr.effect = 'allow' AND ${matchPredicate}) AS allow_match,
          BOOL_OR(pr.effect = 'deny' AND ${matchPredicate}) AS deny_match
        FROM base_objects bo
        LEFT JOIN knowledge_object_permission_rules pr
          ON pr.organization_id = bo.organization_id
          AND pr.knowledge_object_id = bo.id
        GROUP BY bo.id
      ), permitted_objects AS (
        SELECT bo.id
        FROM base_objects bo
        JOIN permission_eval pe
          ON pe.id = bo.id
        WHERE CASE
          WHEN bo.permissions_mode = 'org_wide' THEN TRUE
          WHEN bo.permissions_mode = 'inherited_source_acl' THEN FALSE
          ELSE COALESCE(pe.deny_match, FALSE) = FALSE AND (COALESCE(pe.allow_count, 0) = 0 OR COALESCE(pe.allow_match, FALSE))
        END
      )
      SELECT
        koc.id AS chunk_id,
        kov.knowledge_object_id,
        kov.id AS knowledge_object_version_id,
        ko.title,
        koc.text_content,
        ('/app/knowledge/' || ko.id || '?v=' || kov.version_number::text) AS source_url,
        (COALESCE(ko.confidence_score, 0.5) * 100)::double precision AS source_score,
        ko.updated_at,
        ko.owner_user_id,
        ts_rank_cd(to_tsvector('english', koc.text_content), plainto_tsquery('english', $6)) AS lexical_score
      FROM knowledge_object_chunks koc
      JOIN knowledge_object_versions kov
        ON kov.id = koc.knowledge_object_version_id
        AND kov.organization_id = koc.organization_id
      JOIN knowledge_objects ko
        ON ko.id = kov.knowledge_object_id
        AND ko.organization_id = kov.organization_id
      JOIN permitted_objects po
        ON po.id = ko.id
      WHERE to_tsvector('english', koc.text_content) @@ plainto_tsquery('english', $6)
      ORDER BY lexical_score DESC
      LIMIT $7
    `,
    [...baseParams, params.queryText, retrievalPool]
  );

  const merged = new Map<
    string,
    {
      chunkId: string;
      knowledgeObjectId: string;
      knowledgeObjectVersionId: string;
      knowledgeObjectTitle: string;
      text: string;
      sourceUrl: string;
      sourceScore: number;
      updatedAt: string;
      ownerUserId: string;
      vectorRank?: number;
      lexicalRank?: number;
      vectorDistance?: number;
      lexicalScore?: number;
    }
  >();

  for (let i = 0; i < vectorRows.length; i += 1) {
    const row = vectorRows[i] as (typeof vectorRows)[number];
    const existing = merged.get(row.chunk_id);
    merged.set(row.chunk_id, {
      chunkId: row.chunk_id,
      knowledgeObjectId: row.knowledge_object_id,
      knowledgeObjectVersionId: row.knowledge_object_version_id,
      knowledgeObjectTitle: row.title,
      text: row.text_content,
      sourceUrl: row.source_url,
      sourceScore: Number(row.source_score),
      updatedAt: row.updated_at,
      ownerUserId: row.owner_user_id,
      vectorRank: i + 1,
      vectorDistance: Number(row.vector_distance),
      lexicalRank: existing?.lexicalRank,
      lexicalScore: existing?.lexicalScore
    });
  }

  for (let i = 0; i < lexicalRows.length; i += 1) {
    const row = lexicalRows[i] as (typeof lexicalRows)[number];
    const existing = merged.get(row.chunk_id);
    merged.set(row.chunk_id, {
      chunkId: row.chunk_id,
      knowledgeObjectId: row.knowledge_object_id,
      knowledgeObjectVersionId: row.knowledge_object_version_id,
      knowledgeObjectTitle: row.title,
      text: row.text_content,
      sourceUrl: row.source_url,
      sourceScore: Number(row.source_score),
      updatedAt: row.updated_at,
      ownerUserId: row.owner_user_id,
      lexicalRank: i + 1,
      lexicalScore: Number(row.lexical_score),
      vectorRank: existing?.vectorRank,
      vectorDistance: existing?.vectorDistance
    });
  }

  return Array.from(merged.values())
    .map((entry) => {
      const vectorComponent = entry.vectorRank ? 1 / (k + entry.vectorRank) : 0;
      const lexicalComponent = entry.lexicalRank ? 1 / (k + entry.lexicalRank) : 0;
      const trustNorm = Math.max(0, Math.min(1, entry.sourceScore / 100));
      const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
      const recencyNorm = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
      const combinedScore = vectorComponent + lexicalComponent + 0.2 * trustNorm + 0.1 * recencyNorm;
      return {
        ...entry,
        combinedScore
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
}
