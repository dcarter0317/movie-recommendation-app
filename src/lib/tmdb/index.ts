/** TMDB client surface (spec 0003). */
export { discoverMovies, getMovieDetail, tmdbFetch } from "./client";
export {
  discoverResponseSchema,
  movieDetailSchema,
  type DiscoverResponse,
  type MovieDetail,
} from "./schemas";
export { err, ok, type Result, type TmdbError, type TmdbErrorKind } from "./result";
