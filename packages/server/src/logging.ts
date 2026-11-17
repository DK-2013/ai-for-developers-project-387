export type Logger = {
  error(message: string, error: unknown): void;
  info(message: string): void;
};
