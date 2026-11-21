export function prepareDatabase(adminUrl: string, name: string, fresh: boolean): Promise<void>;
export function migrate(
  url: string,
  options?: { supabaseLike?: boolean; log?: (line: string) => void },
): Promise<number>;
export function loadSampleData(url: string): Promise<void>;
export function loadTestFixtures(url: string): Promise<void>;
