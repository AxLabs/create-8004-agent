/**
 * Minimal Identity Registry ABI, checked against erc-8004-contracts/abis/IdentityRegistry.json.
 * Generated projects embed this subset and do not import the contracts checkout.
 */
export declare const IDENTITY_REGISTRY_ABI: readonly [{
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
}];
export declare const REGISTERED_EVENT: {
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
};
export declare const URI_UPDATED_EVENT: {
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
};
export declare const REGISTERED_SIGNATURE = "Registered(uint256,string,address)";
export declare const URI_UPDATED_SIGNATURE = "URIUpdated(uint256,string,address)";
