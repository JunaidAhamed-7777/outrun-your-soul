export const DEFAULT_PREFIX: string;
export interface NestedServers {
  prefix: string;
  gameOrigin: string;
  gameUrl: string;
  embedUrl: string;
  log: { path: string; status: number }[];
  close(): Promise<unknown>;
}
export function startNestedServers(files: Map<string, Uint8Array>, options?: { prefix?: string }): Promise<NestedServers>;
export interface CrawlEntry {
  url: string;
  via: string;
  kind: string;
  status: number;
  type: string;
}
export interface CrawlReport {
  ok: boolean;
  failures: { url: string; problem: string; via?: string }[];
  crawled: CrawlEntry[];
  packageChecks: { path: string; url: string; status: number; type: string }[];
}
export function crawlNested(servers: NestedServers, packagePaths: string[]): Promise<CrawlReport>;
