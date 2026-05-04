// Shared ESM loader for user_context.js with multi-path lookup.
// Search order (configurable): services/user_context.js → root user_context.js → /etc/secrets/user_context.js
// Safe failure: logs exact path on error, returns null module — never throws.
//
// Consumers: gemini.js (USER_CONTEXT text), project-policy.js (PROJECT_POLICY, KEYWORDS, etc.),
//            user-settings.js (USER_TIMEZONE).
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_SEARCH_PATHS = [
    path.resolve(__dirname, 'user_context.js'), // services/user_context.js
    path.resolve(process.cwd(), 'user_context.js'), // root user_context.js
    '/etc/secrets/user_context.js' // Render secret mount
];

/**
 * Load user context module by searching paths in order.
 * Safe failure: logs exact path on error, continues to next path.
 * Never throws — returns { mod, source, path } with null mod on complete failure.
 *
 * @param {string[]} [searchPaths=DEFAULT_SEARCH_PATHS] - Ordered paths to search (injectable for tests)
 * @returns {Promise<{mod: object|null, source: string|null, path: string|null}>}
 */
export async function loadUserContextModule(searchPaths = DEFAULT_SEARCH_PATHS) {
    const errors = [];
    for (const filePath of searchPaths) {
        if (existsSync(filePath)) {
            try {
                const url = pathToFileURL(filePath);
                const mod = await import(url);
                if (mod && typeof mod === 'object') {
                    return { mod, source: 'user_context', path: filePath };
                }
            } catch (err) {
                errors.push({ path: filePath, message: err.message });
                console.warn(`⚠️  Failed to load user context from ${filePath}: ${err.message}`);
            }
        }
    }
    if (errors.length > 0) {
        console.warn(`⚠️  All user context paths exhausted (${errors.length} error(s)). Falling back.`);
    }
    return { mod: null, source: null, path: null };
}

/**
 * Extract a named export from a loaded module, returning undefined if missing.
 *
 * @param {object|null} mod - Module object from loadUserContextModule
 * @param {string} key - Named export name
 * @returns {*|undefined}
 */
export function getModuleExport(mod, key) {
    if (mod && typeof mod === 'object' && key in mod) {
        return mod[key];
    }
    return undefined;
}
