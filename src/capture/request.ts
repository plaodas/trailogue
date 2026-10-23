export const CAPTURE_REQUEST = "trailogue:capture";

export function isCaptureRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === CAPTURE_REQUEST
  );
}
