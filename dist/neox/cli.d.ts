import type { AgentProjectConfig } from "./types.js";
export type NeoxCliCommand = "preflight" | "dry-run" | "register" | "verify" | "logs";
export declare function parseNeoxCliCommand(argv?: string[]): NeoxCliCommand;
export declare function runNeoxRegistrationCli(config: AgentProjectConfig, argv?: string[]): Promise<void>;
