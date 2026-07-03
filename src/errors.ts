/** Base error class for all sns-fans errors. */
export class FansError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FansError"
  }
}

/**
 * Thrown when authentication fails.
 * This includes expired/invalid tokens and failed token refresh attempts.
 */
export class FansAuthError extends FansError {
  constructor(message: string) {
    super(message)
    this.name = "FansAuthError"
  }
}

/**
 * Thrown when a provided value (e.g. group code, slug) is invalid.
 */
export class FansValidationError extends FansError {
  constructor(message: string) {
    super(message)
    this.name = "FansValidationError"
  }
}
