import { getFacebookConfig, type FacebookConfig } from "./env";

const MAX_PAGING_PAGES = 50;

export class FacebookGraphError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "FacebookGraphError";
    this.status = status;
    this.code = code;
  }
}

type GraphErrorBody = {
  error?: {
    message?: string;
    code?: number;
  };
};

type PagedGraphResponse<T> = {
  data?: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
};

function requireConfig(): FacebookConfig {
  const config = getFacebookConfig();
  if (!config) {
    throw new Error("Facebook Graph is not configured");
  }
  return config;
}

function buildGraphUrl(
  config: FacebookConfig,
  path: string,
  searchParams?: Record<string, string>,
): URL {
  const normalizedPath = path.replace(/^\//, "");
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${normalizedPath}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "access_token") continue;
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("access_token", config.token);
  return url;
}

async function readGraphJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Facebook Graph request failed (${res.status})`;
    let code: number | undefined;
    try {
      const body = (await res.json()) as GraphErrorBody;
      if (body.error?.message) message = body.error.message;
      if (body.error?.code != null) code = body.error.code;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new FacebookGraphError(message, res.status, code);
  }
  return res.json() as Promise<T>;
}

export async function graphGet<T>(
  path: string,
  searchParams?: Record<string, string>,
): Promise<T> {
  const config = requireConfig();
  const url = buildGraphUrl(config, path, searchParams);
  const res = await fetch(url);
  return readGraphJson<T>(res);
}

function pagingHasMore(paging: PagedGraphResponse<unknown>["paging"]): boolean {
  if (!paging) return false;
  const after = paging.cursors?.after?.trim();
  if (after) return true;
  return Boolean(paging.next?.trim());
}

export async function graphGetAllData<T>(
  path: string,
  searchParams?: Record<string, string>,
): Promise<T[]> {
  const config = requireConfig();
  const collected: T[] = [];
  let cursorParams: Record<string, string> | undefined = searchParams
    ? { ...searchParams }
    : undefined;
  let nextPageUrl: string | null = null;
  let pagesFetched = 0;

  while (pagesFetched < MAX_PAGING_PAGES) {
    const res: Response = nextPageUrl
      ? await fetch(nextPageUrl)
      : await fetch(buildGraphUrl(config, path, cursorParams));

    nextPageUrl = null;
    const body: PagedGraphResponse<T> = await readGraphJson<PagedGraphResponse<T>>(res);
    if (body.data?.length) {
      collected.push(...body.data);
    }

    pagesFetched += 1;
    if (!pagingHasMore(body.paging)) break;

    if (pagesFetched >= MAX_PAGING_PAGES) {
      throw new FacebookGraphError(
        `Facebook Graph pagination limit (${MAX_PAGING_PAGES} pages) reached; results are truncated.`,
        500,
      );
    }

    const after = body.paging?.cursors?.after?.trim();
    if (after) {
      cursorParams = { ...(searchParams ?? {}), after };
    } else {
      const next: string | undefined = body.paging?.next?.trim();
      if (next) nextPageUrl = next;
      else break;
    }
  }

  return collected;
}
