import { Dashboard } from "../../src/ui/Dashboard";
import { openDatabase } from "../../src/storage/db";
import { createRepository } from "../../src/storage/repository";
import { extensionCapture } from "../../src/ui/extensionCapture";

const repository = createRepository(openDatabase());

export function App() {
  return <Dashboard repository={repository} capture={extensionCapture} />;
}
