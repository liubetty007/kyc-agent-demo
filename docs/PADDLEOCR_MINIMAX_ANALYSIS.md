# PaddleOCR to MiniMax document analysis

## Runtime flow

1. An authenticated and case-authorized user starts document analysis.
2. Existing upload controls validate file count, aggregate size, per-file size,
   filename, MIME type, and magic bytes.
3. Images and PDFs are sent to a private PaddleOCR service using its documented
   `POST /ocr` JSON API. The request contains Base64 file bytes and does not use
   a public document URL.
4. PaddleOCR text below the configured confidence threshold is discarded. The
   remaining text is normalized, control characters are removed, and the result
   is length-limited.
5. Only OCR text and the minimum authorized case context are sent to the
   company's OpenAI-compatible endpoint at
   `https://newapi.elevatesphere.com/v1/chat/completions` using model
   `gpustack-minimax-m2.7`.
6. MiniMax output is parsed as structured JSON and merged with deterministic
   checklist checks. All results remain advisory and require human review.

When `PADDLEOCR_REQUIRED=true`, an OCR failure prevents the MiniMax request. The
system does not silently send the original image to MiniMax.

## Required configuration

The KYC Cloud Run service uses these non-secret environment variables:

```text
LLM_PROVIDER=newapi
NEWAPI_BASE_URL=https://newapi.elevatesphere.com/v1
NEWAPI_MODEL=gpustack-minimax-m2.7
PADDLEOCR_BASE_URL=https://kyc-paddleocr-qam2sdmeuq-df.a.run.app
PADDLEOCR_AUTH_MODE=google_id_token
PADDLEOCR_REQUIRED=true
```

Store the MiniMax/NewAPI key as Secret Manager secret `newapi-api-key`. The
deployment script binds it to `NEWAPI_API_KEY`; do not put the value in `.env`,
deployment command arguments, source code, logs, or GitHub.

The PaddleOCR service should be private. Grant `roles/run.invoker` on only that
service to `kyc-agent-runner@kyc-agent-staging-20260610.iam.gserviceaccount.com`.
The KYC service obtains a Google-signed ID token from the Cloud Run metadata
server and sends it as the PaddleOCR bearer token.

If the company already operates a bearer-token protected PaddleOCR endpoint,
set `PADDLEOCR_AUTH_MODE=bearer` and bind its key from Secret Manager as
`PADDLEOCR_API_KEY` instead.

## PaddleOCR API contract

The client follows the official PaddleOCR/PaddleX basic serving contract:

```json
{
  "file": "<base64 bytes>",
  "fileType": 1,
  "useDocOrientationClassify": true,
  "useDocUnwarping": true,
  "useTextlineOrientation": true,
  "visualize": false
}
```

`fileType` is `0` for PDF and `1` for an image. Text is read from each response
item's `result.ocrResults[].prunedResult.rec_texts` and paired with
`rec_scores` when present.

Official references:

- https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/deployment/serving.html
- https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/OCR.html
