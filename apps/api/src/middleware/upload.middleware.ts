import multer, { FileFilterCallback, MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';

// Allowed file types for XLSForm upload
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/xml', // .xml
  'text/xml', // .xml (alternative)
];

const ALLOWED_EXTENSIONS = ['.xlsx', '.xml'];

// File filter for XLSForm files
const xlsformFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  const isValidExtension = ALLOWED_EXTENSIONS.includes(extension);
  const isValidMimeType = ALLOWED_MIME_TYPES.includes(file.mimetype);

  if (isValidExtension || isValidMimeType) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${ALLOWED_EXTENSIONS.join(', ')} files are allowed.`));
  }
};

// XLSForm upload configuration
export const xlsformUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per AC1
    files: 1, // Only allow single file upload
  },
  fileFilter: xlsformFileFilter,
});

/**
 * Error handler middleware for multer errors
 * Converts multer errors to AppError for consistent error handling
 */
export const handleMulterError = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        next(new AppError(
          'FILE_TOO_LARGE',
          'File size exceeds the maximum limit of 10MB',
          413
        ));
        break;
      case 'LIMIT_FILE_COUNT':
        next(new AppError(
          'TOO_MANY_FILES',
          'Only single file upload is allowed',
          400
        ));
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        next(new AppError(
          'UNEXPECTED_FIELD',
          `Unexpected field name. Use 'file' for the upload field.`,
          400
        ));
        break;
      default:
        next(new AppError(
          'UPLOAD_ERROR',
          `Upload error: ${err.message}`,
          400
        ));
    }
  } else if (err.message.includes('Invalid file type')) {
    next(new AppError(
      'INVALID_FILE_TYPE',
      err.message,
      400
    ));
  } else {
    next(err);
  }
};

// Magic bytes for file content validation
// XLSX files are ZIP archives: starts with PK (0x50 0x4B)
const XLSX_MAGIC = Buffer.from([0x50, 0x4B]);
// XML files start with '<' (0x3C) or BOM + '<'
const XML_START = 0x3C; // '<'
const UTF8_BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

/**
 * Validate file content by magic bytes after multer has buffered the file.
 * Prevents spoofed extensions from bypassing the file filter.
 */
export const validateFileContent = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.file) return next();

  const { buffer, originalname } = req.file;
  const extension = originalname.toLowerCase().slice(originalname.lastIndexOf('.'));

  if (extension === '.xlsx') {
    if (buffer.length < 2 || !buffer.subarray(0, 2).equals(XLSX_MAGIC)) {
      return next(new AppError(
        'INVALID_FILE_CONTENT',
        'File content does not match .xlsx format (invalid magic bytes)',
        400
      ));
    }
  } else if (extension === '.xml') {
    // XML may start with BOM or directly with '<'
    const startsWithBom = buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM);
    const firstContentByte = startsWithBom ? buffer[3] : buffer[0];
    if (firstContentByte !== XML_START) {
      return next(new AppError(
        'INVALID_FILE_CONTENT',
        'File content does not match .xml format (missing XML declaration or root element)',
        400
      ));
    }
  }

  next();
};

/**
 * Middleware wrapper for XLSForm upload that includes error handling
 */
export const uploadXlsform = [
  xlsformUpload.single('file'),
  handleMulterError,
];
