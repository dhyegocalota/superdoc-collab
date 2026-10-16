export enum HttpStatus {
  Ok = 200,
  Created = 201,
  NoContent = 204,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  Conflict = 409,
  PayloadTooLarge = 413,
  UnsupportedMediaType = 415,
  TooManyRequests = 429,
}

export enum HttpMethod {
  Get = 'GET',
  Post = 'POST',
  Patch = 'PATCH',
  Delete = 'DELETE',
}
