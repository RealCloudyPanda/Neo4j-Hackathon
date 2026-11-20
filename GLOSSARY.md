# Glossary

Terms used in code, docs, CLI output and the viewer. One meaning each.

**Contract field**: a property of a shared API type that carries meaning metadata (a `@unit`, `@format`
or `@tz` tag). A property without such a tag is not a contract field.
_Avoid_: API field, schema field, attribute.

**Meaning tag**: one of the explicit metadata tags on a contract field or a function parameter that states
what a value means (unit, format, time zone).
_Avoid_: annotation (too broad), semantic type, label.

**Meaning change**: a meaning tag on the same contract field differs between the base and head snapshots.
_Avoid_: breaking change (that word means structural breaks), semantic diff.

**Drift**: one detected meaning change, with everything it reaches. The thing the tool reports.
_Avoid_: alert, violation, issue.

**Snapshot**: one complete copy of the monorepo at a point in time. A review compares a **base** snapshot
with a **head** snapshot.
_Avoid_: version, commit, revision (we do not read git).

**Producer**: code that writes a contract field's value (e.g. the API procedure that returns it).
_Avoid_: source, emitter, server.

**Usage**: one place in code that reads a contract field, identified by file and line.
_Avoid_: consumer site, reference, call site.

**Consumer**: the file or function that contains a usage.
_Avoid_: client, subscriber.

**Hidden link**: a connection between two fields that static analysis cannot see (queue message, another
service), declared by hand in the link manifest.
_Avoid_: manual edge, override, mapping.

**Link manifest**: the small file that lists hidden links with a reason for each.
_Avoid_: config, contracts manifest.

**Impact path**: the chain of graph relationships from a drift to a flagged usage or test.
_Avoid_: trace, lineage, call chain.

**Verdict**: how a flagged usage relates to the new meaning: **MISMATCH** (it states the old meaning),
**REVIEW** (it states nothing, a human must check), **OK** (it already states the new meaning).
_Avoid_: severity, status, score.

**Shortlist**: the ranked list of usages and tests a reviewer should look at for one drift.
_Avoid_: report, results, findings list.

**Evidence**: the file, line and source text that justify one shortlist entry.
_Avoid_: proof, context.

**In diff**: whether the file was changed between base and head. A shortlisted test that is not in diff is
the most valuable kind.
_Avoid_: touched, modified.

**Store**: the persisted Relate graph file committed in the repo.
_Avoid_: database, DB, cache.

**Reviewer**: the person approving the pull request. The one user.
_Avoid_: developer, user, maintainer.
