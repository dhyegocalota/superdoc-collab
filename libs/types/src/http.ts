export enum HttpStatus {
  Ok = 200,
  Accepted = 202,
  Created = 201,
  NoContent = 204,
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
  Patch = 'PATCH',
  Delete = 'DELETE',
}

export const RETRY_AFTER_HEADER = 'Retry-After';
export const RETRY_AFTER_SECONDS = 1;
