export class AuthTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthTimeoutError";
  }
}

// Covers SDK/session-lock waits as well as network waits. Late completion cannot
// resume the caller after it has already received the timeout error.
export async function withAuthTimeout<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AuthTimeoutError(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
