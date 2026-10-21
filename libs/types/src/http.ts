export enum HttpStatus {
  Ok = 200,
  Accepted = 202,
  Created = 201,
  NoContent = 204,
  NotModified = 304,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  Conflict = 409,
  PayloadTooLarge = 413,
  UnsupportedMediaType = 415,
  TooManyRequests = 429,
  InternalServerError = 500,
  ServiceUnavailable = 503,
}

export enum HttpMethod {
  Get = 'GET',
  Post = 'POST',
  Put = 'PUT',
  Patch = 'PATCH',
  Delete = 'DELETE',
}

export const RETRY_AFTER_HEADER = 'Retry-After';
export const CACHE_CONTROL_HEADER = 'Cache-Control';
export const NO_STORE_CACHE_CONTROL = 'no-store';
export const RETRY_AFTER_SECONDS = 1;
