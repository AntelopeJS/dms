import { MongoClient } from "mongodb";

// `__antelope_instances` is the mongodb adapter's instance bookkeeping
// collection; wiping it would deregister tenants/instances.
const PRESERVED_COLLECTION_PREFIXES = ["system.", "__antelope"];
const DMS_SCHEMA_DB = "dms-core";

function getMongoUrl(): string {
  const url = process.env.TEST_MONGO_URL;
  if (!url) {
    throw new Error("TEST_MONGO_URL is not set - test harness must run setup");
  }
  return url;
}

function isPreserved(name: string): boolean {
  return PRESERVED_COLLECTION_PREFIXES.some((prefix) =>
    name.startsWith(prefix),
  );
}

export async function resetDatabase(): Promise<void> {
  const client = await MongoClient.connect(getMongoUrl());
  try {
    const db = client.db(DMS_SCHEMA_DB);
    const collections = await db.collections();
    await Promise.all(
      collections
        .filter((collection) => !isPreserved(collection.collectionName))
        .map((collection) => collection.deleteMany({})),
    );
  } finally {
    await client.close();
  }
}

export async function countRawDocuments(
  collectionName: string,
  filter: Record<string, unknown> = {},
): Promise<number> {
  const client = await MongoClient.connect(getMongoUrl());
  try {
    const name = `${DMS_SCHEMA_DB}__${collectionName}`;
    if (!(await client.db(DMS_SCHEMA_DB).listCollections({ name }).hasNext())) {
      throw new Error(`Missing test collection: ${name}`);
    }
    return await client
      .db(DMS_SCHEMA_DB)
      .collection(name)
      .countDocuments(filter);
  } finally {
    await client.close();
  }
}
