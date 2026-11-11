"""HTTP surface: the endpoints the frontend is built against.

These are smoke-level by design. The interesting logic lives in the schemas, the geometry and
eventually the compiler, all tested directly; what an endpoint adds is wiring and status codes, so
that is all that is asserted here.
"""

from __future__ import annotations

import re

from fastapi.testclient import TestClient

from tests.helpers import doc_to_payload, make_document, make_element

SNAKE_CASE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)+$")


class TestWireNamingConvention:
    """Guard the camelCase rule across the entire API, not just the fields someone remembered.

    A single snake_case response property is invisible in development and expensive in production:
    the frontend reads ``undefined``, renders an empty panel, and raises nothing anywhere. Testing
    one field at a time would leave the next new model unprotected, so this walks the generated
    OpenAPI document instead.
    """

    def test_no_property_name_anywhere_uses_snake_case(self, client: TestClient) -> None:
        schema = client.get("/openapi.json").json()
        components = schema.get("components", {}).get("schemas", {})

        offenders: list[str] = []
        for model_name, definition in components.items():
            for property_name in definition.get("properties", {}):
                if SNAKE_CASE.match(property_name):
                    offenders.append(f"{model_name}.{property_name}")

        assert offenders == [], f"snake_case leaked into the wire format: {sorted(offenders)}"

    def test_the_convention_is_actually_exercised_by_these_tests(self, client: TestClient) -> None:
        # A guard that matches nothing passes vacuously. Confirming that camelCase names exist
        # proves the scan above is looking at real fields.
        schema = client.get("/openapi.json").json()
        summary = schema["components"]["schemas"]["LayoutSummary"]["properties"]
        assert "elementCount" in summary
        assert "element_count" not in summary


class TestHealth:
    def test_health_reports_alive(self, client: TestClient) -> None:
        response = client.get("/api/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["service"] == "mogong-backend"


class TestLayoutCrud:
    def test_create_then_read_returns_the_same_document(self, client: TestClient) -> None:
        document = make_document([make_element("e_01", 0, 0, 1440, 72, name="Header")])
        created = client.post("/api/layouts", json=doc_to_payload(document))
        assert created.status_code == 201
        fetched = client.get("/api/layouts/test-layout")
        assert fetched.status_code == 200
        assert fetched.json() == created.json()

    def test_creating_the_same_id_twice_is_refused(self, client: TestClient) -> None:
        # A duplicate id would overwrite saved work, so it has to fail rather than win.
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        assert client.post("/api/layouts", json=doc_to_payload(document)).status_code == 201
        repeat = client.post("/api/layouts", json=doc_to_payload(document))
        assert repeat.status_code == 409

    def test_put_updates_an_existing_layout(self, client: TestClient) -> None:
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        client.post("/api/layouts", json=doc_to_payload(document))

        updated = make_document(
            [make_element("e_01", 0, 0, 200, 80), make_element("e_02", 0, 80, 100, 40)]
        )
        response = client.put("/api/layouts/test-layout", json=doc_to_payload(updated))
        assert response.status_code == 200
        assert len(response.json()["elements"]) == 2

    def test_put_may_create_when_the_layout_does_not_exist_yet(self, client: TestClient) -> None:
        # The editor autosaves, so it must not have to know whether this id is new.
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        response = client.put("/api/layouts/test-layout", json=doc_to_payload(document))
        assert response.status_code == 200

    def test_put_rejects_a_body_whose_id_disagrees_with_the_path(self, client: TestClient) -> None:
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        response = client.put("/api/layouts/other-id", json=doc_to_payload(document))
        assert response.status_code == 400
        assert "does not match" in response.json()["detail"]

    def test_delete_removes_the_layout(self, client: TestClient) -> None:
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        client.post("/api/layouts", json=doc_to_payload(document))
        assert client.delete("/api/layouts/test-layout").status_code == 204
        assert client.get("/api/layouts/test-layout").status_code == 404

    def test_deleting_twice_reports_not_found(self, client: TestClient) -> None:
        assert client.delete("/api/layouts/ghost").status_code == 404

    def test_list_is_empty_before_anything_is_saved(self, client: TestClient) -> None:
        body = client.get("/api/layouts").json()
        assert body == {"items": [], "total": 0}

    def test_list_summarizes_without_returning_full_documents(self, client: TestClient) -> None:
        client.post(
            "/api/layouts",
            json=doc_to_payload(make_document([make_element("e_01", 0, 0, 100, 50)])),
        )
        item = client.get("/api/layouts").json()["items"][0]
        assert item["id"] == "test-layout"
        assert item["elementCount"] == 1
        # Geometry must not ride along in a file-picker payload.
        assert "elements" not in item

    def test_a_traversal_style_id_is_refused_before_reaching_the_filesystem(
        self, client: TestClient
    ) -> None:
        response = client.get("/api/layouts/..%2F..%2Fetc%2Fpasswd")
        assert response.status_code in (400, 404)


class TestValidationEndpoint:
    def test_clean_drawing_validates(self, client: TestClient) -> None:
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        body = client.post("/api/compile/validate", json=doc_to_payload(document)).json()
        assert body["valid"] is True
        assert body["problems"] == []

    def test_off_canvas_element_makes_the_drawing_not_valid(self, client: TestClient) -> None:
        document = make_document([make_element("e_01", 1400, 0, 100, 50)])
        body = client.post("/api/compile/validate", json=doc_to_payload(document)).json()
        assert body["valid"] is False
        assert body["problems"][0]["code"] == "ELEMENT_OFF_CANVAS"

    def test_an_empty_canvas_is_information_not_a_failure(self, client: TestClient) -> None:
        # Nothing is wrong with an empty drawing; there is simply nothing to compile yet. Marking it
        # invalid would block autosave on a brand-new layout.
        body = client.post("/api/compile/validate", json=doc_to_payload(make_document([]))).json()
        assert body["valid"] is True
        assert body["problems"][0]["level"] == "info"

    def test_validation_writes_nothing(self, client: TestClient, repository) -> None:
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        client.post("/api/compile/validate", json=doc_to_payload(document))
        assert repository.list_ids() == []


class TestCompileEndpoint:
    def test_compile_reports_not_implemented_until_m4(self, client: TestClient) -> None:
        # 501 rather than a plausible-looking empty tree: a stub that returned success would send
        # the user to Cursor with confident-sounding nonsense, which is the failure this product
        # exists to prevent.
        document = make_document([make_element("e_01", 0, 0, 100, 50)])
        response = client.post("/api/compile", json=doc_to_payload(document))
        assert response.status_code == 501
        assert response.json()["detail"]["milestone"] == "M4"


class TestRequestRejection:
    def test_a_document_with_an_unknown_field_is_rejected(self, client: TestClient) -> None:
        payload = doc_to_payload(make_document([make_element("e_01", 0, 0, 100, 50)]))
        payload["elements"][0]["margin"] = 10
        assert client.post("/api/layouts", json=payload).status_code == 422

    def test_a_negative_stored_width_is_normalized_not_rejected(self, client: TestClient) -> None:
        # The pointer layer can produce a reverse drag, and the schema folds it. By the time it
        # reaches storage the rectangle is ordinary, so the API must accept it.
        payload = doc_to_payload(make_document([make_element("e_01", 0, 0, 100, 50)]))
        payload["elements"][0].update({"x": 100, "y": 50, "width": -60, "height": -30})
        response = client.post("/api/layouts", json=payload)
        assert response.status_code == 201
        element = response.json()["elements"][0]
        assert (element["x"], element["y"]) == (40, 20)
        assert (element["width"], element["height"]) == (60, 30)
