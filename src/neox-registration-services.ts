import type { WizardAnswers } from "./wizard.js";
import { hasFeature } from "./wizard.js";
import { defaultA2aAgentCardEndpoint, normalizeAgentServices } from "./neox/services.js";
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
        const mcpEndpoint = answers.mcpEndpoint?.trim();
        if (mcpEndpoint) {
            services.push({
                name: "MCP",
                endpoint: mcpEndpoint,
            });
        }
    }

    const skills = answers.skills ?? [];
    const domains = answers.domains ?? [];
    const oasfEndpoint = answers.oasfEndpoint?.trim();
    if ((skills.length > 0 || domains.length > 0) && oasfEndpoint) {
        const oasf: AgentService = {
            name: "OASF",
            endpoint: oasfEndpoint,
        };
        if (skills.length > 0) oasf.skills = skills;
        if (domains.length > 0) oasf.domains = domains;
        services.push(oasf);
    }

    return normalizeAgentServices(services);
}
