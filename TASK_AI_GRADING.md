# Task AI grading (staff assistance only)

## Deployment

Deploy the backend migration BEFORE deploying the frontend:

```sh
npx prisma migrate deploy
npx prisma generate
```

Locally stop the running backend first if Windows reports EPERM on the Prisma DLL,
run the commands, then restart it. Do not use `prisma migrate reset`.

Required existing configuration: `GEMINI_API_KEY`, the R2 environment variables,
and `DATABASE_URL`. `GEMINI_MODEL` uses the existing model setting (default:
`gemini-2.5-flash`). Optional `GEMINI_TASK_CACHE_TTL_SECONDS` defaults to 600
seconds and is bounded to 60–3600 seconds. Explicit Gemini caching may require a
paid API tier/model minimum token count. If unavailable, grading uses the same
persisted rubric directly; no document re-extraction is needed. Cache storage
and cached input still have costs: do not treat caching as free or permanent.

## Workflow

1. Open a task. In **AI grading • task reference documents**, upload both PDFs.
2. Original PDFs are stored privately in R2. A detailed rubric is extracted once
   and saved in PostgreSQL. Identical document pairs reuse the existing pack.
3. Review every scoring rule, optional-question rule, diagram limitation and
   mark total against the originals, then approve the rubric.
4. In a student's submission, open **AI grading assistance**, select answer PDFs,
   and generate the correction. Select up to 20 files: PDFs and JPG/JPEG/PNG
   images can be mixed. All selected files form one answer with one overall
   score, not separate attempts. Evidence cites the PDF page or image filename.
   The combined limit is 100 MB; each file is at most 50 MB, with PDFs limited
   to 500 pages. Password-protected/invalid PDFs and unsupported image formats
   are rejected. Office/text files remain available for manual grading only.
5. Reopening the panel loads saved corrections. Identical inputs reuse a saved
   correction without another AI call. Changed documents/answers create a new
   correction; previous records remain visible and are marked outdated.
6. AI suggestions never modify the student's grade/comments, returned files,
   grading history, delegation completion, or notifications. Annotate the PDF
   manually and publish through the existing grading form.

Teachers/head assistants can access task submissions. Regular assistants need
group assignment and the existing submission delegation to access corrections;
the `canGradeHomework` permission is required to upload/approve references or run
grading. Student and parent endpoints do not include reference packs/corrections.

## Persistence and interruptions

`TaskAIGradingPack` holds immutable document versions, extracted rubrics, staff
approval and short-lived Gemini cache references. `SubmissionAICorrection` holds
the answer snapshot, model, requesting staff name/ID, structured feedback,
per-question marks, token usage and job status. Database uniqueness prevents
duplicate work for an identical submission/reference/file selection.

Processing occurs after an HTTP 202 response; the UI polls persisted status.
If the backend restarts during processing, after 10 minutes the record is marked
failed on the next read and staff can retry. This initial implementation does
not run a separate durable worker queue; failed jobs must be retried explicitly.
Gemini temporary answer/reference uploads are deleted after each job. Expired
provider caches are rebuilt from the stored rubric, not from the PDFs.

Deleting a task/submission cascades its AI database rows. Original reference PDFs
remain in R2 under `task-ai-references/` for now (no automatic task-deletion
storage cleanup). Staff identifiers are audit snapshots, not additional User
foreign keys. A database-only removal of a test submission also removes any AI
correction records attached to it.

## Verification

```sh
node --test tests/taskAIGrading.test.js
npx prisma validate
```

Automated tests use mocked persistence/storage and never send paid Gemini requests.
Before rollout, test with a known paper/mark scheme/answer set: inspect the extracted
rubric, compare suggested marks with a human marker, reload to confirm persistence,
replace references/change answers to check outdated flags, and verify students
cannot retrieve the private endpoints. Staff should never assume AI is correct.
