#!/usr/bin/env bash

# Add the source custom field to docs ingested from mail
if [[ $DOCUMENT_SOURCE_PATH == *"originals/mail-ingest"* ]]; then
    echo "Document $DOCUMENT_ID originates from mail, attaching source and removing storage path"

    curl -X PATCH --silent --show-error --fail --output /dev/null \
        -H "Authorization: Token $PAPERLESS_SCRIPT_AUTH_TOKEN" \
        -H "Content-type: application/json" \
        --data '{"storage_path": null, "custom_fields": [{ "field": 1, "value": "tQSknnSdHRqT8RF8" }]}' \
        $PAPERLESS_URL/api/documents/$DOCUMENT_ID/
fi
