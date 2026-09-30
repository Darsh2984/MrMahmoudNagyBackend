ALTER TABLE "Group"
ADD COLUMN "sessionLinks" JSONB;

UPDATE "Group"
SET "sessionLinks" = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'title', 'Online session',
    'link', "sessionLink"
  )
)
WHERE "sessionLink" IS NOT NULL
  AND BTRIM("sessionLink") <> '';
