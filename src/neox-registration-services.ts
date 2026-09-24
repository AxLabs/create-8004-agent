import type { WizardAnswers } from "./wizard.js";
import { hasFeature } from "./wizard.js";
import {
    defaultA2aAgentCardEndpoint,
    defaultMcpHttpEndpoint,
    defaultOasfTaxonomyEndpoint,
    normalizeAgentServices,
} from "./neox/services.js";
import type { AgentService } from "./neox/types.js";

/** Build ERC-8004 service declarations from CLI wizard answers (Neo X projects). */
export function buildNeoxRegistrationServices(answers: WizardAnswers): AgentService[] {
    const services: AgentService[] = [];

    if (hasFeature(answers, "a2a")) {
        services.push({
            name: "A2A",
            endpoint: answers.a2aEndpoint?.trim() || defaultA2aAgentCardEndpoint(),
        });
    }

    if (hasFeature(answers, "mcp")) {
        services.push({
            name: "MCP",
            endpoint: answers.mcpEndpoint?.trim() || defaultMcpHttpEndpoint(),
        });
    }

    const skills = answers.skills ?? [];
    const domains = answers.domains ?? [];
    if (skills.length > 0 || domains.length > 0) {
        const oasf: AgentService = {
            name: "OASF",
            endpoint: answers.oasfEndpoint?.trim() || defaultOasfTaxonomyEndpoint(),
        };
        if (skills.length > 0) oasf.skills = skills;
        if (domains.length > 0) oasf.domains = domains;
        services.push(oasf);
    }

    return normalizeAgentServices(services);
}
