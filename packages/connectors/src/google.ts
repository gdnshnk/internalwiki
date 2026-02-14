import { createHash } from "node:crypto";
import type { ConnectorSyncInput, ConnectorSyncResult, NormalizedExternalItem, WorkspaceConnector } from "./types";
import { ConnectorSyncError } from "./types";

type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  md5Checksum?: string;
  owners?: Array<{ emailAddress?: string; displayName?: string }>;
};

type GoogleDriveListResponse = {
  files?: GoogleDriveFile[];
  nextPageToken?: string;
};

type GoogleDocResponse = {
  body?: {
    content?: Array<{
      paragraph?: {
        elements?: Array<{
          textRun?: {
            content?: string;
          };
        }>;
      };
    }>;
  };
};

const GOOGLE_API_BASE = "https://www.googleapis.com";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SLIDE_MIME = "application/vnd.google-apps.presentation";

function hashChecksum(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function useSampleMode(input: ConnectorSyncInput): boolean {
  if (!input.credentials.accessToken) {
    return true;
  }
  return process.env.INTERNALWIKI_CONNECTOR_MODE === "sample";
}

function classifyStatus(status: number): "auth" | "transient" | "payload" {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 408 || status === 429 || status >= 500) {
    return "transient";
  }
  return "payload";
}

async function googleJsonRequest<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const message = `Google API request failed (${response.status})`;
    throw new ConnectorSyncError(message, classifyStatus(response.status), response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ConnectorSyncError("Google API returned invalid JSON", "payload");
  }
}

async function googleTextRequest(path: string, accessToken: string): Promise<string> {
  const response = await fetch(`${GOOGLE_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new ConnectorSyncError(`Google file download failed (${response.status})`, classifyStatus(response.status), response.status);
  }

  return response.text();
}

function extractDocumentText(document: GoogleDocResponse): string {
  const chunks: string[] = [];
  for (const block of document.body?.content ?? []) {
    for (const element of block.paragraph?.elements ?? []) {
      const text = element.textRun?.content;
      if (text) {
        chunks.push(text);
      }
    }
  }
  return chunks.join("").trim();
}

function sourceTypeFromMime(mimeType: string): "google_docs" | "google_drive" {
  return mimeType === GOOGLE_DOC_MIME ? "google_docs" : "google_drive";
}

async function resolveContent(file: GoogleDriveFile, accessToken: string): Promise<string> {
  if (file.mimeType === GOOGLE_DOC_MIME) {
    const doc = await googleJsonRequest<GoogleDocResponse>(`/docs/v1/documents/${encodeURIComponent(file.id)}`, accessToken);
    const docText = extractDocumentText(doc);
    if (docText.length > 0) {
      return docText;
    }
    return `Google document "${file.name}" has no extractable text content.`;
  }

  if (file.mimeType === "text/plain" || file.mimeType === "application/json") {
    return googleTextRequest(`/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, accessToken);
  }

  if (file.mimeType === GOOGLE_SLIDE_MIME) {
    return `Google Slides file "${file.name}" indexed as metadata-only (slide text extraction pending).`;
  }

  if (file.mimeType === "application/pdf") {
    return `PDF file "${file.name}" indexed as metadata-only (OCR/PDF text extraction pending).`;
  }

  return `Unsupported Google mime type "${file.mimeType}" indexed as metadata-only.`;
}

function buildSampleItems(nowIso: string): NormalizedExternalItem[] {
  return [
    {
      externalId: "gdoc-ops-playbook",
      checksum: hashChecksum(`gdoc-ops-playbook:${nowIso}`),
      title: "Operations Playbook",
      sourceUrl: "https://docs.google.com/document/d/ops-playbook",
      canonicalSourceUrl: "https://docs.google.com/document/d/ops-playbook",
      sourceType: "google_docs",
      updatedAt: nowIso,
      sourceLastUpdatedAt: nowIso,
      sourceVersionLabel: "sample-v1",
      sourceExternalId: "gdoc-ops-playbook",
      sourceFormat: GOOGLE_DOC_MIME,
      owner: "ops-lead@internalwiki.com",
      author: "ops-lead@internalwiki.com",
      aclPrincipalKeys: ["google:workspace"],
      mimeType: GOOGLE_DOC_MIME,
      content: "Operational escalation, on-call handoffs, and incident runbook ownership."
    },
    {
      externalId: "gdrive-quarterly-plan",
      checksum: hashChecksum(`gdrive-quarterly-plan:${nowIso}`),
      title: "Quarterly Planning Notes",
      sourceUrl: "https://drive.google.com/file/d/quarterly-plan/view",
      canonicalSourceUrl: "https://drive.google.com/file/d/quarterly-plan/view",
      sourceType: "google_drive",
      updatedAt: nowIso,
      sourceLastUpdatedAt: nowIso,
      sourceVersionLabel: "sample-v1",
      sourceExternalId: "gdrive-quarterly-plan",
      sourceFormat: "text/plain",
      owner: "product-lead@internalwiki.com",
      author: "product-lead@internalwiki.com",
      aclPrincipalKeys: ["google:workspace"],
      mimeType: "text/plain",
      content: "Quarter priorities, launch sequencing, risk owners, and dependency notes."
    }
  ];
}

export class GoogleWorkspaceConnector implements WorkspaceConnector {
  readonly type = "google_drive" as const;

  async sync(input: ConnectorSyncInput): Promise<ConnectorSyncResult> {
    const nowIso = new Date().toISOString();
    if (useSampleMode(input)) {
      return {
        nextCursor: nowIso,
        items: buildSampleItems(nowIso)
      };
    }

    const accessToken = input.credentials.accessToken;
    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;
    const maxPages = 10;

    do {
      const params = new URLSearchParams({
        pageSize: "50",
        fields:
          "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum,owners(emailAddress,displayName))",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
        q: input.lastCursor
          ? `trashed = false and modifiedTime > '${input.lastCursor.replace(/'/g, "")}'`
          : "trashed = false"
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const payload = await googleJsonRequest<GoogleDriveListResponse>(`/drive/v3/files?${params.toString()}`, accessToken);
      files.push(...(payload.files ?? []));
      pageToken = payload.nextPageToken;
      pageCount += 1;
    } while (pageToken && pageCount < maxPages);

    const items: NormalizedExternalItem[] = [];
    for (const file of files) {
      const updatedAt = file.modifiedTime || nowIso;
      const content = await resolveContent(file, accessToken);
      const checksum = file.md5Checksum ?? hashChecksum(`${file.id}:${updatedAt}:${content.length}`);
      const sourceUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
      const owner = file.owners?.[0]?.emailAddress ?? file.owners?.[0]?.displayName ?? "unknown";

      items.push({
        externalId: file.id,
        checksum,
        title: file.name || file.id,
        sourceUrl,
        canonicalSourceUrl: sourceUrl,
        sourceType: sourceTypeFromMime(file.mimeType),
        updatedAt,
        sourceLastUpdatedAt: updatedAt,
        sourceVersionLabel: file.modifiedTime ? `updated-${new Date(file.modifiedTime).getTime()}` : undefined,
        sourceExternalId: file.id,
        sourceFormat: file.mimeType,
        owner,
        author: owner,
        aclPrincipalKeys: ["google:workspace"],
        mimeType: file.mimeType,
        content
      });
    }

    const newestUpdatedAt = items.reduce<string | undefined>((latest, item) => {
      if (!latest) {
        return item.updatedAt;
      }
      return new Date(item.updatedAt).getTime() > new Date(latest).getTime() ? item.updatedAt : latest;
    }, input.lastCursor);

    return {
      nextCursor: newestUpdatedAt ?? nowIso,
      items
    };
  }
}
