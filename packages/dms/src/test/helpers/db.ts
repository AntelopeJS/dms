import {
  MongoClient,
  type Document,
  type Filter,
  type IndexDescriptionInfo,
} from "mongodb";

const PRESERVED_COLLECTION_PREFIXES = ["system.", "__antelope"];
const DMS_SCHEMA_DB = "dms-core";

function getMongoUrl(): string {
  const url = process.env.TEST_MONGO_URL;
  if (!url) {
    throw new Error("TEST_MONGO_URL is not set - test harness must run setup");
  }
  return url;
}

let sharedClient: Promise<MongoClient> | undefined;

function getClient(): Promise<MongoClient> {
  sharedClient ??= MongoClient.connect(getMongoUrl()).catch((error) => {
    sharedClient = undefined;
    throw error;
  });
  return sharedClient;
}

after(async () => {
  const client = sharedClient;
  sharedClient = undefined;
  if (client) await (await client).close();
});

function isPreserved(name: string): boolean {
  return PRESERVED_COLLECTION_PREFIXES.some((prefix) =>
    name.startsWith(prefix),
  );
}

export async function resetDatabase(): Promise<void> {
  const db = (await getClient()).db(DMS_SCHEMA_DB);
  const collections = await db.collections();
  await Promise.all(
    collections
      .filter((collection) => !isPreserved(collection.collectionName))
      .map((collection) => collection.deleteMany({})),
  );
}

export async function countRawDocuments(
  collectionName: string,
  filter: Filter<Document> = {},
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

export async function listRawIndexes(
  collectionName: string,
): Promise<Record<string, IndexDescriptionInfo["key"]>> {
  const client = await MongoClient.connect(getMongoUrl());
  try {
    const indexes = await client
      .db(DMS_SCHEMA_DB)
      .collection(`${DMS_SCHEMA_DB}__${collectionName}`)
      .indexes();
    return Object.fromEntries(
      indexes.map((index) => [index.name ?? "", index.key]),
    );
  } finally {
    await client.close();
  }
}
