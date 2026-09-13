// Shared @mention helpers used by the message compose boxes
// (CommonGroupFeed, DirectMessageThread) and the Messages pages.
//
// A mention is stored in message text as "@slug" where slug is the
// person's name with spaces stripped and lowercased — e.g. "Dr. Meera"
// becomes "@drmeera". This keeps mentions a single unambiguous token
// (no spaces to worry about) and lets us resolve "@slug" back to a
// real user by regenerating the same slug for everyone in the
// directory and comparing.

export function slugifyName(name = "") {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Finds the "@partial" word the cursor is currently sitting inside/after,
// if any — used to decide whether to show the suggestion dropdown while
// typing. Returns { start, end, query } or null.
export function findMentionTrigger(text, cursor) {
  const upToCursor = text.slice(0, cursor);
  const match = upToCursor.match(/(?:^|\s)@([a-zA-Z0-9]*)$/);
  if (!match) return null;
  const start = upToCursor.length - match[1].length - 1; // position of "@"
  return { start, end: cursor, query: match[1].toLowerCase() };
}

// Filters a directory (array of {id, name, role, ...}) by a partial
// query, matching either the slug or a plain-name substring.
export function filterDirectory(directory, query) {
  if (!query) return directory.slice(0, 8);
  return directory
    .filter((u) => slugifyName(u.name).includes(query) || u.name.toLowerCase().includes(query))
    .slice(0, 8);
}

// Splits message text into plain-text and mention segments for
// rendering. Each segment is { text } or { mention: "@slug", user }.
export function splitMentions(text, directory) {
  if (!text) return [{ text: "" }];
  const bySlug = new Map(directory.map((u) => [slugifyName(u.name), u]));
  const parts = text.split(/(@[a-zA-Z0-9]+)/g);
  return parts.map((part) => {
    if (part.startsWith("@")) {
      const slug = part.slice(1).toLowerCase();
      const user = bySlug.get(slug);
      if (user) return { mention: part, user };
    }
    return { text: part };
  });
}
