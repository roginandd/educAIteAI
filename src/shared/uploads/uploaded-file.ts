import { readFile, unlink } from "node:fs/promises";

import type { Express } from "express";

export async function readUploadedFileAsBase64(file: Express.Multer.File): Promise<string> {
  const bytes = await readUploadedFileBytes(file);
  return bytes.toString("base64");
}

export async function readUploadedFileAsBlob(file: Express.Multer.File): Promise<Blob> {
  const bytes = await readUploadedFileBytes(file);
  return new Blob([bytes], {
    type: file.mimetype || "application/pdf",
  });
}

export async function cleanupUploadedFile(file: Express.Multer.File | undefined): Promise<void> {
  const filePath = file?.path?.trim();
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return;
    }
  }
}

async function readUploadedFileBytes(file: Express.Multer.File): Promise<Buffer> {
  if (file.buffer?.byteLength) {
    return file.buffer;
  }

  return readFile(requireUploadedFilePath(file));
}

function requireUploadedFilePath(file: Express.Multer.File): string {
  const filePath = file.path?.trim();
  if (!filePath) {
    throw new Error("Uploaded file is missing a temp-file path.");
  }

  return filePath;
}
