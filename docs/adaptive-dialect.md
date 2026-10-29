# Adaptive dialect (local)

Captures remain free form. A personal lexical layer expands the **subject/title** only, after the baseline parser has extracted structural fields. It never learns patient IDs, times, priority, status, conditions or actions. Existing parsing stays available without personal rules.

On a saved card, open **Corregir / enseñar mi dialecto**, enter a single abbreviation, its corrected meaning and optional context words present in the original capture. Confirm on three different captures to reach 80% and enable application. Saving a capture, previewing or leaving a suggestion unchanged never counts as confirmation. A capture counts once per feedback direction. Corrections replacing an applied meaning reduce confidence transactionally with the loop edit; explicit teaching of a different meaning also rejects the prior interpretation. Ordinary edits do not guess a reusable mapping: teaching makes the intended abbreviation and context explicit.

Rules live in the IndexedDB `aliases` table (schema v2; v1 loops preserved). Confidence is `(confirmations + 1) / (confirmations + 3 * rejections + 2)`. Automatic use requires at least three confirmations and confidence >= 0.8. This is an evidence score, not a calibrated probability or clinical certainty. Negative evidence weighs three times as much as positive evidence. Repeated positive feedback can recover a rule.

Context uses normalized whole words from the original subject, requires all specified words, and excludes bed numbers. More specific rules take precedence over general ones. Conflicting meanings at equal specificity are never automatically selected; the original text remains and review is requested. Contextless rules do not apply when a matching specific candidate is still uncertain. Expansion is a single pass, preventing rules from triggering each other.

Preview and saved cards show the association, confidence, reason and whether it was applied. **Mi dialecto** in Captura lists all associations, including disabled ones, with disable/enable and forget controls. Changes affect future interpretations and previews; saved cards keep their historical explanation. Original capture text remains intact. Old cards without dialect metadata work unchanged.

All storage and computation stay in the browser. No server, telemetry or LLM is added. Browser storage clearing removes learning, and learning is not synchronized across devices. Evidence stores loop identifiers rather than full captures.

Validation: automated tests cover positive/negative feedback, retry deduplication, contradictory meanings, context separation and precedence, disable/forget, single-pass expansion, original structural fields, real IndexedDB operations through fake-indexeddb, v1 migration, reopen persistence, corrections and followup integration. The existing parser/stress/ward-round suites remain regression checks. Mobile/offline manual UX validation remains separate.
