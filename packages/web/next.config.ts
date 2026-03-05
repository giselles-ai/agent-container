import { withGiselleAgent } from "@giselles-ai/agent-builder/next";
import type { NextConfig } from "next";

import { agent } from "./lib/agent";

const nextConfig: NextConfig = {
	transpilePackages: ["@giselles-ai/browser-tool"],
};

export default withGiselleAgent(nextConfig, agent);
