"""Mutation sweep for contracts/keywitness.py.

Each mutant breaks one guard in a scratch copy of the repository and runs the
direct suite there. A mutant the suite does not kill is a guard no test
defends. A mutant whose pattern is not found exactly as expected is a FAILURE,
not a notice: a renamed guard otherwise drops out of the sweep silently.

    python tests/mutation/mutate.py            run every mutant (3 workers, or KW_SWEEP_WORKERS)
    python tests/mutation/mutate.py F3 F6      run the named mutants only

The live repository is never modified. Exit code 0 only if the control
passes, every pattern matched, and every mutant was killed.

Some candidate mutants are deliberately absent because they are equivalent:
no test can tell them from the original, by construction.
  - removing the "malformed leader result" dissent (a malformed result makes
    the validator raise, which the network counts as disagreement anyway);
  - removing the overall-finding comparison (the overall finding is a pure
    function of the per-criterion findings, which are compared first);
  - removing the length checks that run BEFORE text is cleaned (_bounded,
    submit_text): the same refusal follows after cleaning, only slower;
  - removing the type check in _address (the conversion below it fails and
    gives the same refusal);
  - removing "c['challenge'] or" from the retry rule (after a challenge the
    decision's window is already closed, so the retry is refused anyway);
  - removing the NOT_ASSESSED disjunct of an incomplete readjudication round
    (nothing visible implies one of the other two disjuncts).
"""

import concurrent.futures as cf
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "contracts" / "keywitness.py"
F = "if False:"

# (name, old, new, occurrences expected in the source, which occurrence to replace)
MUTANTS = [
    # terms
    ("title_min", "if len(title) < 5:", "if len(title) < 0:", 1, 0),
    ("kind_check", "if kind not in EVENT_KINDS:", F, 1, 0),
    ("contact_check", 'if "@" in prop or "http" in low or "www." in low:', F, 1, 0),
    ("tz_check", "if not _TZ.match(tz):", F, 1, 0),
    ("window_order", "if start and deadline and start > falls:", F, 1, 0),
    ("deadline_day_ends", 'falls = deadline if "T" in deadline else deadline + "T23:59"', "falls = deadline", 1, 0),
    ("bounded_refuses", '    if len(text) > limit:\n        _refuse(f"{what} may be at most',
     '    if False:\n        _refuse(f"{what} may be at most', 1, 0),
    ("local_time_whole", 'text = _clean(value, 40)\n    if not text:',
     'text = _clean(value, 16)\n    if not text:', 1, 0),
    ("local_time_real", "        datetime.fromisoformat(text)\n    except ValueError:",
     "        text.upper()\n    except ValueError:", 1, 0),
    ("limitations_cap", "if not isinstance(lim_raw, list) or len(lim_raw) > MAX_LIMITATIONS:",
     "if not isinstance(lim_raw, list):", 1, 0),
    ("limitations_list", "if not isinstance(lim_raw, list) or len(lim_raw) > MAX_LIMITATIONS:",
     "if isinstance(lim_raw, list) and len(lim_raw) > MAX_LIMITATIONS:", 1, 0),
    ("limitation_is_text", 'if x is None:\n            _refuse(f"limitation {i} must be text")',
     'if False:\n            _refuse(f"limitation {i} must be text")', 1, 0),
    ("prompt_whole_day",
     '+ ". A window start or deadline given as a day with no time means that whole day: the window opens "\n'
     '            "as the day starts and the deadline falls as the day ends. Dates in "',
     '+ ". Dates in "', 1, 0),
    ("claim_min", "if len(claim) < 10:", "if len(claim) < 0:", 1, 0),
    ("criteria_count", "not (1 <= len(crit_raw) <= MAX_CRITERIA)", "not (0 <= len(crit_raw) <= 99)", 1, 0),
    ("independent_bool", "if not isinstance(independent, bool):", F, 1, 0),
    ("duplicate_criteria", 'if len(set(c["text"].lower() for c in criteria)) != len(criteria):', F, 1, 0),
    ("respondent_not_claimant", "if respondent == claimant:", F, 1, 0),
    ("inspector_independent", "if inspector in (claimant, respondent):", F, 1, 0),
    ("independent_needs_inspector", 'if any(c["needs_independent"] for c in criteria) and not inspector:', F, 1, 0),
    ("held_range", "if not (MIN_HELD <= held <= MAX_HELD):", F, 1, 0),
    ("funder_named", "if funder not in PARTIES:", F, 1, 0),
    ("bond_range", "if not (MIN_BOND <= bond <= MAX_BOND):", F, 1, 0),
    ("follows_exists", 'if not earlier:\n                _refuse(f"there is no earlier case',
     'if False:\n                _refuse(f"there is no earlier case', 1, 0),
    ("min_window", "MIN_WINDOW = 600", "MIN_WINDOW = 1", 1, 0),
    ("required_allowed", "elif rtype not in allowed:", "elif False:", 1, 0),
    # the draft
    ("open_limit", "if self._open_count(claimant) >= MAX_OPEN_PER_CLAIMANT:", F, 1, 0),
    ("revise_frozen", 'if c["state"] != "DRAFT" or c["accepted_version"]:\n            _refuse("the terms are frozen',
     'if c["state"] != "DRAFT":\n            _refuse("the terms are frozen', 1, 0),
    ("revise_same_parties", 'if t["respondent"] != c["respondent"] or t["inspector"] != c["inspector"]:', F, 1, 0),
    ("accept_digest", 'if not isinstance(terms_digest, str) or terms_digest.strip().lower() != t["digest"]:', F,
     2, 0),
    ("inspector_digest", 'if not isinstance(terms_digest, str) or terms_digest.strip().lower() != t["digest"]:', F,
     2, 1),
    ("accept_only_respondent",
     'if self._sender() != c["respondent"]:\n            _refuse("only the named respondent accepts',
     'if False:\n            _refuse("only the named respondent accepts', 1, 0),
    ("decline_only_respondent",
     'if self._sender() != c["respondent"]:\n            _refuse("only the named respondent declines',
     'if False:\n            _refuse("only the named respondent declines', 1, 0),
    ("withdraw_only_draft", 'if c["state"] != "DRAFT":\n            _refuse("a case can be withdrawn only',
     'if False:\n            _refuse("a case can be withdrawn only', 1, 0),
    ("inspector_named", 'if not c["inspector"] or self._sender() != c["inspector"]:', F, 1, 0),
    ("open_needs_inspector", 'if t["inspector"] and not c["inspector_accepted"]:\n            return',
     'if False:\n            return', 1, 0),
    ("open_needs_funding",
     'if int(t["held_sum_wei"]) and int(c["funded_wei"]) != int(t["held_sum_wei"]):\n            return',
     'if False:\n            return', 1, 0),
    ("expire_deadline", 'if _now() < _parse_iso(c["draft_expires_at"]):', F, 1, 0),
    ("close_counts", "self._bump(f\"open|{c['claimant']}\", -1)", "pass", 1, 0),
    # funding
    ("fund_state",
     'if c["state"] != "DRAFT" or not c["accepted_version"]:\n                raise _PayableRefusal("the held sum is',
     'if False:\n                raise _PayableRefusal("the held sum is', 1, 0),
    ("fund_funder", "if sender != funder:", F, 1, 0),
    ("fund_exact", "if sent != held:", F, 1, 0),
    ("fund_twice", 'if int(c["funded_wei"]):\n                raise _PayableRefusal("the held sum is already',
     'if False:\n                raise _PayableRefusal("the held sum is already', 1, 0),
    ("fund_refusal_credit", "                self._credit(sender, sent)\n", "                pass\n", 2, 0),
    ("challenge_refusal_credit", "                self._credit(sender, sent)\n", "                pass\n", 2, 1),
    ("held_counter", 'self._bump("held_wei", sent)', "pass", 1, 0),
    ("refund_to_depositor", 'self._credit(c["funder_address"], held)', 'self._credit(c["claimant"], held)', 1, 0),
    # evidence
    ("filing_role",
     'if not role:\n            _refuse("only the claimant, the respondent or an accepted inspector files',
     'if False:\n            _refuse("only the claimant, the respondent or an accepted inspector files', 1, 0),
    ("kind_allowed", 'if kind not in t["allowed"]:', F, 1, 0),
    ("evidence_deadline", 'if now >= _parse_iso(c["evidence_deadline"]):', F, 1, 0),
    ("cap_check", "if used >= cap:", F, 1, 0),
    ("challenge_evidence_deadline",
     'if now >= _parse_iso(ch["evidence_ends"]):\n                    _refuse(',
     'if False:\n                    _refuse(', 1, 0),
    ("challenge_reply_deadline", 'elif now >= _parse_iso(ch["reply_ends"]):', "elif False:", 1, 0),
    ("challenge_filer_is_challenger", 'if role == ch["by"]:', "if True:", 1, 0),
    ("duplicate_bytes", 'if other["sha256"] == digest and other["role"] == role:', F, 1, 0),
    ("duplicate_only_within_a_role", 'if other["sha256"] == digest and other["role"] == role:',
     'if other["sha256"] == digest:', 1, 0),
    ("image_structure", "problem = _image_problem(blob)", 'problem = ""', 1, 0),
    ("image_size", "if len(blob) > IMAGE_MAX_BYTES:", F, 1, 0),
    ("text_min", "if len(body) < 10:", "if len(body) < 0:", 1, 0),
    ("text_max", "if len(body) > TEXT_MAX:", F, 1, 0),
    ("criteria_mapping", "if s not in ids:\n                _refuse(", "if False:\n                _refuse(", 1, 0),
    ("criteria_mapping_shape", "if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):", F, 1, 0),
    ("challenge_reason_cap", "if len(text) > REASON_MAX:", F, 1, 0),
    ("ready_reset", 'c["ready"] = {r: False for r in ROLES}', "pass", 1, 0),
    ("ready_once", 'if c["ready"][role]:\n            _refuse("you have already marked',
     'if False:\n            _refuse("you have already marked', 1, 0),
    ("ready_reset_all", 'c["ready"] = {r: False for r in ROLES}', 'c["ready"][role] = False', 1, 0),
    ("reuse_record", '"first_filed_in": first_case, "reuse": reuse}', '"first_filed_in": first_case, "reuse": ""}',
     1, 0),
    ("reuse_other", "if first_by != sender:", F, 1, 0),
    ("digest_records_filer", "self.digests[digest] = f\"{c['case_id']}|{eid}|{sender}\"",
     "self.digests[digest] = f\"{c['case_id']}|{eid}|\"", 1, 0),
    ("reuse_never_related", 'reuse = "RELATED" if same else "SELF"', 'reuse = "SELF"', 1, 0),
    ("reuse_always_related", 'reuse = "RELATED" if same else "SELF"', 'reuse = "RELATED"', 1, 0),
    ("reuse_by_citation",
     'same = {earlier.get("claimant"), earlier.get("respondent")} == {c["claimant"], c["respondent"]}',
     'same = earlier.get("thread") == c["thread"]', 1, 0),
    ("reuse_same_case", 'if first_case == c["case_id"]:', F, 1, 0),
    ("thread_inherit", 'thread = earlier["thread"]', 'thread = ""', 1, 0),
    ("follow_closed", 'if earlier["state"] not in TERMINAL:', F, 1, 0),
    ("follow_parties", 'if {earlier["claimant"], earlier["respondent"]} != {claimant, t["respondent"]}:', F, 1, 0),
    ("frame_time_check", 'if timed and not _FRAME_TIME.match(rec["frame_time"]):', F, 1, 0),
    ("doc_type_text", 'if doc not in DOC_TYPES:\n            _refuse("say what kind of document this is")',
     'if False:\n            _refuse("say what kind of document this is")', 1, 0),
    # asking for the assessment
    ("readiness_rule", 'if now < _parse_iso(c["evidence_deadline"]) and not ready:', F, 1, 0),
    ("inspector_ready", 'not c["inspector"] or c["ready"]["INSPECTOR"])', "True)", 1, 0),
    ("empty_file_in_code", 'if not ctx["items"] and not missing:', F, 1, 0),
    ("required_missing", 'if have < r["min"]:', F, 1, 0),
    ("request_role", 'if role not in PARTIES:\n            _refuse("only the claimant or the respondent asks',
     'if False:\n            _refuse("only the claimant or the respondent asks', 1, 0),
    ("retry_limit", 'if c["retried_by"].count(role) >= MAX_RETRIES:', F, 1, 0),
    ("retry_limit_shared", 'if c["retried_by"].count(role) >= MAX_RETRIES:',
     'if len(c["retried_by"]) >= MAX_RETRIES:', 1, 0),
    ("retry_recorded", 'c["retried_by"] = c["retried_by"] + [role]', "pass", 1, 0),
    ("no_reassessment", 'if c["challenge"] or (d["overall"] != "NOT_ASSESSED" and not d["unseen_ids"]):', F, 1, 0),
    ("retry_only_when_nothing_seen", 'if c["challenge"] or (d["overall"] != "NOT_ASSESSED" and not d["unseen_ids"]):',
     'if c["challenge"] or d["overall"] != "NOT_ASSESSED":', 1, 0),
    ("retry_role", 'if role != against:', F, 1, 0),
    ("retry_against", 'against = "RESPONDENT" if d["overall"] == "SUPPORTED" else "CLAIMANT"',
     'against = "CLAIMANT" if d["overall"] == "SUPPORTED" else "RESPONDENT"', 2, 0),
    # the floors
    ("F0", 'finding = model if model in MODEL_FINDINGS else "INSUFFICIENT"', 'finding = model or "INSUFFICIENT"', 1, 0),
    ("F5", "supports = [x for x in row.get(\"supports\", []) if x in visible]",
     "supports = list(row.get(\"supports\", []))", 1, 0),
    ("F5_against", "against = [x for x in row.get(\"against\", []) if x in visible]",
     "against = list(row.get(\"against\", []))", 1, 0),
    ("twins_named", "for y in twins.get(x, []):", "for y in []:", 1, 0),
    ("twins_own_copy_brings_nothing", "if roles[x] == favours:\n                    continue",
     "if False:\n                    continue", 1, 0),
    ("twins_stay_where_named", "if y in visible and y not in out and y not in taken:",
     "if y in visible and y not in out:", 1, 0),
    ("twins_unseen_not_brought", "if y in visible and y not in out and y not in taken:",
     "if y not in out and y not in taken:", 1, 0),
    ("twins_contrary_wins", "basis = grown(named_basis, sides[0], set(contrary))",
     "basis = grown(named_basis, sides[0], set(named_contrary))", 1, 0),
    ("twins_contrary_grows", "contrary = grown(named_contrary, sides[1], set(named_basis))",
     "contrary = list(named_contrary)", 1, 0),
    ("twins_basis_grows", "basis = grown(named_basis, sides[0], set(contrary))",
     "basis = list(named_basis)", 1, 0),
    ("both_lists_never_carry", "basis = [x for x in basis if x not in both]", "basis = list(basis)", 1, 0),
    ("both_lists_still_oppose", "basis = [x for x in basis if x not in both]",
     "basis = [x for x in basis if x not in both]\n    contrary = [x for x in contrary if x not in both]", 1, 0),
    ("twins_seen_together", 'visible |= set(y for x in list(visible) for y in ctx.get("twins", {}).get(x, []))',
     "pass", 1, 0),
    ("flags_never_spread", 'flagged = set(shaped["instructions_found"] if flags is None else flags)\n',
     'flagged = set(shaped["instructions_found"] if flags is None else flags)\n'
     '    flagged |= set(y for x in list(flagged) for y in ctx.get("twins", {}).get(x, []))\n', 1, 0),
    ("basis_follows_the_finding",
     'basis, contrary = (against, supports) if finding == "NOT_ESTABLISHED" else (supports, against)',
     "basis, contrary = supports, against", 1, 0),
    ("F5_floor", "if any(x not in visible for x in cited):", F, 1, 0),
    ("F5_from_lengths", "if any(x not in visible for x in cited):",
     "if len(basis) + len(contrary) != len(cited):", 1, 0),
    ("F6", 'tainted = ctx["instructions"] | ctx["reused"]', 'tainted = ctx["reused"]', 1, 0),
    ("F7", 'tainted = ctx["instructions"] | ctx["reused"]', 'tainted = ctx["instructions"]', 1, 0),
    ("F7_claimant_only", 'if it["reuse"] == "SELF" and it["role"] == "CLAIMANT"),', 'if it["reuse"] == "SELF"),', 1, 0),
    ("F6_contrary",
     'keep_contrary = [x for x in contrary if not (x in tainted and roles[x] in (sides[1], "INSPECTOR"))]',
     "keep_contrary = list(contrary)", 1, 0),
    ("F6_inspector_basis", 'roles[x] in (sides[0], "INSPECTOR")', "roles[x] == sides[0]", 1, 0),
    ("F6_inspector_contrary", 'roles[x] in (sides[1], "INSPECTOR")', "roles[x] == sides[1]", 1, 0),
    ("F6_admission", 'x in tainted and roles[x] in (sides[0], "INSPECTOR")', "x in tainted", 1, 0),
    ("F6_sides_mirror", '"NOT_ESTABLISHED": ("RESPONDENT", "CLAIMANT")',
     '"NOT_ESTABLISHED": ("CLAIMANT", "RESPONDENT")', 1, 0),
    ("F6_conflicting", '\n               "CONFLICTING": ("CLAIMANT", "RESPONDENT")}', "}", 1, 0),
    ("F4", 'if finding in CONCLUSIVE and row.get("adequate") is not True:', F, 1, 0),
    ("F1", "if finding in CONCLUSIVE and not basis:", F, 1, 0),
    ("F8", 'if finding == "CONFLICTING" and (not basis or not contrary):', F, 1, 0),
    ("F2", 'if finding in CONCLUSIVE and crit["needs_independent"] and not any(', "if False and not any(", 1, 0),
    ("F3", "if not corroborated and opposing:", F, 1, 0),
    ("F3_admission", 'corroborated = any(roles[x] in ("INSPECTOR", other) for x in basis)',
     'corroborated = any(roles[x] == "INSPECTOR" for x in basis)', 1, 0),
    ("F3_inspector_opposes", "opposing = list(contrary)",
     "opposing = [x for x in contrary if roles[x] == other]", 1, 0),
    ("F3_asks_no_filer", "opposing = list(contrary)",
     'opposing = [x for x in contrary if roles[x] in ("INSPECTOR", other)]', 1, 0),
    ("F3_mirror", "other = _LIST_SIDES[finding][1]", 'other = "RESPONDENT"', 1, 0),
    ("none_seen", "        if not visible:\n", "        if False:\n", 1, 0),
    # the overall rule
    ("overall_not_assessed", 'if any(f == "NOT_ASSESSED" for f in findings):', F, 1, 0),
    ("overall_all_supported", 'if findings and all(f == "SUPPORTED" for f in findings):',
     'if findings and any(f == "SUPPORTED" for f in findings):', 1, 0),
    ("overall_order", 'if any(f == "NOT_ESTABLISHED" for f in findings):\n        return "NOT_ESTABLISHED"',
     'if any(f == "CONFLICTING" for f in findings):\n        return "CONFLICTING"', 1, 0),
    # validators
    ("dissent_dropped", "if dropped:\n        return", "if False:\n        return", 1, 0),
    ("dissent_foreign", 'if any(x not in ctx["image_ids"] for x in claimed):', F, 1, 0),
    ("dissent_bound", "if _bound(settled, ids) != _bound(mine, ids):", F, 1, 0),
    ("bound_not_assessed", 'settled["overall"] == "NOT_ASSESSED")', "False)", 1, 0),
    ("bound_criteria", 'tuple(settled["criteria"][c]["finding"] == "SUPPORTED" for c in criterion_ids),', "(),", 1, 0),
    ("bound_finer_labels", 'settled["criteria"][c]["finding"] == "SUPPORTED" for c in criterion_ids',
     'settled["criteria"][c]["finding"] for c in criterion_ids', 1, 0),
    ("blind_cannot_lead", "if lead is None and not sighted:", F, 1, 0),
    ("sight_needed_only_with_images", 'sighted = (not ctx["images"]) or self._sighted(ctx)',
     "sighted = self._sighted(ctx)", 1, 0),
    ("canary_must_be_read",
     'return isinstance(got, str) and "".join(ch for ch in got[:40] if ch in "0123456789") == code',
     "return isinstance(got, str)", 1, 0),
    ("canary_number_answer",
     "if isinstance(got, int) and not isinstance(got, bool) and 0 <= got < 10 ** CANARY_DIGITS:", "if False:", 1, 0),
    ("canary_failure_is_blind", 'except Exception:\n            return False\n        got = out.get("digits")',
     'except Exception:\n            return True\n        got = out.get("digits")', 1, 0),
    ("canary_crc", '_crc32(tag + data).to_bytes(4, "big")', '(0).to_bytes(4, "big")', 1, 0),
    ("canary_adler", '_adler32(raw).to_bytes(4, "big")', '(1).to_bytes(4, "big")', 1, 0),
    ("borrowed_is_labelled", '"describes it as: " if o.get("borrowed") else', '"describes it as: " if False else',
     1, 0),
    ("seen_needs_a_description",
     'if row.get("seen") is True and _clean(_text(row.get("shows"), 2 * NOTE_MAX), NOTE_MAX):',
     'if row.get("seen") is True:', 1, 0),
    ("finalize_not_assessed", 'elif overall == "NOT_ASSESSED":', "elif False:", 1, 0),
    ("examine_singly", "if not rows and len(pair) > 1:", F, 1, 0),
    ("observations_str_id", 'if isinstance(o, dict) and isinstance(o.get("evidence_id"), str):',
     "if isinstance(o, dict):", 1, 0),
    ("clean_only_strings", 'if not isinstance(value, str):\n        return ""', 'if False:\n        return ""', 3, 0),
    ("block_only_strings", 'if not isinstance(value, str):\n        return ""', 'if False:\n        return ""', 3, 1),
    ("text_only_strings", 'if not isinstance(value, str):\n        return ""', 'if False:\n        return ""', 3, 2),
    ("trim_scrub", 'return "".join(" " if 0xD800 <= ord(c) <= 0xDFFF else c for c in value[:limit])',
     "return value[:limit]", 1, 0),
    ("trim_cap", 'ids(out.get("instructions_found"), 40)', 'ids(out.get("instructions_found"), 12)', 1, 0),
    ("ids_uncapped", "            out.append(s)\n    return out\n", "            out.append(s)\n    return out[:12]\n",
     1, 0),
    ("f3_swap", "                basis, contrary = contrary, basis\n", "                pass\n", 1, 0),
    ("dissent_flags", "if lead != own:", F, 1, 0),
    ("dissent_flags_union", "for flags in (lead | own, lead & own):", "for flags in (lead & own,):", 1, 0),
    ("dissent_flags_intersection", "for flags in (lead | own, lead & own):", "for flags in (lead | own,):", 1, 0),
    ("observations_shaped",
     '"observations": _notes(observations, ctx["image_kinds"], seen) if raw_shaped else [],',
     '"observations": observations,', 1, 0),
    ("observations_seen", "seen = eid in seen_ids", 'seen = o.get("seen") is True', 1, 0),
    ("observations_quality", 'quality if seen and quality in ("GOOD", "POOR", "UNUSABLE") else ""', "quality", 1, 0),
    # prompts
    ("chunk_by_role", 'mine = [x for x in images if x[0]["role"] == role]',
     'mine = list(images) if role == "CLAIMANT" else []', 1, 0),
    ("examiner_reads_claims", 'lines.append(f"Image {n}: {what}.")',
     "lines.append(f\"Image {n}: {what}. {it['description']}\")", 1, 0),
    ("fence_once", 'while "<<<" in t or ">>>" in t:', 'if "<<<" in t or ">>>" in t:', 1, 0),
    ("visible_invisible", "elif not any(lo <= o <= hi for lo, hi in _INVISIBLE_RANGES):", "elif True:", 1, 0),
    ("visible_c1", "o < 0x20 or 0x7F <= o <= 0x9F or o in _BLANKS or", "o < 0x20 or o in _BLANKS or", 1, 0),
    ("visible_blanks", "0x7F <= o <= 0x9F or o in _BLANKS or 0xD800", "0x7F <= o <= 0x9F or 0xD800", 1, 0),
    ("visible_surrogates", " or 0xD800 <= o <= 0xDFFF:", ":", 1, 0),
    ("fence_tag", 'return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]', 'return "0" * 16', 1, 0),
    ("block_tag_close", r'return f"<<<{head}\n{body}\nEND {head}>>>"', r'return f"<<<{head}\n{body}\nEND>>>"', 1, 0),
    ("visible_newlines", r'if newlines and ch == "\n":', "if False:", 1, 0),
    ("fence_lookalikes", '"".join(_fold(ch) for ch in', '"".join(ch for ch in', 1, 0),
    ("fold_table", "if o in _FOLD:\n        return _FOLD[o]", "if False:\n        return _FOLD[o]", 1, 0),
    ("fold_fullwidth", "if 0xFF01 <= o <= 0xFF5E:", F, 1, 0),
    ("fold_math", "if 0x1D400 <= o <= 0x1D6A3:", F, 1, 0),
    ("fence_markers", "for m in _MARKERS.finditer(shadow):", "for m in []:", 1, 0),
    ("fence_confusables", 'shadow = "".join(_CONFUSABLE.get(ord(ch), ch) for ch in t)', "shadow = t", 1, 0),
    ("marker_separator", r"(END)[\W_]*(EXHIBIT", r"(END)\s+(EXHIBIT", 1, 0),
    ("title_fenced", 'title = (" titled " + _quoted("TITLE", it["title"])) if it.get("title") else ""',
     'title = (" titled " + it["title"]) if it.get("title") else ""', 1, 0),
    ("zone_fenced", "f\"TIME: zone {_quoted('ZONE', t['time_zone'])}\"", "f\"TIME: zone {t['time_zone']}\"", 1, 0),
    ("prompt_reuse_other", 'elif it["reuse"] == "OTHER":', "elif False:", 1, 0),
    # challenge and readjudication
    ("challenge_state", 'if c["state"] != "DETERMINED":\n                raise _PayableRefusal("only a standing',
     'if False:\n                raise _PayableRefusal("only a standing', 1, 0),
    ("challenge_once", 'if c["challenge"]:\n                raise _PayableRefusal("this case has already',
     'if False:\n                raise _PayableRefusal("this case has already', 1, 0),
    ("challenge_window", 'if _now() >= _parse_iso(d["challenge_window_ends"]):\n                raise',
     'if False:\n                raise', 1, 0),
    ("challenge_against", 'against = "RESPONDENT" if d["overall"] == "SUPPORTED" else "CLAIMANT"',
     'against = "CLAIMANT" if d["overall"] == "SUPPORTED" else "RESPONDENT"', 2, 1),
    ("challenge_reason", 'if len(text) < 10:\n                raise _PayableRefusal("state the reason',
     'if False:\n                raise _PayableRefusal("state the reason', 1, 0),
    ("challenge_bond", "if sent != bond:", F, 1, 0),
    ("brought_by_challenger", ' and self._item(e)["role"] == ch["by"]', "", 1, 0),
    ("readjudicate_early", 'if now < _parse_iso(ch["evidence_ends"]):\n            _refuse(f"the challenger may',
     'if False:\n            _refuse(f"the challenger may', 1, 0),
    ("readjudicate_before_the_reply", 'if now < _parse_iso(ch["reply_ends"]):', F, 1, 0),
    ("readjudicate_late", 'if now >= _parse_iso(ch["close_after"]):\n            _refuse("the readjudication',
     'if False:\n            _refuse("the readjudication', 1, 0),
    ("readjudicate_no_result", 'if d["overall"] == "NOT_ASSESSED" or lost or unopened:', F, 1, 0),
    ("round_that_lost_sight", 'if d["overall"] == "NOT_ASSESSED" or lost or unopened:',
     'if d["overall"] == "NOT_ASSESSED" or unopened:', 1, 0),
    ("round_blind_to_new_evidence", 'if d["overall"] == "NOT_ASSESSED" or lost or unopened:',
     'if d["overall"] == "NOT_ASSESSED" or lost:', 1, 0),
    ("round_waits_only_for_the_challenger",
     'if i["during_challenge"] and i["role"] == ch["by"] and i["kind"] in IMAGE_KINDS]',
     'if i["during_challenge"] and i["kind"] in IMAGE_KINDS]', 1, 0),
    ("network_fault_recorded", 'ch["network_fault"] = True', "pass", 1, 0),
    ("network_fault_needs_new_files_seen", "if lost and not unopened:", "if lost:", 1, 0),
    ("readjudication_closes_window", 'd["challenge_window_ends"] = d["decided_at"]', "pass", 1, 0),
    ("bond_on_reversal", 'reversed_ = (d["overall"] == "SUPPORTED") != (first["overall"] == "SUPPORTED")',
     "reversed_ = False", 1, 0),
    ("bond_on_any_change", 'reversed_ = (d["overall"] == "SUPPORTED") != (first["overall"] == "SUPPORTED")',
     'reversed_ = d["overall"] != first["overall"]', 1, 0),
    ("readjudication_cap", 'if ch["rounds"] >= MAX_READJUDICATIONS:\n            _refuse(',
     "if False:\n            _refuse(", 1, 0),
    ("rounds_count", 'ch["rounds"] = ch["rounds"] + 1', "pass", 1, 0),
    ("close_after_cap", 'elif now >= _parse_iso(ch["close_after"]) or ch["rounds"] >= MAX_READJUDICATIONS:',
     'elif now >= _parse_iso(ch["close_after"]):', 1, 0),
    ("timeout_unpursued", 'if not ch["rounds"]:', F, 1, 0),
    ("close_network_fault_never", 'elif ch.get("network_fault"):', "elif False:", 1, 0),
    ("close_network_fault_always", 'elif ch.get("network_fault"):', "elif True:", 1, 0),
    ("bond_payee",
     'to = ch["by_address"] if to_challenger else (c["respondent"] if ch["by"] == "CLAIMANT" else c["claimant"])',
     'to = ch["by_address"] if to_challenger else (c["claimant"] if ch["by"] == "CLAIMANT" else c["respondent"])',
     1, 0),
    ("close_no_evidence", "if not self._brought(c):\n            self._settle_bond(",
     "if False:\n            self._settle_bond(", 1, 0),
    ("close_timeout", 'elif now >= _parse_iso(ch["close_after"]) or ch["rounds"] >= MAX_READJUDICATIONS:', "elif True:",
     1, 0),
    ("close_early", 'if now < _parse_iso(ch["evidence_ends"]):\n            _refuse(f"the challenge evidence',
     'if False:\n            _refuse(f"the challenge evidence', 1, 0),
    # finality and money
    ("finalize_window", 'if _now() < _parse_iso(d["challenge_window_ends"]):\n            _refuse(f"the decision',
     'if False:\n            _refuse(f"the decision', 1, 0),
    ("finalize_payee", 'if overall == "SUPPORTED":\n            self._release_held(c, "CLAIMANT"',
     'if overall != "SUPPORTED":\n            self._release_held(c, "CLAIMANT"', 1, 0),
    ("finalize_state",
     'if c["state"] != "DETERMINED":\n            _refuse("only a case with a standing decision can be finalized")',
     'if c["state"] not in ("DETERMINED", "FINAL"):\n            _refuse("only a case with a standing decision can '
     'be finalized")', 1, 0),
    ("lapse_grace", 'due = _parse_iso(c["evidence_deadline"]) + timedelta(seconds=LAPSE_GRACE)',
     'due = _parse_iso(c["evidence_deadline"])', 1, 0),
    ("lapse_payee", 'self._refund_deposit(c, "no assessment was recorded',
     'self._release_held(c, "RESPONDENT", "no assessment was recorded', 1, 0),
    ("withdraw_zeroes", 'row["owed"], row["paid"] = "0", str(int(row["paid"]) + owed)',
     'row["paid"] = str(int(row["paid"]) + owed)', 1, 0),
    ("owed_counter", 'self._bump("owed_wei", -owed)', "pass", 1, 0),
    # digests
    ("decision_digest_scope",
     'DECISION_MUTABLE = ("status", "supersedes", "superseded_by", "challenge_window_ends", "decision_digest")',
     'DECISION_MUTABLE = ("decision_digest",)', 1, 0),
    ("canonical_sorting", 'return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)',
     'return json.dumps(value, separators=(",", ":"), ensure_ascii=True)', 1, 0),
    # ---- what is text, what is a number, how long it may be -----------------------------------------------
    ("bounded_type", 'if not isinstance(value, str):\n        _refuse(f"{what} must be text")',
     'if False:\n        _refuse(f"{what} must be text")', 2, 0),
    ("local_time_type", 'if not isinstance(value, str):\n        _refuse(f"{what} must be text")',
     'if False:\n        _refuse(f"{what} must be text")', 2, 1),
    ("local_time_year", 'if not _LOCAL_TIME.match(text) or text < "1000":', "if not _LOCAL_TIME.match(text):", 1, 0),
    ("ascii_digits_time", '_LOCAL_TIME = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2})?$")',
     '_LOCAL_TIME = re.compile(r"^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2})?$")', 1, 0),
    ("ascii_digits_wei", '_DIGITS = re.compile(r"^[0-9]{1,40}$")', '_DIGITS = re.compile(r"^\\d{1,40}$")', 1, 0),
    ("ascii_digits_frame", '_FRAME_TIME = re.compile(r"^[0-9]{1,4}:[0-5][0-9]$")',
     '_FRAME_TIME = re.compile(r"^\\d{1,4}:[0-5]\\d$")', 1, 0),
    ("ascii_digits_case", '_CASE_ID = re.compile(r"^KW-[0-9]{4,12}$")', '_CASE_ID = re.compile(r"^KW-\\d{4,12}$")',
     1, 0),
    ("wei_int_range", "if isinstance(raw, int) and not isinstance(raw, bool) and 0 <= raw < 10 ** 40:",
     "if isinstance(raw, int) and not isinstance(raw, bool):", 1, 0),
    ("wei_not_bool", "if isinstance(raw, int) and not isinstance(raw, bool) and 0 <= raw < 10 ** 40:",
     "if isinstance(raw, int) and 0 <= raw < 10 ** 40:", 1, 0),
    ("required_images_one_party", 'if need_images > CAPS["CLAIMANT"][0] or need_documents > CAPS["CLAIMANT"][1]:',
     'if need_documents > CAPS["CLAIMANT"][1]:', 1, 0),
    ("required_documents_one_party", 'if need_images > CAPS["CLAIMANT"][0] or need_documents > CAPS["CLAIMANT"][1]:',
     'if need_images > CAPS["CLAIMANT"][0]:', 1, 0),
    ("challenge_window_floor", 'raw.get("challenge_window_seconds", 86400), MIN_CHALLENGE_WINDOW,',
     'raw.get("challenge_window_seconds", 86400), MIN_WINDOW,', 1, 0),
    ("funder_named_without_a_sum", 'if raw.get("funder") not in (None, "") and funder not in PARTIES:', F, 1, 0),
    ("follows_shape", 'if raw.get("follows_case") not in (None, "") and not _CASE_ID.match(follows):', F, 1, 0),
    ("case_id_shape", "if not isinstance(cid, str) or not _CASE_ID.fullmatch(cid.strip().upper()):", F, 1, 0),
    ("json_is_text", 'if not isinstance(raw_json, str):\n            _refuse(f"{what} must be JSON text")',
     'if False:\n            _refuse(f"{what} must be JSON text")', 1, 0),
    ("json_size", "if len(raw_json) > limit:", F, 1, 0),
    ("versions_cap", 'if c["version"] >= MAX_VERSIONS:', F, 1, 0),
    # ---- drafts end; the inspector accepts one version ------------------------------------------------------
    ("draft_live_revise", "self._draft_live(c)", "pass", 3, 0),
    ("draft_live_accept", "self._draft_live(c)", "pass", 3, 1),
    ("draft_live_inspector", "self._draft_live(c)", "pass", 3, 2),
    ("draft_live_fund", 'if _now() >= _parse_iso(c["draft_expires_at"]):\n                raise _PayableRefusal(',
     'if False:\n                raise _PayableRefusal(', 1, 0),
    ("inspector_reaccepts", 'c["inspector_accepted"] = False', "pass", 1, 0),
    # ---- value is never left behind ---------------------------------------------------------------------------
    ("fund_catch_all", 'except Exception:\n            # Whatever went wrong while reading the request',
     'except ZeroDivisionError:\n            # Whatever went wrong while reading the request', 1, 0),
    ("challenge_catch_all",
     'except Exception:\n            refusal = "the request could not be read"\n        if refusal:\n'
     '            if sent > 0:\n                self._credit(sender, sent)\n'
     '                return json.dumps({"refused": True, "reason": refusal, "credited_wei": str(sent)})\n'
     '            _refuse(refusal)\n        now = _now()',
     'except ZeroDivisionError:\n            refusal = "the request could not be read"\n        if refusal:\n'
     '            if sent > 0:\n                self._credit(sender, sent)\n'
     '                return json.dumps({"refused": True, "reason": refusal, "credited_wei": str(sent)})\n'
     '            _refuse(refusal)\n        now = _now()', 1, 0),
    # ---- what the contract accepts as an image --------------------------------------------------------------------
    ("image_is_bytes", "if not isinstance(data, (bytes, bytearray)):", F, 1, 0),
    ("image_kind_is_text", 'if kind not in IMAGE_KINDS or not isinstance(meta.get("kind", ""), str):',
     "if kind not in IMAGE_KINDS:", 1, 0),
    ("frame_time_is_text", 'timed = kind == "VIDEO_FRAME" and meta.get("frame_time") not in (None, "")',
     'timed = bool(rec["frame_time"])', 1, 0),
    ("document_is_text", 'if not isinstance(text, str):\n            _refuse("a document must be sent as text")',
     'if False:\n            _refuse("a document must be sent as text")', 1, 0),
    ("jpeg_opens", 'if data[:4] != b"\\xff\\xd8\\xff\\xe0" or data[6:11] != b"JFIF\\x00":', F, 1, 0),
    ("jpeg_ends", 'if data[-2:] != b"\\xff\\xd9":', F, 1, 0),
    ("jpeg_metadata", "if marker in (0xE1, 0xED, 0xFE):", F, 1, 0),
    ("jpeg_sides",
     'if not _side_ok(int.from_bytes(body[3:5], "big"), int.from_bytes(body[1:3], "big")):', F, 1, 0),
    ("jpeg_coding", "elif not (0xE0 <= marker <= 0xEF or marker in (0xC4, 0xDD)):", "elif False:", 1, 0),
    ("jpeg_needs_a_frame", 'return "" if frame and tables else "its structure is broken"', 'return ""', 1, 0),
    ("png_sides", 'if not _side_ok(width, int.from_bytes(data[pos + 12:pos + 16], "big")):', F, 1, 0),
    ("png_chunks", 'elif kind not in _PNG_CHUNKS or kind == b"IHDR":', "elif False:", 1, 0),
    ("png_ends", 'return "" if has_data and pos == size else "its structure is broken"', 'return ""', 1, 0),
    # ---- a non-answer is never a finding ---------------------------------------------------------------------------
    ("judged_asked_again", 'if not judged(answer):\n            # Asked once more',
     'if False:\n            # Asked once more', 1, 0),
    ("judged_or_the_node_fails", 'if not judged(answer):\n            raise gl.vm.UserError(',
     'if False:\n            raise gl.vm.UserError(', 1, 0),
    ("judged_as_it_travels",
     'return _judged(a, ctx["criterion_ids"]) and _judged(_trim(a, seen_ids), ctx["criterion_ids"])',
     'return _judged(a, ctx["criterion_ids"])', 1, 0),
    ("judged_as_the_model_gave_it",
     'return _judged(a, ctx["criterion_ids"]) and _judged(_trim(a, seen_ids), ctx["criterion_ids"])',
     'return _judged(_trim(a, seen_ids), ctx["criterion_ids"])', 1, 0),
    ("trim_strips_before_cutting", "        w = v.strip()\n        return w if len(w) <= limit",
     "        w = v\n        return w if len(w) <= limit", 1, 0),
    ("trim_never_cuts_a_word", "return w if len(w) <= limit and _text(w, limit) == w else \"\"",
     "return _text(w, limit)", 1, 0),
    ("trim_ids_once_before_the_cap",
     "            if w and w not in out:\n                out.append(w)\n        return out[:cap]",
     "            if w:\n                out.append(w)\n        return out[:cap]", 1, 0),
    ("refusal_text_is_clean", "_refuse(f\"{_clean(x, 20) or 'an empty value'} is not a criterion of this case\")",
     "_refuse(f\"{s or 'an empty value'} is not a criterion of this case\")", 1, 0),
    ("copy_described_by_its_twin", "if other and other[\"seen\"]:\n                            o, via = other, twin",
     "if False:\n                            o, via = other, twin", 1, 0),
    ("copy_said_to_be_a_copy", "if via:\n                        lead_in = (f\"this copy did not open",
     "if False:\n                        lead_in = (f\"this copy did not open", 1, 0),
    ("unseen_counts_copies", "if x not in seen and not any(y in seen for y in twins.get(x, []))]",
     "if x not in seen]", 1, 0),
    ("unseen_still_listed", "if x not in seen and not any(y in seen for y in twins.get(x, []))]",
     "if x not in seen and False]", 1, 0),
    ("judged_leader_result", 'if not _judged(raw, ctx["criterion_ids"]):\n        return "the leader',
     'if False:\n        return "the leader', 1, 0),
    ("judged_vocabulary", "if finding not in MODEL_FINDINGS:\n            return False",
     "if False:\n            return False", 1, 0),
    ("judged_every_criterion", 'if r is None or not isinstance(r.get("finding"), str):\n            return False',
     'if r is None or not isinstance(r.get("finding"), str):\n            continue', 1, 0),
    # ---- calibration, notes, prompts --------------------------------------------------------------------------------
    ("canary_seed_moment", 'str(len(c["decisions"])), _iso(_now()), self._sender()]',
     'str(len(c["decisions"])), self._sender()]', 1, 0),
    ("canary_seed_sender", 'str(len(c["decisions"])), _iso(_now()), self._sender()]',
     'str(len(c["decisions"])), _iso(_now())]', 1, 0),
    ("transcript_cut_noted",
     '(o.get("text_cut") is True or len(lines) > cap or any(len(x) > width for x in lines[:cap])', "(False", 1, 0),
    ("transcript_cut_borrowed", 'o.get("text_cut") is True or len(lines) > cap', "len(lines) > cap", 1, 0),
    ("transcript_cut_told", 'if o.get("text_cut"):', F, 1, 0),
    ("twin_told", 'for twin in ctx["twins"].get(eid, []):', "for twin in []:", 2, 0),
    # ---- the end of a case that could not be examined ---------------------------------------------------
    ("not_assessed_reason", 'elif overall == "NOT_ASSESSED":', "elif False:", 1, 0),
    # audit 4: form, numbers, ids and lengths
    ("judged_adequate_is_boolean", 'if conclusive and not isinstance(r.get("evidence_adequate"), bool):', F, 1, 0),
    ("judged_lists_are_lists", "if not isinstance(r.get(key), list):", F, 1, 0),
    ("judged_lists_needed_when_conclusive", "if key in r or conclusive:", "if key in r:", 1, 0),
    ("judged_before_trim", "answer = self._ask(prompt)", "answer = _trim(self._ask(prompt), seen_ids)", 2, 0),
    ("judged_again_before_trim", "answer = self._ask(prompt)", "answer = _trim(self._ask(prompt), seen_ids)", 2, 1),
    ("whole_plain_digits", "if isinstance(raw, str) and not _DIGITS.fullmatch(raw):", F, 1, 0),
    ("whole_fullmatch", "if isinstance(raw, str) and not _DIGITS.fullmatch(raw):",
     "if isinstance(raw, str) and not _DIGITS.match(raw):", 1, 0),
    ("required_pages_are_images", 'as_pages = "TEXT_DOCUMENT" not in allowed', "as_pages = False", 1, 0),
    ("required_is_a_list", '[] if raw.get("required") is None else raw.get("required")',
     'raw.get("required") or []', 1, 0),
    ("limitations_is_a_list", '[] if raw.get("limitations") is None else raw.get("limitations")',
     'raw.get("limitations") or []', 1, 0),
    ("reason_length_before_cleaning", "if not isinstance(reason, str) or len(reason) > 4 * REASON_MAX + 64:", F, 1, 0),
    ("dissent_counts_twins",
     'counted = set(claimed) | set(y for x in claimed for y in ctx.get("twins", {}).get(x, []))',
     "counted = set(claimed)", 1, 0),
    ("item_id_is_text", 'if not isinstance(eid, str):', F, 1, 0),
    ("decision_id_is_text", 'if not isinstance(did, str):', F, 1, 0),
    ("page_numbers_are_ints", "if isinstance(n, bool) or not isinstance(n, int):", F, 1, 0),
    ("terms_version_checked", '_whole(version, 1, MAX_VERSIONS, "the terms version")', "int(version)", 1, 0),
    ("meta_empty_only", '"{}" if raw_json in (None, "") else raw_json', 'raw_json or "{}"', 1, 0),
    ("notes_string_transcript", 'o.get("text").split("\\n") if isinstance(o.get("text"), str) else o.get("text")',
     'o.get("text")', 1, 0),
    ("notes_dates_cut", "or len(dates) > 8)", ")", 1, 0),
]


def _apply(src: str, old: str, new: str, expected: int, which: int) -> str:
    found = src.count(old)
    if found != expected:
        raise ValueError(f"pattern found {found} times, expected {expected}")
    start = -1
    for _ in range(which + 1):
        start = src.index(old, start + 1)
    return src[:start] + new + src[start + len(old):]


def _scratch(base: pathlib.Path) -> pathlib.Path:
    shutil.copytree(ROOT / "contracts", base / "contracts")
    shutil.copytree(ROOT / "tests" / "direct", base / "tests" / "direct",
                    ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copy(ROOT / "pyproject.toml", base / "pyproject.toml")
    # One test reads the sample images to hold them to the contract's own image check.
    shutil.copytree(ROOT / "fixtures", base / "fixtures")
    return base


def _run(base: pathlib.Path) -> int:
    return subprocess.run([sys.executable, "-m", "pytest", "-x", "-q", "-p", "no:cacheprovider"],
                          cwd=base, capture_output=True, timeout=900).returncode


def _one(item):
    name, old, new, expected, which = item
    src = SRC.read_text(encoding="ascii")
    try:
        mutated = _apply(src, old, new, expected, which)
    except ValueError as e:
        return name, "BAD", str(e)
    with tempfile.TemporaryDirectory() as tmp:
        base = _scratch(pathlib.Path(tmp))
        (base / "contracts" / "keywitness.py").write_text(mutated, encoding="ascii", newline="\n")
        code = _run(base)
    return name, "killed" if code != 0 else "SURVIVED", ""


def main(argv):
    names = set(argv)
    chosen = [m for m in MUTANTS if not names or m[0] in names]
    if len(set(m[0] for m in MUTANTS)) != len(MUTANTS):
        print("duplicate mutant names")
        return 2
    with tempfile.TemporaryDirectory() as tmp:
        if _run(_scratch(pathlib.Path(tmp))) != 0:
            print("control: the unmutated suite FAILS; fix it before sweeping")
            return 2
    print("control: the unmutated suite passes")
    results = []
    with cf.ProcessPoolExecutor(max_workers=int(os.environ.get("KW_SWEEP_WORKERS", "3"))) as pool:
        for name, verdict, note in pool.map(_one, chosen):
            results.append((name, verdict))
            print(f"{verdict:9} {name}" + (f"  ({note})" if note else ""), flush=True)
    bad = [n for n, v in results if v == "BAD"]
    survived = [n for n, v in results if v == "SURVIVED"]
    killed = len([1 for _, v in results if v == "killed"])
    print(f"\n{killed}/{len(results)} mutants killed; {len(survived)} survived; {len(bad)} bad patterns")
    return 0 if not bad and not survived else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
