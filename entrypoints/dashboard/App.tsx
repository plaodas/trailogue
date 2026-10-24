import { createFileSystemArchive } from "../../src/archive/fileSystemArchive";
import { BrowserGate, detectBrave } from "../../src/ui/browserGate";
import { Dashboard } from "../../src/ui/Dashboard";
import { openDatabase } from "../../src/storage/db";
import { createRepository } from "../../src/storage/repository";
import { extensionBatch } from "../../src/ui/extensionBatch";
import { extensionCapture } from "../../src/ui/extensionCapture";

const database = openDatabase();
const repository = createRepository(database);
const archive = createFileSystemArchive(database);

export function App() {
  return (
    <BrowserGate detect={detectBrave}>
      <Dashboard
        repository={repository}
        archive={archive}
        capture={extensionCapture}
        sidebar={extensionBatch}
      />
    </BrowserGate>
  );
}
