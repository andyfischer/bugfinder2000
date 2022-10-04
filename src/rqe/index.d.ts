
declare global {
    interface Console {
      slog: typeof console.log
    }
}
