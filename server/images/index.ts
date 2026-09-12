import type { ImageProvider } from "./provider.ts";
import { mockImageProvider } from "./mock.ts";

const registry: Record<string, ImageProvider> = {
  mock: mockImageProvider,
  // Register real adapters here, e.g. `myvendor: myVendorProvider`.
};

export function resolveImageProvider(): ImageProvider {
  const name = process.env.IMAGE_PROVIDER ?? "mock";
  const provider = registry[name];
  if (!provider) {
    const known = Object.keys(registry).join(", ");
    throw new Error(`Unknown IMAGE_PROVIDER "${name}". Registered providers: ${known}`);
  }
  return provider;
}
