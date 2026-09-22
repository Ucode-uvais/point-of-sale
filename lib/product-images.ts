import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { v2 as cloudinary } from "cloudinary";

const PUBLIC_ROOT = path.join(process.cwd(), "public");
const PRODUCT_UPLOAD_ROOT = path.join(PUBLIC_ROOT, "uploads", "products");

function sanitizeSegment(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "shop"
  );
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".bin";
}

function maxUploadBytes() {
  const mb = Number(process.env.MAX_PRODUCT_IMAGE_UPLOAD_MB || "5");
  return Number.isFinite(mb) && mb > 0
    ? Math.floor(mb * 1024 * 1024)
    : 5 * 1024 * 1024;
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
    process.env.CLOUDINARY_API_KEY?.trim() &&
    process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

function shouldUseCloudinary() {
  const strategy = process.env.UPLOAD_STRATEGY?.trim().toLowerCase();

  if (strategy === "local") {
    return false;
  }

  if (strategy === "cloudinary") {
    return isCloudinaryConfigured();
  }

  return process.env.NODE_ENV === "production" && isCloudinaryConfigured();
}

function getCloudinaryFolder(shopId: string) {
  return `crezvion-pos/products/${sanitizeSegment(shopId)}`;
}

async function saveToLocalFilesystem(shopId: string, file: File) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeShopId = sanitizeSegment(shopId);
  const extension = extensionFromMimeType(file.type);
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const relativeDirectory = path.posix.join(
    "/uploads/products",
    safeShopId,
    year,
    month,
  );
  const relativePath = path.posix.join(relativeDirectory, fileName);
  const absoluteDirectory = path.join(
    PRODUCT_UPLOAD_ROOT,
    safeShopId,
    year,
    month,
  );
  const absolutePath = path.join(absoluteDirectory, fileName);

  await mkdir(absoluteDirectory, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);

  return relativePath;
}

async function uploadToCloudinary(shopId: string, file: File) {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured for production image uploads.",
    );
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
  const result = await cloudinary.uploader.upload(
    `data:${file.type};base64,${buffer.toString("base64")}`,
    {
      folder: getCloudinaryFolder(shopId),
      resource_type: "image",
      ...(uploadPreset ? { upload_preset: uploadPreset } : {}),
    },
  );

  return result.secure_url || result.url;
}

export function isLocalProductUploadPath(value: string) {
  return value.startsWith("/uploads/products/");
}

export function extractLocalProductUploadPaths(values: string[]) {
  const paths = new Set<string>();

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    if (isLocalProductUploadPath(normalized)) {
      paths.add(normalized);
      continue;
    }

    try {
      const parsed = new URL(normalized);
      if (isLocalProductUploadPath(parsed.pathname)) {
        paths.add(parsed.pathname);
      }
    } catch {
      // ignore non-URL values
    }
  }

  return [...paths];
}

export async function saveProductImageUpload(shopId: string, file: File) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("No upload file received.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }

  if (file.size <= 0) {
    throw new Error("Uploaded image is empty.");
  }

  if (file.size > maxUploadBytes()) {
    throw new Error(
      `Image exceeds the ${process.env.MAX_PRODUCT_IMAGE_UPLOAD_MB || "5"} MB upload limit.`,
    );
  }

  if (shouldUseCloudinary()) {
    return uploadToCloudinary(shopId, file);
  }

  return saveToLocalFilesystem(shopId, file);
}

export async function deleteLocalProductUploads(pathsToDelete: string[]) {
  const uniquePaths = [...new Set(pathsToDelete.filter(Boolean))];

  await Promise.all(
    uniquePaths.map(async (relativePath) => {
      if (!isLocalProductUploadPath(relativePath)) {
        return;
      }

      const normalized = path.posix.normalize(relativePath);
      if (!normalized.startsWith("/uploads/products/")) {
        return;
      }

      const absolutePath = path.join(
        PUBLIC_ROOT,
        normalized.replace(/^\/+/, ""),
      );
      await rm(absolutePath, { force: true });
    }),
  );
}

export async function deleteCloudinaryProductUploads(urlsToDelete: string[]) {
  if (!isCloudinaryConfigured()) {
    return;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const uniqueUrls = [...new Set(urlsToDelete.filter(Boolean))];

  await Promise.all(
    uniqueUrls.map(async (value) => {
      try {
        const parsed = new URL(value);
        const segments = parsed.pathname.split("/").filter(Boolean);
        const uploadIndex = segments.findIndex(
          (segment) => segment === "upload",
        );

        if (uploadIndex === -1 || uploadIndex === segments.length - 1) {
          return;
        }

        const publicIdParts = segments.slice(uploadIndex + 1);
        if (!publicIdParts.length) {
          return;
        }

        const fullPublicId = publicIdParts.join("/");
        const publicId = fullPublicId.replace(/\.[^/.]+$/, "");

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch {
        // Ignore non-URL values.
      }
    }),
  );
}
