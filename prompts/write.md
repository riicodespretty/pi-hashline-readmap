Write full file content. Creates new files and parent directories, overwrites existing files, and returns `LINE:HASH` anchors for immediate `edit` use.

## Use / avoid

Use `write` to create a file or intentionally replace a whole file. For small changes or appends, `read` first and use `edit` (`insert_after` for appends).

Existing files are overwritten without confirmation. Binary-looking content is written, but hashlines are not generated, so there are no anchors to feed into `edit`.

## Parameters

- `path` — relative or absolute file path.
- `content` — complete file contents.
- `map` — optional; append a structural map when possible. Map append is best-effort and write still succeeds if map generation fails.

## Output

Successful text writes return `LINE:HASH|content`; display hashlines escape control characters for safe rendering. Visible output is capped at 2000 lines or 50 KB, but full anchors remain available in `ptcValue`.
