import type {
  HealthResponse,
  ImageRequest,
  ImageResponse,
  StoryboardRequest,
  StoryboardResponse,
} from "../../shared/schema.ts";

async function post<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as TRes;
}

export const api = {
  health: () => fetch("/api/health").then((r) => r.json() as Promise<HealthResponse>),
  storyboard: (req: StoryboardRequest) => post<StoryboardRequest, StoryboardResponse>("/api/storyboard", req),
  image: (req: ImageRequest) => post<ImageRequest, ImageResponse>("/api/image", req),
};
