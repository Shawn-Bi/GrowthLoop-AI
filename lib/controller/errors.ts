// An expected failure with the HTTP status a route handler should return.
export class ControllerError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "ControllerError";
  }
}

// Rejected state changes: 403 wrong role, 404 unknown record, 409 illegal
// transition.
export class TransitionError extends ControllerError {
  constructor(
    message: string,
    override readonly httpStatus: 403 | 404 | 409
  ) {
    super(message, httpStatus);
    this.name = "TransitionError";
  }
}
