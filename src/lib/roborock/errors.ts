/** Base class of the errors thrown by the Roborock account client */
export class RoborockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The account doesn't exist, or the verification code is wrong */
export class RoborockAuthError extends RoborockError {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
  }
}

/** The session is no longer valid: log in again */
export class RoborockSessionExpiredError extends RoborockError {
  constructor() {
    super("The Roborock session expired: please log in again");
  }
}

/** The API returned an error */
export class RoborockApiError extends RoborockError {
  constructor(
    message: string,
    public readonly code?: number | string,
  ) {
    super(message);
  }
}
