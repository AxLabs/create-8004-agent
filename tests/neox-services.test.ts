import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { generateProject } from "../src/generator.js";
import { buildNeoxRegistrationServices } from "../src/neox-registration-services.js";
import { normalizeAgentServices } from "../src/neox/services.js";
import {
    buildRegistrationMetadata,
    decodeMetadataDataUri,
    encodeMetadataDataUri,
    registrationRefMatches,
} from "../src/neox/metadata.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import type { AgentProjectConfig } from "../src/neox/types.js";
import type { WizardAnswers } from "../src/wizard.js";
import { generateNeoxAgentConfig } from "../src/templates/neox.js";

const REGISTRY = NEOX_T4_IDENTITY_REGISTRY;

function baseAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: "fixture",
        agentName: "Service Test Agent",
        agentDescription: "Fixture",
        agentImage: "https://example.com/a.png",
        features: [],
        a2aStreaming: false,
        chain: "neox-t4",
        trustModels: [],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        ...overrides,
    };
}

const BASE_CONFIG: AgentProjectConfig = {
    name: "Service Test Agent",
    description: "Fixture",
    image: "https://example.com/a.png",
    projectId: "service-test-agent",
};

describe("Neo X registration services model", () => {
    it("normalizes zero services", () => {
        expect(normalizeAgentServices([])).toEqual([]);
        const metadata = buildRegistrationMetadata(BASE_CONFIG, 1n, REGISTRY);
        expect(metadata.services).toEqual([]);
    });

    it("includes A2A only", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                features: ["a2a"],
                a2aEndpoint: "https://agent.example/.well-known/agent-card.json",
            })
        );
        expect(services).toEqual([
            { name: "A2A", endpoint: "https://agent.example/.well-known/agent-card.json" },
        ]);
    });

    it("includes MCP only", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                features: ["mcp"],
                mcpEndpoint: "https://agent.example/mcp",
            })
        );
        expect(services).toEqual([{ name: "MCP", endpoint: "https://agent.example/mcp" }]);
    });

    it("includes A2A and MCP together", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                features: ["a2a", "mcp"],
                a2aEndpoint: "https://agent.example/.well-known/agent-card.json",
                mcpEndpoint: "https://agent.example/mcp",
            })
        );
        expect(services).toHaveLength(2);
        expect(services.map((s) => s.name).sort()).toEqual(["A2A", "MCP"]);
    });

    it("includes OASF skills and domains", () => {
        const services = buildNeoxRegistrationServices(
            baseAnswers({
                skills: ["technology/data_science/data_engineering"],
                domains: ["finance_and_business/investment_services"],
                oasfEndpoint: "https://github.com/8004-org/oasf",
            })
        );
        expect(services).toEqual([
            {
                name: "OASF",
                endpoint: "https://github.com/8004-org/oasf",
                skills: ["technology/data_science/data_engineering"],
                domains: ["finance_and_business/investment_services"],
            },
        ]);
    });

    it("round-trips metadata with services and preserves registration ref", () => {
        const config: AgentProjectConfig = {
            ...BASE_CONFIG,
            services: [
                {
                    name: "A2A",
                    endpoint: "https://agent.example/.well-known/agent-card.json",
                    version: "0.3.0",
                },
            ],
        };
        const metadata = buildRegistrationMetadata(config, 9007199254740991n, REGISTRY);
        expect(metadata.registrations[0].agentId).toBe(9007199254740991);
        const uri = encodeMetadataDataUri(metadata);
        const decoded = decodeMetadataDataUri(uri);
        expect(decoded.services).toEqual(config.services);
        expect(registrationRefMatches(decoded, 9007199254740991n, REGISTRY)).toBe(true);
    });

    it("rejects unsafe endpoints", () => {
        expect(() =>
            normalizeAgentServices([{ name: "A2A", endpoint: "javascript:alert(1)" }])
        ).toThrow();
    });
});

describe("Neo X generator service declarations", () => {
    const outputRoot = path.join(process.cwd(), "test-output", "neox-services-generator");

    it("emits no A2A/MCP services without features", async () => {
        const configSource = generateNeoxAgentConfig(baseAnswers());
        expect(configSource).not.toContain('"name": "A2A"');
        expect(configSource).not.toContain('"name": "MCP"');
    });

    it("emits A2A service aligned with agent-card path", () => {
        const configSource = generateNeoxAgentConfig(
            baseAnswers({
                features: ["a2a"],
                a2aEndpoint: "https://public.example/.well-known/agent-card.json",
            })
        );
        expect(configSource).toContain('"name": "A2A"');
        expect(configSource).toContain(".well-known/agent-card.json");
    });

    it("writes README service discovery guidance", async () => {
        await fs.promises.rm(outputRoot, { recursive: true, force: true });
        await generateProject(
            baseAnswers({
                projectDir: path.join(outputRoot, "a2a-only"),
                features: ["a2a"],
                a2aEndpoint: "https://public.example/.well-known/agent-card.json",
            })
        );
        const readme = await fs.promises.readFile(
            path.join(outputRoot, "a2a-only", "README.md"),
            "utf8"
        );
        expect(readme).toContain("agent-config.ts");
        expect(readme).toContain("service=A2A");
        expect(readme).not.toContain("not advertised in on-chain metadata");
    });
});

describe("resumable registration metadata", () => {
    it("rebuilds identical service declarations across register retries", () => {
        const config: AgentProjectConfig = {
            ...BASE_CONFIG,
            services: [{ name: "A2A", endpoint: "https://resume.example/.well-known/agent-card.json" }],
        };
        const first = buildRegistrationMetadata(config, 0n, REGISTRY);
        const second = buildRegistrationMetadata(config, 0n, REGISTRY);
        expect(second).toEqual(first);
        expect(decodeMetadataDataUri(encodeMetadataDataUri(first)).services).toEqual(config.services);
    });
});
