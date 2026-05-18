const { MongoClient } = require('mongodb');
const client = new MongoClient('mongodb://127.0.0.1:27017/enterprise_erp');
async function run() {
  try {
    await client.connect();
    const db = client.db('enterprise_erp');
    const users = await db.collection('User').find().toArray();
    console.log('Users found:', users.length);
    if (users.length > 0) {
      console.log('First user:', users[0].email, users[0].passwordHash);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
