/**
 * Neo X T4 templates
 *
 * agent0-sdk does not support Neo X. Generated projects use direct viem calls
 * against the Identity Registry, copying the CLI's self-contained neox library.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasFeature } from "../wizard.js";
import { DEFAULT_FIXTURE_IMAGE_URI, NEOX_T4_CHAIN_ID, NEOX_T4_EXPLORER_URL, NEOX_T4_FAUCET_URL, NEOX_T4_IDENTITY_REGISTRY, NEOX_T4_NATIVE_CURRENCY, NEOX_T4_RPC_URL, } from "../neox/constants.js";
export { isNeoxChain, NEOX_T4_CHAIN_KEY, NEOX_T4_CHAIN_ID, NEOX_T4_IDENTITY_REGISTRY, } from "../neox/constants.js";
export function getNeoxIdentityRegistry() {
    return NEOX_T4_IDENTITY_REGISTRY;
}
export async function resolveNeoxLibraryDir() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
        path.resolve(here, "../../src/neox"),
        path.resolve(process.cwd(), "src/neox"),
        path.resolve(here, "../neox"),
    ];
    for (const dir of candidates) {
        try {
            const entries = await fs.readdir(dir);
            if (entries.some((name) => name.startsWith("constants."))) {
                return dir;
            }
        }
        catch {
            // try next
        }
    }
    throw new Error("Neo X library sources were not found next to the CLI");
}
export async function copyNeoxLibrary(projectPath) {
    const sourceDir = await resolveNeoxLibraryDir();
    const destDir = path.join(projectPath, "src", "neox");
    await fs.mkdir(destDir, { recursive: true });
    const entries = await fs.readdir(sourceDir);
    const preferTs = entries.some((name) => name.endsWith(".ts"));
    const copyDirectory = async (source, destination) => {
        await fs.mkdir(destination, { recursive: true });
        for (const entry of await fs.readdir(source, { withFileTypes: true })) {
            const from = path.join(source, entry.name);
            const to = path.join(destination, entry.name);
            if (entry.isDirectory()) {
                await copyDirectory(from, to);
            }
            else if (preferTs
                ? entry.name.endsWith(".ts")
                : entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
                await fs.copyFile(from, to);
            }
        }
    };
    await copyDirectory(sourceDir, destDir);
}
export function generateNeoxPackageJson(answers) {
    const scripts = {
        build: "tsc",
        preflight: "tsx src/register.ts preflight",
        "dry-run": "tsx src/register.ts dry-run",
        register: "tsx src/register.ts register",
        verify: "tsx src/register.ts verify",
        logs: "tsx src/register.ts logs",
    };
    const dependencies = {
        viem: "^2.21.0",
        dotenv: "^16.3.1",
    };
    const devDependencies = {
        "@types/node": "^20.10.0",
        tsx: "^4.7.0",
        typescript: "^5.3.0",
    };
    if (hasFeature(answers, "a2a") || hasFeature(answers, "mcp")) {
        dependencies["openai"] = "^4.68.0";
    }
    if (hasFeature(answers, "a2a")) {
        scripts["start:a2a"] = "tsx src/a2a-server.ts";
        dependencies["express"] = "^4.18.2";
        dependencies["uuid"] = "^9.0.0";
        devDependencies["@types/express"] = "^4.17.21";
        devDependencies["@types/uuid"] = "^9.0.7";
    }
    if (hasFeature(answers, "mcp")) {
        scripts["start:mcp"] = "tsx src/mcp-server.ts";
        dependencies["@modelcontextprotocol/sdk"] = "^1.0.0";
    }
    return JSON.stringify({
        name: answers.agentName.toLowerCase().replace(/\s+/g, "-"),
        version: "1.0.0",
        description: answers.agentDescription,
        type: "module",
        scripts,
        dependencies,
        devDependencies,
    }, null, 2);
}
export function generateNeoxEnvExample(_answers, chain) {
    const storage = _answers.metadataStorage === "neofs"
        ? `
# NeoFS publication. The bearer token is optional for public-write containers.
METADATA_STORAGE=neofs
NEOFS_REST_GATEWAY=
NEOFS_CONTAINER_ID=
NEOFS_PUBLIC_GATEWAY=
NEOFS_BEARER_TOKEN=
`
        : `
METADATA_STORAGE=inline
`;
    return `# Secret-free example. Copy to .env locally; never commit keys.
# Provide exactly one of:
PRIVATE_KEY=
PRIVATE_KEY_FILE=

# RPC and registry are overridable. Writes require eth_chainId == ${chain.chainId}.
RPC_URL=${chain.rpcUrl}
IDENTITY_REGISTRY=${NEOX_T4_IDENTITY_REGISTRY}
CHAIN_ID=${chain.chainId}
${storage}
`;
}
export function generateNeoxAgentConfig(answers) {
    const image = answers.agentImage?.trim() || DEFAULT_FIXTURE_IMAGE_URI;
    const projectId = answers.agentName.toLowerCase().replace(/\s+/g, "-");
    return `import type { AgentProjectConfig } from "./neox/types.js";
import { NEOX_T4_IDENTITY_REGISTRY } from "./neox/constants.js";

export const AGENT_PROJECT_CONFIG: AgentProjectConfig = {
  name: ${JSON.stringify(answers.agentName)},
  description: ${JSON.stringify(answers.agentDescription)},
  image: ${JSON.stringify(image)},
  projectId: ${JSON.stringify(projectId)},
  registry: NEOX_T4_IDENTITY_REGISTRY,
  metadataStorage: ${JSON.stringify(answers.metadataStorage ?? "inline")},
};
`;
}
export function generateNeoxRegisterEntry() {
    return `/**
 * Neo X T4 ERC-8004 identity registration
 *
 * Commands:
 *   npm run preflight   # read-only dry-run
 *   npm run dry-run     # alias for preflight
 *   npm run register    # mint with register(), then setAgentURI; resumable
 *   npm run verify      # ownerOf / tokenURI / getAgentWallet readback
 */

import "dotenv/config";
import { AGENT_PROJECT_CONFIG } from "./agent-config.js";
import { runNeoxRegistrationCli } from "./neox/cli.js";

runNeoxRegistrationCli(AGENT_PROJECT_CONFIG).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Registration failed:", message);
  process.exit(1);
});
`;
}
export function generateNeoxReadme(answers, chain) {
    const hasA2A = hasFeature(answers, "a2a");
    const hasMCP = hasFeature(answers, "mcp");
    const neofs = answers.metadataStorage === "neofs";
    return `# ${answers.agentName}

${answers.agentDescription}

This project registers an ERC-8004 identity on **${chain.name}** using direct viem contract calls.
x402 payments, Agent0 SDK, Pinata, and OpenAI are not required for this fixture path.
There is no 8004scan route for Neo X; use the Neo X T4 explorer.

## Network

- Chain ID: \`${NEOX_T4_CHAIN_ID}\`
- Native currency: ${NEOX_T4_NATIVE_CURRENCY.name} (${NEOX_T4_NATIVE_CURRENCY.symbol}, ${NEOX_T4_NATIVE_CURRENCY.decimals} decimals)
- RPC (overridable via \`RPC_URL\`): \`${NEOX_T4_RPC_URL}\`
- Identity registry (overridable via \`IDENTITY_REGISTRY\`): \`${NEOX_T4_IDENTITY_REGISTRY}\`
- Explorer: ${NEOX_T4_EXPLORER_URL}

## 1. Install

\`\`\`bash
npm install
\`\`\`

## 2. Configure a signing key

Copy \`.env.example\` to \`.env\` if you want local overrides. Do not commit secrets.

\`\`\`bash
export PRIVATE_KEY_FILE=/path/to/gitignored-key
# or: export PRIVATE_KEY=0x...
export RPC_URL=${NEOX_T4_RPC_URL}
\`\`\`

The register script derives the public address locally and never prints the key.

${neofs ? `This project publishes metadata to NeoFS. Configure the existing container and gateways in \`.env\`:

\`\`\`env
METADATA_STORAGE=neofs
NEOFS_REST_GATEWAY=https://your-rest-gateway.example
NEOFS_CONTAINER_ID=your-container-id
NEOFS_PUBLIC_GATEWAY=https://your-public-gateway.example
NEOFS_BEARER_TOKEN= # optional for a public-write container
\`\`\`

The REST gateway controls uploads. The public gateway must serve unauthenticated HTTPS reads. Never commit the bearer token.
` : `Metadata uses the inline data-URI backend, so no external storage configuration is required.
`}

## 3. Fund the signer with testnet GAS

Address shown by \`npm run preflight\`. Faucet: ${NEOX_T4_FAUCET_URL}

## 4. Preflight (read-only)

Checks \`eth_chainId === ${NEOX_T4_CHAIN_ID}\`, registry bytecode, \`name()\` / \`getVersion()\`,
GAS balance, simulates the next call, and quotes fees from the Neo X RPC
(minimum 20 gwei priority fee). No transaction is sent.

\`\`\`bash
npm run preflight
\`\`\`

## 5. Register or resume

\`\`\`bash
npm run register
\`\`\`

This:

1. Calls parameterless \`register()\` and decodes \`Registered\` from that receipt (agent ID 0 is valid).
2. ${neofs ? "Uploads compact registration-v1 JSON to NeoFS, reads it back through the public gateway, and persists the object IDs." : "Encodes compact registration-v1 metadata as a `data:application/json;base64,` URI."}
3. Calls \`setAgentURI(agentId, uri)\`.
4. Persists transaction hashes immediately and resumes metadata publication if minting already succeeded.
5. Refuses to mint a second identity once this project has completed.

On-chain metadata uses \`services: []\`, \`active: false\`, \`x402Support: false\`, and \`supportedTrust: []\`.
It does not advertise A2A/MCP endpoints or payment providers.

## 6. Verify

\`\`\`bash
npm run verify
\`\`\`

Reads \`ownerOf\`, \`tokenURI\`, and \`getAgentWallet\`, then writes secret-free \`registration-result.json\`.
For HTTP(S) URIs it also retrieves and validates the metadata and exact Neo X registration reference.

## Transaction links

Explorer transactions: \`${NEOX_T4_EXPLORER_URL}/tx/<hash>\`
${hasA2A ? `
## Optional local A2A server

A2A is generated for local development only and is not advertised in on-chain metadata.

\`\`\`bash
npm run start:a2a
\`\`\`
` : ""}${hasMCP ? `
## Optional local MCP server

MCP is generated for local development only and is not advertised in on-chain metadata.

\`\`\`bash
npm run start:mcp
\`\`\`
` : ""}
## Resources

- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
- [Neo X T4 explorer](${NEOX_T4_EXPLORER_URL})
`;
}
export function generateNeoxGitignore() {
    return `node_modules/
dist/
.env
.registration-state.json
registration-result.json
*.log
`;
}
