import i18n from "@/i18n";
import { resolveMediaUrl } from "@/services/file-storage";
import { ensureImagePreview, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const metadata = node.metadata;
            const content = metadata?.content;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && metadata?.storageKey) {
                return { ...node, metadata: { ...metadata, content: await resolveMediaUrl(metadata.storageKey, content) } };
            }
            if (node.type !== CanvasNodeType.Image || !metadata || !content) return node;
            const images = await Promise.all(
                (metadata.images || []).map(async (image) => {
                    if (!image.content) return image;
                    void ensureImagePreview(image.storageKey);
                    return { ...image, content: await resolveImageUrl(image.storageKey, image.content) };
                }),
            );
            if (metadata.storageKey) {
                void ensureImagePreview(metadata.storageKey);
                return { ...node, metadata: { ...metadata, content: await resolveImageUrl(metadata.storageKey, content), images } };
            }
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    return nodes.map((node) =>
        node.metadata?.status === "loading"
            ? {
                  ...node,
                  metadata: {
                      ...node.metadata,
                      status: "error" as const,
                      errorDetails: i18n.t("canvas.generation.interrupted"),
                      images: node.metadata.images?.map((image) =>
                          image.status === "loading" ? { ...image, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") } : image,
                      ),
                      texts: node.metadata.texts?.map((text) =>
                          text.status === "loading" ? { ...text, status: "error" as const, errorDetails: i18n.t("canvas.generation.interrupted") } : text,
                      ),
                  },
              }
            : node,
    );
}
