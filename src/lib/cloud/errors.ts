/** Base class of the errors thrown by the Xiaomi Cloud client */
export class CloudError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The username or password is wrong (or the account can't log in) */
export class CloudAuthError extends CloudError {}

/** Xiaomi asks to solve a captcha, but no `solveCaptcha` callback was provided */
export class CloudCaptchaRequiredError extends CloudError {
  constructor(public readonly captchaUrl: string) {
    super("Xiaomi asks to solve a captcha to log in");
  }
}

/** Xiaomi asks for a verification code (2FA), but no `getVerificationCode` callback was provided */
export class CloudTwoFactorRequiredError extends CloudError {
  constructor(public readonly notificationUrl: string) {
    super(
      "Xiaomi asks for a verification code to log in (two-factor authentication)",
    );
  }
}

/** The session is no longer valid: log in again */
export class CloudSessionExpiredError extends CloudError {
  constructor() {
    super("The Xiaomi Cloud session expired: please log in again");
  }
}

/** The API returned an error */
export class CloudApiError extends CloudError {
  constructor(
    message: string,
    public readonly code?: number | string,
  ) {
    super(message);
  }
}
