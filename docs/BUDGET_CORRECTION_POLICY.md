# Budget Correction Policy

Approved planning periods are read-only historical decisions. A correction must
be made through the existing planning-period workflow as a superseding draft
with a new record and audit history. The original finalized record remains
available for history and is not rewritten.

When more than one approved or closed record exists for the same household month,
Capital OS treats the **newest-created finalized version** as the canonical plan
for downstream budget intelligence, Capital Governor inputs, copy-forward
selection, and budget comparison totals. Older same-month finalized versions are
historical evidence only and must not be double-counted.

Drafts are never canonical downstream inputs. The variable-income engine and
Capital Governor consume only approved or closed versions and never mutate them
while calculating intelligence.
