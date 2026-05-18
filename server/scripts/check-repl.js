const { MongoClient } = require('mongodb');
const client = new MongoClient('mongodb://127.0.0.1:27017');
async function run() {
  try {
    await client.connect();
    try {
      const status = await client.db('admin').command({ replSetGetStatus: 1 });
      console.log('Replica set is enabled.');
    } catch (e) {
      if (e.message.includes('not running with --replSet')) {
        console.log('Not a replica set.');
      } else {
        console.log('Error checking replica set:', e.message);
        try {
          await client.db('admin').command({ replSetInitiate: {} });
          console.log('Initiated replica set.');
        } catch (initErr) {
          console.log('Failed to initiate:', initErr.message);
        }
      }
    }
  } finally {
    await client.close();
  }
}
run();
