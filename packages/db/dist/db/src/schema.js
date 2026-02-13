import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export function loadInitialSchemaSql() {
    const filePath = resolve(fileURLToPath(new URL("../migrations/0001_init.sql", import.meta.url)));
    return readFileSync(filePath, "utf8");
}
//# sourceMappingURL=schema.js.map