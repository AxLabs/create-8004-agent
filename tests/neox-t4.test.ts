import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CHAINS } from "../src/config.js";
import { generateProject } from "../src/generator.js";
import { isNeoxChain, NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY } from "../src/neox/constants.js";
import { IDENTITY_REGISTRY_ABI } from "../src/neox/abi.js";
import type { WizardAnswers } from "../src/wizard.js";

const execFileAsync = promisify(execFile);
const OUTPUT_DIR = path.join(process.cwd(), "test-output", "neox-t4-generator");

function neoxAnswers(overrides: Partial<WizardAnswers> = {}): WizardAnswers {
    return {
        projectDir: path.join(OUTPUT_DIR, "identity-fixture"),
        agentName: "AxLabs Neo X Scanner Test 01",
        agentDescription: "AxLabs scanner test fixture for Neo X T4.",
        agentImage:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        features: [],
        a2aStreaming: false,
        chain: "neox-t4",
        trustModels: [],
        agentWallet: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        ...overrides,
    };
}

describe("Neo X T4 chain configuration", () => {
    it("uses the contracts-repo T4 values", () => {
        const chain = CHAINS["neox-t4"];
        expect(chain).toBeDefined();
        expect(chain.name).toBe("Neo X T4 (Testnet)");
        expect(chain.chainId).toBe(12227332);
        expect(chain.chainId).toBe(NEOX_T4_CHAIN_ID);
        expect(chain.rpcUrl).toBe("https://neoxt4seed1.ngd.network");
        expect(chain.x402Supported).toBe(false);
        expect(chain.x402Providers).toEqual([]);
        expect(chain.scanPath).toBe("");
        expect(NEOX_T4_IDENTITY_REGISTRY).toBe("0x8004A856a396D08d31E597a867B1D8273901e641");
        expect(isNeoxChain("neox-t4")).toBe(true);
        expect(isNeoxChain("monad-testnet")).toBe(false);
    });

    it("embeds an ABI subset that matches IdentityRegistry.json", async () => {
        const abiPath = path.resolve(process.cwd(), "../erc-8004-contracts/abis/IdentityRegistry.json");
        const fullAbi = JSON.parse(await fs.readFile(abiPath, "utf8")) as Array<Record<string, unknown>>;

        for (const fragment of IDENTITY_REGISTRY_ABI) {
            const match = fullAbi.find((item) => {
                if (item.type !== fragment.type || item.name !== fragment.name) return false;
                if (fragment.type === "function") {
                    const inputs = (item.inputs as Array<{ type: string }>) ?? [];
                    const expected = fragment.inputs ?? [];
                    return inputs.length === expected.length && inputs.every((input, i) => input.type === expected[i].type);
                }
                return true;
            });
            expect(match, `${fragment.type} ${fragment.name}`).toBeDefined();
        }
    });
});

describe("Neo X T4 generator routing", () => {
    beforeAll(async () => {
        await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
        await generateProject(neoxAnswers());
    });

    it("generates a viem registration path instead of agent0-sdk", async () => {
        const projectDir = path.join(OUTPUT_DIR, "identity-fixture");
        const register = await fs.readFile(path.join(projectDir, "src/register.ts"), "utf8");
        const pkg = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8"));
        const envExample = await fs.readFile(path.join(projectDir, ".env.example"), "utf8");
        const readme = await fs.readFile(path.join(projectDir, "README.md"), "utf8");

        expect(register).toContain("runNeoxRegistrationCli");
        expect(register).not.toContain("agent0-sdk");
        expect(pkg.dependencies.viem).toBeDefined();
        expect(pkg.dependencies["agent0-sdk"]).toBeUndefined();
        expect(pkg.scripts.preflight).toBeDefined();
        expect(pkg.scripts.register).toBeDefined();
        expect(pkg.scripts.verify).toBeDefined();
        expect(envExample).toContain("PRIVATE_KEY=");
        expect(envExample).not.toMatch(/PRIVATE_KEY=0x[0-9a-fA-F]{64}/);
        expect(envExample).not.toContain("PINATA");
        expect(envExample).not.toContain("OPENAI");
        expect(readme).toContain("GAS");
        expect(readme).toContain("https://xt4scan.ngd.network");
        expect(readme).not.toContain("8004scan.io");
        expect(readme).toContain("0x8004A856a396D08d31E597a867B1D8273901e641");

        const copied = await fs.readFile(path.join(projectDir, "src/neox/constants.ts"), "utf8");
        expect(copied).toContain("12227332");
    });

    it(
        "compiles the generated project",
        async () => {
            const projectDir = path.join(OUTPUT_DIR, "identity-fixture");
            await execFileAsync("npm", ["install", "--no-fund", "--no-audit"], {
                cwd: projectDir,
                maxBuffer: 10 * 1024 * 1024,
            });
            await execFileAsync("npx", ["tsc", "--noEmit"], { cwd: projectDir });
        },
        300000,
    );
});
