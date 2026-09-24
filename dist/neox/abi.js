/**
 * Minimal Identity Registry ABI, checked against erc-8004-contracts/abis/IdentityRegistry.json.
 * Generated projects embed this subset and do not import the contracts checkout.
 */
export const IDENTITY_REGISTRY_ABI = [
    {
        type: "function",
        name: "name",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
    {
        type: "function",
        name: "getVersion",
        stateMutability: "pure",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
    {
        type: "function",
        name: "register",
        stateMutability: "nonpayable",
        inputs: [],
        outputs: [{ name: "agentId", type: "uint256" }],
    },
    {
        type: "function",
        name: "setAgentURI",
        stateMutability: "nonpayable",
        inputs: [
            { name: "agentId", type: "uint256" },
            { name: "newURI", type: "string" },
        ],
        outputs: [],
    },
    {
        type: "function",
        name: "ownerOf",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
    },
    {
        type: "function",
        name: "tokenURI",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ name: "", type: "string" }],
    },
    {
        type: "function",
        name: "getAgentWallet",
        stateMutability: "view",
        inputs: [{ name: "agentId", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
    },
    {
        type: "event",
        name: "Registered",
        inputs: [
            { name: "agentId", type: "uint256", indexed: true },
            { name: "agentURI", type: "string", indexed: false },
            { name: "owner", type: "address", indexed: true },
        ],
    },
    {
        type: "event",
        name: "URIUpdated",
        inputs: [
            { name: "agentId", type: "uint256", indexed: true },
            { name: "newURI", type: "string", indexed: false },
            { name: "updatedBy", type: "address", indexed: true },
        ],
    },
];
export const REGISTERED_EVENT = IDENTITY_REGISTRY_ABI.find((item) => item.type === "event" && item.name === "Registered");
export const URI_UPDATED_EVENT = IDENTITY_REGISTRY_ABI.find((item) => item.type === "event" && item.name === "URIUpdated");
export const REGISTERED_SIGNATURE = "Registered(uint256,string,address)";
export const URI_UPDATED_SIGNATURE = "URIUpdated(uint256,string,address)";
