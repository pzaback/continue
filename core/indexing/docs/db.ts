import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import * as lancedb from "vectordb";
import { Chunk } from "../..";
import { getDocsSqlitePath, getLanceDbPath } from "../../util/paths";

const DOCS_TABLE_NAME = "docs";

interface LanceDbDocsRow {
  title: string;
  baseUrl: string;
  // Chunk
  content: string;
  path: string;
  startLine: number;
  endLine: number;
  vector: number[];
  [key: string]: any;
}

async function createDocsTable(db: Database<sqlite3.Database>) {
  db.exec(`CREATE TABLE IF NOT EXISTS docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title STRING NOT NULL,
        baseUrl STRING NOT NULL
    )`);
}

export async function retrieveDocs(
  baseUrl: string,
  vector: number[]
): Promise<Chunk[]> {
  const lance = await lancedb.connect(getLanceDbPath());
  const table = await lance.openTable(DOCS_TABLE_NAME);
  const docs: LanceDbDocsRow[] = await table
    .search(vector)
    .limit(20)
    .where(`baseUrl = '${baseUrl}'`)
    .execute();

  return docs.map((doc) => ({
    digest: doc.path,
    filepath: doc.path,
    startLine: doc.startLine,
    endLine: doc.endLine,
    index: 0,
    content: doc.content,
  }));
}

export async function addDocs(
  title: string,
  baseUrl: URL,
  chunks: Chunk[],
  embeddings: number[][]
) {
  const db = await open({
    filename: getDocsSqlitePath(),
    driver: sqlite3.Database,
  });
  await createDocsTable(db);
  await db.run(
    `INSERT INTO docs (title, baseUrl) VALUES (?, ?)`,
    title,
    baseUrl.toString()
  );

  const data: LanceDbDocsRow[] = chunks.map((chunk, i) => ({
    title,
    baseUrl: baseUrl.toString(),
    content: chunk.content,
    path: chunk.filepath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    vector: embeddings[i],
  }));

  const lance = await lancedb.connect(getLanceDbPath());
  const tableNames = await lance.tableNames();
  if (!tableNames.includes(DOCS_TABLE_NAME)) {
    await lance.createTable(DOCS_TABLE_NAME, data);
  } else {
    const table = await lance.openTable(DOCS_TABLE_NAME);
    await table.add(data);
  }
}

export async function listDocs(): Promise<
  { title: string; baseUrl: string }[]
> {
  const db = await open({
    filename: getDocsSqlitePath(),
    driver: sqlite3.Database,
  });
  await createDocsTable(db);
  const docs = await db.all(`SELECT title, baseUrl FROM docs`);
  return docs;
}
