// Tests not in diff: tests the shortlist says to run that the PR never touched.
MATCH (d:Drift)-[r:FLAGS {verdict: 'TEST'}]->(t:File)
WHERE t.inDiff = false
RETURN d.head AS head, t.path AS test, r.reason AS why
ORDER BY head, test
