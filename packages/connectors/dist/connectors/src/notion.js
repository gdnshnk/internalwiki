import { createHash } from "node:crypto";
import { ConnectorSyncError } from "./types";
const NOTION_API_BASE = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-06-28";
function hashChecksum(input) {
    return createHash("sha256").update(input).digest("hex");
}
function useSampleMode(input) {
    if (!input.credentials.accessToken) {
        return true;
    }
    return process.env.INTERNALWIKI_CONNECTOR_MODE === "sample";
}
function classifyStatus(status) {
    if (status === 401 || status === 403) {
        return "auth";
    }
    if (status === 408 || status === 429 || status >= 500) {
        return "transient";
    }
    return "payload";
}
async function notionRequest(path, accessToken, init) {
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            "Notion-Version": process.env.NOTION_VERSION ?? DEFAULT_NOTION_VERSION,
            Authorization: `Bearer ${accessToken}`,
            ...(init?.headers ?? {})
        }
    });
    if (!response.ok) {
        throw new ConnectorSyncError(`Notion API request failed (${response.status})`, classifyStatus(response.status), response.status);
    }
    try {
        return (await response.json());
    }
    catch {
        throw new ConnectorSyncError("Notion API returned invalid JSON", "payload");
    }
}
function parsePageTitle(page) {
    const properties = page.properties ?? {};
    for (const property of Object.values(properties)) {
        if (property?.type === "title" && Array.isArray(property.title)) {
            const title = property.title.map((part) => part.plain_text ?? "").join("").trim();
            if (title.length > 0) {
                return title;
            }
        }
    }
    return `Notion page ${page.id}`;
}
function blockToPlainText(block) {
    const content = block[block.type];
    if (!content || !Array.isArray(content.rich_text)) {
        return "";
    }
    return content.rich_text.map((item) => item.plain_text ?? "").join("");
}
async function fetchPageText(pageId, accessToken) {
    let cursor;
    let pageCount = 0;
    const maxPages = 20;
    const snippets = [];
    do {
        const params = new URLSearchParams({
            page_size: "100"
        });
        if (cursor) {
            params.set("start_cursor", cursor);
        }
        const payload = await notionRequest(`/blocks/${encodeURIComponent(pageId)}/children?${params.toString()}`, accessToken);
        for (const block of payload.results ?? []) {
            const text = blockToPlainText(block);
            if (text.length > 0) {
                snippets.push(text);
            }
        }
        cursor = payload.next_cursor ?? undefined;
        pageCount += 1;
    } while (cursor && pageCount < maxPages);
    return snippets.join("\n").trim();
}
function buildSampleItems(nowIso) {
    return [
        {
            externalId: "notion-product-prd",
            checksum: hashChecksum(`notion-product-prd:${nowIso}`),
            title: "Product Requirements",
            sourceUrl: "https://www.notion.so/internalwiki/product-requirements",
            sourceType: "notion",
            updatedAt: nowIso,
            owner: "pm@internalwiki.com",
            mimeType: "text/markdown",
            content: "Requirements scope, constraints, milestones, and owners for current quarter initiatives."
        }
    ];
}
export class NotionConnector {
    type = "notion";
    async sync(input) {
        const nowIso = new Date().toISOString();
        if (useSampleMode(input)) {
            return {
                nextCursor: nowIso,
                items: buildSampleItems(nowIso)
            };
        }
        const accessToken = input.credentials.accessToken;
        const pages = [];
        let cursor;
        let pageCount = 0;
        const maxPages = 20;
        do {
            const payload = await notionRequest("/search", accessToken, {
                method: "POST",
                body: JSON.stringify({
                    page_size: 50,
                    start_cursor: cursor,
                    filter: {
                        property: "object",
                        value: "page"
                    }
                })
            });
            for (const result of payload.results ?? []) {
                if (result.object === "page") {
                    pages.push(result);
                }
            }
            cursor = payload.next_cursor ?? undefined;
            pageCount += 1;
        } while (cursor && pageCount < maxPages);
        const filtered = input.lastCursor
            ? pages.filter((page) => new Date(page.last_edited_time).getTime() > new Date(input.lastCursor).getTime())
            : pages;
        const items = [];
        for (const page of filtered) {
            const content = await fetchPageText(page.id, accessToken);
            const title = parsePageTitle(page);
            const owner = page.created_by?.id ? `notion-user:${page.created_by.id}` : "unknown";
            const checksum = hashChecksum(`${page.id}:${page.last_edited_time}:${content.length}`);
            items.push({
                externalId: page.id,
                checksum,
                title,
                sourceUrl: page.url,
                sourceType: "notion",
                updatedAt: page.last_edited_time,
                owner,
                mimeType: "text/markdown",
                content: content.length > 0 ? content : `${title} indexed as metadata-only.`
            });
        }
        const newestUpdatedAt = items.reduce((latest, item) => {
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
//# sourceMappingURL=notion.js.map