/** A single flattened locale entry: a dot-path key and its raw message string. */
export interface ParsedMessage {
  /** Dot-path key, e.g. `popup.greeting` — matches the source YAML/JSON structure. */
  key: string;
  /** Raw message text, e.g. `"Hello, $1"`. */
  message: string;
  /** Highest `$N` placeholder referenced in `message` (0 if none). */
  arity: number;
}
