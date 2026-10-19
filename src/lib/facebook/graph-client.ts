import { getFacebookConfig, type FacebookConfig } from "./env";

const MAX_PAGING_PAGES = 50;

export class FacebookGraphError extends Error {
  status: number;
  code?: number;
  subcode?: number;

  constructor(message: string, status: number, code?: number, subcode?: number) {
    super(message);
    this.name = "FacebookGraphError";
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

type GraphErrorBody = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
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

export type GraphRequestOptions = {
  /** Override env user token — required for Page-scoped endpoints like leadgen_forms. */
  accessToken?: string;
};

function buildGraphUrl(
  config: FacebookConfig,
  path: string,
  searchParams?: Record<string, string>,
  accessToken = config.token,
): URL {
  const normalizedPath = path.replace(/^\//, "");
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${normalizedPath}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "access_token") continue;
      url.searchParams.set(key, value);
    }
  }
  url.searchParams.set("access_token", accessToken);
  return url;
}

async function readGraphJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Facebook Graph request failed (${res.status})`;
    let code: number | undefined;
    let subcode: number | undefined;
    try {
      const body = (await res.json()) as GraphErrorBody;
      const err = body.error;
      if (err?.message) message = err.message;
      if (err?.error_user_msg) {
        message = `${message} — ${err.error_user_msg}`;
      } else if (err?.error_user_title) {
        message = `${message} — ${err.error_user_title}`;
      }
      if (err?.code != null) code = err.code;
      if (err?.error_subcode != null) subcode = err.error_subcode;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new FacebookGraphError(message, res.status, code, subcode);
  }
  return res.json() as Promise<T>;
}

export async function graphGet<T>(
  path: string,
  searchParams?: Record<string, string>,
  options?: GraphRequestOptions,
): Promise<T> {
  const config = requireConfig();
  const url = buildGraphUrl(config, path, searchParams, options?.accessToken ?? config.token);
  const res = await fetch(url);
  return readGraphJson<T>(res);
}

export async function graphPost<T>(
  path: string,
  body: Record<string, unknown>,
  options?: GraphRequestOptions,
): Promise<T> {
  const config = requireConfig();
  const url = buildGraphUrl(config, path, undefined, options?.accessToken ?? config.token);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
  options?: GraphRequestOptions,
): Promise<T[]> {
  const config = requireConfig();
  const accessToken = options?.accessToken ?? config.token;
  const collected: T[] = [];
  let cursorParams: Record<string, string> | undefined = searchParams
    ? { ...searchParams }
    : undefined;
  let nextPageUrl: string | null = null;
  let pagesFetched = 0;

  while (pagesFetched < MAX_PAGING_PAGES) {
    const res: Response = nextPageUrl
      ? await fetch(nextPageUrl)
      : await fetch(buildGraphUrl(config, path, cursorParams, accessToken));

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
