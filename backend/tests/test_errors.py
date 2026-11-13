"""Tests for the shared validation-error wording.

The point of the helper is that the HTTP API and the browser-side CPython build cannot drift apart,
so it is tested directly rather than only through the endpoint.
"""

from __future__ import annotations

from app.services.errors import format_validation_error


def test_names_the_first_field_and_drops_the_http_prefix() -> None:
    errors = [
        {"loc": ("body", "elements", 0, "margin"), "msg": "extra inputs are not permitted"},
        {"loc": ("body", "canvas", "width"), "msg": "greater than 0"},
    ]
    assert format_validation_error(errors) == (
        "elements.0.margin: extra inputs are not permitted (and 1 more)"
    )


def test_a_single_finding_is_not_counted() -> None:
    assert format_validation_error([{"loc": ("body", "format"), "msg": "field required"}]) == (
        "format: field required"
    )


def test_a_finding_without_a_location_still_reads_as_a_sentence() -> None:
    assert format_validation_error([{"loc": (), "msg": "value is not a valid dictionary"}]) == (
        "value is not a valid dictionary"
    )


def test_an_empty_error_list_does_not_produce_an_empty_message() -> None:
    assert format_validation_error([]) == "invalid request"
