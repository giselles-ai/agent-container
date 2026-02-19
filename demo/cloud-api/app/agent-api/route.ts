import {
	GET as AgentGet,
	OPTIONS as AgentOptions,
	POST as AgentPost,
} from "../api/agent/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = AgentGet;
export const OPTIONS = AgentOptions;
export const POST = AgentPost;
