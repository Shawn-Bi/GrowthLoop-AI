// Thrown for rejected state changes; route handlers map httpStatus to the
// response (403 wrong role, 404 unknown record, 409 illegal transition).
export class TransitionError extends Error {
  constructor(
    message: string,
    readonly httpStatus: 403 | 404 | 409
  ) {
    super(message);
    this.name = "TransitionError";
  }
}
