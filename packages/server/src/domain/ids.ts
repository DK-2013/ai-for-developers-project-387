const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects an id that cannot name a stored meeting type before a lookup. */
export function isValidMeetingTypeId(id: string): boolean {
  return UUID_PATTERN.test(id);
}
