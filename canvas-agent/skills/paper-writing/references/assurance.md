<!-- CoResearch managed skill resource -->
# Assurance

`draft` (default): audits run when detectors match; missing JSON is allowed.

`submission`: every mandatory audit emits JSON (`PASS` / `WARN` / `FAIL` / `NOT_APPLICABLE` / `BLOCKED` / `ERROR`). Silent skip is forbidden. `verify_audits.py` exit code is the gate; conversation memory is not.

Mandatory at submission:

1. `paper/PAPER_CLAIM_AUDIT.json` from `paper-claim-audit`
2. `paper/CITATION_AUDIT.json` from `citation-audit`
3. `paper/PROOF_AUDIT.json` from `paper-proof` (`NOT_APPLICABLE` if no theorem)

Write `paper/.aris/assurance.txt` once at pipeline start. Re-derive from the user request at the final gate.
