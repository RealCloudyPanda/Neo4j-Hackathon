// Impact paths: what each drift flags, ranked, with the path the verdict came from.
MATCH (d:Drift)-[r:FLAGS]->(x)
RETURN d.head AS head, r.rank AS rank, r.verdict AS verdict, x.path AS path, x.line AS line, r.pathText AS impactPath
ORDER BY head, rank
