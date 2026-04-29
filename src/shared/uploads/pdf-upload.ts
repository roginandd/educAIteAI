import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

import multer from "multer";

const MAX_PDF_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const uploadDirectory = join(tmpdir(), "educaiteai", "uploads");

mkdirSync(uploadDirectory, { recursive: true });

export function createPdfUpload(): multer.Multer {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, uploadDirectory);
      },
      filename: (_req, file, callback) => {
        const extension = extname(file.originalname).trim().toLowerCase() || ".pdf";
        callback(null, `${Date.now()}-${randomUUID()}${extension}`);
      },
    }),
    limits: {
      fileSize: MAX_PDF_FILE_SIZE_BYTES,
    },
  });
}
