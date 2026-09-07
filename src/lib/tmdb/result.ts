/**
 * The `Result` value the TMDB client returns at its boundary (spec 0003,
 * error-handling pattern). Expected failures (a rate limit, a 5xx after
 * retries, a network error, a schema mismatch) come back as `{ ok: false }`
 * for the caller to handle; only a TMDB 404 is thrown, as a
 * `NonRetriableError`, because it means "this movie is gone", not "try
 * again".
 */
export type TmdbErrorKind = "rate_limited" | "server_error" | "network_error" | "invalid_response";

export type TmdbError = {
  readonly kind: TmdbErrorKind;
  readonly message: string;
};

export type Result<T, E = TmdbError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
