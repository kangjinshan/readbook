import * as path from 'path';
import type { Request } from 'express';
import { config } from '../config';

const COVER_FILE_PATTERN = /^\d+\.[a-z0-9]+$/i;

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizeCoverFileName(fileName: string): string | null {
  const trimmed = fileName.trim();
  return COVER_FILE_PATTERN.test(trimmed) ? trimmed : null;
}

export function normalizeStoredCoverPath(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeSlashes(value).trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('covers/')) {
    const fileName = normalizeCoverFileName(normalized.slice('covers/'.length));
    return fileName ? `covers/${fileName}` : null;
  }

  if (normalized.startsWith('/covers/')) {
    const fileName = normalizeCoverFileName(normalized.slice('/covers/'.length));
    return fileName ? `covers/${fileName}` : null;
  }

  const storageMarker = '/storage/covers/';
  const markerIndex = normalized.lastIndexOf(storageMarker);
  if (markerIndex >= 0) {
    const fileName = normalizeCoverFileName(normalized.slice(markerIndex + storageMarker.length));
    return fileName ? `covers/${fileName}` : null;
  }

  if (normalized.startsWith('./storage/covers/')) {
    const fileName = normalizeCoverFileName(normalized.slice('./storage/covers/'.length));
    return fileName ? `covers/${fileName}` : null;
  }

  return null;
}

export function resolveCoverDiskPath(value?: string | null): string | null {
  const normalized = normalizeStoredCoverPath(value);
  if (!normalized) {
    return null;
  }

  return path.resolve(config.storage.covers, path.basename(normalized));
}

export function buildStoredCoverPath(bookId: number, extension: string): string {
  const normalizedExt = extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return `covers/${bookId}${normalizedExt}`;
}

export function buildCoverDiskPath(bookId: number, extension: string): string {
  return path.resolve(config.storage.covers, `${bookId}${extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`}`);
}

export function pickCoverExtension(filePath: string, fallbackExtension: string = '.jpg'): string {
  const extension = path.extname(filePath).toLowerCase();
  if (!extension) {
    return fallbackExtension;
  }

  return extension;
}

export function buildStorageCoverUrl(origin: string, value?: string | null): string | null {
  const normalized = normalizeStoredCoverPath(value);
  if (!normalized) {
    return null;
  }

  const baseOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${baseOrigin}/storage/${normalized}`;
}

export function getRequestOrigin(req: Request): string {
  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = forwardedHost || req.header('host') || 'localhost';
  return `${protocol}://${host}`;
}
