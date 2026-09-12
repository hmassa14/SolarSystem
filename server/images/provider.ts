import type { ImageRequest, ImageResponse } from "../../shared/schema.ts";

/**
 * Image generation is intentionally pluggable. Claude plans the storyboard;
 * rendering each frame is a separate concern with a separate vendor.
 *
 * To add a real provider:
 *   1. Create server/images/<name>.ts exporting an ImageProvider.
 *   2. Register it in server/images/index.ts.
 *   3. Set IMAGE_PROVIDER=<name> in .env.
 */
export interface ImageProvider {
  readonly name: string;
  generate(req: ImageRequest): Promise<ImageResponse>;
}
