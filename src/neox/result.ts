import fs from "node:fs";
import path from "node:path";
import type { Address } from "viem";
import { explorerAddressUrl, explorerTxUrl, RESULT_FILE_NAME } from "./constants.js";
import type {
    RegistrationState,
    SecretFreeRegistrationResult,
    VerificationResult,
} from "./types.js";

export function buildSecretFreeResult(
    state: RegistrationState,
    verification: VerificationResult
): SecretFreeRegistrationResult {
    return {
        chainId: state.chainId,
        registry: state.registry,
        agentId: verification.agentId,
        owner: verification.owner,
        agentWallet: verification.agentWallet,
        finalURI: verification.tokenURI,
        agentURI: verification.tokenURI,
        metadataStorage: verification.metadataStorage,
        decodedMetadata: verification.decodedMetadata,
        transactionHashes: {
            register: state.registerTxHash,
            setAgentURI: state.setUriTxHash,
        },
        receipts: {
            register:
                state.registerBlockNumber && state.registerBlockHash
                    ? {
                          blockNumber: state.registerBlockNumber,
                          blockHash: state.registerBlockHash,
                      }
                    : undefined,
            setAgentURI:
                state.setUriBlockNumber && state.setUriBlockHash
                    ? {
                          blockNumber: state.setUriBlockNumber,
                          blockHash: state.setUriBlockHash,
                      }
                    : undefined,
        },
        verification,
        explorer: {
            registerTx: state.registerTxHash ? explorerTxUrl(state.registerTxHash) : undefined,
            setAgentURITx: state.setUriTxHash ? explorerTxUrl(state.setUriTxHash) : undefined,
            registry: explorerAddressUrl(state.registry as Address),
        },
    };
}

export function writeSecretFreeResult(projectDir: string, result: SecretFreeRegistrationResult): string {
    const file = path.join(projectDir, RESULT_FILE_NAME);
    fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    return file;
}
