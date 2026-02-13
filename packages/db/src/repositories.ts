import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type {
  AnswerClaim,
  ChatThreadDetail,
  Citation,
  ConnectorType,
  DocumentChunk,
  DocumentRecord,
  GroundedAnswer,
  OrgRole,
  OrganizationDomain,
  RegistrationInvite,
  ReviewAction,
  SourceScore
} from "@internalwiki/core";
import { query, pool } from "./client";
import type {
  MarketingWaitlistLeadRecord,
  ConnectorSyncStats,
  ReviewQueueStats,
  RecentDeadLetterStats,
  ChatThreadMessageRecord,
  ChatThreadSummaryRecord,
  ChunkSearchRecord,
  ConnectorAccountRecord,
  ConnectorAccountUpsertInput,
  OrganizationDomainRecord,
  RateLimitRecord,
  RegistrationInviteRecord,
  ReviewQueueItem,
  SessionContext,
  SyncRun,
  UserSessionRecord
} from "./types";

type DbDocumentRow = {
  id: string;
  organization_id: string;
  title: string;
  source_type: ConnectorType;
  source_url: string;
  source_external_id: string | null;
  source_format: string | null;
  canonical_source_url: string | null;
  owner_identity: string | null;
  updated_at: string;
  summary_text: string | null;
  total_score: number | null;
  factors: Record<string, number> | null;
  computed_at: string | null;
  model_version: string | null;
};

type DbMembershipRow = {
  user_id: string;
  organization_id: string;
  role: SessionContext["role"];
  email: string;
};

type DbConnectorAccountRow = {
  id: string;
  organization_id: string;
  connector_type: ConnectorType;
  status: ConnectorAccountRecord["status"];
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  sync_cursor: string | null;
  last_synced_at: string | null;
  display_name: string | null;
  external_workspace_id: string | null;
  created_at: string;
  updated_at: string;
};

type DbSyncRunRow = {
  id: string;
  organization_id: string;
  connector_account_id: string;
  status: SyncRun["status"];
  started_at: string;
  completed_at: string | null;
  items_seen: number;
  items_changed: number;
  items_skipped: number;
  items_failed: number;
  failure_classification: SyncRun["failureClassification"] | null;
  error_message: string | null;
};

type DbChunkSearchRow = {
  chunk_id: string;
  doc_version_id: string;
  document_id: string;
  document_title: string;
  text: string;
  source_url: string;
  source_score: number;
  updated_at: string;
  owner_identity: string | null;
  source_format: string | null;
  source_external_id: string | null;
  canonical_source_url: string | null;
  source_version_label: string | null;
  source_checksum: string | null;
  connector_sync_run_id: string | null;
  connector_type: ConnectorType;
  vector_distance: number | null;
  lexical_score: number | null;
};

type DbUserSessionRow = {
  id: string;
  user_id: string;
  organization_id: string;
  expires_at: string;
  revoked_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type DbOrganizationDomainRow = {
  id: string;
  organization_id: string;
  domain: string;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbRegistrationInviteRow = {
  id: string;
  organization_id: string;
  code_hash: string;
  email: string | null;
  domain: string | null;
  role: OrgRole;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type DbChatThreadSummaryRow = {
  id: string;
  title: string | null;
  updated_at: string;
  last_message_preview: string | null;
};

type DbChatThreadMessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  message_text: string;
  confidence: number | null;
  source_score: number | null;
  created_at: string;
};

type DbDocumentVersionRow = {
  id: string;
  created_at: string;
  content_hash: string;
  source_last_updated_at: string | null;
  source_version_label: string | null;
  source_checksum: string | null;
  connector_sync_run_id: string | null;
};

type DbMarketingWaitlistLeadRow = {
  id: string;
  email: string;
  company: string;
  role: string | null;
  source_page: string;
  ip_hash: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

type DbSyncStatsRow = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  transient_failures: number;
  auth_failures: number;
  payload_failures: number;
  unknown_failures: number;
};

type DbReviewStatsRow = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type DbDeadLetterStatsRow = {
  last_24h: number;
  last_7d: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function hashContent(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function mapDocument(row: DbDocumentRow): DocumentRecord {
  const sourceScore =
    row.total_score !== null && row.factors && row.computed_at && row.model_version
      ? {
          total: row.total_score,
          factors: {
            recency: Number(row.factors.recency ?? 0),
            sourceAuthority: Number(row.factors.sourceAuthority ?? 0),
            authorAuthority: Number(row.factors.authorAuthority ?? 0),
            citationCoverage: Number(row.factors.citationCoverage ?? 0)
          },
          computedAt: row.computed_at,
          modelVersion: row.model_version
        }
      : undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    owner: row.owner_identity ?? "unknown",
    updatedAt: row.updated_at,
    summary: row.summary_text ?? undefined,
    sourceScore,
    sourceExternalId: row.source_external_id ?? undefined,
    sourceFormat: row.source_format ?? undefined,
    canonicalSourceUrl: row.canonical_source_url ?? undefined
  };
}

function mapConnectorAccount(row: DbConnectorAccountRow): ConnectorAccountRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectorType: row.connector_type,
    status: row.status,
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token ?? undefined,
    tokenExpiresAt: row.token_expires_at ?? undefined,
    syncCursor: row.sync_cursor ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    displayName: row.display_name ?? undefined,
    externalWorkspaceId: row.external_workspace_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSyncRun(row: DbSyncRunRow): SyncRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    connectorAccountId: row.connector_account_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    itemsSeen: row.items_seen,
    itemsChanged: row.items_changed,
    itemsSkipped: row.items_skipped,
    itemsFailed: row.items_failed,
    failureClassification: row.failure_classification ?? undefined,
    errorMessage: row.error_message ?? undefined
  };
}

function mapUserSession(row: DbUserSessionRow): UserSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined,
    metadata: row.metadata ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrganizationDomain(row: DbOrganizationDomainRow): OrganizationDomainRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    domain: row.domain,
    verifiedAt: row.verified_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRegistrationInvite(row: DbRegistrationInviteRow): RegistrationInviteRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email ?? undefined,
    domain: row.domain ?? undefined,
    role: row.role,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined
  };
}

function mapChatThreadSummary(row: DbChatThreadSummaryRow): ChatThreadSummaryRecord {
  return {
    id: row.id,
    title: row.title ?? "Untitled thread",
    updatedAt: row.updated_at,
    lastMessagePreview: row.last_message_preview ?? ""
  };
}

function mapChatThreadMessage(row: DbChatThreadMessageRow): ChatThreadMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    messageText: row.message_text,
    confidence: row.confidence ?? undefined,
    sourceScore: row.source_score ?? undefined,
    createdAt: row.created_at
  };
}

function mapMarketingWaitlistLead(row: DbMarketingWaitlistLeadRow): MarketingWaitlistLeadRecord {
  return {
    id: row.id,
    email: row.email,
    company: row.company,
    role: row.role ?? undefined,
    sourcePage: row.source_page,
    ipHash: row.ip_hash,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listDocuments(organizationId: string): Promise<DocumentRecord[]> {
  const rows = await query<DbDocumentRow>(
    `
      SELECT
        d.id,
        d.organization_id,
        d.title,
        d.source_type,
        d.source_url,
        d.source_external_id,
        d.source_format,
        d.canonical_source_url,
        d.owner_identity,
        d.updated_at,
        s.summary_text,
        ss.total_score,
        ss.factors,
        ss.computed_at,
        ss.model_version
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT dv.id
        FROM document_versions dv
        WHERE dv.organization_id = d.organization_id
          AND dv.document_id = d.id
        ORDER BY dv.created_at DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN summaries s
        ON s.organization_id = d.organization_id
        AND s.document_version_id = latest.id
      LEFT JOIN source_scores ss
        ON ss.organization_id = d.organization_id
        AND ss.document_version_id = latest.id
      WHERE d.organization_id = $1
      ORDER BY d.updated_at DESC
    `,
    [organizationId]
  );

  return rows.map(mapDocument);
}

export async function getDocumentById(organizationId: string, docId: string): Promise<DocumentRecord | null> {
  const rows = await query<DbDocumentRow>(
    `
      SELECT
        d.id,
        d.organization_id,
        d.title,
        d.source_type,
        d.source_url,
        d.source_external_id,
        d.source_format,
        d.canonical_source_url,
        d.owner_identity,
        d.updated_at,
        s.summary_text,
        ss.total_score,
        ss.factors,
        ss.computed_at,
        ss.model_version
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT dv.id
        FROM document_versions dv
        WHERE dv.organization_id = d.organization_id
          AND dv.document_id = d.id
        ORDER BY dv.created_at DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN summaries s
        ON s.organization_id = d.organization_id
        AND s.document_version_id = latest.id
      LEFT JOIN source_scores ss
        ON ss.organization_id = d.organization_id
        AND ss.document_version_id = latest.id
      WHERE d.organization_id = $1
        AND d.id = $2
      LIMIT 1
    `,
    [organizationId, docId]
  );

  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function listReviewQueue(organizationId: string): Promise<ReviewQueueItem[]> {
  const rows = await query<{
    id: string;
    organization_id: string;
    summary_id: string;
    status: ReviewQueueItem["status"];
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT id, organization_id, summary_id, status, created_at, updated_at
      FROM review_queue_items
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `,
    [organizationId]
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    summaryId: row.summary_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function applyReviewAction(
  organizationId: string,
  summaryId: string,
  action: ReviewAction,
  params?: { actorId?: string; reason?: string }
): Promise<ReviewQueueItem | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const queueResult = await client.query<{
      id: string;
      organization_id: string;
      summary_id: string;
      status: ReviewQueueItem["status"];
      created_at: string;
      updated_at: string;
    }>(
      `
        UPDATE review_queue_items
        SET status = $3, updated_at = NOW()
        WHERE organization_id = $1
          AND summary_id = $2
        RETURNING id, organization_id, summary_id, status, created_at, updated_at
      `,
      [organizationId, summaryId, action === "approve" ? "approved" : "rejected"]
    );

    if (queueResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const queueItem = queueResult.rows[0];

    await client.query(
      `
        INSERT INTO review_actions (
          id,
          organization_id,
          review_queue_item_id,
          summary_id,
          action,
          reason,
          actor_id,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
      `,
      [
        randomUUID(),
        organizationId,
        queueItem.id,
        summaryId,
        action,
        params?.reason ?? null,
        params?.actorId ?? null
      ]
    );

    await appendAuditEventTx(client, {
      organizationId,
      actorId: params?.actorId,
      eventType: "review.action",
      entityType: "summary",
      entityId: summaryId,
      payload: {
        action,
        reason: params?.reason ?? null
      }
    });

    await client.query("COMMIT");

    return {
      id: queueItem.id,
      organizationId: queueItem.organization_id,
      summaryId: queueItem.summary_id,
      status: queueItem.status,
      createdAt: queueItem.created_at,
      updatedAt: queueItem.updated_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function persistGroundedAnswer(input: {
  organizationId: string;
  question: string;
  response: GroundedAnswer;
  threadId?: string;
  actorId?: string;
}): Promise<{ threadId: string; assistantMessageId: string; userMessageId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let threadId: string = randomUUID();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    let reusedExistingThread = false;

    if (input.threadId) {
      const existingThread = await client.query<{ id: string }>(
        `
          SELECT id
          FROM chat_threads
          WHERE organization_id = $1
            AND id = $2
          LIMIT 1
        `,
        [input.organizationId, input.threadId]
      );
      if (existingThread.rows[0]) {
        threadId = existingThread.rows[0].id;
        reusedExistingThread = true;
      }
    }

    if (!reusedExistingThread) {
      await client.query(
        `
          INSERT INTO chat_threads (id, organization_id, title, created_by)
          VALUES ($1, $2, $3, $4)
        `,
        [threadId, input.organizationId, input.question.slice(0, 120), input.actorId ?? null]
      );
    }

    await client.query(
      `
        INSERT INTO chat_messages (id, organization_id, thread_id, role, message_text, created_by)
        VALUES ($1, $2, $3, 'user', $4, $5)
      `,
      [userMessageId, input.organizationId, threadId, input.question, input.actorId ?? null]
    );

    await client.query(
      `
        INSERT INTO chat_messages (
          id,
          organization_id,
          thread_id,
          role,
          message_text,
          confidence,
          source_score,
          created_by
        ) VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7)
      `,
      [
        assistantMessageId,
        input.organizationId,
        threadId,
        input.response.answer,
        input.response.confidence,
        input.response.sourceScore,
        input.actorId ?? null
      ]
    );

    await client.query(
      `
        UPDATE chat_threads
        SET
          updated_at = NOW(),
          title = CASE
            WHEN title IS NULL OR length(trim(title)) = 0 THEN $3
            ELSE title
          END
        WHERE id = $1
          AND organization_id = $2
      `,
      [threadId, input.organizationId, input.question.slice(0, 120)]
    );

    for (const citation of input.response.citations) {
      await client.query(
        `
          INSERT INTO answer_citations (
            id,
            organization_id,
            chat_message_id,
            chunk_id,
            start_offset,
            end_offset,
            source_url,
            created_by
          )
          SELECT $1, $2, $3, $4, $5, $6, $7, $8
          WHERE EXISTS (
            SELECT 1
            FROM document_chunks dc
            WHERE dc.organization_id = $2
              AND dc.id = $4
          )
        `,
        [
          randomUUID(),
          input.organizationId,
          assistantMessageId,
          citation.chunkId,
          citation.startOffset,
          citation.endOffset,
          citation.sourceUrl,
          input.actorId ?? null
        ]
      );
    }

    await appendAuditEventTx(client, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      eventType: "assistant.answer.persisted",
      entityType: "chat_message",
      entityId: assistantMessageId,
      payload: {
        threadId,
        resumedThread: reusedExistingThread,
        citations: input.response.citations.length,
        confidence: input.response.confidence,
        sourceScore: input.response.sourceScore
      }
    });

    await client.query("COMMIT");
    return {
      threadId,
      assistantMessageId,
      userMessageId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function persistAnswerClaims(input: {
  organizationId: string;
  chatMessageId: string;
  claims: AnswerClaim[];
  actorId?: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
        DELETE FROM answer_claim_citations
        WHERE organization_id = $1
          AND answer_claim_id IN (
            SELECT id
            FROM answer_claims
            WHERE organization_id = $1
              AND chat_message_id = $2
          )
      `,
      [input.organizationId, input.chatMessageId]
    );

    await client.query(
      `
        DELETE FROM answer_claims
        WHERE organization_id = $1
          AND chat_message_id = $2
      `,
      [input.organizationId, input.chatMessageId]
    );

    for (const claim of input.claims) {
      const claimId = randomUUID();
      await client.query(
        `
          INSERT INTO answer_claims (
            id,
            organization_id,
            chat_message_id,
            claim_text,
            claim_order,
            supported,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          claimId,
          input.organizationId,
          input.chatMessageId,
          claim.text,
          claim.order,
          claim.supported,
          input.actorId ?? null
        ]
      );

      for (const citation of claim.citations) {
        await client.query(
          `
            INSERT INTO answer_claim_citations (
              id,
              organization_id,
              answer_claim_id,
              chunk_id,
              start_offset,
              end_offset,
              created_by
            )
            SELECT $1, $2, $3, $4, $5, $6, $7
            WHERE EXISTS (
              SELECT 1
              FROM document_chunks dc
              WHERE dc.organization_id = $2
                AND dc.id = $4
            )
          `,
          [
            randomUUID(),
            input.organizationId,
            claimId,
            citation.chunkId,
            citation.startOffset,
            citation.endOffset,
            input.actorId ?? null
          ]
        );
      }
    }

    await appendAuditEventTx(client, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      eventType: "assistant.answer.claims.persisted",
      entityType: "chat_message",
      entityId: input.chatMessageId,
      payload: {
        claims: input.claims.length,
        supportedClaims: input.claims.filter((entry) => entry.supported).length
      }
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveMembership(params: {
  userId?: string;
  email?: string;
  organizationId?: string;
}): Promise<SessionContext | null> {
  if (!params.userId && !params.email) {
    return null;
  }

  const rows = await query<DbMembershipRow>(
    `
      SELECT m.user_id, m.organization_id, m.role, u.email
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE ($1::text IS NULL OR m.user_id = $1)
        AND ($2::text IS NULL OR lower(u.email) = lower($2))
        AND ($3::text IS NULL OR m.organization_id = $3)
      ORDER BY m.updated_at DESC
      LIMIT 1
    `,
    [params.userId ?? null, params.email ?? null, params.organizationId ?? null]
  );

  if (!rows[0]) {
    return null;
  }

  return {
    userId: rows[0].user_id,
    email: rows[0].email,
    organizationId: rows[0].organization_id,
    role: rows[0].role
  };
}

export async function upsertGoogleUserAndEnsureMembership(params: {
  googleSub: string;
  email: string;
  displayName?: string;
  organizationSlug: string;
  organizationName: string;
  role?: SessionContext["role"];
}): Promise<SessionContext> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const organizationId = `org_${params.organizationSlug}`;
    const userId = `user_google_${params.googleSub}`;

    await client.query(
      `
        INSERT INTO organizations (id, name, slug, created_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `,
      [organizationId, params.organizationName, params.organizationSlug, userId]
    );

    await client.query(
      `
        INSERT INTO users (id, email, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          updated_at = NOW()
      `,
      [userId, params.email, params.displayName ?? null]
    );

    await client.query(
      `
        INSERT INTO memberships (id, organization_id, user_id, role, created_by)
        VALUES ($1, $2, $3, $4, $3)
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          updated_at = NOW()
      `,
      [randomUUID(), organizationId, userId, params.role ?? "owner"]
    );

    await appendAuditEventTx(client, {
      organizationId,
      actorId: userId,
      eventType: "auth.google.callback",
      entityType: "user",
      entityId: userId,
      payload: {
        email: params.email,
        organizationSlug: params.organizationSlug
      }
    });

    await client.query("COMMIT");

    return {
      userId,
      email: params.email,
      organizationId,
      role: params.role ?? "owner"
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createConnectorAccount(input: ConnectorAccountUpsertInput): Promise<ConnectorAccountRecord> {
  const rows = await query<DbConnectorAccountRow>(
    `
      INSERT INTO connector_accounts (
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        display_name,
        external_workspace_id,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        last_synced_at,
        display_name,
        external_workspace_id,
        created_at,
        updated_at
    `,
    [
      input.id,
      input.organizationId,
      input.connectorType,
      input.status ?? "active",
      input.encryptedAccessToken,
      input.encryptedRefreshToken ?? null,
      input.tokenExpiresAt ?? null,
      input.syncCursor ?? null,
      input.displayName ?? null,
      input.externalWorkspaceId ?? null,
      input.createdBy ?? null
    ]
  );

  const created = mapConnectorAccount(rows[0]);

  await appendAuditEvent({
    organizationId: created.organizationId,
    actorId: input.createdBy,
    eventType: "connector.created",
    entityType: "connector_account",
    entityId: created.id,
    payload: {
      connectorType: created.connectorType,
      status: created.status
    }
  });

  return created;
}

export async function listConnectorAccounts(organizationId: string): Promise<ConnectorAccountRecord[]> {
  const rows = await query<DbConnectorAccountRow>(
    `
      SELECT
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        last_synced_at,
        display_name,
        external_workspace_id,
        created_at,
        updated_at
      FROM connector_accounts
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `,
    [organizationId]
  );

  return rows.map(mapConnectorAccount);
}

export async function getConnectorAccount(organizationId: string, connectorAccountId: string): Promise<ConnectorAccountRecord | null> {
  const rows = await query<DbConnectorAccountRow>(
    `
      SELECT
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        last_synced_at,
        display_name,
        external_workspace_id,
        created_at,
        updated_at
      FROM connector_accounts
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [organizationId, connectorAccountId]
  );

  return rows[0] ? mapConnectorAccount(rows[0]) : null;
}

export async function updateConnectorAccount(
  organizationId: string,
  connectorAccountId: string,
  patch: {
    status?: ConnectorAccountRecord["status"];
    encryptedAccessToken?: string;
    encryptedRefreshToken?: string;
    tokenExpiresAt?: string;
    syncCursor?: string;
    displayName?: string;
    externalWorkspaceId?: string;
  }
): Promise<ConnectorAccountRecord | null> {
  const rows = await query<DbConnectorAccountRow>(
    `
      UPDATE connector_accounts
      SET
        status = COALESCE($3, status),
        encrypted_access_token = COALESCE($4, encrypted_access_token),
        encrypted_refresh_token = COALESCE($5, encrypted_refresh_token),
        token_expires_at = COALESCE($6, token_expires_at),
        sync_cursor = COALESCE($7, sync_cursor),
        display_name = COALESCE($8, display_name),
        external_workspace_id = COALESCE($9, external_workspace_id),
        updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      RETURNING
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        last_synced_at,
        display_name,
        external_workspace_id,
        created_at,
        updated_at
    `,
    [
      organizationId,
      connectorAccountId,
      patch.status ?? null,
      patch.encryptedAccessToken ?? null,
      patch.encryptedRefreshToken ?? null,
      patch.tokenExpiresAt ?? null,
      patch.syncCursor ?? null,
      patch.displayName ?? null,
      patch.externalWorkspaceId ?? null
    ]
  );

  if (!rows[0]) {
    return null;
  }

  return mapConnectorAccount(rows[0]);
}

export async function deleteConnectorAccount(organizationId: string, connectorAccountId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
      DELETE FROM connector_accounts
      WHERE organization_id = $1
        AND id = $2
      RETURNING id
    `,
    [organizationId, connectorAccountId]
  );

  return rows.length > 0;
}

export async function listActiveConnectorAccounts(): Promise<ConnectorAccountRecord[]> {
  const rows = await query<DbConnectorAccountRow>(
    `
      SELECT
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        last_synced_at,
        display_name,
        external_workspace_id,
        created_at,
        updated_at
      FROM connector_accounts
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `
  );

  return rows.map(mapConnectorAccount);
}

export async function markConnectorReauthRequired(organizationId: string, connectorAccountId: string): Promise<void> {
  await query(
    `
      UPDATE connector_accounts
      SET status = 'reauth_required', updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
    `,
    [organizationId, connectorAccountId]
  );
}

export async function startConnectorSyncRun(input: {
  organizationId: string;
  connectorAccountId: string;
  createdBy?: string;
}): Promise<SyncRun> {
  const rows = await query<DbSyncRunRow>(
    `
      INSERT INTO connector_sync_runs (
        id,
        organization_id,
        connector_account_id,
        status,
        created_by
      ) VALUES ($1, $2, $3, 'running', $4)
      RETURNING
        id,
        organization_id,
        connector_account_id,
        status,
        started_at,
        completed_at,
        items_seen,
        items_changed,
        items_skipped,
        items_failed,
        failure_classification,
        error_message
    `,
    [randomUUID(), input.organizationId, input.connectorAccountId, input.createdBy ?? null]
  );

  return mapSyncRun(rows[0]);
}

export async function finishConnectorSyncRun(input: {
  runId: string;
  organizationId: string;
  status: SyncRun["status"];
  itemsSeen: number;
  itemsChanged: number;
  itemsSkipped: number;
  itemsFailed: number;
  failureClassification?: SyncRun["failureClassification"];
  errorMessage?: string;
  nextCursor?: string;
  connectorAccountId: string;
}): Promise<SyncRun | null> {
  const rows = await query<DbSyncRunRow>(
    `
      UPDATE connector_sync_runs
      SET
        status = $3,
        completed_at = NOW(),
        items_seen = $4,
        items_changed = $5,
        items_skipped = $6,
        items_failed = $7,
        failure_classification = $8,
        error_message = $9,
        updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
      RETURNING
        id,
        organization_id,
        connector_account_id,
        status,
        started_at,
        completed_at,
        items_seen,
        items_changed,
        items_skipped,
        items_failed,
        failure_classification,
        error_message
    `,
    [
      input.runId,
      input.organizationId,
      input.status,
      input.itemsSeen,
      input.itemsChanged,
      input.itemsSkipped,
      input.itemsFailed,
      input.failureClassification ?? null,
      input.errorMessage ?? null
    ]
  );

  if (input.nextCursor) {
    await query(
      `
        UPDATE connector_accounts
        SET sync_cursor = $3, last_synced_at = NOW(), updated_at = NOW()
        WHERE organization_id = $1 AND id = $2
      `,
      [input.organizationId, input.connectorAccountId, input.nextCursor]
    );
  }

  return rows[0] ? mapSyncRun(rows[0]) : null;
}

export async function listConnectorSyncRuns(
  organizationId: string,
  connectorAccountId: string,
  limit = 20
): Promise<SyncRun[]> {
  const rows = await query<DbSyncRunRow>(
    `
      SELECT
        id,
        organization_id,
        connector_account_id,
        status,
        started_at,
        completed_at,
        items_seen,
        items_changed,
        items_skipped,
        items_failed,
        failure_classification,
        error_message
      FROM connector_sync_runs
      WHERE organization_id = $1
        AND connector_account_id = $2
      ORDER BY started_at DESC
      LIMIT $3
    `,
    [organizationId, connectorAccountId, limit]
  );

  return rows.map(mapSyncRun);
}

export async function getConnectorSyncRun(
  organizationId: string,
  connectorAccountId: string,
  runId: string
): Promise<SyncRun | null> {
  const rows = await query<DbSyncRunRow>(
    `
      SELECT
        id,
        organization_id,
        connector_account_id,
        status,
        started_at,
        completed_at,
        items_seen,
        items_changed,
        items_skipped,
        items_failed,
        failure_classification,
        error_message
      FROM connector_sync_runs
      WHERE organization_id = $1
        AND connector_account_id = $2
        AND id = $3
      LIMIT 1
    `,
    [organizationId, connectorAccountId, runId]
  );

  return rows[0] ? mapSyncRun(rows[0]) : null;
}

export async function getExternalItemChecksums(input: {
  organizationId: string;
  connectorAccountId: string;
  externalIds: string[];
}): Promise<Map<string, string>> {
  if (input.externalIds.length === 0) {
    return new Map();
  }

  const rows = await query<{
    external_id: string;
    external_checksum: string;
  }>(
    `
      SELECT external_id, external_checksum
      FROM external_items
      WHERE organization_id = $1
        AND connector_account_id = $2
        AND external_id = ANY($3::text[])
    `,
    [input.organizationId, input.connectorAccountId, input.externalIds]
  );

  const checksums = new Map<string, string>();
  for (const row of rows) {
    checksums.set(row.external_id, row.external_checksum);
  }

  return checksums;
}

export async function upsertExternalItemAndDocuments(input: {
  organizationId: string;
  connectorAccountId: string;
  externalId: string;
  checksum: string;
  sourceType: ConnectorType;
  sourceUrl: string;
  title: string;
  owner: string;
  updatedAt: string;
  sourceLastUpdatedAt?: string;
  sourceExternalId?: string;
  sourceFormat?: string;
  canonicalSourceUrl?: string;
  sourceVersionLabel?: string;
  syncRunId?: string;
  content: string;
  chunks: string[];
  embeddingVectors: string[];
  embeddingModel?: string;
  summary: string;
  sourceScore: SourceScore;
  createdBy?: string;
}): Promise<{ changed: boolean; documentId: string; documentVersionId: string }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingExternalItem = await client.query<{ external_checksum: string }>(
      `
        SELECT external_checksum
        FROM external_items
        WHERE organization_id = $1
          AND connector_account_id = $2
          AND external_id = $3
        LIMIT 1
      `,
      [input.organizationId, input.connectorAccountId, input.externalId]
    );

    const unchanged = existingExternalItem.rows[0]?.external_checksum === input.checksum;

    await client.query(
      `
        INSERT INTO external_items (
          id,
          organization_id,
          connector_account_id,
          external_id,
          external_checksum,
          source_type,
          source_url,
          updated_at_source,
          normalized_payload,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (organization_id, connector_account_id, external_id)
        DO UPDATE SET
          external_checksum = EXCLUDED.external_checksum,
          source_type = EXCLUDED.source_type,
          source_url = EXCLUDED.source_url,
          updated_at_source = EXCLUDED.updated_at_source,
          normalized_payload = EXCLUDED.normalized_payload,
          updated_at = NOW()
      `,
      [
        randomUUID(),
        input.organizationId,
        input.connectorAccountId,
        input.externalId,
        input.checksum,
        input.sourceType,
        input.sourceUrl,
        input.updatedAt,
        JSON.stringify({
          title: input.title,
          owner: input.owner,
          content: input.content,
          sourceExternalId: input.sourceExternalId ?? input.externalId,
          sourceFormat: input.sourceFormat ?? null,
          canonicalSourceUrl: input.canonicalSourceUrl ?? input.sourceUrl,
          sourceVersionLabel: input.sourceVersionLabel ?? null,
          sourceChecksum: input.checksum,
          syncRunId: input.syncRunId ?? null
        }),
        input.createdBy ?? null
      ]
    );

    let documentId: string = randomUUID();
    const existingDocument = await client.query<{ id: string }>(
      `
        SELECT id
        FROM documents
        WHERE organization_id = $1
          AND (
            source_url = $2
            OR canonical_source_url = $3
            OR source_external_id = $4
          )
        LIMIT 1
      `,
      [
        input.organizationId,
        input.sourceUrl,
        input.canonicalSourceUrl ?? input.sourceUrl,
        input.sourceExternalId ?? input.externalId
      ]
    );

    if (existingDocument.rows[0]) {
      documentId = existingDocument.rows[0].id;
      await client.query(
        `
          UPDATE documents
          SET
            title = $3,
            source_type = $4,
            owner_identity = $5,
            updated_at = $6,
            source_external_id = $7,
            source_format = $8,
            canonical_source_url = $9
          WHERE organization_id = $1
            AND id = $2
        `,
        [
          input.organizationId,
          documentId,
          input.title,
          input.sourceType,
          input.owner,
          input.updatedAt,
          input.sourceExternalId ?? input.externalId,
          input.sourceFormat ?? null,
          input.canonicalSourceUrl ?? input.sourceUrl
        ]
      );
    } else {
      await client.query(
        `
          INSERT INTO documents (
            id,
            organization_id,
            source_type,
            source_url,
            title,
            owner_identity,
            source_external_id,
            source_format,
            canonical_source_url,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          documentId,
          input.organizationId,
          input.sourceType,
          input.sourceUrl,
          input.title,
          input.owner,
          input.sourceExternalId ?? input.externalId,
          input.sourceFormat ?? null,
          input.canonicalSourceUrl ?? input.sourceUrl,
          input.createdBy ?? null
        ]
      );
    }

    const contentHash = hashContent(input.content);

    let documentVersionId: string = randomUUID();
    const versionLookup = await client.query<{ id: string }>(
      `
        SELECT id
        FROM document_versions
        WHERE organization_id = $1
          AND document_id = $2
          AND content_hash = $3
        LIMIT 1
      `,
      [input.organizationId, documentId, contentHash]
    );

    if (versionLookup.rows[0]) {
      documentVersionId = versionLookup.rows[0].id;
    } else {
      await client.query(
        `
          INSERT INTO document_versions (
            id,
            organization_id,
            document_id,
            content_markdown,
            content_hash,
            version_label,
            source_last_updated_at,
            source_version_label,
            source_checksum,
            connector_sync_run_id,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          documentVersionId,
          input.organizationId,
          documentId,
          input.content,
          contentHash,
          `v-${Date.now()}`,
          input.sourceLastUpdatedAt ?? input.updatedAt,
          input.sourceVersionLabel ?? null,
          input.checksum,
          input.syncRunId ?? null,
          input.createdBy ?? null
        ]
      );

      const chunkIds: string[] = [];
      let cursor = 0;
      for (let i = 0; i < input.chunks.length; i += 1) {
        const chunkId = randomUUID();
        const chunk = input.chunks[i];
        const startOffset = cursor;
        const endOffset = cursor + chunk.length;
        cursor = endOffset;
        chunkIds.push(chunkId);

        await client.query(
          `
            INSERT INTO document_chunks (
              id,
              organization_id,
              document_version_id,
              chunk_index,
              start_offset,
              end_offset,
              text_content,
              created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            chunkId,
            input.organizationId,
            documentVersionId,
            i,
            startOffset,
            endOffset,
            chunk,
            input.createdBy ?? null
          ]
        );

        const vector = input.embeddingVectors[i];
        if (vector) {
          await client.query(
            `
              INSERT INTO chunk_embeddings (
                id,
                organization_id,
                chunk_id,
                embedding,
                embedding_model,
                created_by
              ) VALUES ($1, $2, $3, $4::vector, $5, $6)
              ON CONFLICT (organization_id, chunk_id)
              DO UPDATE SET
                embedding = EXCLUDED.embedding,
                embedding_model = EXCLUDED.embedding_model,
                updated_at = NOW()
            `,
            [
              randomUUID(),
              input.organizationId,
              chunkId,
              vector,
              input.embeddingModel ?? "text-embedding-3-small",
              input.createdBy ?? null
            ]
          );
        }
      }

      const summaryId = randomUUID();
      await client.query(
        `
          INSERT INTO summaries (
            id,
            organization_id,
            document_version_id,
            summary_text,
            status,
            created_by
          ) VALUES ($1, $2, $3, $4, 'pending_review', $5)
        `,
        [summaryId, input.organizationId, documentVersionId, input.summary, input.createdBy ?? null]
      );

      for (const chunkId of chunkIds.slice(0, 2)) {
        await client.query(
          `
            INSERT INTO summary_citations (
              id,
              organization_id,
              summary_id,
              chunk_id,
              start_offset,
              end_offset,
              created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [randomUUID(), input.organizationId, summaryId, chunkId, 0, 120, input.createdBy ?? null]
        );
      }

      await client.query(
        `
          INSERT INTO source_scores (
            id,
            organization_id,
            document_version_id,
            total_score,
            factors,
            model_version,
            computed_at,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (organization_id, document_version_id)
          DO UPDATE SET
            total_score = EXCLUDED.total_score,
            factors = EXCLUDED.factors,
            model_version = EXCLUDED.model_version,
            computed_at = EXCLUDED.computed_at,
            updated_at = NOW()
        `,
        [
          randomUUID(),
          input.organizationId,
          documentVersionId,
          input.sourceScore.total,
          JSON.stringify(input.sourceScore.factors),
          input.sourceScore.modelVersion,
          input.sourceScore.computedAt,
          input.createdBy ?? null
        ]
      );

      await client.query(
        `
          INSERT INTO review_queue_items (
            id,
            organization_id,
            summary_id,
            status,
            created_by
          ) VALUES ($1, $2, $3, 'pending', $4)
          ON CONFLICT DO NOTHING
        `,
        [randomUUID(), input.organizationId, summaryId, input.createdBy ?? null]
      );
    }

    await client.query("COMMIT");

    // Invalidate cache if document was changed
    if (!unchanged) {
      const { invalidateDocumentCache } = await import("./cached-repositories");
      await invalidateDocumentCache(input.organizationId, documentId).catch((error) => {
        // Don't fail the transaction if cache invalidation fails
        console.error("[Cache] Failed to invalidate cache:", error);
      });
    }

    return {
      changed: !unchanged,
      documentId,
      documentVersionId
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function searchDocumentChunksHybrid(params: {
  organizationId: string;
  queryText: string;
  queryVector: string;
  sourceType?: ConnectorType;
  limit?: number;
  dateRange?: { from?: string; to?: string };
  author?: string;
  minSourceScore?: number;
  documentIds?: string[];
}): Promise<ChunkSearchRecord[]> {
  const limit = params.limit ?? 8;
  // Reduced retrieval pool: 30 instead of 60 for better performance with HNSW index
  const retrievalPool = Math.max(30, limit * 4);
  const k = 30; // Reduced from 60 for optimized vector search

  // Build WHERE clause conditions for filters
  const conditions: string[] = ["d.organization_id = $1"];
  const queryParams: unknown[] = [params.organizationId];
  let paramIndex = 2;

  if (params.sourceType) {
    conditions.push(`d.source_type = $${paramIndex}`);
    queryParams.push(params.sourceType);
    paramIndex += 1;
  }

  if (params.dateRange?.from) {
    conditions.push(`COALESCE(dv.source_last_updated_at, d.updated_at) >= $${paramIndex}`);
    queryParams.push(params.dateRange.from);
    paramIndex += 1;
  }

  if (params.dateRange?.to) {
    conditions.push(`COALESCE(dv.source_last_updated_at, d.updated_at) <= $${paramIndex}`);
    queryParams.push(params.dateRange.to);
    paramIndex += 1;
  }

  if (params.author) {
    conditions.push(`d.owner_identity ILIKE $${paramIndex}`);
    queryParams.push(`%${params.author}%`);
    paramIndex += 1;
  }

  if (params.minSourceScore !== undefined) {
    conditions.push(`COALESCE(ss.total_score, 50) >= $${paramIndex}`);
    queryParams.push(params.minSourceScore);
    paramIndex += 1;
  }

  if (params.documentIds && params.documentIds.length > 0) {
    conditions.push(`d.id = ANY($${paramIndex}::text[])`);
    queryParams.push(params.documentIds);
    paramIndex += 1;
  }

  const whereClause = conditions.join(" AND ");
  const vectorQueryParamIndex = paramIndex;
  const limitParamIndex = paramIndex + 1;

  const vectorRows = await query<DbChunkSearchRow>(
    `
      SELECT
        dc.id AS chunk_id,
        dc.document_version_id AS doc_version_id,
        dv.document_id AS document_id,
        d.title AS document_title,
        dc.text_content AS text,
        d.source_url,
        COALESCE(ss.total_score, 50) AS source_score,
        COALESCE(dv.source_last_updated_at, d.updated_at) AS updated_at,
        d.owner_identity,
        d.source_format,
        d.source_external_id,
        d.canonical_source_url,
        dv.source_version_label,
        dv.source_checksum,
        dv.connector_sync_run_id,
        d.source_type AS connector_type,
        ce.embedding <=> $${vectorQueryParamIndex}::vector AS vector_distance,
        NULL::double precision AS lexical_score
      FROM document_chunks dc
      JOIN document_versions dv
        ON dv.id = dc.document_version_id
        AND dv.organization_id = dc.organization_id
      JOIN documents d
        ON d.id = dv.document_id
        AND d.organization_id = dv.organization_id
      LEFT JOIN source_scores ss
        ON ss.organization_id = d.organization_id
        AND ss.document_version_id = dv.id
      JOIN chunk_embeddings ce
        ON ce.chunk_id = dc.id
        AND ce.organization_id = dc.organization_id
      WHERE ${whereClause}
      ORDER BY ce.embedding <=> $${vectorQueryParamIndex}::vector ASC
      LIMIT $${limitParamIndex}
    `,
    [...queryParams, params.queryVector, retrievalPool]
  );

  const lexicalQueryParamIndex = paramIndex;
  const lexicalLimitParamIndex = paramIndex + 1;

  const lexicalRows = await query<DbChunkSearchRow>(
    `
      SELECT
        dc.id AS chunk_id,
        dc.document_version_id AS doc_version_id,
        dv.document_id AS document_id,
        d.title AS document_title,
        dc.text_content AS text,
        d.source_url,
        COALESCE(ss.total_score, 50) AS source_score,
        COALESCE(dv.source_last_updated_at, d.updated_at) AS updated_at,
        d.owner_identity,
        d.source_format,
        d.source_external_id,
        d.canonical_source_url,
        dv.source_version_label,
        dv.source_checksum,
        dv.connector_sync_run_id,
        d.source_type AS connector_type,
        NULL::double precision AS vector_distance,
        ts_rank_cd(to_tsvector('english', dc.text_content), plainto_tsquery('english', $${lexicalQueryParamIndex})) AS lexical_score
      FROM document_chunks dc
      JOIN document_versions dv
        ON dv.id = dc.document_version_id
        AND dv.organization_id = dc.organization_id
      JOIN documents d
        ON d.id = dv.document_id
        AND d.organization_id = dv.organization_id
      LEFT JOIN source_scores ss
        ON ss.organization_id = d.organization_id
        AND ss.document_version_id = dv.id
      WHERE ${whereClause}
        AND to_tsvector('english', dc.text_content) @@ plainto_tsquery('english', $${lexicalQueryParamIndex})
      ORDER BY lexical_score DESC
      LIMIT $${lexicalLimitParamIndex}
    `,
    [...queryParams, params.queryText, retrievalPool]
  );

  const merged = new Map<
    string,
    {
      chunkId: string;
      docVersionId: string;
      documentId: string;
      documentTitle: string;
      text: string;
      sourceUrl: string;
      sourceScore: number;
      updatedAt: string;
      connectorType: ConnectorType;
      author: string | null;
      sourceFormat: string | null;
      sourceExternalId: string | null;
      canonicalSourceUrl: string | null;
      sourceVersionLabel: string | null;
      sourceChecksum: string | null;
      syncRunId: string | null;
      vectorRank?: number;
      lexicalRank?: number;
      vectorDistance?: number;
      lexicalScore?: number;
    }
  >();

  for (let index = 0; index < vectorRows.length; index += 1) {
    const row = vectorRows[index];
    const existing = merged.get(row.chunk_id);
    merged.set(row.chunk_id, {
      chunkId: row.chunk_id,
      docVersionId: row.doc_version_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      text: row.text,
      sourceUrl: row.source_url,
      sourceScore: Number(row.source_score),
      updatedAt: row.updated_at,
      connectorType: row.connector_type,
      author: row.owner_identity,
      sourceFormat: row.source_format,
      sourceExternalId: row.source_external_id,
      canonicalSourceUrl: row.canonical_source_url,
      sourceVersionLabel: row.source_version_label,
      sourceChecksum: row.source_checksum,
      syncRunId: row.connector_sync_run_id,
      lexicalRank: existing?.lexicalRank,
      lexicalScore: existing?.lexicalScore,
      vectorRank: index + 1,
      vectorDistance: row.vector_distance ?? undefined
    });
  }

  for (let index = 0; index < lexicalRows.length; index += 1) {
    const row = lexicalRows[index];
    const existing = merged.get(row.chunk_id);
    merged.set(row.chunk_id, {
      chunkId: row.chunk_id,
      docVersionId: row.doc_version_id,
      documentId: row.document_id,
      documentTitle: row.document_title,
      text: row.text,
      sourceUrl: row.source_url,
      sourceScore: Number(row.source_score),
      updatedAt: row.updated_at,
      connectorType: row.connector_type,
      author: row.owner_identity,
      sourceFormat: row.source_format,
      sourceExternalId: row.source_external_id,
      canonicalSourceUrl: row.canonical_source_url,
      sourceVersionLabel: row.source_version_label,
      sourceChecksum: row.source_checksum,
      syncRunId: row.connector_sync_run_id,
      vectorRank: existing?.vectorRank,
      vectorDistance: existing?.vectorDistance,
      lexicalRank: index + 1,
      lexicalScore: row.lexical_score ?? undefined
    });
  }

  return Array.from(merged.values())
    .map((entry) => {
      const vectorComponent = entry.vectorRank ? 1 / (k + entry.vectorRank) : 0;
      const lexicalComponent = entry.lexicalRank ? 1 / (k + entry.lexicalRank) : 0;
      const trustNorm = Math.min(1, Math.max(0, entry.sourceScore / 100));
      const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
      const recencyNorm = Math.max(0, 1 - ageMs / (1000 * 60 * 60 * 24 * 30));
      const combinedScore = vectorComponent + lexicalComponent + 0.2 * trustNorm + 0.1 * recencyNorm;

      const candidate: ChunkSearchRecord = {
        chunkId: entry.chunkId,
        docVersionId: entry.docVersionId,
        text: entry.text,
        sourceUrl: entry.sourceUrl,
        sourceScore: entry.sourceScore,
        documentId: entry.documentId,
        documentTitle: entry.documentTitle,
        author: entry.author ?? undefined,
        sourceFormat: entry.sourceFormat ?? undefined,
        sourceExternalId: entry.sourceExternalId ?? undefined,
        canonicalSourceUrl: entry.canonicalSourceUrl ?? undefined,
        sourceVersionLabel: entry.sourceVersionLabel ?? undefined,
        sourceChecksum: entry.sourceChecksum ?? undefined,
        syncRunId: entry.syncRunId ?? undefined,
        vectorRank: entry.vectorRank,
        lexicalRank: entry.lexicalRank,
        vectorDistance: entry.vectorDistance,
        lexicalScore: entry.lexicalScore,
        combinedScore,
        updatedAt: entry.updatedAt,
        connectorType: entry.connectorType
      };
      return candidate;
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, limit);
}

export async function appendAuditEvent(input: {
  organizationId: string;
  actorId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const rows = await query<{ id: string }>(
    `
      INSERT INTO audit_events (
        id,
        organization_id,
        actor_id,
        event_type,
        entity_type,
        entity_id,
        payload,
        occurred_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $3)
      RETURNING id
    `,
    [
      randomUUID(),
      input.organizationId,
      input.actorId ?? null,
      input.eventType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload)
    ]
  );

  void rows;
}

async function appendAuditEventTx(
  client: PoolClient,
  input: {
    organizationId: string;
    actorId?: string;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_events (
        id,
        organization_id,
        actor_id,
        event_type,
        entity_type,
        entity_id,
        payload,
        occurred_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $3)
    `,
    [
      randomUUID(),
      input.organizationId,
      input.actorId ?? null,
      input.eventType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload)
    ]
  );
}

export function vectorToSqlLiteral(values: number[]): string {
  const normalized = values.map((value) => Number(value.toFixed(8)));
  return `[${normalized.join(",")}]`;
}

export function hashEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const normalized = text.toLowerCase();

  for (let i = 0; i < normalized.length; i += 1) {
    const charCode = normalized.charCodeAt(i);
    const index = (charCode * 31 + i * 17) % dimensions;
    vector[index] += ((charCode % 13) + 1) / 13;
  }

  const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

export function toDocumentChunk(records: ChunkSearchRecord[]): DocumentChunk[] {
  return records.map((record, index) => ({
    chunkId: record.chunkId,
    docVersionId: record.docVersionId,
    text: record.text,
    rank: index,
    sourceUrl: record.sourceUrl,
    sourceScore: record.sourceScore,
    documentId: record.documentId,
    documentTitle: record.documentTitle,
    connectorType: record.connectorType,
    updatedAt: record.updatedAt,
    author: record.author,
    sourceFormat: record.sourceFormat,
    sourceExternalId: record.sourceExternalId,
    canonicalSourceUrl: record.canonicalSourceUrl,
    sourceVersionLabel: record.sourceVersionLabel,
    sourceChecksum: record.sourceChecksum,
    syncRunId: record.syncRunId
  }));
}

export async function getDocumentByVersionId(organizationId: string, documentVersionId: string): Promise<DocumentRecord | null> {
  const rows = await query<DbDocumentRow>(
    `
      SELECT
        d.id,
        d.organization_id,
        d.title,
        d.source_type,
        d.source_url,
        d.source_external_id,
        d.source_format,
        d.canonical_source_url,
        d.owner_identity,
        d.updated_at,
        s.summary_text,
        ss.total_score,
        ss.factors,
        ss.computed_at,
        ss.model_version
      FROM document_versions dv
      JOIN documents d
        ON d.id = dv.document_id
        AND d.organization_id = dv.organization_id
      LEFT JOIN summaries s
        ON s.organization_id = dv.organization_id
        AND s.document_version_id = dv.id
      LEFT JOIN source_scores ss
        ON ss.organization_id = dv.organization_id
        AND ss.document_version_id = dv.id
      WHERE dv.organization_id = $1
        AND dv.id = $2
      LIMIT 1
    `,
    [organizationId, documentVersionId]
  );

  return rows[0] ? mapDocument(rows[0]) : null;
}

export async function getCitationsForMessage(organizationId: string, messageId: string): Promise<Citation[]> {
  const rows = await query<{
    chunk_id: string;
    source_url: string;
    start_offset: number;
    end_offset: number;
    doc_version_id: string;
  }>(
    `
      SELECT
        ac.chunk_id,
        ac.source_url,
        ac.start_offset,
        ac.end_offset,
        dc.document_version_id AS doc_version_id
      FROM answer_citations ac
      JOIN document_chunks dc
        ON dc.id = ac.chunk_id
        AND dc.organization_id = ac.organization_id
      WHERE ac.organization_id = $1
        AND ac.chat_message_id = $2
      ORDER BY ac.created_at ASC
    `,
    [organizationId, messageId]
  );

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    docVersionId: row.doc_version_id,
    sourceUrl: row.source_url,
    startOffset: row.start_offset,
    endOffset: row.end_offset
  }));
}

export async function touchConnectorLastSync(organizationId: string, connectorAccountId: string): Promise<void> {
  await query(
    `
      UPDATE connector_accounts
      SET last_synced_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
    `,
    [organizationId, connectorAccountId]
  );
}

export async function getOrganizationIdsWithActiveConnectors(): Promise<string[]> {
  const rows = await query<{ organization_id: string }>(
    `
      SELECT DISTINCT organization_id
      FROM connector_accounts
      WHERE status = 'active'
    `
  );

  return rows.map((row) => row.organization_id);
}

export async function getConnectorAccountsForOrganization(organizationId: string): Promise<ConnectorAccountRecord[]> {
  return listConnectorAccounts(organizationId);
}

export async function getConnectorAccountById(connectorAccountId: string): Promise<ConnectorAccountRecord | null> {
  const rows = await query<DbConnectorAccountRow>(
    `
      SELECT
        id,
        organization_id,
        connector_type,
        status,
        encrypted_access_token,
        encrypted_refresh_token,
        token_expires_at,
        sync_cursor,
        last_synced_at,
        display_name,
        external_workspace_id,
        created_at,
        updated_at
      FROM connector_accounts
      WHERE id = $1
      LIMIT 1
    `,
    [connectorAccountId]
  );

  return rows[0] ? mapConnectorAccount(rows[0]) : null;
}

export async function getLatestDocumentVersionMetadata(
  organizationId: string,
  documentId: string
): Promise<{
  id: string;
  contentHash: string;
  createdAt: string;
  sourceLastUpdatedAt?: string;
  sourceVersionLabel?: string;
  sourceChecksum?: string;
  connectorSyncRunId?: string;
} | null> {
  const rows = await query<{
    id: string;
    content_hash: string;
    created_at: string;
    source_last_updated_at: string | null;
    source_version_label: string | null;
    source_checksum: string | null;
    connector_sync_run_id: string | null;
  }>(
    `
      SELECT
        id,
        content_hash,
        created_at,
        source_last_updated_at,
        source_version_label,
        source_checksum,
        connector_sync_run_id
      FROM document_versions
      WHERE organization_id = $1
        AND document_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [organizationId, documentId]
  );

  return rows[0]
      ? {
          id: rows[0].id,
          contentHash: rows[0].content_hash,
          createdAt: rows[0].created_at,
          sourceLastUpdatedAt: rows[0].source_last_updated_at ?? undefined,
          sourceVersionLabel: rows[0].source_version_label ?? undefined,
          sourceChecksum: rows[0].source_checksum ?? undefined,
          connectorSyncRunId: rows[0].connector_sync_run_id ?? undefined
        }
    : null;
}

export async function getDocumentVersionContent(
  organizationId: string,
  documentVersionId: string
): Promise<{ content: string } | null> {
  const rows = await query<{ content_markdown: string }>(
    `
      SELECT content_markdown
      FROM document_versions
      WHERE organization_id = $1
        AND id = $2
      LIMIT 1
    `,
    [organizationId, documentVersionId]
  );

  return rows[0] ? { content: rows[0].content_markdown } : null;
}

export async function listDocumentVersionTimeline(
  organizationId: string,
  documentId: string,
  limit = 8
): Promise<
  Array<{
    id: string;
    createdAt: string;
    contentHash: string;
    sourceLastUpdatedAt?: string;
    sourceVersionLabel?: string;
    sourceChecksum?: string;
    connectorSyncRunId?: string;
  }>
> {
  const rows = await query<{
    id: string;
    created_at: string;
    content_hash: string;
    source_last_updated_at: string | null;
    source_version_label: string | null;
    source_checksum: string | null;
    connector_sync_run_id: string | null;
  }>(
    `
      SELECT
        id,
        created_at,
        content_hash,
        source_last_updated_at,
        source_version_label,
        source_checksum,
        connector_sync_run_id
      FROM document_versions
      WHERE organization_id = $1
        AND document_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [organizationId, documentId, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    contentHash: row.content_hash,
    sourceLastUpdatedAt: row.source_last_updated_at ?? undefined,
    sourceVersionLabel: row.source_version_label ?? undefined,
    sourceChecksum: row.source_checksum ?? undefined,
    connectorSyncRunId: row.connector_sync_run_id ?? undefined
  }));
}

export async function getSummaryCitationsByDocumentVersion(
  organizationId: string,
  documentVersionId: string
): Promise<Citation[]> {
  const rows = await query<{
    chunk_id: string;
    source_url: string;
    start_offset: number;
    end_offset: number;
  }>(
    `
      SELECT
        sc.chunk_id,
        d.source_url,
        sc.start_offset,
        sc.end_offset
      FROM summaries s
      JOIN summary_citations sc
        ON sc.summary_id = s.id
        AND sc.organization_id = s.organization_id
      JOIN document_chunks dc
        ON dc.id = sc.chunk_id
        AND dc.organization_id = sc.organization_id
      JOIN document_versions dv
        ON dv.id = dc.document_version_id
        AND dv.organization_id = dc.organization_id
      JOIN documents d
        ON d.id = dv.document_id
        AND d.organization_id = dv.organization_id
      WHERE s.organization_id = $1
        AND s.document_version_id = $2
      ORDER BY sc.created_at ASC
    `,
    [organizationId, documentVersionId]
  );

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    docVersionId: documentVersionId,
    sourceUrl: row.source_url,
    startOffset: row.start_offset,
    endOffset: row.end_offset
  }));
}

export async function upsertSummaryReviewQueue(input: {
  organizationId: string;
  documentVersionId: string;
  summary: string;
  createdBy?: string;
}): Promise<{ summaryId: string }> {
  const summaryId = randomUUID();

  await query(
    `
      INSERT INTO summaries (
        id,
        organization_id,
        document_version_id,
        summary_text,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, 'pending_review', $5)
    `,
    [summaryId, input.organizationId, input.documentVersionId, input.summary, input.createdBy ?? null]
  );

  await query(
    `
      INSERT INTO review_queue_items (
        id,
        organization_id,
        summary_id,
        status,
        created_by
      ) VALUES ($1, $2, $3, 'pending', $4)
    `,
    [randomUUID(), input.organizationId, summaryId, input.createdBy ?? null]
  );

  return { summaryId };
}

export async function upsertSourceScore(input: {
  organizationId: string;
  documentVersionId: string;
  sourceScore: SourceScore;
  createdBy?: string;
}): Promise<void> {
  await query(
    `
      INSERT INTO source_scores (
        id,
        organization_id,
        document_version_id,
        total_score,
        factors,
        model_version,
        computed_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (organization_id, document_version_id)
      DO UPDATE SET
        total_score = EXCLUDED.total_score,
        factors = EXCLUDED.factors,
        model_version = EXCLUDED.model_version,
        computed_at = EXCLUDED.computed_at,
        updated_at = NOW()
    `,
    [
      randomUUID(),
      input.organizationId,
      input.documentVersionId,
      input.sourceScore.total,
      JSON.stringify(input.sourceScore.factors),
      input.sourceScore.modelVersion,
      input.sourceScore.computedAt,
      input.createdBy ?? null
    ]
  );
}

export async function updateConnectorSyncCursor(input: {
  organizationId: string;
  connectorAccountId: string;
  cursor: string;
}): Promise<void> {
  await query(
    `
      UPDATE connector_accounts
      SET sync_cursor = $3,
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, input.connectorAccountId, input.cursor]
  );
}

export async function listPendingReviewItems(organizationId: string): Promise<ReviewQueueItem[]> {
  const rows = await query<{
    id: string;
    organization_id: string;
    summary_id: string;
    status: ReviewQueueItem["status"];
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT id, organization_id, summary_id, status, created_at, updated_at
      FROM review_queue_items
      WHERE organization_id = $1
        AND status = 'pending'
      ORDER BY created_at ASC
    `,
    [organizationId]
  );

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    summaryId: row.summary_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function querySyncStatsWindow(organizationId: string, interval: string): Promise<ConnectorSyncStats["last24h"]> {
  const rows = await query<DbSyncStatsRow>(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'running')::int AS running,
        COUNT(*) FILTER (WHERE status = 'failed' AND failure_classification = 'transient')::int AS transient_failures,
        COUNT(*) FILTER (WHERE status = 'failed' AND failure_classification = 'auth')::int AS auth_failures,
        COUNT(*) FILTER (WHERE status = 'failed' AND failure_classification = 'payload')::int AS payload_failures,
        COUNT(*) FILTER (
          WHERE status = 'failed'
            AND (failure_classification IS NULL OR failure_classification NOT IN ('transient', 'auth', 'payload'))
        )::int AS unknown_failures
      FROM connector_sync_runs
      WHERE organization_id = $1
        AND started_at >= NOW() - $2::interval
    `,
    [organizationId, interval]
  );

  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
    failed: Number(row?.failed ?? 0),
    running: Number(row?.running ?? 0),
    failureByClassification: {
      transient: Number(row?.transient_failures ?? 0),
      auth: Number(row?.auth_failures ?? 0),
      payload: Number(row?.payload_failures ?? 0),
      unknown: Number(row?.unknown_failures ?? 0)
    }
  };
}

export async function getConnectorSyncStats(organizationId: string): Promise<ConnectorSyncStats> {
  const [last24h, last7d] = await Promise.all([
    querySyncStatsWindow(organizationId, "24 hours"),
    querySyncStatsWindow(organizationId, "7 days")
  ]);

  return {
    last24h,
    last7d
  };
}

export async function getReviewQueueStats(organizationId: string): Promise<ReviewQueueStats> {
  const rows = await query<DbReviewStatsRow>(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM review_queue_items
      WHERE organization_id = $1
    `,
    [organizationId]
  );

  return {
    total: Number(rows[0]?.total ?? 0),
    pending: Number(rows[0]?.pending ?? 0),
    approved: Number(rows[0]?.approved ?? 0),
    rejected: Number(rows[0]?.rejected ?? 0)
  };
}

export async function getRecentDeadLetterEvents(organizationId: string): Promise<RecentDeadLetterStats> {
  const rows = await query<DbDeadLetterStatsRow>(
    `
      SELECT
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '24 hours')::int AS last_24h,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '7 days')::int AS last_7d
      FROM audit_events
      WHERE organization_id = $1
        AND event_type = 'connector.sync.dead_letter'
    `,
    [organizationId]
  );

  return {
    last24h: Number(rows[0]?.last_24h ?? 0),
    last7d: Number(rows[0]?.last_7d ?? 0)
  };
}

export async function countDocumentsByOrganization(organizationId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM documents
      WHERE organization_id = $1
    `,
    [organizationId]
  );

  return Number(rows[0]?.count ?? 0);
}

export async function listChatThreads(organizationId: string, limit = 12): Promise<ChatThreadSummaryRecord[]> {
  const rows = await query<DbChatThreadSummaryRow>(
    `
      SELECT
        ct.id,
        ct.title,
        ct.updated_at,
        latest.message_text AS last_message_preview
      FROM chat_threads ct
      LEFT JOIN LATERAL (
        SELECT cm.message_text
        FROM chat_messages cm
        WHERE cm.organization_id = ct.organization_id
          AND cm.thread_id = ct.id
        ORDER BY cm.created_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ct.organization_id = $1
      ORDER BY ct.updated_at DESC
      LIMIT $2
    `,
    [organizationId, limit]
  );

  return rows.map(mapChatThreadSummary);
}

export async function getChatThread(
  organizationId: string,
  threadId: string
): Promise<ChatThreadDetail | null> {
  const threadRows = await query<DbChatThreadSummaryRow>(
    `
      SELECT
        ct.id,
        ct.title,
        ct.updated_at,
        latest.message_text AS last_message_preview
      FROM chat_threads ct
      LEFT JOIN LATERAL (
        SELECT cm.message_text
        FROM chat_messages cm
        WHERE cm.organization_id = ct.organization_id
          AND cm.thread_id = ct.id
        ORDER BY cm.created_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ct.organization_id = $1
        AND ct.id = $2
      LIMIT 1
    `,
    [organizationId, threadId]
  );

  if (!threadRows[0]) {
    return null;
  }

  const messageRows = await query<DbChatThreadMessageRow>(
    `
      SELECT
        id,
        thread_id,
        role,
        message_text,
        confidence,
        source_score,
        created_at
      FROM chat_messages
      WHERE organization_id = $1
        AND thread_id = $2
      ORDER BY created_at ASC
    `,
    [organizationId, threadId]
  );

  const assistantMessageIds = messageRows
    .filter((row) => row.role === "assistant")
    .map((row) => row.id);

  const citationRows =
    assistantMessageIds.length > 0
      ? await query<{
          chat_message_id: string;
          chunk_id: string;
          doc_version_id: string;
          source_url: string;
          start_offset: number;
          end_offset: number;
        }>(
          `
            SELECT
              ac.chat_message_id,
              ac.chunk_id,
              dc.document_version_id AS doc_version_id,
              ac.source_url,
              ac.start_offset,
              ac.end_offset
            FROM answer_citations ac
            JOIN document_chunks dc
              ON dc.id = ac.chunk_id
              AND dc.organization_id = ac.organization_id
            WHERE ac.organization_id = $1
              AND ac.chat_message_id = ANY($2::text[])
            ORDER BY ac.created_at ASC
          `,
          [organizationId, assistantMessageIds]
        )
      : [];

  const citationMap = new Map<string, Citation[]>();
  for (const row of citationRows) {
    const existing = citationMap.get(row.chat_message_id) ?? [];
    existing.push({
      chunkId: row.chunk_id,
      docVersionId: row.doc_version_id,
      sourceUrl: row.source_url,
      startOffset: row.start_offset,
      endOffset: row.end_offset
    });
    citationMap.set(row.chat_message_id, existing);
  }

  return {
    thread: mapChatThreadSummary(threadRows[0]),
    messages: messageRows.map((row) => ({
      ...mapChatThreadMessage(row),
      citations: citationMap.get(row.id) ?? []
    }))
  };
}

export async function saveAssistantFeedback(input: {
  organizationId: string;
  threadId: string;
  messageId: string;
  vote: "up" | "down";
  reason?: string;
  actorId: string;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
      INSERT INTO assistant_feedback (
        id,
        organization_id,
        thread_id,
        chat_message_id,
        vote,
        reason,
        created_by
      )
      SELECT
        $1, $2, $3, $4, $5, $6, $7
      WHERE EXISTS (
        SELECT 1
        FROM chat_messages cm
        JOIN chat_threads ct
          ON ct.id = cm.thread_id
          AND ct.organization_id = cm.organization_id
        WHERE cm.organization_id = $2
          AND cm.id = $4
          AND cm.thread_id = $3
      )
      ON CONFLICT (organization_id, chat_message_id, created_by)
      DO UPDATE SET
        vote = EXCLUDED.vote,
        reason = EXCLUDED.reason,
        updated_at = NOW()
      RETURNING id
    `,
    [randomUUID(), input.organizationId, input.threadId, input.messageId, input.vote, input.reason ?? null, input.actorId]
  );

  return rows.length > 0;
}

export async function recordEvalRun(input: {
  organizationId: string;
  totalCases: number;
  scoreGoodPct?: number;
  metadata?: Record<string, unknown>;
  createdBy?: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  await query(
    `
      INSERT INTO retrieval_eval_runs (
        id,
        organization_id,
        started_at,
        completed_at,
        score_good_pct,
        total_cases,
        metadata,
        created_by
      ) VALUES ($1, $2, NOW(), NOW(), $3, $4, $5::jsonb, $6)
    `,
    [id, input.organizationId, input.scoreGoodPct ?? null, input.totalCases, JSON.stringify(input.metadata ?? {}), input.createdBy ?? null]
  );

  return { id };
}

export async function recordEvalCases(input: {
  organizationId: string;
  runId: string;
  cases: Array<{
    queryText: string;
    expectedCitations?: unknown;
    actualCitations?: unknown;
    verdict: "good" | "bad" | "unknown";
    notes?: string;
  }>;
  createdBy?: string;
}): Promise<void> {
  if (input.cases.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const evalCase of input.cases) {
      await client.query(
        `
          INSERT INTO retrieval_eval_cases (
            id,
            organization_id,
            run_id,
            query_text,
            expected_citations,
            actual_citations,
            verdict,
            notes,
            created_by
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
        `,
        [
          randomUUID(),
          input.organizationId,
          input.runId,
          evalCase.queryText,
          JSON.stringify(evalCase.expectedCitations ?? null),
          JSON.stringify(evalCase.actualCitations ?? null),
          evalCase.verdict,
          evalCase.notes ?? null,
          input.createdBy ?? null
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listEvalRuns(
  organizationId: string,
  limit = 20
): Promise<Array<{ id: string; startedAt: string; completedAt?: string; scoreGoodPct?: number; totalCases: number }>> {
  const rows = await query<{
    id: string;
    started_at: string;
    completed_at: string | null;
    score_good_pct: number | null;
    total_cases: number;
  }>(
    `
      SELECT
        id,
        started_at,
        completed_at,
        score_good_pct,
        total_cases
      FROM retrieval_eval_runs
      WHERE organization_id = $1
      ORDER BY started_at DESC
      LIMIT $2
    `,
    [organizationId, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    scoreGoodPct: row.score_good_pct ?? undefined,
    totalCases: Number(row.total_cases)
  }));
}

export async function cleanupExpiredSessions(maxRows = 2000): Promise<number> {
  const rows = await query<{ id: string }>(
    `
      DELETE FROM user_sessions
      WHERE id IN (
        SELECT id
        FROM user_sessions
        WHERE revoked_at IS NOT NULL
           OR expires_at < NOW()
        ORDER BY updated_at ASC
        LIMIT $1
      )
      RETURNING id
    `,
    [maxRows]
  );
  return rows.length;
}

export async function cleanupStaleRateLimits(input?: { olderThanMs?: number; maxRows?: number }): Promise<number> {
  const olderThanMs = input?.olderThanMs ?? 1000 * 60 * 60 * 24 * 2;
  const maxRows = input?.maxRows ?? 5000;
  const rows = await query<{ bucket_key: string }>(
    `
      DELETE FROM api_rate_limits
      WHERE (bucket_key, window_start) IN (
        SELECT bucket_key, window_start
        FROM api_rate_limits
        WHERE window_start < NOW() - ($1::bigint * INTERVAL '1 millisecond')
        ORDER BY window_start ASC
        LIMIT $2
      )
      RETURNING bucket_key
    `,
    [olderThanMs, maxRows]
  );

  return rows.length;
}

export async function createMembership(input: {
  organizationId: string;
  userId: string;
  role: SessionContext["role"];
  createdBy?: string;
}): Promise<void> {
  await query(
    `
      INSERT INTO memberships (id, organization_id, user_id, role, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
    `,
    [randomUUID(), input.organizationId, input.userId, input.role, input.createdBy ?? null]
  );
}

export async function getUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const rows = await query<{ id: string; email: string }>(
    `
      SELECT id, email
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email]
  );

  return rows[0] ?? null;
}

export async function ensureOrganization(input: {
  id: string;
  name: string;
  slug: string;
  createdBy?: string;
}): Promise<void> {
  await query(
    `
      INSERT INTO organizations (id, name, slug, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id)
      DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = NOW()
    `,
    [input.id, input.name, input.slug, input.createdBy ?? null]
  );
}

export async function createOrUpdateUser(input: {
  id: string;
  email: string;
  displayName?: string;
}): Promise<void> {
  await query(
    `
      INSERT INTO users (id, email, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (id)
      DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
    `,
    [input.id, input.email, input.displayName ?? null]
  );
}

export async function getPrimaryMembership(userId: string): Promise<SessionContext | null> {
  return resolveMembership({ userId });
}

function hashInviteCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

function toWindowStart(nowMs: number, windowMs: number): string {
  const slot = Math.floor(nowMs / windowMs) * windowMs;
  return new Date(slot).toISOString();
}

export async function createUserSession(input: {
  userId: string;
  organizationId: string;
  expiresAt: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}): Promise<UserSessionRecord> {
  const rows = await query<DbUserSessionRow>(
    `
      INSERT INTO user_sessions (
        id,
        user_id,
        organization_id,
        expires_at,
        revoked_at,
        metadata,
        created_by
      ) VALUES ($1, $2, $3, $4, NULL, $5::jsonb, $6)
      RETURNING
        id,
        user_id,
        organization_id,
        expires_at,
        revoked_at,
        metadata,
        created_at,
        updated_at
    `,
    [
      randomUUID(),
      input.userId,
      input.organizationId,
      input.expiresAt,
      JSON.stringify(input.metadata ?? {}),
      input.createdBy ?? input.userId
    ]
  );

  return mapUserSession(rows[0]);
}

export async function getUserSession(sessionId: string): Promise<UserSessionRecord | null> {
  const rows = await query<DbUserSessionRow>(
    `
      SELECT
        id,
        user_id,
        organization_id,
        expires_at,
        revoked_at,
        metadata,
        created_at,
        updated_at
      FROM user_sessions
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  return rows[0] ? mapUserSession(rows[0]) : null;
}

export async function getActiveUserSession(sessionId: string): Promise<UserSessionRecord | null> {
  const rows = await query<DbUserSessionRow>(
    `
      SELECT
        id,
        user_id,
        organization_id,
        expires_at,
        revoked_at,
        metadata,
        created_at,
        updated_at
      FROM user_sessions
      WHERE id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [sessionId]
  );

  return rows[0] ? mapUserSession(rows[0]) : null;
}

export async function revokeUserSession(sessionId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
      UPDATE user_sessions
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
      RETURNING id
    `,
    [sessionId]
  );

  return rows.length > 0;
}

export async function listOrganizationDomains(organizationId: string): Promise<OrganizationDomainRecord[]> {
  const rows = await query<DbOrganizationDomainRow>(
    `
      SELECT
        id,
        organization_id,
        domain,
        verified_at,
        created_at,
        updated_at
      FROM organization_domains
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `,
    [organizationId]
  );

  return rows.map(mapOrganizationDomain);
}

export async function addOrganizationDomain(input: {
  organizationId: string;
  domain: string;
  verifiedAt?: string;
  createdBy?: string;
}): Promise<OrganizationDomainRecord> {
  const normalizedDomain = input.domain.trim().toLowerCase();
  const rows = await query<DbOrganizationDomainRow>(
    `
      INSERT INTO organization_domains (
        id,
        organization_id,
        domain,
        verified_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (organization_id, lower(domain))
      DO UPDATE SET
        verified_at = COALESCE(organization_domains.verified_at, EXCLUDED.verified_at),
        updated_at = NOW()
      RETURNING
        id,
        organization_id,
        domain,
        verified_at,
        created_at,
        updated_at
    `,
    [randomUUID(), input.organizationId, normalizedDomain, input.verifiedAt ?? null, input.createdBy ?? null]
  );

  return mapOrganizationDomain(rows[0]);
}

export async function deleteOrganizationDomain(organizationId: string, domainId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
      DELETE FROM organization_domains
      WHERE organization_id = $1
        AND id = $2
      RETURNING id
    `,
    [organizationId, domainId]
  );

  return rows.length > 0;
}

export async function getRegistrationInviteByCode(code: string): Promise<RegistrationInviteRecord | null> {
  const codeHash = hashInviteCode(code);
  const rows = await query<DbRegistrationInviteRow>(
    `
      SELECT
        id,
        organization_id,
        code_hash,
        email,
        domain,
        role,
        expires_at,
        used_at,
        revoked_at,
        created_at,
        updated_at,
        created_by
      FROM registration_invites
      WHERE code_hash = $1
      LIMIT 1
    `,
    [codeHash]
  );

  return rows[0] ? mapRegistrationInvite(rows[0]) : null;
}

export async function listRegistrationInvites(organizationId: string): Promise<RegistrationInviteRecord[]> {
  const rows = await query<DbRegistrationInviteRow>(
    `
      SELECT
        id,
        organization_id,
        code_hash,
        email,
        domain,
        role,
        expires_at,
        used_at,
        revoked_at,
        created_at,
        updated_at,
        created_by
      FROM registration_invites
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `,
    [organizationId]
  );

  return rows.map(mapRegistrationInvite);
}

export async function createRegistrationInvite(input: {
  organizationId: string;
  code: string;
  email?: string;
  domain?: string;
  role: OrgRole;
  expiresAt: string;
  createdBy?: string;
}): Promise<RegistrationInviteRecord> {
  const codeHash = hashInviteCode(input.code);
  const email = input.email?.trim().toLowerCase();
  const domain = input.domain?.trim().toLowerCase();

  const rows = await query<DbRegistrationInviteRow>(
    `
      INSERT INTO registration_invites (
        id,
        organization_id,
        code_hash,
        email,
        domain,
        role,
        expires_at,
        used_at,
        revoked_at,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8)
      RETURNING
        id,
        organization_id,
        code_hash,
        email,
        domain,
        role,
        expires_at,
        used_at,
        revoked_at,
        created_at,
        updated_at,
        created_by
    `,
    [randomUUID(), input.organizationId, codeHash, email ?? null, domain ?? null, input.role, input.expiresAt, input.createdBy ?? null]
  );

  return mapRegistrationInvite(rows[0]);
}

export async function updateRegistrationInvite(
  organizationId: string,
  inviteId: string,
  input: {
    expiresAt?: string;
    revokedAt?: string | null;
  }
): Promise<RegistrationInviteRecord | null> {
  const rows = await query<DbRegistrationInviteRow>(
    `
      UPDATE registration_invites
      SET
        expires_at = COALESCE($3, expires_at),
        revoked_at = CASE
          WHEN $4::timestamptz IS NULL THEN revoked_at
          ELSE $4::timestamptz
        END,
        updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
      RETURNING
        id,
        organization_id,
        code_hash,
        email,
        domain,
        role,
        expires_at,
        used_at,
        revoked_at,
        created_at,
        updated_at,
        created_by
    `,
    [organizationId, inviteId, input.expiresAt ?? null, input.revokedAt ?? null]
  );

  return rows[0] ? mapRegistrationInvite(rows[0]) : null;
}

export async function consumeRegistrationInvite(input: {
  inviteId: string;
  organizationId: string;
  usedBy: string;
}): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `
      UPDATE registration_invites
      SET used_at = NOW(), used_by = $3, updated_at = NOW()
      WHERE id = $1
        AND organization_id = $2
        AND used_at IS NULL
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING id
    `,
    [input.inviteId, input.organizationId, input.usedBy]
  );

  return rows.length > 0;
}

export async function checkAndIncrementApiRateLimit(input: {
  bucketKey: string;
  windowMs: number;
  maxRequests: number;
  nowMs?: number;
}): Promise<{ allowed: boolean; retryAfterMs: number; record: RateLimitRecord }> {
  const nowMs = input.nowMs ?? Date.now();
  const windowStart = toWindowStart(nowMs, input.windowMs);

  const rows = await query<{ bucket_key: string; window_start: string; count: number }>(
    `
      INSERT INTO api_rate_limits (bucket_key, window_start, count, created_at, updated_at)
      VALUES ($1, $2::timestamptz, 1, NOW(), NOW())
      ON CONFLICT (bucket_key, window_start)
      DO UPDATE SET
        count = api_rate_limits.count + 1,
        updated_at = NOW()
      RETURNING bucket_key, window_start, count
    `,
    [input.bucketKey, windowStart]
  );

  const record: RateLimitRecord = {
    bucketKey: rows[0].bucket_key,
    windowStart: rows[0].window_start,
    count: Number(rows[0].count)
  };

  const allowed = record.count <= input.maxRequests;
  const retryAfterMs = allowed ? 0 : Math.max(0, new Date(record.windowStart).getTime() + input.windowMs - nowMs);

  return { allowed, retryAfterMs, record };
}

export async function createOrUpdateMarketingWaitlistLead(input: {
  email: string;
  company: string;
  role?: string;
  sourcePage: string;
  ipHash: string;
}): Promise<MarketingWaitlistLeadRecord> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedCompany = input.company.trim();
  const normalizedRole = input.role?.trim() || null;
  const normalizedSourcePage = input.sourcePage.trim() || "/pricing";

  const existing = await query<{ id: string }>(
    `
      SELECT id
      FROM marketing_waitlist_leads
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [normalizedEmail]
  );

  const rows =
    existing.length > 0
      ? await query<DbMarketingWaitlistLeadRow>(
          `
            UPDATE marketing_waitlist_leads
            SET
              company = $2,
              role = $3,
              source_page = $4,
              ip_hash = $5,
              status = 'pending',
              updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              email,
              company,
              role,
              source_page,
              ip_hash,
              status,
              created_at,
              updated_at
          `,
          [existing[0].id, normalizedCompany, normalizedRole, normalizedSourcePage, input.ipHash]
        )
      : await query<DbMarketingWaitlistLeadRow>(
          `
            INSERT INTO marketing_waitlist_leads (
              id,
              email,
              company,
              role,
              source_page,
              ip_hash,
              status
            ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            RETURNING
              id,
              email,
              company,
              role,
              source_page,
              ip_hash,
              status,
              created_at,
              updated_at
          `,
          [randomUUID(), normalizedEmail, normalizedCompany, normalizedRole, normalizedSourcePage, input.ipHash]
        );

  return mapMarketingWaitlistLead(rows[0]);
}

export function redactSecrets(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (/token|secret|password|authorization/i.test(value)) {
      return "[REDACTED]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = /token|secret|password|authorization/i.test(key) ? "[REDACTED]" : redactSecrets(entry);
    }
    return output;
  }

  return value;
}

export function buildDeterministicContentHash(content: string): string {
  return hashContent(content);
}

export function timestampMs(): number {
  return Date.now();
}

export function isoNow(): string {
  return nowIso();
}
