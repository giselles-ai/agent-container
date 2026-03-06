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
	getLiveConnection,
	removeLiveConnection,
	saveLiveConnection,
} from "./session-manager";
export {
	buildGiselleChatRequestBody,
	createGiselleMessageMetadata,
	createGiselleSessionStateRawValue,
	getGiselleSessionIdFromProviderOptions,
	getGiselleSessionStateFromMessageMetadata,
	getGiselleSessionStateFromProviderOptions,
	getGiselleSessionStateFromRawValue,
	getLatestGiselleSessionStateFromMessages,
	mergeGiselleSessionStates,
	parseGiselleSessionState,
} from "./session-state";
export { GiselleAgentModel };

export function giselle(options: GiselleProviderOptions): GiselleAgentModel {
	return new GiselleAgentModel(options);
}

export type {
	ConnectCloudApiParams,
	ConnectCloudApiResult,
	GiselleProviderDeps,
	GiselleProviderOptions,
	GiselleSessionState,
	LiveConnection,
	RelaySubscription,
	SessionMetadata,
} from "./types";
