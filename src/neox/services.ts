import type { AgentService } from "./types.js";

export const REGISTRATION_SERVICE_NAME_MAX = 64;
export const REGISTRATION_SERVICE_ENDPOINT_MAX = 2048;
export const REGISTRATION_SERVICE_VERSION_MAX = 64;
export const REGISTRATION_OASF_TAXONOMY_ITEM_MAX = 256;
export const REGISTRATION_SERVICES_MAX = 20;
export const REGISTRATION_OASF_ITEMS_MAX = 50;

const HTTP_URL_SCHEMES = new Set(["http:", "https:"]);

function containsUnsafeMarkup(value: string): boolean {
    return /<\s*script/i.test(value) || /javascript:/i.test(value);
}

function normalizeRegistrationServiceName(name: string): string {
    return name.trim();
}

function normalizeRegistrationServiceNameLower(name: string): string {
    return normalizeRegistrationServiceName(name).toLowerCase();
}

function normalizeOasfList(values: string[] | undefined): string[] | undefined {
    if (!values || values.length === 0) return undefined;
    const normalized = values.map((value) => value.trim()).filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
}

export function parseOasfTaxonomyInput(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    const parts = raw
        .split(/[\n,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length > REGISTRATION_OASF_ITEMS_MAX) {
        throw new Error(`OASF entries must be at most ${REGISTRATION_OASF_ITEMS_MAX}`);
    }
    for (const part of parts) {
        if (part.length > REGISTRATION_OASF_TAXONOMY_ITEM_MAX) {
            throw new Error(
                `Each OASF entry must be at most ${REGISTRATION_OASF_TAXONOMY_ITEM_MAX} characters`
            );
        }
    }
    return parts;
}

/** Blank input is valid (no public service advertisement). Non-blank uses full endpoint rules. */
export function validateOptionalRegistrationServiceEndpoint(
    serviceName: string,
    endpoint: string
): { ok: true } | { ok: false; message: string } {
    const trimmed = endpoint.trim();
    if (!trimmed) {
        return { ok: true };
    }
    return validateRegistrationServiceEndpoint(serviceName, trimmed);
}

export function validateRegistrationServiceEndpoint(
    serviceName: string,
    endpoint: string
): { ok: true } | { ok: false; message: string } {
    const trimmed = endpoint.trim();
    if (!trimmed) {
        return { ok: false, message: "Endpoint is required" };
    }
    if (trimmed.length > REGISTRATION_SERVICE_ENDPOINT_MAX) {
        return {
            ok: false,
            message: `Endpoint must be at most ${REGISTRATION_SERVICE_ENDPOINT_MAX} characters`,
        };
    }
    if (containsUnsafeMarkup(trimmed)) {
        return { ok: false, message: "Endpoint contains unsupported content" };
    }

    const normalizedName = normalizeRegistrationServiceNameLower(serviceName);
    const isA2a = normalizedName === "a2a";
    const isMcp = normalizedName === "mcp";
    const isWeb = normalizedName === "web";
    const isOasf = normalizedName === "oasf";
    const isKnownHttpOnly = isA2a || isMcp || isWeb;

    if (isKnownHttpOnly || isOasf) {
        let url: URL;
        try {
            url = new URL(trimmed);
        } catch {
            return { ok: false, message: "Enter a valid URL (https://…)" };
        }
        if (isKnownHttpOnly) {
            if (!HTTP_URL_SCHEMES.has(url.protocol)) {
                return { ok: false, message: "Use an http:// or https:// URL for this service" };
            }
        } else {
            const allowed =
                url.protocol === "https:" || url.protocol === "http:" || url.protocol === "ipfs:";
            if (!allowed) {
                return {
                    ok: false,
                    message: "OASF endpoints must use http://, https://, or ipfs://",
                };
            }
        }
        return { ok: true };
    }

    if (trimmed.includes("://")) {
        try {
            const url = new URL(trimmed);
            if (url.protocol === "javascript:") {
                return { ok: false, message: "Endpoint contains unsupported content" };
            }
        } catch {
            return { ok: false, message: "Enter a valid endpoint" };
        }
        return { ok: true };
    }

    if (/[\s<>]/.test(trimmed)) {
        return { ok: false, message: "Endpoint contains invalid characters" };
    }

    return { ok: true };
}

function validateServiceShape(service: AgentService): { ok: true; value: AgentService } | { ok: false; message: string } {
    const name = normalizeRegistrationServiceName(service.name);
    if (!name) {
        return { ok: false, message: "Service name is required" };
    }
    if (name.length > REGISTRATION_SERVICE_NAME_MAX) {
        return { ok: false, message: `Service name must be at most ${REGISTRATION_SERVICE_NAME_MAX} characters` };
    }

    const endpoint = service.endpoint.trim();
    const endpointResult = validateRegistrationServiceEndpoint(name, endpoint);
    if (!endpointResult.ok) {
        return { ok: false, message: endpointResult.message };
    }

    const version = service.version?.trim();
    if (version && version.length > REGISTRATION_SERVICE_VERSION_MAX) {
        return {
            ok: false,
            message: `Version must be at most ${REGISTRATION_SERVICE_VERSION_MAX} characters`,
        };
    }

    const skills = normalizeOasfList(service.skills);
    const domains = normalizeOasfList(service.domains);
    if (skills && skills.length > REGISTRATION_OASF_ITEMS_MAX) {
        return { ok: false, message: `At most ${REGISTRATION_OASF_ITEMS_MAX} skills entries` };
    }
    if (domains && domains.length > REGISTRATION_OASF_ITEMS_MAX) {
        return { ok: false, message: `At most ${REGISTRATION_OASF_ITEMS_MAX} domains entries` };
    }
    for (const item of [...(skills ?? []), ...(domains ?? [])]) {
        if (item.length > REGISTRATION_OASF_TAXONOMY_ITEM_MAX) {
            return {
                ok: false,
                message: `Each OASF entry must be at most ${REGISTRATION_OASF_TAXONOMY_ITEM_MAX} characters`,
            };
        }
    }

    const out: AgentService = { name, endpoint };
    if (version) out.version = version;
    if (skills) out.skills = skills;
    if (domains) out.domains = domains;
    return { ok: true, value: out };
}

export function normalizeAgentServices(services: readonly AgentService[] | undefined): AgentService[] {
    if (!services || services.length === 0) return [];
    if (services.length > REGISTRATION_SERVICES_MAX) {
        throw new Error(`At most ${REGISTRATION_SERVICES_MAX} services are allowed`);
    }

    const normalized: AgentService[] = [];
    const seen = new Set<string>();
    for (const service of services) {
        const result = validateServiceShape(service);
        if (!result.ok) {
            throw new Error(result.message);
        }
        const key = `${normalizeRegistrationServiceNameLower(result.value.name)}|${result.value.endpoint.toLowerCase()}`;
        if (seen.has(key)) {
            throw new Error("Duplicate service entries are not allowed");
        }
        seen.add(key);
        normalized.push(result.value);
    }
    return normalized;
}

export function defaultA2aAgentCardEndpoint(): string {
    return "https://YOUR_PUBLIC_HOST/.well-known/agent-card.json";
}

export function servicesMetadataEquals(actual: AgentService[], expected: AgentService[]): boolean {
    return JSON.stringify(normalizeAgentServices(actual)) === JSON.stringify(normalizeAgentServices(expected));
}
