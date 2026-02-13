import { createHash, randomUUID } from "node:crypto";
import { query, pool } from "./client";
function nowIso() {
    return new Date().toISOString();
}
function hashContent(input) {
    return createHash("sha256").update(input).digest("hex");
}
function mapDocument(row) {
    const sourceScore = row.total_score !== null && row.factors && row.computed_at && row.model_version
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
        sourceScore
    };
}
function mapConnectorAccount(row) {
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
function mapSyncRun(row) {
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
export async function listDocuments(organizationId) {
    const rows = await query(`
      SELECT
        d.id,
        d.organization_id,
        d.title,
        d.source_type,
        d.source_url,
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
    `, [organizationId]);
    return rows.map(mapDocument);
}
export async function getDocumentById(organizationId, docId) {
    const rows = await query(`
      SELECT
        d.id,
        d.organization_id,
        d.title,
        d.source_type,
        d.source_url,
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
    `, [organizationId, docId]);
    return rows[0] ? mapDocument(rows[0]) : null;
}
export async function listReviewQueue(organizationId) {
    const rows = await query(`
      SELECT id, organization_id, summary_id, status, created_at, updated_at
      FROM review_queue_items
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `, [organizationId]);
    return rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        summaryId: row.summary_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}
export async function applyReviewAction(organizationId, summaryId, action, params) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const queueResult = await client.query(`
        UPDATE review_queue_items
        SET status = $3, updated_at = NOW()
        WHERE organization_id = $1
          AND summary_id = $2
        RETURNING id, organization_id, summary_id, status, created_at, updated_at
      `, [organizationId, summaryId, action === "approve" ? "approved" : "rejected"]);
        if (queueResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return null;
        }
        const queueItem = queueResult.rows[0];
        await client.query(`
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
      `, [
            randomUUID(),
            organizationId,
            queueItem.id,
            summaryId,
            action,
            params?.reason ?? null,
            params?.actorId ?? null
        ]);
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
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function persistGroundedAnswer(input) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const threadId = randomUUID();
        const userMessageId = randomUUID();
        const assistantMessageId = randomUUID();
        await client.query(`
        INSERT INTO chat_threads (id, organization_id, title, created_by)
        VALUES ($1, $2, $3, $4)
      `, [threadId, input.organizationId, input.question.slice(0, 120), input.actorId ?? null]);
        await client.query(`
        INSERT INTO chat_messages (id, organization_id, thread_id, role, message_text, created_by)
        VALUES ($1, $2, $3, 'user', $4, $5)
      `, [userMessageId, input.organizationId, threadId, input.question, input.actorId ?? null]);
        await client.query(`
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
      `, [
            assistantMessageId,
            input.organizationId,
            threadId,
            input.response.answer,
            input.response.confidence,
            input.response.sourceScore,
            input.actorId ?? null
        ]);
        for (const citation of input.response.citations) {
            await client.query(`
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
        `, [
                randomUUID(),
                input.organizationId,
                assistantMessageId,
                citation.chunkId,
                citation.startOffset,
                citation.endOffset,
                citation.sourceUrl,
                input.actorId ?? null
            ]);
        }
        await appendAuditEventTx(client, {
            organizationId: input.organizationId,
            actorId: input.actorId,
            eventType: "assistant.answer.persisted",
            entityType: "chat_message",
            entityId: assistantMessageId,
            payload: {
                citations: input.response.citations.length,
                confidence: input.response.confidence,
                sourceScore: input.response.sourceScore
            }
        });
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function resolveMembership(params) {
    if (!params.userId && !params.email) {
        return null;
    }
    const rows = await query(`
      SELECT m.user_id, m.organization_id, m.role, u.email
      FROM memberships m
      JOIN users u ON u.id = m.user_id
      WHERE ($1::text IS NULL OR m.user_id = $1)
        AND ($2::text IS NULL OR lower(u.email) = lower($2))
        AND ($3::text IS NULL OR m.organization_id = $3)
      ORDER BY m.updated_at DESC
      LIMIT 1
    `, [params.userId ?? null, params.email ?? null, params.organizationId ?? null]);
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
export async function upsertGoogleUserAndEnsureMembership(params) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const organizationId = `org_${params.organizationSlug}`;
        const userId = `user_google_${params.googleSub}`;
        await client.query(`
        INSERT INTO organizations (id, name, slug, created_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `, [organizationId, params.organizationName, params.organizationSlug, userId]);
        await client.query(`
        INSERT INTO users (id, email, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (id)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          updated_at = NOW()
      `, [userId, params.email, params.displayName ?? null]);
        await client.query(`
        INSERT INTO memberships (id, organization_id, user_id, role, created_by)
        VALUES ($1, $2, $3, $4, $3)
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          updated_at = NOW()
      `, [randomUUID(), organizationId, userId, params.role ?? "owner"]);
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
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function createConnectorAccount(input) {
    const rows = await query(`
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
    `, [
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
    ]);
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
export async function listConnectorAccounts(organizationId) {
    const rows = await query(`
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
    `, [organizationId]);
    return rows.map(mapConnectorAccount);
}
export async function getConnectorAccount(organizationId, connectorAccountId) {
    const rows = await query(`
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
    `, [organizationId, connectorAccountId]);
    return rows[0] ? mapConnectorAccount(rows[0]) : null;
}
export async function updateConnectorAccount(organizationId, connectorAccountId, patch) {
    const rows = await query(`
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
    `, [
        organizationId,
        connectorAccountId,
        patch.status ?? null,
        patch.encryptedAccessToken ?? null,
        patch.encryptedRefreshToken ?? null,
        patch.tokenExpiresAt ?? null,
        patch.syncCursor ?? null,
        patch.displayName ?? null,
        patch.externalWorkspaceId ?? null
    ]);
    if (!rows[0]) {
        return null;
    }
    return mapConnectorAccount(rows[0]);
}
export async function deleteConnectorAccount(organizationId, connectorAccountId) {
    const rows = await query(`
      DELETE FROM connector_accounts
      WHERE organization_id = $1
        AND id = $2
      RETURNING id
    `, [organizationId, connectorAccountId]);
    return rows.length > 0;
}
export async function listActiveConnectorAccounts() {
    const rows = await query(`
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
    `);
    return rows.map(mapConnectorAccount);
}
export async function markConnectorReauthRequired(organizationId, connectorAccountId) {
    await query(`
      UPDATE connector_accounts
      SET status = 'reauth_required', updated_at = NOW()
      WHERE organization_id = $1 AND id = $2
    `, [organizationId, connectorAccountId]);
}
export async function startConnectorSyncRun(input) {
    const rows = await query(`
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
    `, [randomUUID(), input.organizationId, input.connectorAccountId, input.createdBy ?? null]);
    return mapSyncRun(rows[0]);
}
export async function finishConnectorSyncRun(input) {
    const rows = await query(`
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
    `, [
        input.runId,
        input.organizationId,
        input.status,
        input.itemsSeen,
        input.itemsChanged,
        input.itemsSkipped,
        input.itemsFailed,
        input.failureClassification ?? null,
        input.errorMessage ?? null
    ]);
    if (input.nextCursor) {
        await query(`
        UPDATE connector_accounts
        SET sync_cursor = $3, last_synced_at = NOW(), updated_at = NOW()
        WHERE organization_id = $1 AND id = $2
      `, [input.organizationId, input.connectorAccountId, input.nextCursor]);
    }
    return rows[0] ? mapSyncRun(rows[0]) : null;
}
export async function listConnectorSyncRuns(organizationId, connectorAccountId, limit = 20) {
    const rows = await query(`
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
    `, [organizationId, connectorAccountId, limit]);
    return rows.map(mapSyncRun);
}
export async function getConnectorSyncRun(organizationId, connectorAccountId, runId) {
    const rows = await query(`
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
    `, [organizationId, connectorAccountId, runId]);
    return rows[0] ? mapSyncRun(rows[0]) : null;
}
export async function getExternalItemChecksums(input) {
    if (input.externalIds.length === 0) {
        return new Map();
    }
    const rows = await query(`
      SELECT external_id, external_checksum
      FROM external_items
      WHERE organization_id = $1
        AND connector_account_id = $2
        AND external_id = ANY($3::text[])
    `, [input.organizationId, input.connectorAccountId, input.externalIds]);
    const checksums = new Map();
    for (const row of rows) {
        checksums.set(row.external_id, row.external_checksum);
    }
    return checksums;
}
export async function upsertExternalItemAndDocuments(input) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const existingExternalItem = await client.query(`
        SELECT external_checksum
        FROM external_items
        WHERE organization_id = $1
          AND connector_account_id = $2
          AND external_id = $3
        LIMIT 1
      `, [input.organizationId, input.connectorAccountId, input.externalId]);
        const unchanged = existingExternalItem.rows[0]?.external_checksum === input.checksum;
        await client.query(`
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
      `, [
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
                content: input.content
            }),
            input.createdBy ?? null
        ]);
        let documentId = randomUUID();
        const existingDocument = await client.query(`
        SELECT id
        FROM documents
        WHERE organization_id = $1
          AND source_url = $2
        LIMIT 1
      `, [input.organizationId, input.sourceUrl]);
        if (existingDocument.rows[0]) {
            documentId = existingDocument.rows[0].id;
            await client.query(`
          UPDATE documents
          SET
            title = $3,
            source_type = $4,
            owner_identity = $5,
            updated_at = $6
          WHERE organization_id = $1
            AND id = $2
        `, [input.organizationId, documentId, input.title, input.sourceType, input.owner, input.updatedAt]);
        }
        else {
            await client.query(`
          INSERT INTO documents (
            id,
            organization_id,
            source_type,
            source_url,
            title,
            owner_identity,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
                documentId,
                input.organizationId,
                input.sourceType,
                input.sourceUrl,
                input.title,
                input.owner,
                input.createdBy ?? null
            ]);
        }
        const contentHash = hashContent(input.content);
        let documentVersionId = randomUUID();
        const versionLookup = await client.query(`
        SELECT id
        FROM document_versions
        WHERE organization_id = $1
          AND document_id = $2
          AND content_hash = $3
        LIMIT 1
      `, [input.organizationId, documentId, contentHash]);
        if (versionLookup.rows[0]) {
            documentVersionId = versionLookup.rows[0].id;
        }
        else {
            await client.query(`
          INSERT INTO document_versions (
            id,
            organization_id,
            document_id,
            content_markdown,
            content_hash,
            version_label,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
                documentVersionId,
                input.organizationId,
                documentId,
                input.content,
                contentHash,
                `v-${Date.now()}`,
                input.createdBy ?? null
            ]);
            const chunkIds = [];
            let cursor = 0;
            for (let i = 0; i < input.chunks.length; i += 1) {
                const chunkId = randomUUID();
                const chunk = input.chunks[i];
                const startOffset = cursor;
                const endOffset = cursor + chunk.length;
                cursor = endOffset;
                chunkIds.push(chunkId);
                await client.query(`
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
          `, [
                    chunkId,
                    input.organizationId,
                    documentVersionId,
                    i,
                    startOffset,
                    endOffset,
                    chunk,
                    input.createdBy ?? null
                ]);
                const vector = input.embeddingVectors[i];
                if (vector) {
                    await client.query(`
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
            `, [
                        randomUUID(),
                        input.organizationId,
                        chunkId,
                        vector,
                        "hash-embedding-v1",
                        input.createdBy ?? null
                    ]);
                }
            }
            const summaryId = randomUUID();
            await client.query(`
          INSERT INTO summaries (
            id,
            organization_id,
            document_version_id,
            summary_text,
            status,
            created_by
          ) VALUES ($1, $2, $3, $4, 'pending_review', $5)
        `, [summaryId, input.organizationId, documentVersionId, input.summary, input.createdBy ?? null]);
            for (const chunkId of chunkIds.slice(0, 2)) {
                await client.query(`
            INSERT INTO summary_citations (
              id,
              organization_id,
              summary_id,
              chunk_id,
              start_offset,
              end_offset,
              created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [randomUUID(), input.organizationId, summaryId, chunkId, 0, 120, input.createdBy ?? null]);
            }
            await client.query(`
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
        `, [
                randomUUID(),
                input.organizationId,
                documentVersionId,
                input.sourceScore.total,
                JSON.stringify(input.sourceScore.factors),
                input.sourceScore.modelVersion,
                input.sourceScore.computedAt,
                input.createdBy ?? null
            ]);
            await client.query(`
          INSERT INTO review_queue_items (
            id,
            organization_id,
            summary_id,
            status,
            created_by
          ) VALUES ($1, $2, $3, 'pending', $4)
          ON CONFLICT DO NOTHING
        `, [randomUUID(), input.organizationId, summaryId, input.createdBy ?? null]);
        }
        await client.query("COMMIT");
        return {
            changed: !unchanged,
            documentId,
            documentVersionId
        };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function searchDocumentChunksHybrid(params) {
    const limit = params.limit ?? 8;
    const vectorRows = await query(`
      SELECT
        dc.id AS chunk_id,
        dc.document_version_id AS doc_version_id,
        dc.text_content AS text,
        d.source_url,
        COALESCE(ss.total_score, 50) AS source_score,
        d.updated_at,
        d.source_type AS connector_type,
        ce.embedding <=> $3::vector AS vector_distance,
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
      WHERE d.organization_id = $1
        AND ($2::text IS NULL OR d.source_type = $2)
      ORDER BY ce.embedding <=> $3::vector ASC
      LIMIT $4
    `, [params.organizationId, params.sourceType ?? null, params.queryVector, limit * 2]);
    const lexicalRows = await query(`
      SELECT
        dc.id AS chunk_id,
        dc.document_version_id AS doc_version_id,
        dc.text_content AS text,
        d.source_url,
        COALESCE(ss.total_score, 50) AS source_score,
        d.updated_at,
        d.source_type AS connector_type,
        NULL::double precision AS vector_distance,
        ts_rank_cd(to_tsvector('english', dc.text_content), plainto_tsquery('english', $3)) AS lexical_score
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
      WHERE d.organization_id = $1
        AND ($2::text IS NULL OR d.source_type = $2)
        AND to_tsvector('english', dc.text_content) @@ plainto_tsquery('english', $3)
      ORDER BY lexical_score DESC
      LIMIT $4
    `, [params.organizationId, params.sourceType ?? null, params.queryText, limit * 2]);
    const merged = new Map();
    const k = 60;
    vectorRows.forEach((row, index) => {
        const key = row.chunk_id;
        const existing = merged.get(key);
        const vectorRank = index + 1;
        const trustBoost = Math.min(1, Number(row.source_score) / 100) * 0.2;
        const recencyBoost = Math.max(0, 1 - (Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24 * 30)) * 0.1;
        const rrf = 1 / (k + vectorRank) + trustBoost + recencyBoost;
        const candidate = {
            chunkId: row.chunk_id,
            docVersionId: row.doc_version_id,
            text: row.text,
            sourceUrl: row.source_url,
            sourceScore: Number(row.source_score),
            vectorRank,
            vectorDistance: row.vector_distance ?? undefined,
            lexicalRank: existing?.lexicalRank,
            lexicalScore: existing?.lexicalScore,
            updatedAt: row.updated_at,
            connectorType: row.connector_type,
            combinedScore: (existing?.combinedScore ?? 0) + rrf
        };
        merged.set(key, candidate);
    });
    lexicalRows.forEach((row, index) => {
        const key = row.chunk_id;
        const existing = merged.get(key);
        const lexicalRank = index + 1;
        const trustBoost = Math.min(1, Number(row.source_score) / 100) * 0.2;
        const recencyBoost = Math.max(0, 1 - (Date.now() - new Date(row.updated_at).getTime()) / (1000 * 60 * 60 * 24 * 30)) * 0.1;
        const rrf = 1 / (k + lexicalRank) + trustBoost + recencyBoost;
        const candidate = {
            chunkId: row.chunk_id,
            docVersionId: row.doc_version_id,
            text: row.text,
            sourceUrl: row.source_url,
            sourceScore: Number(row.source_score),
            vectorRank: existing?.vectorRank,
            vectorDistance: existing?.vectorDistance,
            lexicalRank,
            lexicalScore: row.lexical_score ?? undefined,
            updatedAt: row.updated_at,
            connectorType: row.connector_type,
            combinedScore: (existing?.combinedScore ?? 0) + rrf
        };
        merged.set(key, candidate);
    });
    return Array.from(merged.values())
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);
}
export async function appendAuditEvent(input) {
    const rows = await query(`
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
    `, [
        randomUUID(),
        input.organizationId,
        input.actorId ?? null,
        input.eventType,
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload)
    ]);
    void rows;
}
async function appendAuditEventTx(client, input) {
    await client.query(`
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
    `, [
        randomUUID(),
        input.organizationId,
        input.actorId ?? null,
        input.eventType,
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload)
    ]);
}
export function vectorToSqlLiteral(values) {
    const normalized = values.map((value) => Number(value.toFixed(8)));
    return `[${normalized.join(",")}]`;
}
export function hashEmbedding(text, dimensions = 1536) {
    const vector = new Array(dimensions).fill(0);
    const normalized = text.toLowerCase();
    for (let i = 0; i < normalized.length; i += 1) {
        const charCode = normalized.charCodeAt(i);
        const index = (charCode * 31 + i * 17) % dimensions;
        vector[index] += ((charCode % 13) + 1) / 13;
    }
    const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
}
export function toDocumentChunk(records) {
    return records.map((record, index) => ({
        chunkId: record.chunkId,
        docVersionId: record.docVersionId,
        text: record.text,
        rank: index,
        sourceUrl: record.sourceUrl,
        sourceScore: record.sourceScore
    }));
}
export async function getDocumentByVersionId(organizationId, documentVersionId) {
    const rows = await query(`
      SELECT
        d.id,
        d.organization_id,
        d.title,
        d.source_type,
        d.source_url,
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
    `, [organizationId, documentVersionId]);
    return rows[0] ? mapDocument(rows[0]) : null;
}
export async function getCitationsForMessage(organizationId, messageId) {
    const rows = await query(`
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
    `, [organizationId, messageId]);
    return rows.map((row) => ({
        chunkId: row.chunk_id,
        docVersionId: row.doc_version_id,
        sourceUrl: row.source_url,
        startOffset: row.start_offset,
        endOffset: row.end_offset
    }));
}
export async function touchConnectorLastSync(organizationId, connectorAccountId) {
    await query(`
      UPDATE connector_accounts
      SET last_synced_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
    `, [organizationId, connectorAccountId]);
}
export async function getOrganizationIdsWithActiveConnectors() {
    const rows = await query(`
      SELECT DISTINCT organization_id
      FROM connector_accounts
      WHERE status = 'active'
    `);
    return rows.map((row) => row.organization_id);
}
export async function getConnectorAccountsForOrganization(organizationId) {
    return listConnectorAccounts(organizationId);
}
export async function getConnectorAccountById(connectorAccountId) {
    const rows = await query(`
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
    `, [connectorAccountId]);
    return rows[0] ? mapConnectorAccount(rows[0]) : null;
}
export async function getLatestDocumentVersionMetadata(organizationId, documentId) {
    const rows = await query(`
      SELECT id, content_hash, created_at
      FROM document_versions
      WHERE organization_id = $1
        AND document_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [organizationId, documentId]);
    return rows[0]
        ? {
            id: rows[0].id,
            contentHash: rows[0].content_hash,
            createdAt: rows[0].created_at
        }
        : null;
}
export async function getSummaryCitationsByDocumentVersion(organizationId, documentVersionId) {
    const rows = await query(`
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
    `, [organizationId, documentVersionId]);
    return rows.map((row) => ({
        chunkId: row.chunk_id,
        docVersionId: documentVersionId,
        sourceUrl: row.source_url,
        startOffset: row.start_offset,
        endOffset: row.end_offset
    }));
}
export async function upsertSummaryReviewQueue(input) {
    const summaryId = randomUUID();
    await query(`
      INSERT INTO summaries (
        id,
        organization_id,
        document_version_id,
        summary_text,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, 'pending_review', $5)
    `, [summaryId, input.organizationId, input.documentVersionId, input.summary, input.createdBy ?? null]);
    await query(`
      INSERT INTO review_queue_items (
        id,
        organization_id,
        summary_id,
        status,
        created_by
      ) VALUES ($1, $2, $3, 'pending', $4)
    `, [randomUUID(), input.organizationId, summaryId, input.createdBy ?? null]);
    return { summaryId };
}
export async function upsertSourceScore(input) {
    await query(`
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
    `, [
        randomUUID(),
        input.organizationId,
        input.documentVersionId,
        input.sourceScore.total,
        JSON.stringify(input.sourceScore.factors),
        input.sourceScore.modelVersion,
        input.sourceScore.computedAt,
        input.createdBy ?? null
    ]);
}
export async function updateConnectorSyncCursor(input) {
    await query(`
      UPDATE connector_accounts
      SET sync_cursor = $3,
          last_synced_at = NOW(),
          updated_at = NOW()
      WHERE organization_id = $1
        AND id = $2
    `, [input.organizationId, input.connectorAccountId, input.cursor]);
}
export async function listPendingReviewItems(organizationId) {
    const rows = await query(`
      SELECT id, organization_id, summary_id, status, created_at, updated_at
      FROM review_queue_items
      WHERE organization_id = $1
        AND status = 'pending'
      ORDER BY created_at ASC
    `, [organizationId]);
    return rows.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        summaryId: row.summary_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}
export async function countDocumentsByOrganization(organizationId) {
    const rows = await query(`
      SELECT COUNT(*)::text AS count
      FROM documents
      WHERE organization_id = $1
    `, [organizationId]);
    return Number(rows[0]?.count ?? 0);
}
export async function createMembership(input) {
    await query(`
      INSERT INTO memberships (id, organization_id, user_id, role, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
    `, [randomUUID(), input.organizationId, input.userId, input.role, input.createdBy ?? null]);
}
export async function getUserByEmail(email) {
    const rows = await query(`
      SELECT id, email
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `, [email]);
    return rows[0] ?? null;
}
export async function ensureOrganization(input) {
    await query(`
      INSERT INTO organizations (id, name, slug, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id)
      DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = NOW()
    `, [input.id, input.name, input.slug, input.createdBy ?? null]);
}
export async function createOrUpdateUser(input) {
    await query(`
      INSERT INTO users (id, email, display_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (id)
      DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
    `, [input.id, input.email, input.displayName ?? null]);
}
export async function getPrimaryMembership(userId) {
    return resolveMembership({ userId });
}
export function redactSecrets(value) {
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
        const output = {};
        for (const [key, entry] of Object.entries(value)) {
            output[key] = /token|secret|password|authorization/i.test(key) ? "[REDACTED]" : redactSecrets(entry);
        }
        return output;
    }
    return value;
}
export function buildDeterministicContentHash(content) {
    return hashContent(content);
}
export function timestampMs() {
    return Date.now();
}
export function isoNow() {
    return nowIso();
}
//# sourceMappingURL=repositories.js.map