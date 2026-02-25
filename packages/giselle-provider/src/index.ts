import { GiselleAgentModel } from "./giselle-agent-model";
import type { GiselleProviderOptions } from "./types";

export type { MapResult, NdjsonMapperContext } from "./ndjson-mapper";
export {
	createMapperContext,
	extractJsonObjects,
	finishStream,
	mapNdjsonEvent,
} from "./ndjson-mapper";
export {
	createSession,
	deleteSession,
	getLiveConnection,
	loadSession,
	removeLiveConnection,
	saveLiveConnection,
	updateSession,
} from "./session-manager";
export { GiselleAgentModel };

export function giselle(options: GiselleProviderOptions): GiselleAgentModel {
	return new GiselleAgentModel(options);
}

export type {
	ConnectCloudApiParams,
	ConnectCloudApiResult,
	GiselleProviderDeps,
	GiselleProviderOptions,
	LiveConnection,
	RelaySubscription,
	SessionMetadata,
} from "./types";
