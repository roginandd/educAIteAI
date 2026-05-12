import { env } from "../../config/env";

export interface PublicSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface PublicWebSearchService {
  search(query: string, maxResults: number): Promise<PublicSearchResult[]>;
}

export class DuckDuckGoPublicWebSearchService implements PublicWebSearchService {
  async search(query: string, maxResults: number): Promise<PublicSearchResult[]> {
    if (env.WEB_SEARCH_PROVIDER === "disabled") {
      return [];
    }

    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_redirect", "1");
    url.searchParams.set("no_html", "1");

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
    } catch {
      return [];
    }

    if (!response.ok) {
      return [];
    }

    const payload = await parseDuckDuckGoResponse(response);
    if (!payload) {
      return [];
    }

    const results = flattenDuckDuckGoResults(payload.RelatedTopics ?? []);

    return results
      .filter((result) => result.url.trim().length > 0)
      .slice(0, Math.max(0, maxResults));
  }
}

interface DuckDuckGoResponse {
  RelatedTopics?: DuckDuckGoTopic[];
}

type DuckDuckGoTopic = {
  FirstURL?: string;
  Text?: string;
  Result?: string;
  Topics?: DuckDuckGoTopic[];
};

function flattenDuckDuckGoResults(topics: DuckDuckGoTopic[]): PublicSearchResult[] {
  const results: PublicSearchResult[] = [];

  for (const topic of topics) {
    if (Array.isArray(topic.Topics)) {
      results.push(...flattenDuckDuckGoResults(topic.Topics));
      continue;
    }

    const url = topic.FirstURL?.trim();
    const text = stripHtml(topic.Text ?? topic.Result ?? "");
    if (!url || !text) {
      continue;
    }

    results.push({
      title: text.split(" - ")[0]?.trim() || text.slice(0, 120),
      url,
      snippet: text,
    });
  }

  return results;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function parseDuckDuckGoResponse(response: Response): Promise<DuckDuckGoResponse | null> {
  try {
    const rawBody = await response.text();
    if (!rawBody.trim()) {
      return null;
    }

    return JSON.parse(rawBody) as DuckDuckGoResponse;
  } catch {
    return null;
  }
}
