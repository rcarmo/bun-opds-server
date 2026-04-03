/** Read-only query for EPUB-capable books within one Calibre library. */
export const EPUB_BOOKS_QUERY = `
SELECT
  b.id AS book_id,
  b.title AS title,
  b.path AS book_path,
  b.timestamp AS added_at,
  b.last_modified AS updated_at,
  d.name AS file_stem,
  GROUP_CONCAT(a.name, ', ') AS authors
FROM books b
JOIN data d
  ON d.book = b.id
LEFT JOIN books_authors_link bal
  ON bal.book = b.id
LEFT JOIN authors a
  ON a.id = bal.author
WHERE UPPER(d.format) = 'EPUB'
GROUP BY
  b.id, b.title, b.path, b.timestamp, b.last_modified, d.name
ORDER BY b.last_modified DESC
`;
