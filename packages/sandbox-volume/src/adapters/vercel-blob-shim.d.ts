declare module "@vercel/blob" {
	export interface BlobPutResult {
		url: string;
		pathname: string;
		downloadUrl?: string;
	}

	export interface BlobListItem {
		url: string;
		pathname?: string;
		downloadUrl?: string;
	}

	export interface BlobListResult {
		blobs: BlobListItem[];
		cursor?: string;
		hasMore?: boolean;
	}

	export interface BlobPutOptions {
		access?: "public" | "private";
		token?: string;
	}

	export interface BlobListOptions {
		prefix?: string;
		limit?: number;
		cursor?: string;
		token?: string;
	}

	export interface BlobDeleteOptions {
		token?: string;
	}

	export function put(
		pathname: string,
		body:
			| string
			| ArrayBuffer
			| ArrayBufferView
			| Blob
			| ReadableStream<Uint8Array>,
		options?: BlobPutOptions,
	): Promise<BlobPutResult>;

	export function list(options: BlobListOptions): Promise<BlobListResult>;

	export function del(
		urls: string | string[],
		options?: BlobDeleteOptions,
	): Promise<void>;
}
