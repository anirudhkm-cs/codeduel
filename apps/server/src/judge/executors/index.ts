import type { Config } from "../../config.js";
import type { Executor } from "../types.js";
import { Judge0Executor } from "./judge0.js";
import { LocalExecutor } from "./local.js";

export function createExecutor(config: Config): Executor {
  if (config.EXECUTOR === "judge0") {
    return new Judge0Executor({ baseUrl: config.JUDGE0_URL, authToken: config.JUDGE0_AUTH_TOKEN });
  }
  console.warn("⚠️  Using LocalExecutor: submissions run UNSANDBOXED on this machine (dev only).");
  return new LocalExecutor();
}
