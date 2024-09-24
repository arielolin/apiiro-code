import { MongoClient, Collection, Document } from "mongodb";
import { toCamelCase } from "./utils/string";

// Connection URL
const url =
  "mongodb://root:p%40ssw0rd@localhost:27017/?directConnection=true&authMechanism=DEFAULT&authSource=admin";

// Database Name
const dbName = "lim";

export class MongoDbClient {
  private client: MongoClient;

  constructor() {
    this.client = new MongoClient(url);
  }

  async connect() {
    await this.client.connect();
    console.log("Connected successfully to server");
  }

  async close() {
    await this.client.close();
    console.log("Connection closed");
  }

  getCollection(collectionName: string): Collection {
    return this.client.db(dbName).collection(collectionName);
  }

  async find(collectionName: string, query: Document): Promise<Document[]> {
    const collection = this.getCollection(collectionName);
    const result = await collection.find(query).toArray();
    return result.map((doc) => toCamelCase(doc));
  }
}

// Create and connect a client instance
const connectedClient = new MongoDbClient();
connectedClient.connect().catch(console.error);

// Export the connected client
export default connectedClient;

// Export a function to get a new client instance
export function getNewClient(): MongoDbClient {
  return new MongoDbClient();
}
