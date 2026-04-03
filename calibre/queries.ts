/** Read-only query for EPUB-capable books within one Calibre library. */
export const EPUB_BOOKS_QUERY = `
SELECT
  b.id AS book_id,
  b.title AS title,
  b.path AS book_path,
  b.timestamp AS added_at,
  b.last_modified AS updated_at,
  b.pubdate AS published_at,
  d.name AS file_stem,
  (
    SELECT GROUP_CONCAT(a.name, ', ')
    FROM books_authors_link bal
    JOIN authors a ON a.id = bal.author
    WHERE bal.book = b.id
  ) AS authors,
  (
    SELECT s.name
    FROM books_series_link bsl
    JOIN series s ON s.id = bsl.series
    WHERE bsl.book = b.id
    LIMIT 1
  ) AS series,
  (
    SELECT GROUP_CONCAT(t.name, ', ')
    FROM books_tags_link btl
    JOIN tags t ON t.id = btl.tag
    WHERE btl.book = b.id
  ) AS tags,
  c.text AS description
FROM books b
JOIN data d
  ON d.book = b.id
LEFT JOIN comments c
  ON c.book = b.id
WHERE UPPER(d.format) = 'EPUB'
ORDER BY b.last_modified DESC
`;
