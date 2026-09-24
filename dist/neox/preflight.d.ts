import { type Address, type PublicClient } from "viem";
import type { PreflightReport, RegistrationState } from "./types.js";
export declare function readChainId(client: PublicClient): Promise<number>;
export declare function assertChainId(actual: number, expected?: number): void;
export declare function readRegistryIdentity(client: PublicClient, registry: Address): Promise<{
    name: string;
    version: string;
    bytecodeLength: number;
}>;
export declare function simulateRegister(client: PublicClient, registry: Address, account: Address): Promise<import("viem").SimulateContractReturnType<readonly [{
    readonly type: "function";
    readonly name: "name";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
}, {
    readonly type: "function";
    readonly name: "getVersion";
    readonly stateMutability: "pure";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
}, {
    readonly type: "function";
    readonly name: "register";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "setAgentURI";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }, {
        readonly name: "newURI";
        readonly type: "string";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "ownerOf";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "tokenId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "tokenURI";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "tokenId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
}, {
    readonly type: "function";
    readonly name: "getAgentWallet";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}, {
    readonly type: "event";
    readonly name: "Registered";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
        readonly indexed: true;
    }, {
        readonly name: "agentURI";
        readonly type: "string";
        readonly indexed: false;
    }, {
        readonly name: "owner";
        readonly type: "address";
        readonly indexed: true;
    }];
}, {
    readonly type: "event";
    readonly name: "URIUpdated";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
        readonly indexed: true;
    }, {
        readonly name: "newURI";
        readonly type: "string";
        readonly indexed: false;
    }, {
        readonly name: "updatedBy";
        readonly type: "address";
        readonly indexed: true;
    }];
}], "register", readonly [], import("viem").Chain | undefined, import("viem").Account | undefined, import("viem").Chain | undefined, `0x${string}`>>;
export declare function simulateSetAgentURI(client: PublicClient, registry: Address, account: Address, agentId: bigint, uri: string): Promise<import("viem").SimulateContractReturnType<readonly [{
    readonly type: "function";
    readonly name: "name";
    readonly stateMutability: "view";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
}, {
    readonly type: "function";
    readonly name: "getVersion";
    readonly stateMutability: "pure";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
}, {
    readonly type: "function";
    readonly name: "register";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [];
    readonly outputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }];
}, {
    readonly type: "function";
    readonly name: "setAgentURI";
    readonly stateMutability: "nonpayable";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }, {
        readonly name: "newURI";
        readonly type: "string";
    }];
    readonly outputs: readonly [];
}, {
    readonly type: "function";
    readonly name: "ownerOf";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "tokenId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}, {
    readonly type: "function";
    readonly name: "tokenURI";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "tokenId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "string";
    }];
}, {
    readonly type: "function";
    readonly name: "getAgentWallet";
    readonly stateMutability: "view";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }];
    readonly outputs: readonly [{
        readonly name: "";
        readonly type: "address";
    }];
}, {
    readonly type: "event";
    readonly name: "Registered";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
        readonly indexed: true;
    }, {
        readonly name: "agentURI";
        readonly type: "string";
        readonly indexed: false;
    }, {
        readonly name: "owner";
        readonly type: "address";
        readonly indexed: true;
    }];
}, {
    readonly type: "event";
    readonly name: "URIUpdated";
    readonly inputs: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
        readonly indexed: true;
    }, {
        readonly name: "newURI";
        readonly type: "string";
        readonly indexed: false;
    }, {
        readonly name: "updatedBy";
        readonly type: "address";
        readonly indexed: true;
    }];
}], "setAgentURI", readonly [bigint, string], import("viem").Chain | undefined, import("viem").Account | undefined, import("viem").Chain | undefined, `0x${string}`>>;
export declare function estimateRegisterGas(client: PublicClient, registry: Address, account: Address): Promise<bigint>;
export declare function estimateSetAgentURIGas(client: PublicClient, registry: Address, account: Address, agentId: bigint, uri: string): Promise<bigint>;
export declare function nextActionForState(state: RegistrationState): PreflightReport["nextAction"];
export declare function runPreflight(args: {
    client: PublicClient;
    registry: Address;
    signer: Address;
    state: RegistrationState;
    uriForEstimate?: string;
}): Promise<PreflightReport>;
export declare function formatPreflight(report: PreflightReport): string;
