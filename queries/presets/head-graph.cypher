// Whole head graph around the duration drift: field versions, usages, params, functions, links.
MATCH (v:FieldVersion {snapshot: 'pr-duration-ms'})-[r:READ_AT|LINKED_TO]->(x)
OPTIONAL MATCH (x)-[p:PASSES_TO]->(pm:Param)-[o:PARAM_OF]->(fn:Function)
RETURN v, r, x, p, pm, o, fn
